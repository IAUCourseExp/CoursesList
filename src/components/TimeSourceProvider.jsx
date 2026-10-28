// Mounts the trusted-clock engine once for the whole app and exposes its state
// (confidence, drift flag, active sources) to the countdown UI. The state only
// changes a handful of times per session (per collected sample), so wrapping
// the tree is cheap - ticking itself happens in the useNow/useTehranDay hooks.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { timeSource } from '../lib/timeSource.js';

const TimeStateContext = createContext({
  offsetMs: 0,
  confidence: 'low',
  clockDrift: false,
  pin: false,
  sourceIds: [],
});

/** Current trusted-clock state: { offsetMs, confidence, clockDrift, pin, sourceIds }. */
export const useTimeState = () => useContext(TimeStateContext);

export default function TimeSourceProvider({ children }) {
  const [state, setState] = useState(() => timeSource.getState());

  useEffect(() => {
    const unsubscribe = timeSource.subscribe(setState);
    timeSource.ensureStarted();
    return unsubscribe;
  }, []);

  return <TimeStateContext.Provider value={state}>{children}</TimeStateContext.Provider>;
}
