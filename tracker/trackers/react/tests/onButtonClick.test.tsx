import { makeButtonContext } from '@objectiv/tracker-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { onButtonClick, ReactTracker, TrackerContextProvider, TrackerNavigation, TrackerSection } from '../src';

describe('onButtonClick', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const spyTransport = { transportName: 'SpyTransport', handle: jest.fn(), isUsable: () => true };
  const renderSpy = jest.fn();
  const tracker = new ReactTracker({ transport: spyTransport });

  const TestApp = () => {
    renderSpy();

    return (
      <TrackerContextProvider tracker={tracker}>
        <TrackerSection id={'root'}>
          <TrackerNavigation id={'main-nav'}>
            <Button />
          </TrackerNavigation>
        </TrackerSection>
      </TrackerContextProvider>
    );
  };

  const Button = () => (
    <button
      data-testid="test-button"
      onClick={onButtonClick(makeButtonContext({ id: 'buttonA', text: 'confirm button' }))}
      value={'Proceed'}
    />
  );

  it('should not execute on mount', () => {
    render(<TestApp />);

    expect(spyTransport.handle).not.toHaveBeenCalled();
  });

  it('should not execute on unmount', () => {
    const { unmount } = render(<TestApp />);

    unmount();

    expect(spyTransport.handle).not.toHaveBeenCalled();
  });

  it('should not execute on rerender', () => {
    const { rerender } = render(<TestApp />);

    rerender(<TestApp />);
    rerender(<TestApp />);

    expect(renderSpy).toHaveBeenCalledTimes(3);
    expect(spyTransport.handle).not.toHaveBeenCalled();
  });

  it('should execute on click', () => {
    render(<TestApp />);

    const testButton = screen.getByTestId('test-button');

    fireEvent.click(testButton);
    fireEvent.click(testButton);
    fireEvent.click(testButton);

    expect(spyTransport.handle).toHaveBeenCalledTimes(3);
    expect(spyTransport.handle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: 'ClickEvent',
        globalContexts: expect.arrayContaining([expect.objectContaining({ _context_type: 'DeviceContext' })]),
        locationStack: expect.arrayContaining([
          expect.objectContaining({ _context_type: 'SectionContext' }),
          expect.objectContaining({ _context_type: 'NavigationContext' }),
          expect.objectContaining({ _context_type: 'ButtonContext' }),
        ]),
      })
    );
    expect(spyTransport.handle).toHaveBeenNthCalledWith(2, expect.objectContaining({ event: 'ClickEvent' }));
    expect(spyTransport.handle).toHaveBeenNthCalledWith(3, expect.objectContaining({ event: 'ClickEvent' }));
  });

  it('should allow overriding the tracker with a custom one', () => {
    const TestApp = () => (
      <TrackerContextProvider tracker={tracker}>
        <TrackerSection id={'root'}>
          <Button />
        </TrackerSection>
      </TrackerContextProvider>
    );
    const spyTransport2 = { transportName: 'spyTransport2', handle: jest.fn(), isUsable: () => true };
    const anotherTracker = new ReactTracker({ transport: spyTransport2 });
    const Button = () => (
      <button
        data-testid="test-button"
        onClick={onButtonClick(makeButtonContext({ id: 'buttonA', text: 'confirm button' }), anotherTracker)}
        value={'Proceed'}
      />
    );

    render(<TestApp />);

    const testButton = screen.getByTestId('test-button');

    fireEvent.click(testButton);

    expect(spyTransport.handle).not.toHaveBeenCalled();
    expect(spyTransport2.handle).toHaveBeenCalledTimes(1);
    expect(spyTransport2.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ClickEvent',
        globalContexts: expect.arrayContaining([expect.objectContaining({ _context_type: 'DeviceContext' })]),
        locationStack: expect.arrayContaining([
          expect.not.objectContaining({ _context_type: 'SectionContext' }),
          expect.objectContaining({ _context_type: 'ButtonContext' }),
        ]),
      })
    );
  });
});
