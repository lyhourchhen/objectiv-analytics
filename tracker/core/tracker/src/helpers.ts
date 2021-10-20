import uuid from 'uuid-random';

/**
 * A TypeScript friendly Object.keys
 */
export const getObjectKeys = Object.keys as <T extends object>(obj: T) => Array<keyof T>;

/**
 * A TypeScript generic describing an array with at least one item of the given Type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * A TypeScript NonEmptyArray guard
 */
export function isNonEmptyArray<T>(array: T[]): array is NonEmptyArray<T> {
  return array.length > 0;
}

/**
 * A UUID v4 generator
 */
export const generateUUID = () => uuid();

/**
 * Executes the given predicate every `intervalMs` for a maximum of `timeoutMs`.
 * It resolves if the predicate returns true. Rejects if `timeoutMs` is reached.
 */
export const waitForPromise = async ({
  predicate,
  intervalMs,
  timeoutMs,
}: {
  predicate: Function;
  intervalMs: number;
  timeoutMs: number;
}) => {
  // If predicate is already truthy we can resolve right away
  if (predicate()) {
    return;
  }

  // We need to keep track of two timers, one for the state polling and one for the global timeout
  let timeoutTimer: ReturnType<typeof setTimeout>;
  let pollingTimer: ReturnType<typeof setTimeout>;

  // A promise that will resolve when `predicate` is truthy. It polls every `intervalMs`.
  const resolutionPromiseResolver = (resolve: Function) => {
    if (predicate()) {
      resolve();
    } else {
      clearTimeout(pollingTimer);
      pollingTimer = setTimeout(() => resolutionPromiseResolver(resolve), intervalMs);
    }
  };
  const resolutionPromise = new Promise<void>(resolutionPromiseResolver);

  // A promise that will reject after its timeout reaches `intervalMs`.
  const timeoutPromise = new Promise((_resolve, reject) => (timeoutTimer = setTimeout(reject, timeoutMs)));

  // Race resolutionPromise against the timeoutPromise. Either the predicate resolves first or we reject on timeout.
  return Promise.race([timeoutPromise, resolutionPromise]).finally(() => {
    clearTimeout(pollingTimer);
    clearTimeout(timeoutTimer);
  });
};
