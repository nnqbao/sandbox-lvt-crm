// Stand-in for `convex/react` inside the guide harness only.
// Every query/mutation/action resolves from fictional fixtures (./fixtures).
import React, { useMemo } from 'react';
import { getFunctionName } from 'convex/server';
import { runMutation, runQuery } from './fixtures/index.js';

const guide = () => window.__GUIDE__ || {};
const isSignedOut = () => Boolean(guide().signedOut);
const queryCache = new Map();

function cachedQuery(name, args) {
  const key = `${name}|${JSON.stringify(args ?? {})}`;
  if (!queryCache.has(key)) queryCache.set(key, runQuery(name, args ?? {}));
  return queryCache.get(key);
}

export class ConvexReactClient {
  constructor(address) {
    this.address = address;
  }

  query(ref, args) {
    return Promise.resolve(cachedQuery(getFunctionName(ref), args));
  }

  mutation(ref, args) {
    return Promise.resolve(runMutation(getFunctionName(ref), args ?? {}));
  }

  action(ref, args) {
    return Promise.resolve(runMutation(getFunctionName(ref), args ?? {}));
  }

  watchQuery(ref, args) {
    const value = cachedQuery(getFunctionName(ref), args);
    return { onUpdate: () => () => {}, localQueryResult: () => value, journal: () => undefined };
  }

  setAuth() {}

  clearAuth() {}

  close() {
    return Promise.resolve();
  }
}

const sharedClient = new ConvexReactClient('https://guide-harness.invalid');

export function ConvexProvider({ children }) {
  return <>{children}</>;
}

export function useConvex() {
  return sharedClient;
}

export function useQuery(ref, args) {
  const name = getFunctionName(ref);
  if (args === 'skip') return undefined;
  return cachedQuery(name, args);
}

export function useQueries() {
  return {};
}

export function usePaginatedQuery(ref, args) {
  if (args === 'skip') return { results: [], status: 'LoadingFirstPage', isLoading: true, loadMore: () => {} };
  const value = cachedQuery(getFunctionName(ref), args) || {};
  return { results: value.page || value.results || [], status: 'Exhausted', isLoading: false, loadMore: () => {} };
}

function makeCallable(ref) {
  const name = getFunctionName(ref);
  const fn = (args) => Promise.resolve(runMutation(name, args ?? {}));
  fn.withOptimisticUpdate = () => fn;
  return fn;
}

export function useMutation(ref) {
  const name = getFunctionName(ref);
  return useMemo(() => makeCallable(ref), [name]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAction(ref) {
  return useMutation(ref);
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: !isSignedOut() };
}

export function Authenticated({ children }) {
  return isSignedOut() ? null : <>{children}</>;
}

export function Unauthenticated({ children }) {
  return isSignedOut() ? <>{children}</> : null;
}

export function AuthLoading() {
  return null;
}

export function useConvexConnectionState() {
  return { isWebSocketConnected: true, hasInflightRequests: false };
}
