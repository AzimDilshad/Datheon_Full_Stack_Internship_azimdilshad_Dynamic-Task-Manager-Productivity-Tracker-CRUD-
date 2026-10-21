import type { Activity, Session, Status, Task } from '../types';
import { todayISO } from './dates';
import { nextDueFrom } from './recurrence';
import { uid } from './utils';

export const addLog = (a: Activity[], text: string, now = Date.now()): Activity[] => [{ at: now, text }, ...a].slice(0, 40);

export function blankTask(p: Partial<Task> = {}): Task {
  const now = Date.now();
  return {
    id: uid(), title: '', notes: '', status: 'todo', priority: 3, projectId: null, tags: [],
    due: null, dueTime: null, estimate: null, subtasks: [], recurrence: null, blockedBy: [],
    reminder: null, remindedFor: null, timeSpent: 0, timerStartedAt: null, order: 0,
    created: now, updated: now, completedAt: null, archived: false, deleted: null,
    activity: [{ at: now, text: 'Created' }], ...p
  };
}

export function stopTimer(t: Task, now: number): [Task, Session | null] {
  if (!t.timerStartedAt) return [t, null];
  const seconds = Math.max(0, Math.round((now - t.timerStartedAt) / 1000));
  return [{ ...t, timeSpent: t.timeSpent + seconds, timerStartedAt: null }, seconds >= 5 ? { id: uid(), at: now, seconds, taskId: t.id } : null];
}

/**
 * Pure status transition. Completing a recurring task keeps one history copy marked done
 * and rolls the original forward to its next due date.
 */
export function applyStatus(tasks: Task[], id: string, status: Status, now = Date.now()): [Task[], Session[]] {
  const cur = tasks.find((x) => x.id === id);
  if (!cur || cur.status === status) return [tasks, []];
  const [t, session] = stopTimer(cur, now);
  const sessions = session ? [session] : [];

  if (status === 'done' && t.recurrence) {
    const today = todayISO();
    const next = nextDueFrom(t.due ?? today, t.recurrence, today);
    const copy: Task = {
      ...t, id: uid(), recurrence: null, blockedBy: [], status: 'done', completedAt: now, updated: now,
      activity: [{ at: now, text: 'Completed (recurring)' }]
    };
    const rolled: Task = {
      ...t, status: 'todo', due: next, completedAt: null, timeSpent: 0, remindedFor: null, updated: now,
      subtasks: t.subtasks.map((s) => ({ ...s, done: false })), activity: addLog(t.activity, `Next occurrence ${next}`, now)
    };
    return [tasks.map((x) => (x.id === id ? rolled : x)).concat(copy), sessions];
  }

  const changed: Task = {
    ...t, status, updated: now, completedAt: status === 'done' ? now : null,
    activity: addLog(t.activity, status === 'done' ? 'Completed' : `Status set to ${status}`, now)
  };
  return [tasks.map((x) => (x.id === id ? changed : x)), sessions];
}

export const isBlocked = (t: Task, byId: Map<string, Task>) =>
  t.blockedBy.some((id) => { const b = byId.get(id); return !!b && b.status !== 'done' && !b.deleted; });

/** True if making `blockerId` block `id` would create a dependency cycle. */
export function wouldCycle(tasks: Task[], id: string, blockerId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [blockerId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    byId.get(cur)?.blockedBy.forEach((x) => stack.push(x));
  }
  return false;
}

export const subtaskProgress = (t: Task): [number, number] | null =>
  t.subtasks.length ? [t.subtasks.filter((s) => s.done).length, t.subtasks.length] : null;

export const elapsed = (t: Task, now: number) =>
  t.timeSpent + (t.timerStartedAt ? Math.max(0, (now - t.timerStartedAt) / 1000) : 0);

/* ---------- sanitising untrusted data (imports, sync) ---------- */
const FREQS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const strings = (v: unknown, n: number, max: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, n).map((x) => x.slice(0, max)) : [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeTask(r: any): Task | null {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.title !== 'string' || !r.title.trim()) return null;
  const now = Date.now();
  return blankTask({
    id: r.id.slice(0, 40),
    title: r.title.trim().slice(0, 200),
    notes: str(r.notes, 5000),
    status: ['todo', 'doing', 'review', 'done'].includes(r.status) ? r.status : 'todo',
    priority: [1, 2, 3, 4].includes(r.priority) ? r.priority : 3,
    projectId: typeof r.projectId === 'string' ? r.projectId : null,
    tags: strings(r.tags, 20, 30),
    due: /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null,
    dueTime: /^\d{2}:\d{2}$/.test(r.dueTime) ? r.dueTime : null,
    estimate: num(r.estimate),
    subtasks: Array.isArray(r.subtasks)
      ? r.subtasks.filter((s: any) => s && typeof s.title === 'string').slice(0, 100)
          .map((s: any) => ({ id: typeof s.id === 'string' ? s.id : uid(), title: s.title.slice(0, 200), done: !!s.done }))
      : [],
    recurrence: r.recurrence && FREQS.includes(r.recurrence.freq)
      ? { freq: r.recurrence.freq, interval: Math.max(1, Math.floor(Number(r.recurrence.interval)) || 1) } : null,
    blockedBy: strings(r.blockedBy, 20, 40),
    reminder: num(r.reminder),
    remindedFor: typeof r.remindedFor === 'string' ? r.remindedFor : null,
    timeSpent: num(r.timeSpent) ?? 0,
    timerStartedAt: num(r.timerStartedAt),
    order: num(r.order) ?? 0,
    created: num(r.created) ?? now,
    updated: num(r.updated) ?? now,
    completedAt: num(r.completedAt),
    archived: !!r.archived,
    deleted: num(r.deleted),
    activity: Array.isArray(r.activity)
      ? r.activity.filter((a: any) => a && typeof a.text === 'string' && typeof a.at === 'number').slice(0, 40).map((a: any) => ({ at: a.at, text: a.text.slice(0, 200) }))
      : []
  });
}
