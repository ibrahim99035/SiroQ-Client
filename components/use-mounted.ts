"use client";

import { useSyncExternalStore } from "react";

// The flag never actually changes after mount, so there is nothing to subscribe
// to. Using `useSyncExternalStore` lets the server snapshot answer `false` and
// the client snapshot answer `true`, which is already correct at hydration time.
// The previous `useState` + `useEffect` pair reported a stale `false` for one
// render after hydration and needed an extra render pass to correct itself.
const subscribe = () => () => {};

const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** True once the component has hydrated on the client (avoids SSR/hydration text drift). */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
