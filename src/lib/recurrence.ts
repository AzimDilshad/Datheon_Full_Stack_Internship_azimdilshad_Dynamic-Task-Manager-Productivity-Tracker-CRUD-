import type { Recurrence } from '../types';
import { addDays, addMonths, fromISO } from './dates';

export function nextDue(from: string, r: Recurrence): string {
  const n = Math.max(1, r.interval);
  switch (r.freq) {
    case 'daily': return addDays(from, n);
    case 'weekly': return addDays(from, 7 * n);
    case 'monthly': return addMonths(from, n);
    case 'yearly': return addMonths(from, 12 * n);
    case 'weekdays': {
      let d = addDays(from, 1);
      while ([0, 6].includes(fromISO(d).getDay())) d = addDays(d, 1);
      return d;
    }
  }
}

/** Next occurrence after `due`, skipping any that are already in the past. */
export function nextDueFrom(due: string, r: Recurrence, today: string): string {
  let d = nextDue(due, r);
  for (let i = 0; i < 1000 && d < today; i++) d = nextDue(d, r);
  return d;
}
