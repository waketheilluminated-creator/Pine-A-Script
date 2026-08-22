"use client";

import { useSyncExternalStore } from "react";

const PINE_STORAGE_KEY = "pilab.pine.source.v1";
const PINE_CHANGE_EVENT = "pilab-pine-source-change";

export const SAMPLE_PINE = `//@version=5
indicator("Fast / Slow EMA", overlay=true)

fastLength = input.int(9, "Fast length")
slowLength = input.int(21, "Slow length")

fast = ta.ema(close, fastLength)
slow = ta.ema(close, slowLength)

plot(fast, "Fast EMA", color=color.aqua)
plot(slow, "Slow EMA", color=color.orange)
alertcondition(ta.crossover(fast, slow), "Bullish cross", "Fast EMA crossed above slow EMA")`;

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === PINE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PINE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PINE_CHANGE_EVENT, onChange);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(PINE_STORAGE_KEY) ?? SAMPLE_PINE;
}

export function usePineSource() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SAMPLE_PINE);
}

export function savePineSource(source: string) {
  window.localStorage.setItem(PINE_STORAGE_KEY, source);
  window.dispatchEvent(new Event(PINE_CHANGE_EVENT));
}
