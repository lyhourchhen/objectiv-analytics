import {
  isNonEmptyArray,
  NonEmptyArray,
  TrackerEvent,
  TrackerTransport,
  TransportableEvent,
  TransportSendError,
} from '@objectiv/tracker-core';

/**
 * The default set of parameters for the fetch API call.
 * The `body` parameter is internally managed and should not be overridden.
 */
export const defaultFetchParameters: Omit<RequestInit, 'body'> = {
  method: 'POST',
  mode: 'cors',
  headers: {
    'Content-Type': 'text/plain',
  },
  credentials: 'include',
};

/**
 * The default fetch function implementation.
 */
export const defaultFetchFunction = async ({
  endpoint,
  events,
  parameters = defaultFetchParameters,
}: {
  endpoint: string;
  events: [TrackerEvent, ...TrackerEvent[]];
  parameters?: typeof defaultFetchParameters;
}): Promise<Response> => {
  return new Promise(function (resolve, reject) {
    events.forEach((event) => event.setTransportTime());

    console.groupCollapsed(`Objectiv: FetchAPITransport sending`);
    console.log(`Events:`);
    console.log(events);
    console.groupEnd();

    fetch(endpoint, {
      ...parameters,
      body: JSON.stringify(events),
    })
      .then((response) => {
        if (response.status === 200) {
          console.groupCollapsed(`Objectiv: FetchAPITransport success`);
          console.log(`Events:`);
          console.log(events);
          console.groupEnd();

          resolve(response);
        } else {
          console.groupCollapsed(`Objectiv: FetchAPITransport failure`);
          console.log(`Events:`);
          console.log(events);
          console.log(`Response: ${response}`);
          console.groupEnd();

          reject(new TransportSendError());
        }
      })
      .catch(() => {
        console.groupCollapsed(`Objectiv: FetchAPITransport error`);
        console.log(`Events:`);
        console.log(events);
        console.groupEnd();

        reject(new TransportSendError());
      });
  });
};

/**
 * The configuration of the FetchAPITransport class
 */
export type FetchAPITransportConfig = {
  /**
   * Collector's URI. Where to send the Events to.
   */
  endpoint: string;

  /**
   * Optional. Override the default fetch API implementation with a custom one.
   */
  fetchFunction?: typeof defaultFetchFunction;
};

/**
 * A TrackerTransport based on Fetch API. Sends event to the specified Collector endpoint.
 * Optionally supports specifying a custom `fetchFunction`.
 */
export class FetchAPITransport implements TrackerTransport {
  readonly transportName = 'FetchAPITransport';
  readonly endpoint: string;
  readonly fetchFunction: typeof defaultFetchFunction;

  constructor(config: FetchAPITransportConfig) {
    this.endpoint = config.endpoint;
    this.fetchFunction = config.fetchFunction ?? defaultFetchFunction;
  }

  async handle(...args: NonEmptyArray<TransportableEvent>): Promise<Response | void> {
    const events = await Promise.all(args);
    if (isNonEmptyArray(events)) {
      return this.fetchFunction({ endpoint: this.endpoint, events });
    }
  }

  isUsable(): boolean {
    return typeof fetch !== 'undefined';
  }
}
