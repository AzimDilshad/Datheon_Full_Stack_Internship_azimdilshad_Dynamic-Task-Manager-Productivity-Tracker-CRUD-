import type { Data, Project, Task } from '../types';
import { blankTask } from './task';
import { sanitizeData } from './merge';
import { hashColor, uid } from './utils';

export const STORAGE_KEY = 'taskbook.v2';
const PRI: Record<string, 1 | 2 | 3 | 4> = { high: 2, medium: 3, low: 4 };

/** Converts the original Taskbook (v1) format: tasks with a `category` string and low/medium/high. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertLegacy(raw: any): Pick<Data, 'tasks' | 'projects'> | null {
  const list = Array.isArray(raw) ? raw : raw?.tasks;
  if (!Array.isArray(list)) return null;
  const names: string[] = Array.isArray(raw?.categories) ? raw.categories.filter((c: unknown) => typeof c === 'string') : [];
  for (const t of list) if (t && typeof t.category === 'string' && !names.includes(t.category)) names.push(t.category);
  const projects: Project[] = names.map((n) => ({ id: uid(), name: n.slice(0, 40), color: hashColor(n), updated: Date.now() }));
  const byName = new Map(projects.map((p) => [p.name, p.id]));
  const tasks: Task[] = [];
  list.forEach((t: any, i: number) => {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) return;
    const done = !!t.done;
    tasks.push(blankTask({
      id: typeof t.id === 'string' ? t.id : uid(), title: t.title.trim().slice(0, 200), notes: String(t.notes || '').slice(0, 5000),
      status: done ? 'done' : 'todo', priority: PRI[t.priority] ?? 3, projectId: byName.get(t.category) ?? null,
      due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : null, order: i,
      created: Number(t.created) || Date.now(), completedAt: done ? Number(t.completedAt) || Date.now() : null
    }));
  });
  return { tasks, projects };
}

export function loadLegacy(): Pick<Data, 'tasks' | 'projects'> | null {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return null;
    const t = localStorage.getItem('taskbook.tasks');
    if (!t) return null;
    const res = convertLegacy({ tasks: JSON.parse(t), categories: JSON.parse(localStorage.getItem('taskbook.categories') || '[]') });
    return res && res.tasks.length ? res : null;
  } catch { return null; }
}

/** Accepts a v2 export or a v1 Taskbook backup. */
export function parseImport(raw: unknown): Data | null {
  const v2 = sanitizeData(raw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const looksLegacy = Array.isArray(r?.tasks) && r.tasks.some((t: any) => t && 'category' in t) && !Array.isArray(r?.projects);
  if (looksLegacy || Array.isArray(raw)) {
    const l = convertLegacy(raw);
    return l ? { ...l, tombstones: [], sessions: [] } : null;
  }
  return v2;
}
