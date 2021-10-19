import { WebDeviceContextPlugin } from '@objectiv/plugin-web-device-context';
import { WebDocumentContextPlugin } from '@objectiv/plugin-web-document-context';
import {
  ContextsConfig,
  getDefaultTrackerPluginsList,
  Tracker,
  TrackerConfig,
  TrackerPlugins,
  TrackerQueue,
  TrackerTransportInterface,
  TrackerTransportQueued,
  TrackerTransportRetry,
  TrackerTransportSwitch,
} from '@objectiv/tracker-core';
import { FetchAPITransport } from '../transport/FetchAPITransport';
import { TrackerQueueLocalStorageStore } from '../transport/TrackerQueueLocalStorageStore';
import { XMLHttpRequestTransport } from '../transport/XMLHttpRequestTransport';

/**
 * Browser Tracker can be configured in a easier way, as opposed to the core tracker, by specifying just an `endpoint`.
 * Internally it will automatically configure the Transport layer for the given `endpoint` with sensible defaults.
 * It also accepts a number of options to configure automatic tracking behavior:
 */
export type BrowserTrackerConfig = TrackerConfig & {
  // The collector endpoint URL
  endpoint?: string;

  // Whether to track application loaded events automatically. Enabled by default.
  trackApplicationLoaded?: boolean;

  // Whether to track URL change events automatically. Enabled by default.
  trackURLChanges?: boolean;
};

/**
 * A factory to create the default Transport of Browser Tracker.
 */
export const makeBrowserTrackerDefaultTransport = (trackerConfig: BrowserTrackerConfig): TrackerTransportInterface =>
  new TrackerTransportQueued({
    console: trackerConfig.console,
    queue: new TrackerQueue({
      store: new TrackerQueueLocalStorageStore({
        trackerId: trackerConfig.trackerId ?? trackerConfig.applicationId,
        console: trackerConfig.console,
      }),
      console: trackerConfig.console,
    }),
    transport: new TrackerTransportRetry({
      console: trackerConfig.console,
      transport: new TrackerTransportSwitch({
        console: trackerConfig.console,
        transports: [
          new FetchAPITransport({ endpoint: trackerConfig.endpoint, console: trackerConfig.console }),
          new XMLHttpRequestTransport({ endpoint: trackerConfig.endpoint, console: trackerConfig.console }),
        ],
      }),
    }),
  });

/**
 * The default list of Plugins of Browser Tracker
 */
export const getDefaultBrowserTrackerPluginsList = (trackerConfig: BrowserTrackerConfig) => [
  ...getDefaultTrackerPluginsList(trackerConfig),
  new WebDocumentContextPlugin({ console: trackerConfig.console }),
  new WebDeviceContextPlugin({ console: trackerConfig.console }),
];

/**
 * Browser Tracker is a 1:1 instance of Tracker core with a simplified construction and some preconfigured Plugins.
 * It initializes with a Queued Fetch and XMLHttpRequest Transport Switch wrapped in a Retry Transport automatically.
 * The resulting Queue has some sensible defaults (10 events every 100ms) for sending events in batches.
 * The Retry logic is configured for 10 retries with exponential backoff starting at 1000ms.
 * The transport is also grouped with a DebugTransport for logging the handled events to console.
 *
 * This statement:
 *
 *  const tracker = new BrowserTracker({ applicationId: 'app-id', endpoint: '/endpoint' });
 *
 * is equivalent to:
 *
 *  const fetchTransport = new FetchAPITransport({ endpoint: '/endpoint' });
 *  const xmlHttpRequestTransport = new XMLHttpRequestTransport({ endpoint: '/endpoint' });
 *  const transportSwitch = new TransportSwitch(fetchTransport, xmlHttpRequestTransport);
 *  const retryTransport = new RetryTransport({ transport: transportSwitch});
 *  const trackerQueue = new TrackerQueue();
 *  const transport = new QueuedTransport({ transport: retryTransport, queue: trackerQueue });
 *  const applicationContextPlugin = new ApplicationContextPlugin({ applicationId: 'app-id' });
 *  const plugins = new TrackerPlugins([ applicationContextPlugin, WebDocumentContextPlugin, WebDeviceContextPlugin ]);
 *  const tracker = new Tracker({ transport, plugins });
 *
 *  See also `makeBrowserTrackerDefaultTransport` for the actual implementation.
 *
 */
export class BrowserTracker extends Tracker {
  constructor(trackerConfig: BrowserTrackerConfig, ...contextConfigs: ContextsConfig[]) {
    let config = trackerConfig;

    // Either `transport` or `endpoint` must be provided
    if (!config.transport && !config.endpoint) {
      throw new Error('Either `transport` or `endpoint` must be provided');
    }

    // `transport` and `endpoint` must not be provided together
    if (config.transport && config.endpoint) {
      throw new Error('Please provider either `transport` or `endpoint`, not both at same time');
    }

    // Automatically create a default Transport for the given `endpoint` with a sensible setup
    if (config.endpoint) {
      config = {
        ...config,
        transport: makeBrowserTrackerDefaultTransport(config),
      };
    }

    // Configure to use provided `plugins` or automatically create a Plugins instance with some sensible web defaults
    if (!config.plugins) {
      config = {
        ...config,
        plugins: new TrackerPlugins({
          console: trackerConfig.console,
          plugins: getDefaultBrowserTrackerPluginsList(config),
        }),
      };
    }

    // Initialize core Tracker
    super(config, ...contextConfigs);
  }
}
