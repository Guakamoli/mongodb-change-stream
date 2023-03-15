import { ChangeStreamDocument } from "npm:mongodb";
import mongoose from "npm:mongoose";
import { DatabaseWatcher } from "./DatabaseWatcher.ts";
import { InstanceStatusModel } from "./models/InstanceStatus.ts";
import type { EventSignatures } from "../core/lib/Events.ts";
import { IInstanceStatus } from "./types/IInstanceStatus.ts";

export type Watcher = <T extends mongoose.Document>(
  model: mongoose.Model<T>,
  fn: (event: ChangeStreamDocument<T>) => void | Promise<void>,
) => void;

export type ClientAction = "inserted" | "updated" | "removed" | "changed";

export type BroadcastCallback = <T extends keyof EventSignatures>(
  event: T,
  ...args: Parameters<EventSignatures[T]>
) => Promise<void>;

export function initWatchers(
  watcher: DatabaseWatcher,
  broadcast: BroadcastCallback,
): void {
  watcher.on<IInstanceStatus>(
    InstanceStatusModel.collection.collectionName,
    (event) => {
      // console.log("watcher.on<InstanceStatusDocument> event=", event);
      const { clientAction, data, diff, id } = event;

      broadcast("watch.instanceStatus", { clientAction, data, diff, id });
    },
  );
}
