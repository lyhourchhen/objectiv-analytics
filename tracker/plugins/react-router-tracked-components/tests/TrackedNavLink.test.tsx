/*
 * Copyright 2021-2022 Objectiv B.V.
 */

import { TrackedNavLink, TrackedNavLinkProps } from '@objectiv/plugin-react-router-tracked-components';
import { SpyTransport } from '@objectiv/testing-tools';
import { Tracker } from '@objectiv/tracker-core';
import {
  ObjectivProvider,
  TrackedDiv,
  TrackedRootLocationContext,
  TrackingContextProvider,
} from '@objectiv/tracker-react';
import { fireEvent, getByTestId, render, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

describe('TrackedNavLink', () => {
  const spyTransport = { transportName: 'SpyTransport', handle: jest.fn(), isUsable: () => true };
  const tracker = new Tracker({ applicationId: 'app-id', transport: spyTransport });

  const cases: [TrackedNavLinkProps, { id: string; href: string }][] = [
    [
      { to: '/', children: 'test' },
      { id: 'test', href: '/' },
    ],
    [
      { to: '/slug', children: 'test' },
      { id: 'test', href: '/slug' },
    ],
    [
      { to: '/', children: 'test', id: 'custom-id' },
      { id: 'custom-id', href: '/' },
    ],
    [
      { to: { pathname: '/slug' }, children: 'test' },
      { id: 'test', href: '/slug' },
    ],
    [
      { to: { pathname: '/' }, children: 'test' },
      { id: 'test', href: '/' },
    ],
    [
      { to: { search: '?p=val' }, children: 'test' },
      { id: 'test', href: '/?p=val' },
    ],
    [
      { to: { pathname: '/', search: '?p=val' }, children: 'test' },
      { id: 'test', href: '/?p=val' },
    ],
    [
      { to: { hash: '#/hash' }, children: 'test' },
      { id: 'test', href: '/#/hash' },
    ],
    [
      { to: { pathname: '/', hash: '#/hash' }, children: 'test' },
      { id: 'test', href: '/#/hash' },
    ],
    [
      { to: { search: '?p=val', hash: '#/hash' }, children: 'test' },
      { id: 'test', href: '/?p=val#/hash' },
    ],
    [
      { to: { search: '?p=val', hash: '#/hash' }, children: 'test' },
      { id: 'test', href: '/?p=val#/hash' },
    ],
    [
      { to: { pathname: '/', search: '?p=val', hash: '#/hash' }, children: 'test' },
      { id: 'test', href: '/?p=val#/hash' },
    ],
    [
      { to: '/', children: '🏡', objectiv: { contextId: 'emoji' } },
      { id: 'emoji', href: '/' },
    ],
  ];

  cases.forEach(([linkProps, expectedAttributes]) => {
    it(`props: ${JSON.stringify(linkProps)} > LinkContext: ${JSON.stringify(expectedAttributes)}`, () => {
      jest.resetAllMocks();

      const { container } = render(
        <BrowserRouter>
          <TrackingContextProvider tracker={tracker}>
            <TrackedNavLink {...linkProps} data-testid={'test'}>
              test
            </TrackedNavLink>
          </TrackingContextProvider>
        </BrowserRouter>
      );

      fireEvent.click(getByTestId(container, 'test'));

      expect(spyTransport.handle).toHaveBeenCalledTimes(1);
      expect(spyTransport.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          _type: 'PressEvent',
          location_stack: [
            expect.objectContaining({
              _type: 'LinkContext',
              ...expectedAttributes,
            }),
          ],
        })
      );
    });
  });

  it('should console.error if an id cannot be automatically generated', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ObjectivProvider tracker={tracker}>
          <TrackedRootLocationContext Component={'div'} id={'root'}>
            <TrackedDiv id={'content'}>
              <TrackedNavLink to={'/'}>🏡</TrackedNavLink>
            </TrackedDiv>
          </TrackedRootLocationContext>
        </ObjectivProvider>
      </BrowserRouter>
    );

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      '｢objectiv｣ Could not generate id for LinkContext @ RootLocation:root / Content:content. Either add the `title` prop or specify an id manually via the  `id` option of the `objectiv` prop.'
    );
  });

  it('should allow forwarding refs', () => {
    const linkRef = React.createRef<HTMLAnchorElement>();

    render(
      <BrowserRouter>
        <ObjectivProvider tracker={tracker}>
          <TrackedNavLink to="/" ref={linkRef}>
            Press me!
          </TrackedNavLink>
        </ObjectivProvider>
      </BrowserRouter>
    );

    expect(linkRef.current).toMatchInlineSnapshot(`
      <a
        aria-current="page"
        class="active"
        href="/"
      >
        Press me!
      </a>
    `);
  });

  it('should execute the given onClick as well', async () => {
    const clickSpy = jest.fn();

    const { container } = render(
      <BrowserRouter>
        <ObjectivProvider tracker={tracker}>
          <TrackedNavLink data-testid={'test1'} to="/" onClick={clickSpy}>
            Press me!
          </TrackedNavLink>
          <TrackedNavLink data-testid={'test2'} to="/" onClick={clickSpy} reloadDocument={true}>
            Press me!
          </TrackedNavLink>
        </ObjectivProvider>
      </BrowserRouter>
    );

    fireEvent.click(getByTestId(container, 'test1'));
    fireEvent.click(getByTestId(container, 'test2'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(2));
  });

  it('should wait until tracked', async () => {
    jest.useFakeTimers();
    const clickSpy = jest.fn();
    const spyTransport = new SpyTransport();
    jest
      .spyOn(spyTransport, 'handle')
      .mockImplementation(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    const tracker = new Tracker({ applicationId: 'app-id', transport: spyTransport });
    jest.spyOn(spyTransport, 'handle');

    const { container } = render(
      <BrowserRouter>
        <ObjectivProvider tracker={tracker}>
          <TrackedNavLink data-testid={'test'} to="/some-url" reloadDocument={true} onClick={clickSpy}>
            Press me
          </TrackedNavLink>
        </ObjectivProvider>
      </BrowserRouter>
    );

    jest.resetAllMocks();

    fireEvent.click(getByTestId(container, 'test'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

    expect(spyTransport.handle).toHaveBeenCalledTimes(1);
    expect(spyTransport.handle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        _type: 'PressEvent',
        location_stack: expect.arrayContaining([
          expect.objectContaining({
            _type: 'LinkContext',
            id: 'press-me',
          }),
        ]),
      })
    );
  });
});