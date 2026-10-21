import { describe, expect, it } from 'vitest';
import { parseQuick } from '../src/lib/parse';
import { nextDue, nextDueFrom } from '../src/lib/recurrence';
import { addDays, addMonths, monthGrid } from '../src/lib/dates';
import { mergeData } from '../src/lib/merge';
import { applyStatus, blankTask, wouldCycle } from '../src/lib/task';
import { matchesQuery } from '../src/lib/filter';
import { convertLegacy } from '../src/lib/importer';
import { toCSV, toICS } from '../src/lib/export';
import type { Project } from '../src/types';

const today = '2026-10-20'; // a Tuesday
const projects: Project[] = [{ id: 'p1', name: 'Home Chores', color: '#000', updated: 1 }, { id: 'p2', name: 'Work', color: '#000', updated: 1 }];
const parse = (s: string) => parseQuick(s, { projects, today });

describe('quick add parser', () => {
  it('extracts everything from a rich sentence', () => {
    const p = parse('Call dentist tomorrow 5pm !1 #home @health ~30m');
    expect(p.title).toBe('Call dentist');
    expect(p.due).toBe('2026-10-21');
    expect(p.dueTime).toBe('17:00');
    expect(p.priority).toBe(1);
    expect(p.projectId).toBe('p1');
    expect(p.tags).toEqual(['health']);
    expect(p.estimate).toBe(30);
  });
  it('handles weekdays, repeats and month names', () => {
    expect(parse('Gym fri').due).toBe('2026-10-23');
    expect(parse('Gym tue').due).toBe('2026-10-27');
    const r = parse('Water plants every 2 weeks');
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 2 });
    expect(r.due).toBe(today);
    expect(parse('Review every mon')).toMatchObject({ due: '2026-10-26', recurrence: { freq: 'weekly', interval: 1 } });
    expect(parse('Tax return jan 5').due).toBe('2027-01-05');
    expect(parse('Party 5 nov').due).toBe('2026-11-05');
    expect(parse('Standup weekdays 9:30').recurrence?.freq).toBe('weekdays');
  });
  it('leaves unknown #tokens and plain text alone', () => {
    const p = parse('Fix #unknown bug');
    expect(p.projectId).toBeUndefined();
    expect(p.title).toBe('Fix #unknown bug');
    expect(parse('Estimate ~1h30m').estimate).toBe(90);
    expect(parse('Reject feb 31').due).toBeUndefined();
  });
});

describe('dates and recurrence', () => {
  it('clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
  });
  it('weekday recurrence skips weekends', () => {
    expect(nextDue('2026-10-23', { freq: 'weekdays', interval: 1 })).toBe('2026-10-26');
  });
  it('skips occurrences already in the past', () => {
    expect(nextDueFrom('2026-10-01', { freq: 'daily', interval: 1 }, today)).toBe(today);
  });
  it('builds a 6 week grid starting on the chosen weekday', () => {
    const g = monthGrid(2026, 9, 1);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-09-28');
    expect(monthGrid(2026, 9, 0)[0]).toBe('2026-09-27');
    expect(addDays(g[0], 1)).toBe(g[1]);
  });
});

describe('task logic', () => {
  it('completing a recurring task rolls it forward and keeps a done copy', () => {
    const t = blankTask({ id: 'a', title: 'Water', due: today, recurrence: { freq: 'weekly', interval: 1 }, subtasks: [{ id: 's', title: 'x', done: true }] });
    const [tasks] = applyStatus([t], 'a', 'done');
    expect(tasks).toHaveLength(2);
    const rolled = tasks.find((x) => x.id === 'a')!;
    expect(rolled.status).toBe('todo');
    expect(rolled.due! > today).toBe(true);
    expect(rolled.subtasks[0].done).toBe(false);
    expect(tasks.find((x) => x.id !== 'a')!.status).toBe('done');
  });
  it('stops a running timer when a task completes', () => {
    const t = blankTask({ id: 'a', title: 'x', timerStartedAt: Date.now() - 120000 });
    const [tasks, sessions] = applyStatus([t], 'a', 'done');
    expect(tasks[0].timerStartedAt).toBeNull();
    expect(tasks[0].timeSpent).toBeGreaterThanOrEqual(119);
    expect(sessions).toHaveLength(1);
  });
  it('detects dependency cycles', () => {
    const a = blankTask({ id: 'a', title: 'a', blockedBy: ['b'] });
    const b = blankTask({ id: 'b', title: 'b', blockedBy: ['c'] });
    const c = blankTask({ id: 'c', title: 'c' });
    expect(wouldCycle([a, b, c], 'c', 'a')).toBe(true);
    expect(wouldCycle([a, b, c], 'a', 'c')).toBe(false);
  });
});

describe('merge', () => {
  const mk = (id: string, updated: number, title: string) => blankTask({ id, title, updated });
  it('keeps the newest record and honours tombstones', () => {
    const a = { tasks: [mk('1', 5, 'old'), mk('2', 5, 'gone')], projects: [], tombstones: [], sessions: [] };
    const b = { tasks: [mk('1', 9, 'new'), mk('3', 1, 'extra')], projects: [], tombstones: ['2'], sessions: [] };
    const m = mergeData(a, b);
    expect(m.tasks.map((t) => t.title).sort()).toEqual(['extra', 'new']);
    expect(m.tombstones).toEqual(['2']);
  });
});

describe('search, import and export', () => {
  const t = blankTask({ title: 'Pay rent', tags: ['bills'], priority: 1, projectId: 'p1', due: today, notes: 'landlord' });
  it('supports operators', () => {
    const ctx = { projects, today };
    expect(matchesQuery(t, 'rent @bills p1', ctx)).toBe(true);
    expect(matchesQuery(t, '#home due:today', ctx)).toBe(true);
    expect(matchesQuery(t, '-landlord', ctx)).toBe(false);
    expect(matchesQuery(t, 'is:done', ctx)).toBe(false);
  });
  it('converts the original Taskbook format', () => {
    const r = convertLegacy({ tasks: [{ id: 'x', title: 'Old', category: 'Work', priority: 'high', done: true, due: '2026-01-01' }], categories: ['Work'] })!;
    expect(r.projects[0].name).toBe('Work');
    expect(r.tasks[0]).toMatchObject({ status: 'done', priority: 2, projectId: r.projects[0].id });
  });
  it('exports CSV and ICS', () => {
    expect(toCSV([t], projects).split('\r\n')[1]).toContain('Pay rent');
    expect(toICS([t], projects)).toContain('DUE;VALUE=DATE:20261020');
  });
});
