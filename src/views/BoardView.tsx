import { useMemo, useRef, useState } from 'react';
import { Lock, ListChecks, Plus } from 'lucide-react';
import type { Status, Task } from '../types';
import { useStore } from '../store';
import { dueInfo, fmtDuration } from '../lib/dates';
import { subtaskProgress } from '../lib/task';
import { cx, STATUSES } from '../lib/utils';
import { Dot, PriorityFlag } from '../components/ui';
import { sortTasks, useVisibleIds } from './listing';
import type { ViewCtx } from './ListView';

export function BoardView({ tasks, ctx }: { tasks: Task[]; ctx: ViewCtx }) {
  const cursorId = useStore((s) => s.cursorId);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const cols = useMemo(() => STATUSES.map((c) => {
    let list = sortTasks(tasks.filter((t) => t.status === c.id), 'manual');
    if (c.id === 'done') list = list.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 40);
    return { ...c, tasks: list };
  }), [tasks]);
  useVisibleIds(cols.flatMap((c) => c.tasks.map((t) => t.id)));

  const drop = (status: Status, target: string | null) => {
    if (dragId.current) useStore.getState().moveTo(dragId.current, target, status);
    dragId.current = null; setOverCol(null); setOverCard(null);
  };

  return (
    <div className="board">
      {cols.map((c) => (
        <section key={c.id} className={cx('col', overCol === c.id && 'over')}
          onDragOver={(e) => { e.preventDefault(); setOverCol(c.id); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
          onDrop={(e) => { e.preventDefault(); drop(c.id, null); }}>
          <header className="col-head">
            <h3>{c.label}</h3><em>{c.tasks.length}</em>
            {c.id !== 'done' && (
              <button type="button" className="iconbtn small" aria-label={`Add task to ${c.label}`}
                onClick={() => useStore.getState().openQuick({ ...useStore.getState().quickDefaults })}><Plus size={15} /></button>
            )}
          </header>
          <div className="col-body">
            {c.tasks.map((t) => {
              const due = dueInfo(t, ctx.today), sub = subtaskProgress(t), proj = t.projectId ? ctx.projectsById.get(t.projectId) : undefined;
              return (
                <article key={t.id} data-id={t.id} draggable tabIndex={0}
                  className={cx('card', cursorId === t.id && 'cursor', overCard === t.id && 'over', t.status === 'done' && 'done')}
                  onClick={() => useStore.getState().ui({ selectedId: t.id, cursorId: t.id })}
                  onKeyDown={(e) => { if (e.key === 'Enter') useStore.getState().ui({ selectedId: t.id }); }}
                  onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverCard(t.id); setOverCol(c.id); }}
                  onDragLeave={() => setOverCard(null)}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(c.id, t.id); }}>
                  <div className="card-title"><PriorityFlag p={t.priority} size={13} /><span>{t.title}</span></div>
                  <div className="row-meta">
                    {proj && <span className="meta"><Dot color={proj.color} />{proj.name}</span>}
                    {due && <span className={cx('due', due.tone)}>{due.label}</span>}
                    {sub && <span className="meta"><ListChecks size={13} />{sub[0]}/{sub[1]}</span>}
                    {t.estimate && <span className="meta">{fmtDuration(t.estimate * 60)}</span>}
                    {ctx.blocked.has(t.id) && <span className="meta warn"><Lock size={13} />Blocked</span>}
                  </div>
                </article>
              );
            })}
            {!c.tasks.length && <p className="col-empty">Drop tasks here</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
