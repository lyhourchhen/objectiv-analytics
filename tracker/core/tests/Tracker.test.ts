import { Tracker, TrackerEvent, TrackerPlugin, TrackerPlugins } from '../src';
import { LogTransport, noop } from './mocks';

describe('Tracker', () => {
  it('should instantiate without any config', () => {
    const testTracker = new Tracker();
    expect(testTracker).toBeInstanceOf(Tracker);
    expect(testTracker.transport).toBe(undefined);
    expect(testTracker.plugins).toBe(undefined);
    expect(testTracker.locationStack).toStrictEqual([]);
    expect(testTracker.globalContexts).toStrictEqual([]);
  });

  it('should instantiate with tracker config', () => {
    const testTransport = new LogTransport();
    const testTracker = new Tracker({ transport: testTransport });
    expect(testTracker).toBeInstanceOf(Tracker);
    expect(testTracker.transport).toStrictEqual(testTransport);
    expect(testTracker.plugins).toBe(undefined);
    expect(testTracker.locationStack).toStrictEqual([]);
    expect(testTracker.globalContexts).toStrictEqual([]);
  });

  it('should instantiate with another Tracker, inheriting its state, yet being independent instances', () => {
    const initialContextsState = {
      locationStack: [
        { _context_type: 'section', id: 'root' },
        { _context_type: 'section', id: 'A' },
      ],
      globalContexts: [
        { _context_type: 'global', id: 'A' },
        { _context_type: 'global', id: 'B' },
      ],
    };

    const testTracker = new Tracker(initialContextsState);
    expect(testTracker.locationStack).toEqual(initialContextsState.locationStack);
    expect(testTracker.globalContexts).toEqual(initialContextsState.globalContexts);

    // Create a clone of the existing tracker
    const newTestTracker = new Tracker(testTracker);
    expect(newTestTracker).toBeInstanceOf(Tracker);
    // They should be identical (yet separate instances)
    expect(newTestTracker).toEqual(testTracker);

    // Refine Location Stack of the new Tracker with an extra Section
    newTestTracker.locationStack.push({ _context_type: 'section', id: 'X' });

    // The old tracker should be unaffected
    expect(testTracker.locationStack).toEqual(initialContextsState.locationStack);
    expect(testTracker.globalContexts).toEqual(initialContextsState.globalContexts);

    // While the new Tracker should now have a deeper Location Stack
    expect(newTestTracker.locationStack).toEqual([
      { _context_type: 'section', id: 'root' },
      { _context_type: 'section', id: 'A' },
      { _context_type: 'section', id: 'X' },
    ]);
    expect(newTestTracker.globalContexts).toEqual([
      { _context_type: 'global', id: 'A' },
      { _context_type: 'global', id: 'B' },
    ]);
  });

  it('should allow complex compositions of multiple Tracker instances and Configs', () => {
    const mainTrackerContexts = {
      locationStack: [
        { _context_type: 'section', id: 'root' },
        { _context_type: 'section', id: 'A' },
      ],
      globalContexts: [
        { _context_type: 'global', id: 'X' },
        { _context_type: 'global', id: 'Y' },
      ],
    };
    const mainTracker = new Tracker(mainTrackerContexts);

    // This new tracker is a clone of the mainTracker and extends it with two custom Contexts configuration
    const sectionTracker = new Tracker(
      mainTracker,
      {
        locationStack: [{ _context_type: 'section', id: 'B' }],
        globalContexts: [{ _context_type: 'global', id: 'Z' }],
      },
      {
        locationStack: [{ _context_type: 'section', id: 'C' }],
      },
      // These last two configurations are useless, but we want to make sure nothing breaks with them
      {
        globalContexts: [],
      },
      {}
    );

    // The old tracker should be unaffected
    expect(mainTracker.locationStack).toEqual(mainTrackerContexts.locationStack);
    expect(mainTracker.globalContexts).toEqual(mainTrackerContexts.globalContexts);

    // The new Tracker, instead, should have all of the Contexts of the mainTracker + the extra Config provided
    expect(sectionTracker.locationStack).toEqual([
      { _context_type: 'section', id: 'root' },
      { _context_type: 'section', id: 'A' },
      { _context_type: 'section', id: 'B' },
      { _context_type: 'section', id: 'C' },
    ]);
    expect(sectionTracker.globalContexts).toEqual([
      { _context_type: 'global', id: 'X' },
      { _context_type: 'global', id: 'Y' },
      { _context_type: 'global', id: 'Z' },
    ]);
  });

  describe('trackEvent', () => {
    const eventContexts = {
      locationStack: [
        { _context_type: 'section', id: 'B' },
        { _context_type: 'item', id: 'C' },
      ],
      globalContexts: [
        { _context_type: 'global', id: 'W' },
        { _context_type: 'global', id: 'X' },
      ],
    };
    const testEvent = new TrackerEvent(
      {
        eventName: 'test-event',
      },
      eventContexts
    );

    it('should merge Tracker Location Stack and Global Contexts with the Event ones', () => {
      const trackerContexts = {
        locationStack: [
          { _context_type: 'section', id: 'root' },
          { _context_type: 'section', id: 'A' },
        ],
        globalContexts: [
          { _context_type: 'global', id: 'Y' },
          { _context_type: 'global', id: 'Z' },
        ],
      };
      const testTracker = new Tracker(trackerContexts);
      expect(testEvent.locationStack).toStrictEqual(eventContexts.locationStack);
      expect(testEvent.globalContexts).toStrictEqual(eventContexts.globalContexts);
      const trackedEvent = testTracker.trackEvent(testEvent);
      expect(testEvent.locationStack).toStrictEqual(eventContexts.locationStack);
      expect(testEvent.globalContexts).toStrictEqual(eventContexts.globalContexts);
      expect(testTracker.locationStack).toStrictEqual(trackerContexts.locationStack);
      expect(testTracker.globalContexts).toStrictEqual(trackerContexts.globalContexts);
      expect(trackedEvent.locationStack).toStrictEqual([
        { _context_type: 'section', id: 'root' },
        { _context_type: 'section', id: 'A' },
        { _context_type: 'section', id: 'B' },
        { _context_type: 'item', id: 'C' },
      ]);
      expect(trackedEvent.globalContexts).toStrictEqual([
        { _context_type: 'global', id: 'W' },
        { _context_type: 'global', id: 'X' },
        { _context_type: 'global', id: 'Y' },
        { _context_type: 'global', id: 'Z' },
      ]);
    });

    it('should execute all plugins implementing the beforeTransport callback', () => {
      const pluginC: TrackerPlugin = { pluginName: 'pluginC', beforeTransport: jest.fn(noop) };
      const pluginD: TrackerPlugin = { pluginName: 'pluginD', beforeTransport: jest.fn(noop) };
      const testTracker = new Tracker({ plugins: new TrackerPlugins([pluginC, pluginD]) });
      testTracker.trackEvent(testEvent);
      expect(pluginC.beforeTransport).toHaveBeenCalledWith(testEvent);
      expect(pluginC.beforeTransport).toHaveBeenCalledWith(testEvent);
    });

    it('should send the Event via the given Transport', () => {
      const testTransport = new LogTransport();
      jest.spyOn(testTransport, 'handle');
      const testTracker = new Tracker({ transport: testTransport });
      testTracker.trackEvent(testEvent);
      expect(testTransport.handle).toHaveBeenCalledWith(testEvent);
    });
  });
});
