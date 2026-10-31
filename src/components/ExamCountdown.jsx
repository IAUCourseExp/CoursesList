// Live exam countdown, driven by the trusted multi-source clock (lib/timeSource.js).
// Two pieces so the modal can place them in different spots:
//   <ExamCountdownBadge/>   - the state pill in the box header (upcoming/ongoing/finished)
//   <ExamCountdownDetails/> - the ticking "X روز و Y ساعت تا شروع امتحان" line + time-source note
// Both subscribe to the same shared per-second ticker, so no extra timers exist.

import { useExamCountdown, useTehranDay } from '../lib/hooks.js';
import { useTimeState } from '../lib/TimeContext.jsx';
import { timeBadgeMeta } from '../lib/timeSource.js';
import { relativeDayLabel, faCountdownLabel, daysUntil } from '../lib/datetime.js';

export function ExamCountdownBadge({ exam }) {
  const cd = useExamCountdown(exam);
  // No parsable time in the cell (or no cell): fall back to the day badge only.
  const dayKey = useTehranDay();
  if (!exam) return null;

  const pillCls = 'rounded-full px-2 py-0.5 text-[10.5px] font-black whitespace-nowrap';

  if (!cd || cd.status === 'unknown') {
    const daysLeft = daysUntil(exam.date, dayKey * 86400000);
    if (daysLeft === null || daysLeft < 0) return null;
    const urgent = daysLeft <= 3;
    return (
      <span className={`${pillCls} ${urgent ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-amber-100 text-amber-800'}`}>
        {relativeDayLabel(daysLeft)}
      </span>
    );
  }

  if (cd.status === 'ongoing') {
    return (
      <span className={`${pillCls} bg-rose-600 text-white animate-pulse`}>
        در حال برگزاری
      </span>
    );
  }

  if (cd.status === 'finished') {
    return <span className={`${pillCls} bg-slate-200 text-slate-500`}>برگزار شد</span>;
  }

  const urgent = cd.daysLeft !== null && cd.daysLeft >= 0 && cd.daysLeft <= 3;
  return (
    <span className={`${pillCls} ${urgent ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-100 text-amber-800'}`}>
      {relativeDayLabel(cd.daysLeft)}
    </span>
  );
}

export function ExamCountdownDetails({ exam }) {
  const cd = useExamCountdown(exam);
  const { confidence, clockDrift, sourceType } = useTimeState();
  if (!exam || !cd || cd.status === 'unknown' || cd.status === 'finished') return null;

  // Source type and confidence are mapped by the shared pure helper (ISSUE 4):
  // network synchronization is never presented as an official time.
  const meta = timeBadgeMeta(sourceType, confidence);
  const targetLabel = cd.status === 'ongoing' ? 'تا پایان امتحان' : 'تا شروع امتحان';
  const live = faCountdownLabel(cd.parts);

  return (
    <>
      {live && (
        <p className="mt-1.5 flex items-center gap-1 text-[11.5px] font-black text-amber-900 tabular-nums" dir="rtl">
          <span aria-hidden="true">⏳</span>
          <span>{live} {targetLabel}</span>
        </p>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400" title={meta.title}>
        <span className={`inline-block size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
        <span>بر اساس {meta.label}</span>
        {clockDrift && (
          <span className="font-bold text-rose-500">
            · ساعت دستگاه شما با زمان رسمی نمی‌خواند
          </span>
        )}
      </p>
    </>
  );
}
