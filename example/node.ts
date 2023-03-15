// deno-lint-ignore-file ban-ts-comment
// no-explicit-any
import mongoose from "npm:mongoose";
import { initWatchers } from "../database/watchers.ts";
import { DatabaseWatcher } from "../database/DatabaseWatcher.ts";
import { api, LocalBroker } from "../services/index.ts";
import { InstanceStatus } from "../services/InstanceStatus.ts";

async function run() {
  const mongoUri = Deno.env.get('MONGO_URI') as string;

  const conn = await mongoose.connect(mongoUri, {
    keepAlive: true,
  });
  console.log("Connected to database");

  const mongo = conn.connection as mongoose.Connection;
  const db = mongo.db;
  // @ts-ignore
  const _oplogHandle = mongo?._oplogHandle;
  const watcher = new DatabaseWatcher({
    db,
    _oplogHandle,
  });
  watcher.watch().catch((err: Error) => {
    console.error(err, "Fatal error occurred when watching database");
    Deno.exit(1);
  });

  initWatchers(watcher, api.broadcastLocal.bind(api));

  setInterval(function _checkDatabaseWatcher() {
    if (watcher.isLastDocDelayed()) {
      console.error("No real time data received recently");
    }
  }, 20000);

  const broker = new LocalBroker();
  broker.onBroadcast((eventName, ...args) => {
    console.log('broadcast', [{ eventName, args }]);
  });

  api.registerService(new InstanceStatus());
  api.setBroker(broker);
  api.start();
}

run();
