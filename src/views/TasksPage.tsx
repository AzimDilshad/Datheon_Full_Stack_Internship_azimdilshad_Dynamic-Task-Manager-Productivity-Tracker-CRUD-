import { useMemo, useState } from 'react';
import { Archive, Check, Trash2, X } from 'lucide-react';
import type { GroupKey, Priority, SortKey } from '../types';
import { selectionTargets, useStore } from '../store';
import { addDays, todayISO } from '../lib/dates';
import { inScope, matchesQuery, scopeDefaults, scopeTitle } from '../lib/filter';
import { isBlocked } from '../lib/task';
import { PRIORITY } from '../lib/utils';
import { Empty } from '../components/ui';
import { ListView, type ViewCtx } from './ListView';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { MatrixView } from './MatrixView';

function InlineAdd() {
  const [text, setText] = useState('');
  const scope = useStore((s) => s.scope);
  return (
    <form className="inline-add" onSubmit={(e) => {
      e.preventDefault();
      if (useStore.getState().quickCreate(text, scopeDefaults(scope))) setText('');
    }}>
      <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Add a task" placeholder="Add a task. Try “Review PR tomorrow 3pm !2 @code”" maxLength={300} />
      <button type="submit" className="btn primary" disabled={!text.trim()}>Add</button>
    </form>
  );
}

function BulkBar() {
  const selection = useStore((s) => s.selection);
  const projects = useStore((s) => s.projects);
  const st = useStore.getState;
  if (!selection.length) return null;
  return (
    <div className="bulk" role="toolbar" aria-label="Bulk actions">
      <strong>{selection.length} selected</strong>
      <button type="button" className="btn small" onClick={() => { st().bulkStatus(selection, 'done'); st().ui({ selection: [] }); }}><Check size={14} />Complete</button>
      <select aria-label="Set priority" value="" onChange={(e) => { if (e.target.value) st().bulkUpdate(selection, { priority: +e.target.value as Priority }); }}>
        <option value="">Priority…</option>
        {([1, 2, 3, 4] as const).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
      </select>
      <select aria-label="Move to project" value="" onChange={(e) => { if (e.target.value) st().bulkUpdate(selection, { projectId: e.target.value === 'none' ? null : e.target.value }); }}>
        <option value="">Project…</option>
        <option value="none">Inbox</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="btn small" onClick={() => st().bulkUpdate(selection, { due: todayISO() })}>Today</button>
      <button type="button" className="btn small" onClick={() => st().bulkUpdate(selection, { due: addDays(todayISO(), 1) })}>Tomorrow</button>
      <button type="button" className="btn small" onClick={() => st().archive(selection, true)}><Archive size={14} />Archive</button>
      <button type="button" className="btn small danger" onClick={() => st().trash(selection)}><Trash2 size={14} />Trash</button>
      <button type="button" className="iconbtn small" aria-label="Clear selection" onClick={() => st().ui({ selection: [] })}><X size={15} /></button>
    </div>
  );
}

export function TasksPage() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const scope = useStore((s) => s.scope);
  const layoutPref = useStore((s) => s.layout);
  const query = useStore((s) => s.query);
  const showDone = useStore((s) => s.showDone);
  const sort = useStore((s) => s.listSort);
  const group = useStore((s) => s.listGroup);
  const ui = useStore((s) => s.ui);
  const today = todayISO();

  const special = scope.kind === 'trash' || scope.kind === 'archive' || scope.kind === 'completed';
  const layout = special ? 'list' : layoutPref;

  const ctx: ViewCtx = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return {
      projectsById: new Map(projects.map((p) => [p.id, p])), today,
      blocked: new Set(tasks.filter((t) => t.blockedBy.length && isBlocked(t, byId)).map((t) => t.id))
    };
  }, [tasks, projects, today]);

  const scoped = useMemo(() => tasks.filter((t) => inScope(t, scope, today)), [tasks, scope, today]);
  const filtered = useMemo(
    () => (query.trim() ? scoped.filter((t) => matchesQuery(t, query, { projects, blocked: ctx.blocked, today })) : scoped),
    [scoped, query, projects, ctx.blocked, today]
  );
  const listTasks = useMemo(() => (showDone || special ? filtered : filtered.filter((t) => t.status !== 'done')), [filtered, showDone, special]);

  const open = scoped.filter((t) => t.status !== 'done').length;
  const overdue = scoped.filter((t) => t.status !== 'done' && t.due && t.due < today).length;
  const mode = scope.kind === 'trash' ? 'trash' : scope.kind === 'archive' ? 'archive' : 'normal';
  const title = scopeTitle(scope, projects);
  const sub = scope.kind === 'today'
    ? new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : scope.kind === 'trash' ? 'Items are removed for good after 30 days.'
    : `${open} open${overdue ? `, ${overdue} overdue` : ''}`;
  const shown = layout === 'list' ? listTasks : filtered;

  return (
    <div className="page-body">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        <div className="page-tools">
          {layout === 'list' && !special && (<>
            <label className="sel"><span>Sort</span>
              <select value={sort} onChange={(e) => ui({ listSort: e.target.value as SortKey })}>
                <option value="manual">Manual</option><option value="due">Due date</option><option value="priority">Priority</option>
                <option value="created">Newest</option><option value="updated">Recently edited</option><option value="title">Title</option>
              </select></label>
            <label className="sel"><span>Group</span>
              <select value={group} onChange={(e) => ui({ listGroup: e.target.value as GroupKey })}>
                <option value="none">None</option><option value="status">Status</option><option value="priority">Priority</option>
                <option value="project">Project</option><option value="due">Due date</option>
              </select></label>
            <label className="check-inline"><input type="checkbox" checked={showDone} onChange={(e) => ui({ showDone: e.target.checked })} />Show completed</label>
          </>)}
          {scope.kind === 'trash' && scoped.length > 0 && (
            <button type="button" className="btn danger" onClick={() => { if (confirm('Permanently delete everything in the trash?')) useStore.getState().emptyTrash(); }}>Empty trash</button>
          )}
        </div>
      </header>

      {mode === 'normal' && !special && layout === 'list' && <InlineAdd />}
      {query.trim() && <p className="query-note">Showing {shown.length} match{shown.length === 1 ? '' : 'es'} for “{query.trim()}”. Operators: #project @tag p1 is:overdue due:week has:subtasks -word</p>}

      {layout === 'list' && (listTasks.length
        ? <ListView tasks={listTasks} ctx={ctx} mode={mode} />
        : <EmptyState scope={scope.kind} filtering={!!query.trim()} hasDone={filtered.length > 0} />)}
      {layout === 'board' && <BoardView tasks={filtered} ctx={ctx} />}
      {layout === 'calendar' && <CalendarView tasks={filtered} ctx={ctx} />}
      {layout === 'matrix' && <MatrixView tasks={filtered} ctx={ctx} />}
      <BulkBar />
    </div>
  );
}

function EmptyState({ scope, filtering, hasDone }: { scope: string; filtering: boolean; hasDone: boolean }) {
  if (filtering) return <Empty title="No matches" hint="Try fewer words or clear the search box." />;
  if (hasDone) return <Empty title="All clear" hint="Everything here is done. Turn on “Show completed” to review it." />;
  const copy: Record<string, [string, string]> = {
    today: ['Nothing due today', 'Add a task above or press N. Anything overdue will show up here too.'],
    inbox: ['Inbox is empty', 'Tasks without a project land here. Add one above.'],
    upcoming: ['Nothing in the next two weeks', 'Give a task a due date and it will appear here.'],
    overdue: ['Nothing overdue', 'You are caught up.'],
    completed: ['No completed tasks yet', 'Finished tasks collect here.'],
    archive: ['The archive is empty', 'Archive finished work from a task’s menu to keep lists tidy.'],
    trash: ['The trash is empty', 'Deleted tasks wait here for 30 days.']
  };
  const [t, h] = copy[scope] ?? ['No tasks yet', 'Add your first task above or press N.'];
  return <Empty title={t} hint={h} />;
}

export { selectionTargets };
