import { useMemo, useRef, useState } from 'react';
import type { Priority, Task } from '../types';
import { useStore } from '../store';
import { addDays, dueInfo } from '../lib/dates';
import { cx } from '../lib/utils';
import { Dot, PriorityFlag } from '../components/ui';
import { useVisibleIds } from './listing';
import type { ViewCtx } from './ListView';

const important = (t: Task) => t.priority <= 2;
const urgent = (t: Task, today: string) => !!t.due && t.due <= addDays(today, 2);

export function MatrixView({ tasks, ctx }: { tasks: Task[]; ctx: ViewCtx }) {
  const [over, setOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const open = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks]);
  const t0 = ctx.today;

  const quads = [
    { id: 'do', title: 'Do first', hint: 'Important and due soon', test: (t: Task) => important(t) && urgent(t, t0),
      drop: (t: Task) => ({ priority: Math.min(t.priority, 2) as Priority, due: t.due && t.due <= addDays(t0, 2) ? t.due : addDays(t0, 1) }) },
    { id: 'plan', title: 'Schedule', hint: 'Important, not urgent yet', test: (t: Task) => important(t) && !urgent(t, t0),
      drop: (t: Task) => ({ priority: Math.min(t.priority, 2) as Priority, due: !t.due || t.due <= addDays(t0, 2) ? addDays(t0, 7) : t.due }) },
    { id: 'quick', title: 'Quick wins', hint: 'Due soon, lower impact', test: (t: Task) => !important(t) && urgent(t, t0),
      drop: (t: Task) => ({ priority: Math.max(t.priority, 3) as Priority, due: t.due && t.due <= addDays(t0, 2) ? t.due : addDays(t0, 1) }) },
    { id: 'later', title: 'Later', hint: 'Lower impact, no rush', test: (t: Task) => !important(t) && !urgent(t, t0),
      drop: (t: Task) => ({ priority: Math.max(t.priority, 3) as Priority, due: !t.due || t.due <= addDays(t0, 2) ? addDays(t0, 7) : t.due }) }
  ].map((q) => ({ ...q, tasks: open.filter(q.test).sort((a, b) => a.priority - b.priority || (a.due ?? '9').localeCompare(b.due ?? '9')) }));
  useVisibleIds(quads.flatMap((q) => q.tasks.map((t) => t.id)));

  return (
    <div className="matrix">
      <div className="mx-axis top"><span>Due soon</span><span>Not urgent</span></div>
      <div className="mx-grid">
        {[quads[0], quads[1], quads[2], quads[3]].map((q) => (
          <section key={q.id} className={cx('mx-cell', q.id, over === q.id && 'over')}
            onDragOver={(e) => { e.preventDefault(); setOver(q.id); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const t = open.find((x) => x.id === dragId.current);
              if (t) useStore.getState().updateTask(t.id, q.drop(t));
              dragId.current = null;
            }}>
            <header><h3>{q.title}</h3><span>{q.hint}</span><em>{q.tasks.length}</em></header>
            <div className="mx-list">
              {q.tasks.map((t) => {
                const due = dueInfo(t, t0), proj = t.projectId ? ctx.projectsById.get(t.projectId) : undefined;
                return (
                  <button key={t.id} type="button" data-id={t.id} draggable className="mx-item"
                    onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.setData('text/plain', t.id); }}
                    onClick={() => useStore.getState().ui({ selectedId: t.id, cursorId: t.id })}>
                    <PriorityFlag p={t.priority} size={12} /><span>{t.title}</span>
                    {proj && <Dot color={proj.color} />}{due && <small className={cx('due', due.tone)}>{due.label}</small>}
                  </button>
                );
              })}
              {!q.tasks.length && <p className="col-empty">Nothing here</p>}
            </div>
          </section>
        ))}
      </div>
      <p className="mx-note">Important means priority urgent or high. Due soon means within two days. Dragging a task into a box adjusts its priority and due date to fit.</p>
    </div>
  );
}
