import { useEffect } from 'react';
import type { GroupKey, Project, SortKey, Task } from '../types';
import { addDays } from '../lib/dates';
import { PRIORITY, STATUSES } from '../lib/utils';
import { useStore } from '../store';

export function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const by: Record<SortKey, (a: Task, b: Task) => number> = {
    manual: (a, b) => a.order - b.order,
    due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || a.priority - b.priority || a.order - b.order,
    priority: (a, b) => a.priority - b.priority || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.order - b.order,
    created: (a, b) => b.created - a.created,
    updated: (a, b) => b.updated - a.updated,
    title: (a, b) => a.title.localeCompare(b.title)
  };
  return [...tasks].sort(by[key]);
}

export interface Group { id: string; title: string; color?: string; tasks: Task[] }

export function groupTasks(tasks: Task[], key: GroupKey, projects: Project[], today: string): Group[] {
  if (key === 'none') return [{ id: 'all', title: '', tasks }];
  const defs: { id: string; title: string; color?: string; test: (t: Task) => boolean }[] =
    key === 'status' ? STATUSES.map((s) => ({ id: s.id, title: s.label, test: (t) => t.status === s.id }))
    : key === 'priority' ? ([1, 2, 3, 4] as const).map((p) => ({ id: 'p' + p, title: PRIORITY[p].label, color: `var(--p${p})`, test: (t) => t.priority === p }))
    : key === 'project' ? [...projects.map((p) => ({ id: p.id, title: p.name, color: p.color, test: (t: Task) => t.projectId === p.id })), { id: 'none', title: 'No project', test: (t: Task) => !t.projectId }]
    : [
      { id: 'over', title: 'Overdue', test: (t) => !!t.due && t.due < today },
      { id: 'today', title: 'Today', test: (t) => t.due === today },
      { id: 'tom', title: 'Tomorrow', test: (t) => t.due === addDays(today, 1) },
      { id: 'week', title: 'Next 7 days', test: (t) => !!t.due && t.due > addDays(today, 1) && t.due <= addDays(today, 7) },
      { id: 'later', title: 'Later', test: (t) => !!t.due && t.due > addDays(today, 7) },
      { id: 'none', title: 'No date', test: (t) => !t.due }
    ];
  return defs.map((d) => ({ id: d.id, title: d.title, color: d.color, tasks: tasks.filter(d.test) })).filter((g) => g.tasks.length);
}

/** Tells the keyboard-navigation layer which task ids are on screen, in order. */
export function useVisibleIds(ids: string[]) {
  const key = ids.join(',');
  useEffect(() => { useStore.getState().ui({ visibleIds: ids }); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
