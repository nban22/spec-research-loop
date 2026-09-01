'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` once it has **held still** for `ms` milliseconds.
 *
 * Built for sliders: one drag fires dozens of `change` events, and no intermediate value is worth
 * a network call. The returned value keeps the **same reference** as `value`, so comparing
 * `value !== debounced` is a cheap way to know "a recomputation is pending".
 *
 * `setState` lives inside the timer, not in the effect body, so it does not violate
 * `react-hooks/set-state-in-effect`.
 */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return settled;
}
