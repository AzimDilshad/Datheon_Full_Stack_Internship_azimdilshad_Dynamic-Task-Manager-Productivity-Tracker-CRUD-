import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Task } from '../types';
import { useStore } from '../store';
import { fmtTime, fromISO, monthGrid, toISO } from '../lib/dates';
import { cx } from '../lib/utils';
import { useVisibleIds } from './listing';
import type { ViewCtx } from './ListView';

export function CalendarView({ tasks, ctx }: { tasks: Task[]; ctx: ViewCtx }) {
  const weekStart = useStore((s) => s.settings.weekStart);
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [over, setOver] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const grid = useMemo(() => monthGrid(cur.y, cur.m, weekStart), [cur, weekStart]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) if (t.due) m.set(t.due, [...(m.get(t.due) ?? []), t]);
    for (const l of m.values()) l.sort((a, b) => (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || a.priority - b.priority);
    return m;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.due && t.status !== 'done'), [tasks]);
  useVisibleIds(grid.flatMap((d) => (byDay.get(d) ?? []).map((t) => t.id)));

  const shift = (n: number) => setCur((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const drop = (day: string) => {
    if (dragId.current) useStore.getState().updateTask(dragId.current, { due: day });
    dragId.current = null; setOver(null);
  };
  const chip = (t: Task) => (
    <button key={t.id} type="button" data-id={t.id} draggable className={cx('chip-task', 'p' + t.priority, t.status === 'done' && 'done')}
      onDragStart={(e) => { dragId.current = t.id; e.dataTransfer.setData('text/plain', t.id); }}
      onClick={() => useStore.getState().ui({ selectedId: t.id, cursorId: t.id })}>
      {t.dueTime && <b>{fmtTime(t.dueTime)}</b>}{t.title}
    </button>
  );

  return (
    <div className="calendar">
      <div className="cal-head">
        <h3>{new Date(cur.y, cur.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <div className="cal-nav">
          <button type="button" className="iconbtn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={17} /></button>
          <button type="button" className="btn small" onClick={() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</button>
          <button type="button" className="iconbtn" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="cal-grid">
        {grid.slice(0, 7).map((d) => <div key={d} className="cal-dow">{fromISO(d).toLocaleDateString(undefined, { weekday: 'short' })}</div>)}
        {grid.map((d) => {
          const date = fromISO(d);
          return (
            <div key={d} className={cx('cal-cell', date.getMonth() !== cur.m && 'dim', d === ctx.today && 'today', over === d && 'over')}
              onDragOver={(e) => { e.preventDefault(); setOver(d); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(d); }}>
              <div className="cal-day">
                <span>{date.getDate() === 1 ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.getDate()}</span>
                <button type="button" className="iconbtn small add" aria-label={`Add task on ${d}`} onClick={() => useStore.getState().openQuick({ due: d })}><Plus size={13} /></button>
              </div>
              <div className="cal-tasks">{(byDay.get(d) ?? []).map(chip)}</div>
            </div>
          );
        })}
      </div>
      {unscheduled.length > 0 && (
        <div className="unscheduled">
          <h4>No date <em>{unscheduled.length}</em></h4>
          <div>{unscheduled.map(chip)}</div>
          <p>Drag a task onto a day to schedule it.</p>
        </div>
      )}
    </div>
  );
}

export const monthKey = (d: Date) => toISO(d).slice(0, 7);
