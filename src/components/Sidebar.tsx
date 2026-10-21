import { useMemo } from 'react';
import { AlertCircle, Archive, BarChart3, CalendarDays, CheckCircle2, Cloud, Inbox, ListTodo, Pencil, Plus, Settings, Sun, Tag, Timer, Trash2 } from 'lucide-react';
import type { Scope } from '../types';
import { useStore } from '../store';
import { addDays, todayISO } from '../lib/dates';
import { sameScope } from '../lib/filter';
import { cx } from '../lib/utils';
import { Dot, Kbd } from './ui';
import { useSyncStatus } from '../lib/sync';

function Item({ icon, label, count, on, danger, onClick, children }: { icon?: JSX.Element; label: string; count?: number; on?: boolean; danger?: boolean; onClick: () => void; children?: JSX.Element }) {
  return (
    <div className="sb-row">
      <button type="button" className={cx('sb-item', on && 'on', danger && 'warn')} aria-current={on ? 'page' : undefined} onClick={onClick}>
        {icon}<span>{label}</span>{!!count && <em>{count}</em>}
      </button>
      {children}
    </div>
  );
}

export function Sidebar() {
  const { tasks, projects, page, scope, navigate, openQuick, ui, settings } = useStore();
  const sync = useSyncStatus();
  const c = useMemo(() => {
    const today = todayISO(), live = tasks.filter((t) => !t.deleted && !t.archived), open = live.filter((t) => t.status !== 'done');
    const byProject = new Map<string, number>(), byTag = new Map<string, number>();
    for (const t of open) {
      if (t.projectId) byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1);
      for (const g of t.tags) byTag.set(g, (byTag.get(g) ?? 0) + 1);
    }
    return {
      inbox: open.filter((t) => !t.projectId).length,
      today: open.filter((t) => t.due && t.due <= today).length,
      upcoming: open.filter((t) => t.due && t.due > today && t.due <= addDays(today, 14)).length,
      all: open.length, overdue: open.filter((t) => t.due && t.due < today).length,
      archive: tasks.filter((t) => t.archived && !t.deleted).length, trash: tasks.filter((t) => t.deleted).length,
      byProject, tags: [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    };
  }, [tasks]);

  const go = (scope: Scope) => navigate('tasks', scope);
  const on = (s: Scope) => page === 'tasks' && sameScope(scope, s);
  const syncing = settings.syncKey.length >= 12;

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand"><span className="logo" aria-hidden>✓</span>Taskbook</div>
      <button type="button" className="btn primary new" onClick={() => openQuick()}><Plus size={16} />New task<Kbd>N</Kbd></button>

      <div className="sb-group">
        <Item icon={<Inbox size={16} />} label="Inbox" count={c.inbox} on={on({ kind: 'inbox' })} onClick={() => go({ kind: 'inbox' })} />
        <Item icon={<Sun size={16} />} label="Today" count={c.today} on={on({ kind: 'today' })} onClick={() => go({ kind: 'today' })} />
        <Item icon={<CalendarDays size={16} />} label="Upcoming" count={c.upcoming} on={on({ kind: 'upcoming' })} onClick={() => go({ kind: 'upcoming' })} />
        <Item icon={<ListTodo size={16} />} label="All tasks" count={c.all} on={on({ kind: 'all' })} onClick={() => go({ kind: 'all' })} />
        <Item icon={<AlertCircle size={16} />} label="Overdue" count={c.overdue} danger on={on({ kind: 'overdue' })} onClick={() => go({ kind: 'overdue' })} />
        <Item icon={<CheckCircle2 size={16} />} label="Completed" on={on({ kind: 'completed' })} onClick={() => go({ kind: 'completed' })} />
      </div>

      <div className="sb-group">
        <Item icon={<BarChart3 size={16} />} label="Dashboard" on={page === 'dashboard'} onClick={() => navigate('dashboard')} />
        <Item icon={<Timer size={16} />} label="Focus timer" on={page === 'focus'} onClick={() => navigate('focus')} />
      </div>

      <div className="sb-group">
        <div className="sb-title"><span>Projects</span>
          <button type="button" className="iconbtn small" aria-label="New project" onClick={() => ui({ modal: 'project', editingProjectId: 'new' })}><Plus size={14} /></button>
        </div>
        {projects.map((p) => (
          <Item key={p.id} icon={<Dot color={p.color} />} label={p.name} count={c.byProject.get(p.id)} on={on({ kind: 'project', id: p.id })} onClick={() => go({ kind: 'project', id: p.id })}>
            <button type="button" className="iconbtn small edit" aria-label={`Edit ${p.name}`} onClick={() => ui({ modal: 'project', editingProjectId: p.id })}><Pencil size={13} /></button>
          </Item>
        ))}
        {!projects.length && <p className="sb-empty">Projects group related tasks.</p>}
      </div>

      {c.tags.length > 0 && (
        <div className="sb-group">
          <div className="sb-title"><span>Tags</span></div>
          {c.tags.map(([g, n]) => <Item key={g} icon={<Tag size={15} />} label={g} count={n} on={on({ kind: 'tag', tag: g })} onClick={() => go({ kind: 'tag', tag: g })} />)}
        </div>
      )}

      <div className="sb-foot">
        <Item icon={<Archive size={16} />} label="Archive" count={c.archive} on={on({ kind: 'archive' })} onClick={() => go({ kind: 'archive' })} />
        <Item icon={<Trash2 size={16} />} label="Trash" count={c.trash} on={on({ kind: 'trash' })} onClick={() => go({ kind: 'trash' })} />
        <Item icon={<Settings size={16} />} label="Settings" on={page === 'settings'} onClick={() => navigate('settings')} />
        {syncing && <p className={cx('sync-pill', sync.state)}><Cloud size={13} />{sync.state === 'syncing' ? 'Syncing…' : sync.state === 'error' ? sync.message : 'Synced'}</p>}
      </div>
    </nav>
  );
}
