// Safe shared-plan import semantics (BUG-01).
// Pure functions only: no React, no storage, no URL access - the import/undo
// rules are unit-tested directly in scripts/verify-share.mjs.

/** Refuse absurd payloads instead of importing them blindly. */
export const MAX_SHARE_KEYS = 500;

/**
 * Validate a decoded ?b= payload before anything touches state or storage.
 * Returns a de-duplicated string array, or null when the payload is empty,
 * malformed, or oversized (callers treat null as "not a usable share link").
 */
export function sanitizeSharedKeys(raw) {
  if (!Array.isArray(raw)) return null;
  const keys = [...new Set(
    raw
      .filter((k) => typeof k === 'string')
      .map((k) => k.trim())
      .filter(Boolean)
  )];
  if (keys.length === 0 || keys.length > MAX_SHARE_KEYS) return null;
  return keys;
}

/**
 * Import `shared` into `local` for the given mode.
 *   replace -> the shared plan becomes the whole selection
 *   merge   -> local keys keep their order, unseen shared keys are appended
 * Both sides are de-duplicated. `added`/`removed` describe the exact delta
 * versus `local`, so the caller can offer a precise undo afterwards.
 */
export function computeImport(mode, local, shared) {
  const localList = [...new Set(local)];
  const sharedList = [...new Set(shared)];
  const localSet = new Set(localList);

  let next;
  if (mode === 'replace') {
    next = sharedList;
  } else {
    next = [...localList];
    for (const k of sharedList) if (!localSet.has(k)) next.push(k);
  }

  const nextSet = new Set(next);
  return {
    keys: next,
    added: next.filter((k) => !localSet.has(k)),
    removed: localList.filter((k) => !nextSet.has(k)),
  };
}

/**
 * Undo an import relative to the CURRENT list, not the import-time list, so
 * unrelated changes the user made after importing survive: keys the import
 * added are removed again (where still present), keys the import removed are
 * restored (where still absent).
 */
export function computeUndo(delta, current) {
  const addedSet = new Set(delta.added);
  const removedList = [...new Set(delta.removed)];
  const next = current.filter((k) => !addedSet.has(k));
  for (const k of removedList) if (!next.includes(k)) next.push(k);
  return next;
}
