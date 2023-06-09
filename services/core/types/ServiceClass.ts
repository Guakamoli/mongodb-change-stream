import { EventEmitter } from "events";
import type { IBroker } from "./IBroker.ts";
import type { IApiService } from "./IApiService.ts";
import type { EventSignatures } from "../Events.ts";

export interface IServiceContext {
  id: string; // Context ID
  broker: IBroker; // Instance of the broker.
  nodeID: string | null; // The caller or target Node ID.
  // action: Object; // Instance of action definition.
  // event: Object; // Instance of event definition.
  // eventName: Object; // The emitted event name.
  // eventType: String; // Type of event (“emit” or “broadcast”).
  // eventGroups: Array; // String>	Groups of event.
  // caller: String; // Service full name of the caller. E.g.: v3.myService
  requestID: string | null; // Request ID. If you make nested-calls, it will be the same ID.
  // parentID: String; // Parent context ID (in nested-calls).
  // params: Any; // Request params. Second argument from broker.call.
  // meta: Any; // Request metadata. It will be also transferred to nested-calls.
  // locals: any; // Local data.
  // level: Number; // Request level (in nested-calls). The first level is 1.
  // span: Span; // Current active span.
  ctx?: any;
}

export interface IServiceClass {
  getName(): string | undefined;

  getEvents(): Array<keyof EventSignatures>;

  setApi(api: IApiService): void;

  onEvent<T extends keyof EventSignatures>(
    event: T,
    handler: EventSignatures[T],
  ): void;
  emit<T extends keyof EventSignatures>(
    event: T,
    ...args: Parameters<EventSignatures[T]>
  ): void;

  created(): Promise<void>;
  started(): Promise<void>;
  stopped(): Promise<void>;
}

export abstract class ServiceClass implements IServiceClass {
  protected name?: string;

  protected events = new EventEmitter();

  protected internal = false;

  protected api?: IApiService;

  constructor() {
    this.emit = this.emit.bind(this);
  }

  setApi(api: IApiService): void {
    this.api = api;
  }

  getEvents(): Array<keyof EventSignatures> {
    return this.events.eventNames() as unknown as Array<keyof EventSignatures>;
  }

  getName(): string | undefined {
    return this.name;
  }

  public onEvent<T extends keyof EventSignatures>(
    event: T,
    handler: EventSignatures[T],
  ): void {
    this.events.on(event, handler);
  }

  public emit<T extends keyof EventSignatures>(
    event: T,
    ...args: Parameters<EventSignatures[T]>
  ): void {
    this.events.emit(event, ...args);
  }

  async created(): Promise<void> {
    // noop
  }

  async started(): Promise<void> {
    // noop
  }

  async stopped(): Promise<void> {
    // noop
  }
}
