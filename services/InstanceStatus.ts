import { ServiceClass } from "./index.ts";

export class InstanceStatus extends ServiceClass {
  protected name = "instances";

  constructor() {
    super();

    this.onEvent("watch.instanceStatus", (event) => {
      const { clientAction } = event;
      if (clientAction === 'inserted') {
        console.log(
          "[services] InstanceStatus onEvent(watch.instanceStatus)",
          event.data,
        );
      }
    });
  }

  async started(): Promise<void> {
    console.log("[services] InstanceStatus started.");
  }
}
