import type { Recurrence, Task } from '../types';

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const addDays = (s: string, n: number) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (a: string, b: string) => Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);

export function addMonths(s: string, n: number) {
  const d = fromISO(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}

export function startOfWeek(s: string, weekStart: 0 | 1) {
  return addDays(s, -((fromISO(s).getDay() - weekStart + 7) % 7));
}

/** 42 ISO dates (6 weeks) covering the given month. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): string[] {
  const start = startOfWeek(toISO(new Date(year, month, 1)), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const fmtDay = (s: string, withYear = false) =>
  fromISO(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

export function relDay(s: string, today = todayISO()) {
  const n = diffDays(s, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fromISO(s).toLocaleDateString(undefined, { weekday: 'long' });
  return fmtDay(s, fromISO(s).getFullYear() !== new Date().getFullYear());
}

export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(sec: number) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${pad(m)}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

export function fmtClock(sec: number) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${pad(m)}` : pad(m)) + `:${pad(s)}`;
}

export type DueTone = 'over' | 'today' | 'soon' | 'future' | 'done';
export function dueInfo(t: Pick<Task, 'due' | 'dueTime' | 'status'>, today = todayISO()): { label: string; tone: DueTone } | null {
  if (!t.due) return null;
  const label = relDay(t.due, today) + (t.dueTime ? ' ' + fmtTime(t.dueTime) : '');
  if (t.status === 'done') return { label, tone: 'done' };
  const n = diffDays(t.due, today);
  return { label, tone: n < 0 ? 'over' : n === 0 ? 'today' : n <= 2 ? 'soon' : 'future' };
}

export const isOverdue = (t: Pick<Task, 'due' | 'status'>, today = todayISO()) =>
  t.status !== 'done' && !!t.due && t.due < today;

export function describeRecurrence(r: Recurrence) {
  if (r.freq === 'weekdays') return 'Every weekday';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}
