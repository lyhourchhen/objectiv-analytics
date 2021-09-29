import { makeInputChangeEvent } from '@objectiv/tracker-core';
import { BrowserTracker, configureTracker } from '../src/';
import { makeBlurEventListener } from '../src/observer/makeBlurEventListener';
import { makeTaggedElement } from './mocks/makeTaggedElement';

describe('makeBlurEventListener', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    configureTracker({ applicationId: 'test', endpoint: 'test' });
    expect(window.objectiv.trackers.get()).toBeInstanceOf(BrowserTracker);
    jest.spyOn(window.objectiv.trackers.get(), 'trackEvent');
  });

  it('should track Input Change when invoked from a valid target', () => {
    const trackedInput = makeTaggedElement('input', null, 'input');
    const blurEventListener = makeBlurEventListener(trackedInput);

    trackedInput.addEventListener('blur', blurEventListener);
    trackedInput.dispatchEvent(new FocusEvent('blur'));

    expect(window.objectiv.trackers.get().trackEvent).toHaveBeenCalledTimes(1);
    expect(window.objectiv.trackers.get().trackEvent).toHaveBeenNthCalledWith(1, makeInputChangeEvent());
  });

  it('should not track Input Change when invoked from a bubbling target', () => {
    const trackedInput = makeTaggedElement('input1', null, 'input');
    const unrelatedInput = makeTaggedElement('input2', null, 'input');
    const blurEventListener = makeBlurEventListener(trackedInput);

    trackedInput.addEventListener('blur', blurEventListener);
    unrelatedInput.dispatchEvent(new FocusEvent('blur'));

    expect(window.objectiv.trackers.get().trackEvent).not.toHaveBeenCalled();
  });
});
