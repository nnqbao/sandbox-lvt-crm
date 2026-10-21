// Stand-in for `@convex-dev/auth/react` inside the guide harness only.
import React from 'react';

const guide = () => window.__GUIDE__ || {};

export function ConvexAuthProvider({ children }) {
  return <>{children}</>;
}

export function useAuthActions() {
  return {
    signIn: async () => ({ signingIn: false }),
    signOut: async () => {},
  };
}

export function useConvexAuth() {
  return {
    isLoading: false,
    isAuthenticated: !guide().signedOut,
    fetchAccessToken: async () => null,
  };
}

export function useAuthToken() {
  return null;
}
