import { useRef, useState } from 'react';
import { Bell, Cloud, Download, KeyRound, RefreshCw, Upload } from 'lucide-react';
import type { Theme } from '../types';
import { useStore } from '../store';
import { ACCENTS, cx, download } from '../lib/utils';
import { toCSV, toICS, toJSON } from '../lib/export';
import { requestNotifications } from '../lib/notify';
import { syncNow, useSyncStatus } from '../lib/sync';
import { Seg } from '../components/ui';

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const data = useStore((s) => ({ tasks: s.tasks, projects: s.projects, tombstones: s.tombstones, sessions: s.sessions }));
  const sync = useSyncStatus();
  const set = useStore.getState().setSettings;
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<'merge' | 'replace'>('merge');
  const [showKey, setShowKey] = useState(false);
  const toast = useStore.getState().toast;

  const pickFile = (mode: 'merge' | 'replace') => { modeRef.current = mode; fileRef.current?.click(); };
  const onFile = async (f: File) => {
    try {
      const n = useStore.getState().importData(JSON.parse(await f.text()), modeRef.current);
      toast(n === null ? 'That file is not a Taskbook backup.' : `Imported ${n} task${n === 1 ? '' : 's'}.`);
    } catch { toast('That file could not be read as JSON.'); }
  };
  const genKey = () => {
    const b = crypto.getRandomValues(new Uint8Array(18));
    set({ syncKey: btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_') });
    setShowKey(true);
  };
  const pomo = (k: 'work' | 'short' | 'long' | 'every', v: number, max: number) => set({ pomodoro: { ...settings.pomodoro, [k]: Math.max(1, Math.min(max, v || 1)) } });
  const num = (k: 'work' | 'short' | 'long' | 'every', label: string, max: number) => (
    <label className="field"><span>{label}</span><input type="number" min={1} max={max} value={settings.pomodoro[k]} onChange={(e) => pomo(k, +e.target.value, max)} onBlur={() => useStore.getState().pomoReset()} /></label>
  );

  return (
    <div className="page-body settings">
      <header className="page-head"><div><h1>Settings</h1><p>Everything is stored on this device unless you turn on sync.</p></div></header>

      <section className="panel">
        <h3>Appearance</h3>
        <div className="set-row"><span>Theme</span>
          <Seg<Theme> label="Theme" value={settings.theme} onChange={(theme) => set({ theme })} options={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} /></div>
        <div className="set-row"><span>Accent colour</span>
          <div className="swatches" role="radiogroup" aria-label="Accent colour">
            {Object.entries(ACCENTS).map(([name, c]) => <button key={name} type="button" role="radio" aria-checked={settings.accent === name} aria-label={name} className={cx('swatch', settings.accent === name && 'on')} style={{ background: c }} onClick={() => set({ accent: name })} />)}
          </div></div>
        <div className="set-row"><span>Week starts on</span>
          <Seg<'1' | '0'> label="Week start" value={String(settings.weekStart) as '1' | '0'} onChange={(v) => set({ weekStart: v === '1' ? 1 : 0 })} options={[{ id: '1', label: 'Monday' }, { id: '0', label: 'Sunday' }]} /></div>
      </section>

      <section className="panel">
        <h3>Focus timer</h3>
        <div className="field-grid">{num('work', 'Focus (min)', 180)}{num('short', 'Short break (min)', 60)}{num('long', 'Long break (min)', 90)}{num('every', 'Sessions before long break', 12)}</div>
        <label className="check-inline"><input type="checkbox" checked={settings.sound} onChange={(e) => set({ sound: e.target.checked })} />Play a sound when a session ends</label>
      </section>

      <section className="panel">
        <h3>Reminders</h3>
        <label className="check-inline"><input type="checkbox" checked={settings.notifications} onChange={async (e) => {
          if (!e.target.checked) return set({ notifications: false });
          const ok = await requestNotifications();
          set({ notifications: ok });
          if (!ok) toast('Notifications are blocked. Allow them in your browser’s site settings.');
        }} /><Bell size={15} />Show browser notifications for task reminders and finished sessions</label>
        <p className="hint">Reminders fire while Taskbook is open or installed as an app on this device.</p>
      </section>

      <section className="panel">
        <h3>Sync between devices</h3>
        <p className="hint">Needs a MongoDB connection on your Vercel project (see the README). Use the same key on every device. Anyone with the key can read your tasks, so make it long and keep it private.</p>
        <div className="key-row">
          <label className="field wide"><span>Sync key</span>
            <input type={showKey ? 'text' : 'password'} value={settings.syncKey} onChange={(e) => set({ syncKey: e.target.value })} autoComplete="off" spellCheck={false} placeholder="At least 12 characters" /></label>
          <button type="button" className="btn" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          <button type="button" className="btn" onClick={genKey}><KeyRound size={15} />Generate</button>
        </div>
        <div className="set-row">
          <label className="check-inline"><input type="checkbox" checked={settings.autoSync} onChange={(e) => set({ autoSync: e.target.checked })} />Sync automatically</label>
          <button type="button" className="btn primary" disabled={settings.syncKey.trim().length < 12 || sync.state === 'syncing'} onClick={() => void syncNow()}><RefreshCw size={15} />Sync now</button>
        </div>
        {(sync.state !== 'idle' || settings.syncedAt) && (
          <p className={cx('sync-line', sync.state)}><Cloud size={14} />{sync.state === 'error' ? sync.message : sync.state === 'syncing' ? 'Syncing…' : `Last synced ${new Date(sync.at ?? settings.syncedAt ?? Date.now()).toLocaleString()}`}</p>
        )}
      </section>

      <section className="panel">
        <h3>Your data</h3>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => download('taskbook-backup.json', toJSON(data, settings), 'application/json')}><Download size={15} />Backup (JSON)</button>
          <button type="button" className="btn" onClick={() => download('taskbook-tasks.csv', toCSV(data.tasks, data.projects), 'text/csv')}><Download size={15} />Spreadsheet (CSV)</button>
          <button type="button" className="btn" onClick={() => download('taskbook.ics', toICS(data.tasks, data.projects), 'text/calendar')}><Download size={15} />Calendar (ICS)</button>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => pickFile('merge')}><Upload size={15} />Import and merge</button>
          <button type="button" className="btn" onClick={() => pickFile('replace')}><Upload size={15} />Import and replace</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        </div>
        <p className="hint">Imports accept backups from this app and from the original Taskbook. Undo works after an import.</p>
        <div className="btn-row">
          <button type="button" className="btn danger" onClick={() => { if (prompt('This permanently deletes every task and project on this device. Type DELETE to confirm.') === 'DELETE') { useStore.getState().resetAll(); toast('All data deleted.'); } }}>Delete all data</button>
        </div>
        <p className="hint">{data.tasks.filter((t) => !t.deleted).length} tasks, {data.projects.length} projects stored.</p>
      </section>
    </div>
  );
}
