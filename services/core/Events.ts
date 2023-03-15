// deno-lint-ignore-file no-explicit-any
import { IInstanceStatus } from '../../database/types/index.ts';

export type ClientAction = "inserted" | "updated" | "removed" | "changed";

export type EventSignatures = {
  "watch.instanceStatus"(data: {
    clientAction: ClientAction;
    data?: undefined | Partial<IInstanceStatus>;
    diff?: undefined | Record<string, any>;
    id: string;
  }): void;
};
