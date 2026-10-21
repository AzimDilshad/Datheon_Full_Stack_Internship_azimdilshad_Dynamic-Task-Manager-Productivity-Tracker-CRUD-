import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../store';
import { download, fuzzy, ACCENTS, PROJECT_COLORS, cx } from '../lib/utils';
import { toCSV, toICS, toJSON } from '../lib/export';
import { syncNow } from '../lib/sync';
import { Dot, Kbd, Modal } from './ui';

/* ---------------- toasts ---------------- */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button type="button" onClick={() => { t.action!.run(); useStore.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- command palette ---------------- */
interface Cmd { id: string; label: string; hint?: string; run: () => void }

export function CommandPalette() {
  const st = useStore;
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const items = useMemo(() => {
    const s = st.getState();
    const close = () => s.ui({ modal: null });
    const go = (label: string, run: () => void, hint?: string): Cmd => ({ id: label, label, hint, run: () => { run(); } });
    const cmds: Cmd[] = [
      go('Create task', () => s.openQuick(), 'N'),
      go('Go to Inbox', () => s.navigate('tasks', { kind: 'inbox' }), 'G I'), go('Go to Today', () => s.navigate('tasks', { kind: 'today' }), 'G T'),
      go('Go to Upcoming', () => s.navigate('tasks', { kind: 'upcoming' }), 'G U'), go('Go to All tasks', () => s.navigate('tasks', { kind: 'all' }), 'G A'),
      go('Go to Overdue', () => s.navigate('tasks', { kind: 'overdue' }), 'G O'), go('Go to Completed', () => s.navigate('tasks', { kind: 'completed' }), 'G C'),
      go('Go to Dashboard', () => s.navigate('dashboard'), 'G D'), go('Go to Focus timer', () => s.navigate('focus'), 'G F'), go('Go to Settings', () => s.navigate('settings'), 'G S'),
      go('Go to Archive', () => s.navigate('tasks', { kind: 'archive' })), go('Go to Trash', () => s.navigate('tasks', { kind: 'trash' })),
      go('View as list', () => s.ui({ layout: 'list', page: 'tasks' }), 'V L'), go('View as board', () => s.ui({ layout: 'board', page: 'tasks' }), 'V B'),
      go('View as calendar', () => s.ui({ layout: 'calendar', page: 'tasks' }), 'V C'), go('View as priority matrix', () => s.ui({ layout: 'matrix', page: 'tasks' }), 'V M'),
      go('Undo', () => s.undo(), 'Ctrl Z'), go('Redo', () => s.redo(), 'Ctrl Shift Z'),
      go('Switch theme', () => s.setSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })),
      go('New project', () => s.ui({ modal: 'project', editingProjectId: 'new' })),
      go('Export backup (JSON)', () => download('taskbook-backup.json', toJSON({ tasks: s.tasks, projects: s.projects, tombstones: s.tombstones, sessions: s.sessions }, s.settings), 'application/json')),
      go('Export tasks (CSV)', () => download('taskbook-tasks.csv', toCSV(s.tasks, s.projects), 'text/csv')),
      go('Export due dates (ICS calendar)', () => download('taskbook.ics', toICS(s.tasks, s.projects), 'text/calendar')),
      ...(settings.syncKey.length >= 12 ? [go('Sync now', () => { void syncNow(); })] : []),
      go('Show keyboard shortcuts', () => s.ui({ modal: 'help' }), '?'),
      ...projects.map((p) => go(`Project: ${p.name}`, () => s.navigate('tasks', { kind: 'project', id: p.id })))
    ];
    const query = q.trim();
    const scored = (query ? cmds.map((c) => [c, fuzzy(query, c.label)] as const).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1]).map(([c]) => c) : cmds.slice(0, 12));
    const found: Cmd[] = query.length > 1
      ? tasks.filter((t) => !t.deleted).map((t) => [t, fuzzy(query, t.title)] as const).filter(([, n]) => n >= 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([t]) => ({ id: t.id, label: t.title, hint: t.status === 'done' ? 'Done' : 'Task', run: () => s.ui({ selectedId: t.id, cursorId: t.id, page: 'tasks', modal: null }) }))
      : [];
    return [...scored.slice(0, 10), ...found].map((c) => ({ ...c, run: () => { const wasModal = st.getState().modal; c.run(); if (wasModal === 'palette' && st.getState().modal === 'palette') close(); } }));
  }, [q, tasks, projects, settings.syncKey, st]);

  useEffect(() => setI(0), [q]);
  const run = (c?: Cmd) => { if (c) c.run(); };

  return (
    <Modal label="Command palette" onClose={() => st.getState().ui({ modal: null })}>
      <div className="palette">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or search tasks" aria-label="Command"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); run(items[i]); }
          }} />
        <ul role="listbox">
          {items.map((c, n) => (
            <li key={c.id + n} role="option" aria-selected={n === i} className={cx(n === i && 'on')} onMouseEnter={() => setI(n)} onClick={() => run(c)}>
              <span>{c.label}</span>{c.hint && <small>{c.hint}</small>}
            </li>
          ))}
          {!items.length && <li className="none">No matching commands or tasks.</li>}
        </ul>
      </div>
    </Modal>
  );
}

/* ---------------- shortcuts ---------------- */
const Row = ({ k, children }: { k: ReactNode; children: ReactNode }) => <tr><td>{k}</td><td>{children}</td></tr>;

export function Help() {
  return (
    <Modal label="Keyboard shortcuts" wide onClose={() => useStore.getState().ui({ modal: null })}>
      <div className="help">
        <h2>Shortcuts and quick add</h2>
        <div className="help-cols">
          <table><tbody>
            <Row k={<Kbd>N</Kbd>}>New task</Row>
            <Row k={<><Kbd>Ctrl</Kbd><Kbd>K</Kbd></>}>Command palette</Row>
            <Row k={<Kbd>/</Kbd>}>Search</Row>
            <Row k={<><Kbd>J</Kbd><Kbd>K</Kbd></>}>Move down and up</Row>
            <Row k={<Kbd>Enter</Kbd>}>Open task</Row>
            <Row k={<Kbd>Space</Kbd>}>Complete or reopen</Row>
            <Row k={<Kbd>X</Kbd>}>Select task (or Shift-click)</Row>
            <Row k={<><Kbd>1</Kbd>–<Kbd>4</Kbd></>}>Set priority</Row>
            <Row k={<><Kbd>T</Kbd><Kbd>M</Kbd></>}>Due today, due tomorrow</Row>
            <Row k={<Kbd>Delete</Kbd>}>Move to trash</Row>
            <Row k={<><Kbd>Ctrl</Kbd><Kbd>Z</Kbd></>}>Undo (add Shift to redo)</Row>
            <Row k={<><Kbd>G</Kbd> then <Kbd>I T U A O D F S</Kbd></>}>Inbox, Today, Upcoming, All, Overdue, Dashboard, Focus, Settings</Row>
            <Row k={<><Kbd>V</Kbd> then <Kbd>L B C M</Kbd></>}>List, Board, Calendar, Matrix</Row>
          </tbody></table>
          <div>
            <h3>Quick add</h3>
            <p><code>#home</code> project · <code>@errand</code> tag · <code>!1</code> to <code>!4</code> or <code>!high</code> priority</p>
            <p><code>tomorrow</code>, <code>fri</code>, <code>next week</code>, <code>in 3 days</code>, <code>jan 5</code>, <code>2026-12-01</code></p>
            <p><code>5pm</code>, <code>17:30</code> · <code>every day</code>, <code>every 2 weeks</code>, <code>every mon</code>, <code>weekdays</code> · <code>~45m</code>, <code>~1h30m</code> estimate</p>
            <h3>Search operators</h3>
            <p><code>#project</code> <code>@tag</code> <code>p1</code> <code>is:overdue</code> <code>is:blocked</code> <code>due:week</code> <code>has:subtasks</code> <code>status:doing</code> <code>-word</code></p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- project dialog ---------------- */
export function ProjectDialog() {
  const id = useStore((s) => s.editingProjectId);
  const projects = useStore((s) => s.projects);
  const existing = projects.find((p) => p.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? PROJECT_COLORS[projects.length % PROJECT_COLORS.length]);
  const st = useStore.getState;
  const close = () => st().ui({ modal: null, editingProjectId: null });
  const save = () => {
    if (!name.trim()) return;
    if (existing) st().updateProject(existing.id, { name: name.trim().slice(0, 40), color });
    else st().navigate('tasks', { kind: 'project', id: st().addProject(name, color) });
    close();
  };
  return (
    <Modal label={existing ? 'Edit project' : 'New project'} onClose={close}>
      <form className="proj" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2>{existing ? 'Edit project' : 'New project'}</h2>
        <label className="field"><span>Name</span><input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {PROJECT_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} className={cx('swatch', c === color && 'on')} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
        <footer className="qa-foot">
          {existing
            ? <button type="button" className="btn danger" onClick={() => { if (confirm(`Delete “${existing.name}”? Its tasks move to the Inbox.`)) { st().deleteProject(existing.id); close(); } }}>Delete project</button>
            : <span />}
          <span className="row-gap"><button type="button" className="btn" onClick={close}>Cancel</button><button type="submit" className="btn primary" disabled={!name.trim()}>Save project</button></span>
        </footer>
      </form>
    </Modal>
  );
}

export { Dot, ACCENTS };
