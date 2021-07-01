import { DeviceContext } from '@objectiv/schema';
import { makeDeviceContext, TrackerEvent, TrackerPlugin } from '@objectiv/tracker-core';

/**
 * The WebDeviceContext Plugin gathers the current user-agent using the Navigator API.
 * It detects it during construction and adds it as GlobalContext before events are handed over to TrackerTransport.
 */
export class WebDeviceContextPlugin implements TrackerPlugin {
  readonly pluginName = `WebDeviceContextPlugin`;
  readonly webDeviceContext: DeviceContext;

  /**
   * Detects user-agent and generates a WebDeviceContext.
   */
  constructor() {
    this.webDeviceContext = makeDeviceContext({ id: 'device', user_agent: navigator.userAgent });
  }

  /**
   * Add the the WebDeviceContext to the Event's Global Contexts
   */
  beforeTransport(event: TrackerEvent): void {
    event.global_contexts.push(this.webDeviceContext);
  }
}
