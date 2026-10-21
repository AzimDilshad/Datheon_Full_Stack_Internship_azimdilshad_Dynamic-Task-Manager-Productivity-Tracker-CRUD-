import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Copy, Link2, Lock, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import type { Priority, Status, Task } from '../types';
import { useStore } from '../store';
import { describeRecurrence, fmtDuration, todayISO } from '../lib/dates';
import { elapsed, subtaskProgress, wouldCycle } from '../lib/task';
import { PRIORITY, STATUSES, uid } from '../lib/utils';
import { useDraft, useNow } from '../hooks';
import { Field } from './ui';

const REPEATS = [
  { id: 'none', label: 'Does not repeat' }, { id: 'daily', label: 'Every day' }, { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekly', label: 'Every week' }, { id: 'monthly', label: 'Every month' }, { id: 'yearly', label: 'Every year' }
];
const REMINDERS: [number | null, string][] = [[null, 'No reminder'], [0, 'At due time'], [10, '10 minutes before'], [60, '1 hour before'], [1440, '1 day before']];

function Timer({ t }: { t: Task }) {
  const now = useNow(1000);
  const running = t.timerStartedAt !== null;
  const st = useStore.getState;
  return (
    <div className="timer-box">
      <button type="button" className={running ? 'btn primary' : 'btn'} onClick={() => (running ? st().stopTimer(t.id) : st().startTimer(t.id))}>
        {running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Stop' : 'Start timer'}
      </button>
      <strong>{fmtDuration(elapsed(t, now))}</strong>
      {t.estimate ? <span className="muted">of {fmtDuration(t.estimate * 60)} estimated</span> : null}
      <span className="spacer" />
      <button type="button" className="btn small" onClick={() => st().addTime(t.id, 15)}>+15m</button>
      <button type="button" className="btn small" onClick={() => st().addTime(t.id, -15)} disabled={t.timeSpent < 900}>−15m</button>
    </div>
  );
}

export function TaskDetail({ id }: { id: string }) {
  const t = useStore((s) => s.tasks.find((x) => x.id === id));
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const st = useStore.getState;
  const [tagText, setTagText] = useState('');
  const [subText, setSubText] = useState('');
  const title = useDraft(t?.title ?? '', (v) => { if (v.trim()) st().updateTask(id, { title: v.trim().slice(0, 200) }); });
  const notes = useDraft(t?.notes ?? '', (v) => st().updateTask(id, { notes: v.slice(0, 5000) }));
  const allTags = useMemo(() => [...new Set(tasks.flatMap((x) => x.tags))].sort(), [tasks]);
  const candidates = useMemo(() => tasks.filter((x) => x.id !== id && !x.deleted && !x.archived && x.status !== 'done' && !t?.blockedBy.includes(x.id) && !wouldCycle(tasks, id, x.id)), [tasks, id, t?.blockedBy]);

  if (!t) return null;
  const up = (patch: Partial<Task>) => st().updateTask(id, patch);
  const prog = subtaskProgress(t);
  const blockers = t.blockedBy.map((b) => tasks.find((x) => x.id === b)).filter((x): x is Task => !!x);
  const addTag = (raw: string) => {
    const g = raw.trim().toLowerCase().replace(/^@/, '').replace(/[^\w-]/g, '').slice(0, 24);
    if (g && !t.tags.includes(g)) up({ tags: [...t.tags, g] });
    setTagText('');
  };

  return (
    <aside className="drawer" aria-label="Task details">
      <header className="drawer-head">
        <select className="status-select" aria-label="Status" value={t.status} onChange={(e) => st().setStatus(id, e.target.value as Status)}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="spacer" />
        <button type="button" className="iconbtn" aria-label="Copy link" title="Copy link" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/#task=${id}`); st().toast('Link copied.'); }}><Link2 size={16} /></button>
        <button type="button" className="iconbtn" aria-label="Duplicate" title="Duplicate" onClick={() => st().duplicate(id)}><Copy size={16} /></button>
        <button type="button" className="iconbtn" aria-label={t.archived ? 'Unarchive' : 'Archive'} title={t.archived ? 'Unarchive' : 'Archive'} onClick={() => st().archive([id], !t.archived)}>{t.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
        <button type="button" className="iconbtn danger" aria-label="Move to trash" title="Move to trash" onClick={() => st().trash([id])}><Trash2 size={16} /></button>
        <button type="button" className="iconbtn" aria-label="Close details" onClick={() => st().ui({ selectedId: null })}><X size={17} /></button>
      </header>

      <div className="drawer-body">
        <input className="d-title" value={title.value} aria-label="Title" maxLength={200}
          onChange={(e) => title.onChange(e.target.value)} onBlur={title.commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />

        <div className="fields">
          <Field label="Priority">
            <select value={t.priority} onChange={(e) => up({ priority: +e.target.value as Priority })}>
              {([1, 2, 3, 4] as const).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={t.projectId ?? ''} onChange={(e) => up({ projectId: e.target.value || null })}>
              <option value="">Inbox</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Due date"><input type="date" value={t.due ?? ''} onChange={(e) => up({ due: e.target.value || null, dueTime: e.target.value ? t.dueTime : null, remindedFor: null })} /></Field>
          <Field label="Time"><input type="time" value={t.dueTime ?? ''} disabled={!t.due} onChange={(e) => up({ dueTime: e.target.value || null, remindedFor: null })} /></Field>
          <Field label="Repeat">
            <select value={t.recurrence?.freq ?? 'none'} onChange={(e) => up({ recurrence: e.target.value === 'none' ? null : { freq: e.target.value as 'daily', interval: t.recurrence?.interval ?? 1 }, due: t.due ?? (e.target.value === 'none' ? null : todayISO()) })}>
              {REPEATS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Every">
            <input type="number" min={1} max={99} value={t.recurrence?.interval ?? 1} disabled={!t.recurrence || t.recurrence.freq === 'weekdays'}
              onChange={(e) => t.recurrence && up({ recurrence: { ...t.recurrence, interval: Math.max(1, Math.min(99, +e.target.value || 1)) } })} />
          </Field>
          <Field label="Estimate (minutes)"><input type="number" min={0} step={5} value={t.estimate ?? ''} placeholder="None" onChange={(e) => up({ estimate: e.target.value ? Math.max(0, +e.target.value) : null })} /></Field>
          <Field label="Reminder">
            <select value={t.reminder ?? ''} disabled={!t.due} onChange={(e) => up({ reminder: e.target.value === '' ? null : +e.target.value, remindedFor: null })}>
              {REMINDERS.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}
            </select>
          </Field>
        </div>
        {t.recurrence && <p className="hint">{describeRecurrence(t.recurrence)}. Completing it creates the next one automatically.</p>}
        {t.reminder !== null && <p className="hint">Reminders need notifications turned on in Settings.</p>}

        <section>
          <h4>Tags</h4>
          <div className="tag-edit">
            {t.tags.map((g) => <span key={g} className="pill">@{g}<button type="button" aria-label={`Remove tag ${g}`} onClick={() => up({ tags: t.tags.filter((x) => x !== g) })}><X size={11} /></button></span>)}
            <input list="all-tags" value={tagText} placeholder="Add tag" aria-label="Add tag" maxLength={24}
              onChange={(e) => setTagText(e.target.value)} onBlur={() => addTag(tagText)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }} />
            <datalist id="all-tags">{allTags.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
        </section>

        <section>
          <h4>Notes</h4>
          <textarea rows={4} value={notes.value} maxLength={5000} placeholder="Add details, links or context" aria-label="Notes"
            onChange={(e) => notes.onChange(e.target.value)} onBlur={notes.commit} />
        </section>

        <section>
          <h4>Subtasks {prog && <em>{prog[0]}/{prog[1]}</em>}</h4>
          {prog && <div className="bar"><i style={{ width: `${(prog[0] / prog[1]) * 100}%` }} /></div>}
          <ul className="subtasks">
            {t.subtasks.map((s) => (
              <li key={s.id}>
                <input type="checkbox" checked={s.done} aria-label={`Complete ${s.title}`} onChange={() => up({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
                <input className={s.done ? 'sub-title done' : 'sub-title'} defaultValue={s.title} aria-label="Subtask title" maxLength={200}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.title) up({ subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, title: v } : x)) }); }} />
                <button type="button" className="iconbtn small" aria-label="Delete subtask" onClick={() => up({ subtasks: t.subtasks.filter((x) => x.id !== s.id) })}><X size={13} /></button>
              </li>
            ))}
          </ul>
          <form className="add-line" onSubmit={(e) => { e.preventDefault(); if (subText.trim()) { up({ subtasks: [...t.subtasks, { id: uid(), title: subText.trim().slice(0, 200), done: false }] }); setSubText(''); } }}>
            <input value={subText} onChange={(e) => setSubText(e.target.value)} placeholder="Add a subtask" aria-label="Add a subtask" maxLength={200} />
            <button type="submit" className="iconbtn" aria-label="Add subtask"><Plus size={16} /></button>
          </form>
        </section>

        <section>
          <h4>Blocked by</h4>
          {blockers.map((b) => (
            <div key={b.id} className="blocker">
              <Lock size={13} className={b.status === 'done' ? 'muted' : 'warn'} />
              <button type="button" className="linklike" onClick={() => st().ui({ selectedId: b.id })}>{b.title}</button>
              <span className="muted">{b.status === 'done' ? 'done' : 'open'}</span>
              <button type="button" className="iconbtn small" aria-label="Remove dependency" onClick={() => up({ blockedBy: t.blockedBy.filter((x) => x !== b.id) })}><X size={13} /></button>
            </div>
          ))}
          <select value="" aria-label="Add a blocking task" onChange={(e) => { if (e.target.value) up({ blockedBy: [...t.blockedBy, e.target.value] }); }}>
            <option value="">Choose a task that must finish first…</option>
            {candidates.slice(0, 200).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </section>

        <section><h4>Time</h4><Timer t={t} /></section>

        <section>
          <h4>Activity</h4>
          <ul className="activity">
            {t.activity.slice(0, 8).map((a, i) => <li key={i}><span>{a.text}</span><time>{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></li>)}
          </ul>
        </section>
      </div>
    </aside>
  );
}
