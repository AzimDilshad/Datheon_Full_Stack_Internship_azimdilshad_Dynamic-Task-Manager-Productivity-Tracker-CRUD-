import type { Data, Project, Session } from '../types';
import { sanitizeTask } from './task';

/** Last-write-wins merge per record, with tombstones so deletions propagate between devices. */
export function mergeData(a: Data, b: Data): Data {
  const tomb = new Set([...a.tombstones, ...b.tombstones]);
  const mergeList = <T extends { id: string; updated: number }>(x: T[], y: T[]) => {
    const m = new Map<string, T>();
    for (const i of [...x, ...y]) {
      if (tomb.has(i.id)) continue;
      const cur = m.get(i.id);
      m.set(i.id, cur && cur.updated >= i.updated ? cur : i);
    }
    return [...m.values()];
  };
  const sessions = new Map<string, Session>();
  for (const s of [...a.sessions, ...b.sessions]) sessions.set(s.id, s);
  return {
    tasks: mergeList(a.tasks, b.tasks),
    projects: mergeList<Project>(a.projects, b.projects),
    tombstones: [...tomb].slice(-5000),
    sessions: [...sessions.values()].sort((x, y) => x.at - y.at).slice(-1000)
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeData(raw: any): Data | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
  return {
    tasks: raw.tasks.map(sanitizeTask).filter(Boolean),
    projects: (Array.isArray(raw.projects) ? raw.projects : [])
      .filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string')
      .map((p: any) => ({ id: p.id.slice(0, 40), name: p.name.slice(0, 40), color: typeof p.color === 'string' ? p.color.slice(0, 9) : '#0f8f80', updated: typeof p.updated === 'number' ? p.updated : Date.now() })),
    tombstones: (Array.isArray(raw.tombstones) ? raw.tombstones : []).filter((x: unknown) => typeof x === 'string'),
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter((s: any) => s && typeof s.id === 'string' && typeof s.at === 'number' && typeof s.seconds === 'number')
      .map((s: any) => ({ id: s.id, at: s.at, seconds: s.seconds, taskId: typeof s.taskId === 'string' ? s.taskId : null }))
  };
}
