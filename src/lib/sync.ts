import { create } from 'zustand';
import type { Data } from '../types';
import { useStore } from '../store';
import { mergeData, sanitizeData } from './merge';

interface SyncStatus { state: 'idle' | 'syncing' | 'ok' | 'error'; message: string; at: number | null }
export const useSyncStatus = create<SyncStatus>(() => ({ state: 'idle', message: '', at: null }));

const snapshot = (): Data => { const s = useStore.getState(); return { tasks: s.tasks, projects: s.projects, tombstones: s.tombstones, sessions: s.sessions }; };
export const signature = (d: Data) =>
  `${d.tasks.length}.${d.projects.length}.${d.tombstones.length}.${d.sessions.length}.${d.tasks.reduce((m, t) => Math.max(m, t.updated), 0)}.${d.projects.reduce((m, p) => Math.max(m, p.updated), 0)}`;
let lastSig = '';
export const isDirty = () => signature(snapshot()) !== lastSig;

let running: Promise<boolean> | null = null;
export function syncNow(): Promise<boolean> {
  return (running ??= run().finally(() => { running = null; }));
}

async function run(): Promise<boolean> {
  const key = useStore.getState().settings.syncKey.trim();
  const set = (p: Partial<SyncStatus>) => useSyncStatus.setState(p);
  if (key.length < 12) { set({ state: 'error', message: 'Sync key must be at least 12 characters.' }); return false; }
  set({ state: 'syncing', message: 'Syncing…' });
  try {
    const headers = { 'x-sync-key': key };
    const res = await fetch('/api/sync', { headers });
    if (res.status === 501) throw new Error('Cloud sync is not set up on this deployment (missing MONGODB_URI).');
    if (!res.ok) throw new Error(res.status === 401 ? 'The sync key was rejected.' : `Server error (${res.status}).`);
    const remote = sanitizeData((await res.json()).data);
    const merged = remote ? mergeData(snapshot(), remote) : snapshot();
    useStore.getState().applyMerged(merged);
    const put = await fetch('/api/sync', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ data: merged }) });
    if (!put.ok) throw new Error(put.status === 413 ? 'Your data is too large to sync.' : `Upload failed (${put.status}).`);
    lastSig = signature(snapshot());
    const at = Date.now();
    useStore.getState().setSettings({ syncedAt: at });
    set({ state: 'ok', message: 'Up to date', at });
    return true;
  } catch (e) {
    set({ state: 'error', message: e instanceof Error ? (e.message === 'Failed to fetch' ? 'You appear to be offline.' : e.message) : 'Sync failed.' });
    return false;
  }
}
