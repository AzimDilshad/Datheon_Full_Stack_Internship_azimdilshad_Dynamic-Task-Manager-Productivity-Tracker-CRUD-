import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Data, GroupKey, Layout, Page, Pomo, PomoPhase, Priority, Project, QuickDefaults, Scope, Session, Settings, SortKey, Status, Task
} from './types';
import { addDays, todayISO } from './lib/dates';
import { applyStatus, addLog, blankTask, stopTimer } from './lib/task';
import { mergeData } from './lib/merge';
import { loadLegacy, parseImport, STORAGE_KEY } from './lib/importer';
import { parseQuick } from './lib/parse';
import { notify, beep } from './lib/notify';
import { hashColor, PRIORITY, PROJECT_COLORS, uid } from './lib/utils';

export { STORAGE_KEY };

export interface Toast { id: string; text: string; action?: { label: string; run: () => void } }
type Snap = { tasks: Task[]; projects: Project[] };
export type Modal = null | 'quick' | 'palette' | 'help' | 'project';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system', accent: 'teal', weekStart: 1, pomodoro: { work: 25, short: 5, long: 15, every: 4 },
  notifications: false, sound: true, syncKey: '', autoSync: true, syncedAt: null
};

const UI_KEYS = ['page', 'scope', 'layout', 'listSort', 'listGroup', 'showDone', 'query', 'selectedId', 'cursorId', 'selection', 'visibleIds', 'modal', 'quickDefaults', 'editingProjectId', 'sidebarOpen'] as const;
type UIPatch = Partial<Pick<State, (typeof UI_KEYS)[number]>>;

export interface State extends Data {
  settings: Settings;
  seeded: boolean;
  // ui
  page: Page; scope: Scope; layout: Layout; listSort: SortKey; listGroup: GroupKey; showDone: boolean;
  query: string; selectedId: string | null; cursorId: string | null; selection: string[]; visibleIds: string[];
  modal: Modal; quickDefaults: Partial<QuickDefaults>; editingProjectId: string | 'new' | null; sidebarOpen: boolean;
  pomo: Pomo;
  past: Snap[]; future: Snap[]; toasts: Toast[];
  // actions
  ui: (p: UIPatch) => void;
  navigate: (page: Page, scope?: Scope) => void;
  openQuick: (d?: Partial<QuickDefaults>) => void;
  toast: (text: string, action?: Toast['action']) => void;
  addTask: (p: Partial<Task>) => string;
  quickCreate: (text: string, defaults?: Partial<QuickDefaults>, notes?: string) => string | null;
  updateTask: (id: string, patch: Partial<Task>, opts?: { quiet?: boolean }) => void;
  bulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  setStatus: (id: string, status: Status) => void;
  bulkStatus: (ids: string[], status: Status) => void;
  toggleDone: (id: string) => void;
  duplicate: (id: string) => void;
  trash: (ids: string[]) => void;
  restore: (ids: string[]) => void;
  purge: (ids: string[]) => void;
  emptyTrash: () => void;
  archive: (ids: string[], archived: boolean) => void;
  moveTo: (id: string, targetId: string | null, status?: Status) => void;
  startTimer: (id: string) => void;
  stopTimer: (id: string) => void;
  addTime: (id: string, minutes: number) => void;
  addProject: (name: string, color?: string) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleSelect: (id: string) => void;
  undo: () => void;
  redo: () => void;
  setSettings: (p: Partial<Settings>) => void;
  importData: (raw: unknown, mode: 'merge' | 'replace') => number | null;
  applyMerged: (d: Data) => void;
  resetAll: () => void;
  purgeOld: () => void;
  pomoStart: () => void; pomoPause: () => void; pomoReset: () => void; pomoSkip: () => void;
  pomoSetPhase: (p: PomoPhase) => void; pomoSetTask: (id: string | null) => void; pomoTick: () => void;
}

/* ---------- storage that never throws (private mode, blocked cookies) ---------- */
const mem = new Map<string, string>();
const safeStorage = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } },
  removeItem: (k: string) => { try { localStorage.removeItem(k); } catch { mem.delete(k); } }
};

/* ---------- first-run content ---------- */
function seed(): Pick<Data, 'tasks' | 'projects'> {
  const today = todayISO();
  const mk = (name: string): Project => ({ id: uid(), name, color: hashColor(name), updated: Date.now() });
  const [work, home, learn] = [mk('Work'), mk('Home'), mk('Learning')];
  const t = (i: number, p: Partial<Task>) => blankTask({ order: i, ...p });
  return {
    projects: [work, home, learn],
    tasks: [
      t(0, { title: 'Try quick add: press N and type "Call dentist tomorrow 5pm !1 #home @health"', priority: 2, due: today, notes: 'The preview chips show what Taskbook understood: project, tags, priority, date, time, repeat and ~estimates.' }),
      t(1, { title: 'Ship the weekly report', projectId: work.id, priority: 1, due: addDays(today, 1), dueTime: '17:00', estimate: 90, tags: ['reports'], status: 'doing',
        subtasks: [{ id: uid(), title: 'Collect numbers', done: true }, { id: uid(), title: 'Write summary', done: false }, { id: uid(), title: 'Send to team', done: false }] }),
      t(2, { title: 'Water the plants', projectId: home.id, priority: 4, due: today, recurrence: { freq: 'weekly', interval: 1 } }),
      t(3, { title: 'Read one chapter of a book', projectId: learn.id, priority: 3, due: addDays(today, 3), recurrence: { freq: 'daily', interval: 1 }, estimate: 30 }),
      t(4, { title: 'Open the board view (V then B) and drag this card to In review', priority: 3, status: 'todo', due: addDays(today, 5) })
    ]
  };
}

function initial(): Pick<Data, 'tasks' | 'projects'> & { seeded: boolean } {
  const legacy = loadLegacy();
  return legacy ? { ...legacy, seeded: true } : { ...seed(), seeded: true };
}

const defaultPomo = (): Pomo => ({ phase: 'work', endsAt: null, remaining: DEFAULT_SETTINGS.pomodoro.work * 60, taskId: null, cycle: 0 });
const phaseSeconds = (s: Settings, p: PomoPhase) => s.pomodoro[p] * 60;

function patched(t: Task, patch: Partial<Task>, projects: Project[]): Task {
  const now = Date.now();
  let activity = t.activity;
  if (patch.priority && patch.priority !== t.priority) activity = addLog(activity, `Priority set to ${PRIORITY[patch.priority as Priority].label}`, now);
  if ('due' in patch && patch.due !== t.due) activity = addLog(activity, patch.due ? `Due date set to ${patch.due}` : 'Due date cleared', now);
  if ('projectId' in patch && patch.projectId !== t.projectId) activity = addLog(activity, `Moved to ${projects.find((p) => p.id === patch.projectId)?.name ?? 'Inbox'}`, now);
  return { ...t, ...patch, activity, updated: now };
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutate = (fn: (s: State) => Partial<State>) =>
        set((s) => ({ ...fn(s), past: [...s.past.slice(-49), { tasks: s.tasks, projects: s.projects }], future: [] }));
      const quiet = (fn: (s: State) => Partial<State>) => set((s) => fn(s));
      const pushToast = (text: string, action?: Toast['action']) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, action }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 6000 : 3500);
      };
      const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`;

      return {
        ...initial(),
        tombstones: [], sessions: [],
        settings: DEFAULT_SETTINGS,
        page: 'tasks', scope: { kind: 'today' }, layout: 'list', listSort: 'manual', listGroup: 'none', showDone: false,
        query: '', selectedId: null, cursorId: null, selection: [], visibleIds: [], modal: null, quickDefaults: {}, editingProjectId: null, sidebarOpen: false,
        pomo: defaultPomo(), past: [], future: [], toasts: [],

        ui: (p) => set(p as Partial<State>),
        navigate: (page, scope) => set((s) => ({ page, scope: scope ?? s.scope, selection: [], cursorId: null, query: '', sidebarOpen: false, modal: null })),
        openQuick: (d = {}) => set({ modal: 'quick', quickDefaults: d }),
        toast: pushToast,

        addTask: (p) => {
          const t = blankTask({ ...p, order: Math.min(0, ...get().tasks.map((x) => x.order)) - 1 });
          mutate((s) => ({ tasks: [t, ...s.tasks] }));
          return t.id;
        },
        quickCreate: (text, defaults = {}, notes = '') => {
          const s = get();
          const p = parseQuick(text, { projects: s.projects });
          if (!p.title) return null;
          const id = s.addTask({
            title: p.title.slice(0, 200), notes: notes.trim().slice(0, 5000),
            projectId: p.projectId ?? defaults.projectId ?? null,
            tags: [...new Set([...(defaults.tags ?? []), ...p.tags])],
            priority: p.priority ?? defaults.priority ?? 3,
            due: p.due ?? defaults.due ?? null, dueTime: p.dueTime ?? null,
            recurrence: p.recurrence ?? null, estimate: p.estimate ?? null
          });
          set({ cursorId: id });
          return id;
        },
        updateTask: (id, patch, opts) =>
          (opts?.quiet ? quiet : mutate)((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? patched(t, patch, s.projects) : t)) })),
        bulkUpdate: (ids, patch) => {
          const set_ = new Set(ids);
          mutate((s) => ({ tasks: s.tasks.map((t) => (set_.has(t.id) ? patched(t, patch, s.projects) : t)) }));
        },
        setStatus: (id, status) =>
          mutate((s) => { const [tasks, ses] = applyStatus(s.tasks, id, status); return { tasks, sessions: [...s.sessions, ...ses] }; }),
        bulkStatus: (ids, status) =>
          mutate((s) => {
            let tasks = s.tasks; const sessions = [...s.sessions];
            for (const id of ids) { const [t, ses] = applyStatus(tasks, id, status); tasks = t; sessions.push(...ses); }
            return { tasks, sessions };
          }),
        toggleDone: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (t) get().setStatus(id, t.status === 'done' ? 'todo' : 'done');
        },
        duplicate: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          const now = Date.now();
          const copy: Task = {
            ...t, id: uid(), title: t.title + ' (copy)', status: 'todo', completedAt: null, timeSpent: 0, timerStartedAt: null, remindedFor: null,
            archived: false, deleted: null, blockedBy: [], activity: addLog([], 'Duplicated', now), created: now, updated: now, order: t.order - 0.001,
            subtasks: t.subtasks.map((x) => ({ ...x, id: uid(), done: false }))
          };
          mutate((s) => ({ tasks: [copy, ...s.tasks] }));
          pushToast('Task duplicated.');
        },
        trash: (ids) => {
          const set_ = new Set(ids), now = Date.now();
          mutate((s) => ({
            tasks: s.tasks.map((t) => (set_.has(t.id) ? stopped({ ...t, deleted: now, updated: now }) : t)),
            selectedId: s.selectedId && set_.has(s.selectedId) ? null : s.selectedId, selection: s.selection.filter((x) => !set_.has(x))
          }));
          pushToast(`${plural(ids.length)} moved to trash.`, { label: 'Undo', run: () => get().undo() });
        },
        restore: (ids) => {
          const set_ = new Set(ids);
          mutate((s) => ({ tasks: s.tasks.map((t) => (set_.has(t.id) ? { ...t, deleted: null, archived: false, updated: Date.now() } : t)) }));
          pushToast(`${plural(ids.length)} restored.`);
        },
        purge: (ids) => {
          const set_ = new Set(ids);
          quiet((s) => ({
            tasks: s.tasks.filter((t) => !set_.has(t.id)), tombstones: [...s.tombstones, ...ids],
            selectedId: s.selectedId && set_.has(s.selectedId) ? null : s.selectedId, selection: s.selection.filter((x) => !set_.has(x))
          }));
        },
        emptyTrash: () => { const ids = get().tasks.filter((t) => t.deleted).map((t) => t.id); get().purge(ids); pushToast('Trash emptied.'); },
        archive: (ids, archived) => {
          const set_ = new Set(ids);
          mutate((s) => ({
            tasks: s.tasks.map((t) => (set_.has(t.id) ? { ...t, archived, updated: Date.now() } : t)),
            selectedId: archived && s.selectedId && set_.has(s.selectedId) ? null : s.selectedId, selection: []
          }));
          pushToast(archived ? `${plural(ids.length)} archived.` : `${plural(ids.length)} unarchived.`, archived ? { label: 'Undo', run: () => get().undo() } : undefined);
        },
        moveTo: (id, targetId, status) =>
          mutate((s) => {
            let tasks = s.tasks; let sessions = s.sessions;
            const cur = tasks.find((t) => t.id === id);
            if (!cur) return {};
            if (status && status !== cur.status) { const [t2, ses] = applyStatus(tasks, id, status); tasks = t2; sessions = [...sessions, ...ses]; }
            const others = tasks.filter((t) => t.id !== id).sort((a, b) => a.order - b.order);
            const i = targetId ? others.findIndex((t) => t.id === targetId) : -1;
            const order = i >= 0 ? (others[i - 1] ? (others[i - 1].order + others[i].order) / 2 : others[i].order - 1) : (others[others.length - 1]?.order ?? 0) + 1;
            return { tasks: tasks.map((t) => (t.id === id ? { ...t, order, updated: Date.now() } : t)), sessions };
          }),

        startTimer: (id) =>
          quiet((s) => {
            const now = Date.now(); let sessions = s.sessions;
            const tasks = s.tasks.map((t) => {
              if (t.id === id) return t.timerStartedAt ? t : { ...t, timerStartedAt: now, status: t.status === 'todo' ? ('doing' as Status) : t.status, updated: now };
              if (t.timerStartedAt) { const [n, ses] = stopTimer(t, now); if (ses) sessions = [...sessions, ses]; return { ...n, updated: now }; }
              return t;
            });
            return { tasks, sessions };
          }),
        stopTimer: (id) =>
          quiet((s) => {
            const now = Date.now(); let sessions = s.sessions;
            const tasks = s.tasks.map((t) => {
              if (t.id !== id) return t;
              const [n, ses] = stopTimer(t, now);
              if (ses) sessions = [...sessions, ses];
              return { ...n, updated: now };
            });
            return { tasks, sessions };
          }),
        addTime: (id, minutes) =>
          mutate((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, timeSpent: Math.max(0, t.timeSpent + minutes * 60), updated: Date.now() } : t)),
            sessions: minutes > 0 ? [...s.sessions, { id: uid(), at: Date.now(), seconds: minutes * 60, taskId: id }] : s.sessions
          })),

        addProject: (name, color) => {
          const p: Project = { id: uid(), name: name.trim().slice(0, 40), color: color ?? PROJECT_COLORS[get().projects.length % PROJECT_COLORS.length], updated: Date.now() };
          mutate((s) => ({ projects: [...s.projects, p] }));
          return p.id;
        },
        updateProject: (id, patch) => mutate((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updated: Date.now() } : p)) })),
        deleteProject: (id) =>
          quiet((s) => ({
            projects: s.projects.filter((p) => p.id !== id), tombstones: [...s.tombstones, id],
            tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null, updated: Date.now() } : t)),
            scope: s.scope.kind === 'project' && s.scope.id === id ? { kind: 'inbox' } : s.scope
          })),

        toggleSelect: (id) => set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })),

        undo: () => {
          const s = get(); const prev = s.past[s.past.length - 1];
          if (!prev) return pushToast('Nothing to undo.');
          set({ ...prev, past: s.past.slice(0, -1), future: [{ tasks: s.tasks, projects: s.projects }, ...s.future].slice(0, 50) });
        },
        redo: () => {
          const s = get(); const next = s.future[0];
          if (!next) return pushToast('Nothing to redo.');
          set({ ...next, future: s.future.slice(1), past: [...s.past, { tasks: s.tasks, projects: s.projects }] });
        },

        setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
        importData: (raw, mode) => {
          const d = parseImport(raw);
          if (!d) return null;
          mutate((s) => {
            if (mode === 'replace') return { tasks: d.tasks, projects: d.projects, sessions: d.sessions, tombstones: [] };
            // merging a backup should resurrect deleted items, so ignore local tombstones for imported ids
            const incoming = new Set([...d.tasks.map((t) => t.id), ...d.projects.map((p) => p.id)]);
            const m = mergeData({ ...s, tombstones: s.tombstones.filter((x) => !incoming.has(x)) }, { ...d, tombstones: [] });
            return { ...m };
          });
          return d.tasks.length;
        },
        applyMerged: (d) => quiet(() => ({ tasks: d.tasks, projects: d.projects, tombstones: d.tombstones, sessions: d.sessions })),
        resetAll: () => set({ tasks: [], projects: [], tombstones: [], sessions: [], past: [], future: [], selectedId: null, selection: [], pomo: defaultPomo() }),
        purgeOld: () => {
          const cutoff = Date.now() - 30 * 86400000;
          const old = get().tasks.filter((t) => t.deleted && t.deleted < cutoff).map((t) => t.id);
          if (old.length) get().purge(old);
        },

        pomoStart: () => set((s) => ({ pomo: { ...s.pomo, endsAt: Date.now() + s.pomo.remaining * 1000 } })),
        pomoPause: () => set((s) => (s.pomo.endsAt ? { pomo: { ...s.pomo, remaining: Math.max(1, Math.round((s.pomo.endsAt - Date.now()) / 1000)), endsAt: null } } : {})),
        pomoReset: () => set((s) => ({ pomo: { ...s.pomo, endsAt: null, remaining: phaseSeconds(s.settings, s.pomo.phase) } })),
        pomoSetPhase: (phase) => set((s) => ({ pomo: { ...s.pomo, phase, endsAt: null, remaining: phaseSeconds(s.settings, phase) } })),
        pomoSetTask: (taskId) => set((s) => ({ pomo: { ...s.pomo, taskId } })),
        pomoSkip: () => finishPhase(false),
        pomoTick: () => { const p = get().pomo; if (p.endsAt && Date.now() >= p.endsAt) finishPhase(true); }
      };

      function stopped(t: Task): Task { return t.timerStartedAt ? { ...t, timeSpent: t.timeSpent + Math.round((Date.now() - t.timerStartedAt) / 1000), timerStartedAt: null } : t; }

      function finishPhase(completed: boolean) {
        const s = get();
        const { phase, taskId } = s.pomo;
        let cycle = s.pomo.cycle;
        let next: PomoPhase = 'work';
        if (phase === 'work') {
          cycle += completed ? 1 : 0;
          next = cycle > 0 && cycle % s.settings.pomodoro.every === 0 && completed ? 'long' : 'short';
        }
        const seconds = s.settings.pomodoro.work * 60;
        const logged = completed && phase === 'work';
        set((st) => ({
          pomo: { ...st.pomo, phase: next, cycle, endsAt: null, remaining: phaseSeconds(st.settings, next) },
          sessions: logged ? [...st.sessions, { id: uid(), at: Date.now(), seconds, taskId }] : st.sessions,
          tasks: logged && taskId ? st.tasks.map((t) => (t.id === taskId ? { ...t, timeSpent: t.timeSpent + seconds, updated: Date.now() } : t)) : st.tasks
        }));
        if (completed) {
          if (s.settings.sound) beep();
          if (s.settings.notifications) notify(phase === 'work' ? 'Focus session complete' : 'Break is over', phase === 'work' ? 'Time for a break.' : 'Ready for the next focus session?');
        }
      }
    },
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        tasks: s.tasks, projects: s.projects, tombstones: s.tombstones, sessions: s.sessions, settings: s.settings, seeded: s.seeded,
        page: s.page, scope: s.scope, layout: s.layout, listSort: s.listSort, listGroup: s.listGroup, showDone: s.showDone, pomo: s.pomo
      }),
      migrate: (persisted) => persisted as State,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(p.settings?.pomodoro ?? {}) } } };
      },
      onRehydrateStorage: () => (state) => state?.purgeOld()
    }
  )
);

export const selectionTargets = (s: State) => (s.selection.length ? s.selection : s.cursorId ? [s.cursorId] : []);
export { todayISO };
