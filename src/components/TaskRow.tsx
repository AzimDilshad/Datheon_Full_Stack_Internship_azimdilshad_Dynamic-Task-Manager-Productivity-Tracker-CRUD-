import { memo, useState } from 'react';
import { AlignLeft, ArchiveRestore, Check, Clock, ListChecks, Lock, Pause, Play, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import type { Project, Task } from '../types';
import { useStore } from '../store';
import { dueInfo, describeRecurrence, fmtDuration } from '../lib/dates';
import { elapsed, subtaskProgress } from '../lib/task';
import { cx } from '../lib/utils';
import { useNow } from '../hooks';
import { Dot } from './ui';

export interface DragApi { start: (id: string) => void; drop: (targetId: string) => void }
interface Props {
  t: Task; project?: Project; blocked: boolean; cursor: boolean; selected: boolean; today: string;
  mode?: 'normal' | 'trash' | 'archive'; drag?: DragApi;
}

function LiveTime({ t }: { t: Task }) {
  const now = useNow(1000);
  return <>{fmtDuration(elapsed(t, now))}</>;
}

export const TaskRow = memo(function TaskRow({ t, project, blocked, cursor, selected, today, mode = 'normal', drag }: Props) {
  const [over, setOver] = useState(false);
  const done = t.status === 'done';
  const due = dueInfo(t, today);
  const sub = subtaskProgress(t);
  const running = t.timerStartedAt !== null;
  const st = () => useStore.getState();

  const open = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) { st().toggleSelect(t.id); return; }
    st().ui({ selectedId: t.id, cursorId: t.id });
  };

  return (
    <li
      className={cx('row', done && 'done', cursor && 'cursor', selected && 'selected', over && 'over')}
      data-id={t.id}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) st().ui({ selectedId: t.id }); }}
      draggable={!!drag}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); drag?.start(t.id); }}
      onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); drag?.drop(t.id); }}
    >
      {mode === 'normal' ? (
        <button
          type="button" role="checkbox" aria-checked={done} aria-label={`${done ? 'Reopen' : 'Complete'} ${t.title}`}
          className={cx('check', 'p' + t.priority, done && 'on')}
          onClick={(e) => { e.stopPropagation(); st().toggleDone(t.id); }}
        >{done && <Check size={12} strokeWidth={3} />}</button>
      ) : <span className="check-spacer" />}

      <div className="row-main">
        <div className="row-title">{t.title}</div>
        <div className="row-meta">
          {project && <span className="meta"><Dot color={project.color} />{project.name}</span>}
          {t.tags.map((g) => <span key={g} className="meta tag">@{g}</span>)}
          {sub && <span className="meta"><ListChecks size={13} />{sub[0]}/{sub[1]}</span>}
          {t.recurrence && <span className="meta" title={describeRecurrence(t.recurrence)}><Repeat size={13} /></span>}
          {(t.estimate || t.timeSpent > 0 || running) && (
            <span className={cx('meta', running && 'live')}><Clock size={13} />{running || t.timeSpent > 0 ? <LiveTime t={t} /> : null}{t.estimate ? `${t.timeSpent > 0 || running ? ' / ' : ''}${fmtDuration(t.estimate * 60)}` : ''}</span>
          )}
          {blocked && <span className="meta warn"><Lock size={13} />Blocked</span>}
          {t.notes && <span className="meta" title="Has notes"><AlignLeft size={13} /></span>}
        </div>
      </div>

      <div className="row-side">
        {due && <span className={cx('due', due.tone)}>{due.label}</span>}
        {mode === 'normal' && !done && (
          <button type="button" className={cx('iconbtn small timer', running && 'on')} aria-label={running ? 'Stop timer' : 'Start timer'}
            onClick={(e) => { e.stopPropagation(); running ? st().stopTimer(t.id) : st().startTimer(t.id); }}>
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
        )}
        {mode === 'trash' && (<>
          <button type="button" className="iconbtn small" aria-label="Restore" title="Restore" onClick={(e) => { e.stopPropagation(); st().restore([t.id]); }}><RotateCcw size={14} /></button>
          <button type="button" className="iconbtn small danger" aria-label="Delete forever" title="Delete forever" onClick={(e) => { e.stopPropagation(); if (confirm('Delete this task forever?')) st().purge([t.id]); }}><Trash2 size={14} /></button>
        </>)}
        {mode === 'archive' && (
          <button type="button" className="iconbtn small" aria-label="Unarchive" title="Unarchive" onClick={(e) => { e.stopPropagation(); st().archive([t.id], false); }}><ArchiveRestore size={14} /></button>
        )}
      </div>
    </li>
  );
});
