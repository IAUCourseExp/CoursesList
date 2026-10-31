// Trusted-clock state context for React components
import { createContext, useContext } from 'react';

export const TimeStateContext = createContext({
  offsetMs: 0,
  confidence: 'low',
  clockDrift: false,
  pin: false,
  sourceIds: [],
  sourceType: 'device',
});

/** Hook for accessing trusted-clock state from TimeSourceProvider context */
export const useTimeState = () => {
  const context = useContext(TimeStateContext);
  if (!context) {
    throw new Error('useTimeState must be used within a TimeSourceProvider');
  }
  return context;
};