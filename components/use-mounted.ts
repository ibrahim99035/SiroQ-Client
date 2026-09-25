"use client";

import { useEffect, useState } from "react";

/** True once the component has hydrated on the client (avoids SSR/hydration text drift). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}