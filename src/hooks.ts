import { useEffect, useRef, useState } from 'react';
import { selectionTargets, useStore } from './store';
import { ACCENTS } from './lib/utils';
import { addDays, fmtClock, fromISO, todayISO } from './lib/dates';
import { notify } from './lib/notify';
import { isDirty, syncNow } from './lib/sync';
import type { Priority, Layout, Scope } from './types';

/** Re-renders on an interval; returns Date.now(). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

/** Local draft that commits on blur / when asked, so typing doesn't create undo steps. */
export function useDraft(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return { value: draft, onChange: (v: string) => setDraft(v), commit: () => { if (draft !== value) commit(draft); } };
}

export function useTheme() {
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? 'dark' : 'light';
      root.style.setProperty('--accent', ACCENTS[settings.accent] ?? ACCENTS.teal);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', ACCENTS[settings.accent] ?? ACCENTS.teal);
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.accent]);
}

/** Fires browser notifications for tasks with a reminder, once per due stamp. */
export function useReminders() {
  useEffect(() => {
    const check = () => {
      const s = useStore.getState();
      if (!s.settings.notifications) return;
      const now = Date.now();
      for (const t of s.tasks) {
        if (t.reminder === null || !t.due || t.status === 'done' || t.deleted || t.archived) continue;
        const stamp = `${t.due}T${t.dueTime ?? '09:00'}`;
        if (t.remindedFor === stamp) continue;
        const [h, m] = (t.dueTime ?? '09:00').split(':').map(Number);
        const at = fromISO(t.due).setHours(h, m, 0, 0) - t.reminder * 60000;
        if (now >= at && now < at + 6 * 3600000 + t.reminder * 60000) {
          notify(t.title, t.dueTime ? `Due ${t.dueTime}` : 'Due today');
          s.updateTask(t.id, { remindedFor: stamp }, { quiet: true });
        }
      }
    };
    check();
    const i = setInterval(check, 30000);
    return () => clearInterval(i);
  }, []);
}

export function usePomoTicker() {
  const running = useStore((s) => !!s.pomo.endsAt);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const p = useStore.getState().pomo;
      useStore.getState().pomoTick();
      if (p.endsAt) document.title = `${fmtClock((p.endsAt - Date.now()) / 1000)} · ${p.phase === 'work' ? 'Focus' : 'Break'}`;
    };
    tick();
    const i = setInterval(tick, 500);
    return () => { clearInterval(i); document.title = 'Taskbook'; };
  }, [running]);
}

/** Cross-tab sync, background cloud sync, deep links and PWA shortcuts. */
export function useLifecycle() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'taskbook.v2') void useStore.persist.rehydrate(); };
    window.addEventListener('storage', onStorage);
    const params = new URLSearchParams(location.search);
    if (params.get('new')) { useStore.getState().openQuick(); history.replaceState(null, '', '/'); }
    const m = location.hash.match(/^#task=([\w-]+)/);
    if (m && useStore.getState().tasks.some((t) => t.id === m[1])) useStore.getState().ui({ selectedId: m[1] });
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const key = useStore((s) => s.settings.syncKey);
  const auto = useStore((s) => s.settings.autoSync);
  const tasks = useStore((s) => s.tasks);
  const timer = useRef<number>();
  useEffect(() => {
    if (key.trim().length < 12 || !auto) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (isDirty() && navigator.onLine) void syncNow(); }, 3000);
    return () => clearTimeout(timer.current);
  }, [key, auto, tasks]);
  useEffect(() => {
    if (key.trim().length < 12 || !auto) return;
    void syncNow();
    const onVis = () => { if (document.visibilityState === 'visible') void syncNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onVis); };
  }, [key, auto]);
}

const typingIn = (el: Element | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);
const GO: Record<string, [string, Scope?]> = {
  i: ['tasks', { kind: 'inbox' }], t: ['tasks', { kind: 'today' }], u: ['tasks', { kind: 'upcoming' }], a: ['tasks', { kind: 'all' }],
  o: ['tasks', { kind: 'overdue' }], c: ['tasks', { kind: 'completed' }], d: ['dashboard'], f: ['focus'], s: ['settings']
};
const LAYOUT: Record<string, Layout> = { l: 'list', b: 'board', c: 'calendar', m: 'matrix' };

export function useHotkeys() {
  useEffect(() => {
    let pending: 'g' | 'v' | null = null;
    let timer: number;
    const h = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        if (s.modal) s.ui({ modal: null });
        else if (s.selectedId) s.ui({ selectedId: null });
        else if (s.selection.length) s.ui({ selection: [] });
        else if (s.sidebarOpen) s.ui({ sidebarOpen: false });
        else if (typingIn(document.activeElement)) (document.activeElement as HTMLElement).blur();
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); s.ui({ modal: s.modal === 'palette' ? null : 'palette' }); return; }
      if (typingIn(document.activeElement) || s.modal) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redo(); return; }
      if (mod && e.key.toLowerCase() === 'a' && s.page === 'tasks') { e.preventDefault(); s.ui({ selection: s.visibleIds }); return; }
      if (mod || e.altKey) return;

      if (pending) {
        const p = pending; pending = null; clearTimeout(timer);
        const k = e.key.toLowerCase();
        if (p === 'g' && GO[k]) { e.preventDefault(); const [page, scope] = GO[k]; s.navigate(page as 'tasks', scope); }
        if (p === 'v' && LAYOUT[k]) { e.preventDefault(); s.ui({ layout: LAYOUT[k], page: 'tasks' }); }
        return;
      }
      const k = e.key;
      if (k === 'g' || k === 'v') { pending = k; timer = window.setTimeout(() => (pending = null), 1200); return; }
      if (k === 'n' || k === 'q') { e.preventDefault(); s.openQuick(); return; }
      if (k === '/') { e.preventDefault(); document.getElementById('search')?.focus(); return; }
      if (k === '?') { s.ui({ modal: 'help' }); return; }
      if (s.page !== 'tasks') return;

      const ids = s.visibleIds;
      const idx = s.cursorId ? ids.indexOf(s.cursorId) : -1;
      const move = (d: number) => {
        e.preventDefault();
        const next = ids[Math.min(ids.length - 1, Math.max(0, idx + d))];
        if (next) { s.ui({ cursorId: next }); document.querySelector(`[data-id="${next}"]`)?.scrollIntoView({ block: 'nearest' }); }
      };
      if (k === 'j' || k === 'ArrowDown') return move(1);
      if (k === 'k' || k === 'ArrowUp') return move(-1);
      const targets = selectionTargets(s);
      if (!targets.length) return;
      if (k === 'x' && s.cursorId) { s.toggleSelect(s.cursorId); return; }
      if (k === 'Enter' || k === 'e') { if (s.cursorId) { e.preventDefault(); s.ui({ selectedId: s.cursorId }); } return; }
      if (k === ' ') { e.preventDefault(); targets.forEach((id) => s.toggleDone(id)); return; }
      if (k === 'Delete' || k === 'Backspace' || k === '#') { e.preventDefault(); s.trash(targets); return; }
      if (/^[1-4]$/.test(k)) { s.bulkUpdate(targets, { priority: +k as Priority }); return; }
      if (k === 't') { s.bulkUpdate(targets, { due: todayISO() }); return; }
      if (k === 'm') { s.bulkUpdate(targets, { due: addDays(todayISO(), 1) }); return; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
