// Approximate teaching-term configuration for the .ics export (ISSUE 1).
//
// The university has NO fixed, officially stable semester dates. The three
// academic periods below are APPROXIMATE presets the owner keeps editable in
// public/semester.json (no code changes per term). Two hard rules follow:
//   1. Approximate dates are never presented as official or verified.
//   2. Weekly class events are only generated after the USER has seen and
//      confirmed (or edited) the dates for the current export. Exam events,
//      which are exact, may always be exported on their own.

import { jalaliToDate } from './datetime.js';

const JALALI_DATE_RE = /^([1-9][0-9]{3})\/([0-9]{1,2})\/([0-9]{1,2})$/;

export const SEMESTER_TYPES = ['fall', 'winter', 'summer'];

/**
 * "1405/07/01" (Jalali y/m/d) -> UTC-midnight Date, or null when the value is
 * malformed or not a real Jalali calendar day (month-length aware).
 */
export const parseJalaliDate = (value) => {
  const m = JALALI_DATE_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  return jalaliToDate(+m[1], +m[2], +m[3]);
};

/**
 * Validate one semester entry. Returns
 * { semesterStart: Date, teachingEnd: Date, label, startText, endText } or null.
 * The original text travels with the window so the confirm dialog can prefill
 * editable fields (a Date cannot be inverted back to Jalali text).
 * Pure - unit-tested in scripts/verify-megafeatures.mjs.
 */
export const validateSemesterEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const startText = String(entry.semesterStart ?? '').trim();
  const endText = String(entry.teachingEnd ?? '').trim();
  const semesterStart = parseJalaliDate(startText);
  const teachingEnd = parseJalaliDate(endText);
  if (!semesterStart || !teachingEnd || teachingEnd <= semesterStart) return null;
  const label = String(entry.label ?? '').trim() || 'ترم';
  return { semesterStart, teachingEnd, label, startText, endText };
};

/**
 * Load and validate public/semester.json (the owner's editable presets).
 * Returns { active, semesters: { [type]: {semesterStart, teachingEnd, label} } }
 * or null when the file is absent or unusable.
 */
export const loadSemesterConfig = async (baseUrl = '/') => {
  try {
    const res = await fetch(`${baseUrl}semester.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== 'object' || !json.semesters) return null;
    const semesters = {};
    let validCount = 0;
    for (const type of Object.keys(json.semesters)) {
      const entry = validateSemesterEntry(json.semesters[type]);
      if (entry) {
        semesters[type] = entry;
        validCount += 1;
      }
    }
    if (validCount === 0) return null;
    const active = SEMESTER_TYPES.includes(json.active) && semesters[json.active]
      ? json.active
      : Object.keys(semesters)[0];
    return { active, semesters };
  } catch {
    // Missing file / offline / bad JSON: the calendar simply stays exam-only.
    return null;
  }
};

/**
 * The teaching window for one semester type, or null. Pure.
 */
export const semesterWindow = (config, type) => {
  if (!config?.semesters) return null;
  return config.semesters[type] ?? null;
};
