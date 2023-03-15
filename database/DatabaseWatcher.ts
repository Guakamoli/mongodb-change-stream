// deno-lint-ignore-file no-explicit-any
import EventEmitter from "events";
import type {
  ChangeStreamDeleteDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
  Db,
  Timestamp,
  WithId,
} from "npm:mongodb";
import { MongoClient } from "npm:mongodb";
import watchCollections from "./watchCollections.ts";
import { convertChangeStreamPayload } from "./convertChangeStreamPayload.ts";
import { convertOplogPayload } from "./convertOplogPayload.ts";
import { escapeRegExp } from "./escapeRegExp.ts";
import type { IRecord } from "./types/index.ts";

export type RecordDeleted<T> = WithId<T> & {
  _updatedAt: Date;
  _deletedAt: Date;
  __collection__: string;
};

const instancePing =
  parseInt(String(Deno.env.get("MULTIPLE_INSTANCES_PING_INTERVAL"))) || 10000;

const maxDocMs = instancePing * 4; // 4 times the ping interval

export type RealTimeData<T> = {
  id: string;
  action: "insert" | "update" | "remove";
  clientAction: "inserted" | "updated" | "removed";
  data?: T;
  diff?: Record<string, any>;
  unset?: Record<string, number>;
  oplog?: true;
};

const ignoreChangeStream = ["yes", "true"].includes(
  String(Deno.env.get("IGNORE_CHANGE_STREAM")).toLowerCase(),
);

const useMeteorOplog = ["yes", "true"].includes(
  String(Deno.env.get("USE_NATIVE_OPLOG")).toLowerCase(),
);

export class DatabaseWatcher extends EventEmitter {
  private db: Db;

  private _oplogHandle?: any;

  private metrics?: any;

  /**
   * Last doc timestamp received from a real time event
   */
  private lastDocTS: Date | undefined;

  constructor(
    { db, _oplogHandle, metrics }: {
      db: Db;
      _oplogHandle?: any;
      metrics?: any;
    },
  ) {
    super();

    this.db = db;
    this._oplogHandle = _oplogHandle;
    this.metrics = metrics;
  }

  async watch(): Promise<void> {
    if (useMeteorOplog) {
      // TODO remove this when updating to Meteor 2.8
      console.warn(
        "Using USE_NATIVE_OPLOG=true is currently discouraged due to known performance issues. Please use IGNORE_CHANGE_STREAM=true instead.",
      );
      this.watchMeteorOplog();
      return;
    }

    if (ignoreChangeStream) {
      await this.watchOplog();
      return;
    }

    try {
      this.watchChangeStream();
    } catch (_err: unknown) {
      await this.watchOplog();
    }
  }

  private async watchOplog(): Promise<void> {
    
    if (!Deno.env.has('MONGO_OPLOG_URL')) {
      throw Error("No $MONGO_OPLOG_URL provided");
    }

    const isMasterDoc = await this.db.admin().command({ ismaster: 1 });
    if (!isMasterDoc || !isMasterDoc.setName) {
      throw Error("$MONGO_URL should be a replica set's URL");
    }

    const dbName = this.db.databaseName;

    const client = new MongoClient(Deno.env.get('MONGO_OPLOG_URL') as string, {
      maxPoolSize: 1,
    });

    if (client.db().databaseName !== "local") {
      throw Error(
        "$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set",
      );
    }

    await client.connect();

    console.log("Using oplog");

    const db = client.db();

    const oplogCollection = db.collection("oplog.rs");

    const lastOplogEntry = await oplogCollection.findOne<{ ts: Timestamp }>(
      {},
      { sort: { $natural: -1 }, projection: { _id: 0, ts: 1 } },
    );

    const oplogSelector = {
      ns: new RegExp(`^(?:${[escapeRegExp(`${dbName}.`)].join("|")})`),
      op: { $in: ["i", "u", "d"] },
      ...(lastOplogEntry && { ts: { $gt: lastOplogEntry.ts } }),
    };

    const cursor = oplogCollection.find(oplogSelector);

    cursor.addCursorFlag("tailable", true);
    cursor.addCursorFlag("awaitData", true);
    cursor.addCursorFlag("oplogReplay", true);

    const stream = cursor.stream();

    stream.on("data", (doc) => {
      const doesMatter = watchCollections.some((collection) =>
        doc.ns === `${dbName}.${collection}`
      );
      if (!doesMatter) {
        return;
      }

      this.emitDoc(
        doc.ns.slice(dbName.length + 1),
        convertOplogPayload({
          id: doc.op === "u" ? doc.o2._id : doc.o._id,
          op: doc,
        }),
      );
    });
  }

  private watchMeteorOplog(): void {
    if (!this._oplogHandle) {
      throw new Error("no-oplog-handle");
    }

    console.log("Using Meteor oplog");

    watchCollections.forEach((collection) => {
      this._oplogHandle.onOplogEntry({ collection }, (event: any) => {
        this.emitDoc(collection, convertOplogPayload(event));
      });
    });
  }

  private watchChangeStream(): void {
    try {
      const changeStream = this.db.watch<
        IRecord,
        | ChangeStreamInsertDocument<IRecord>
        | ChangeStreamUpdateDocument<IRecord>
        | ChangeStreamDeleteDocument<IRecord>
      >([
        {
          $match: {
            "operationType": { $in: ["insert", "update", "delete"] },
            "ns.coll": { $in: watchCollections },
          },
        },
      ]);
      changeStream.on("change", (event) => {
        this.emitDoc(event.ns.coll, convertChangeStreamPayload(event));
      });

      changeStream.on("error", (err) => {
        throw err;
      });

      console.log("Using change streams");
    } catch (err: unknown) {
      console.error(err, "Change stream error");

      throw err;
    }
  }

  private emitDoc(
    collection: string,
    doc: RealTimeData<IRecord> | void,
  ): void {
    if (!doc) {
      return;
    }

    this.lastDocTS = new Date();

    this.metrics?.oplog.inc({
      collection,
      op: doc.action,
    });

    this.emit(collection, doc);
  }

  on<T>(collection: string, callback: (event: RealTimeData<T>) => void): this {
    return super.on(collection, callback);
  }

  /**
   * @returns the last timestamp delta in miliseconds received from a real time event
   */
  getLastDocDelta(): number {
    return this.lastDocTS ? Date.now() - this.lastDocTS.getTime() : Infinity;
  }

  /**
   * @returns Indicates if the last document received is older than it should be. If that happens, it means that the oplog is not working properly
   */
  isLastDocDelayed(): boolean {
    return this.getLastDocDelta() > maxDocMs;
  }
}
