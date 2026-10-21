import { useMemo } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import type { PomoPhase } from '../types';
import { useStore } from '../store';
import { fmtClock, fmtDuration, toISO, todayISO } from '../lib/dates';
import { useNow } from '../hooks';
import { Seg } from '../components/ui';

export function Focus() {
  const pomo = useStore((s) => s.pomo);
  const settings = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.sessions);
  const st = useStore.getState;
  const now = useNow(250);

  const total = settings.pomodoro[pomo.phase] * 60;
  const remaining = pomo.endsAt ? Math.max(0, (pomo.endsAt - now) / 1000) : pomo.remaining;
  const R = 118, C = 2 * Math.PI * R;
  const running = !!pomo.endsAt;
  const options = useMemo(() => tasks.filter((t) => !t.deleted && !t.archived && t.status !== 'done').sort((a, b) => a.priority - b.priority).slice(0, 300), [tasks]);
  const today = sessions.filter((s) => toISO(new Date(s.at)) === todayISO()).sort((a, b) => b.at - a.at);
  const todayTotal = today.reduce((n, s) => n + s.seconds, 0);
  const label = pomo.phase === 'work' ? 'Focus' : pomo.phase === 'short' ? 'Short break' : 'Long break';

  return (
    <div className="page-body focus">
      <header className="page-head"><div><h1>Focus</h1><p>Work in timed sessions. Finished sessions are logged to the task you pick.</p></div></header>
      <div className="focus-grid">
        <div className="timer-card">
          <Seg<PomoPhase> label="Session type" value={pomo.phase} onChange={(p) => st().pomoSetPhase(p)} options={[
            { id: 'work', label: 'Focus' }, { id: 'short', label: 'Short break' }, { id: 'long', label: 'Long break' }]} />
          <div className="ring">
            <svg viewBox="0 0 260 260" role="img" aria-label={`${label}, ${fmtClock(remaining)} left`}>
              <circle cx="130" cy="130" r={R} className="ring-bg" />
              <circle cx="130" cy="130" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (remaining / total)} transform="rotate(-90 130 130)" />
            </svg>
            <div className="ring-text"><strong aria-live="off">{fmtClock(remaining)}</strong><span>{label}</span></div>
          </div>
          <div className="timer-ctl">
            <button type="button" className="iconbtn big" aria-label="Reset" onClick={() => st().pomoReset()}><RotateCcw size={18} /></button>
            <button type="button" className="btn primary big" onClick={() => (running ? st().pomoPause() : st().pomoStart())}>
              {running ? <Pause size={18} /> : <Play size={18} />}{running ? 'Pause' : remaining < total ? 'Resume' : 'Start'}
            </button>
            <button type="button" className="iconbtn big" aria-label="Skip to next session" onClick={() => st().pomoSkip()}><SkipForward size={18} /></button>
          </div>
          <label className="field wide"><span>Working on</span>
            <select value={pomo.taskId ?? ''} onChange={(e) => st().pomoSetTask(e.target.value || null)}>
              <option value="">No specific task</option>
              {options.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
          <p className="cycle">Session {(pomo.cycle % settings.pomodoro.every) + (pomo.phase === 'work' ? 1 : 0)} of {settings.pomodoro.every} before a long break</p>
        </div>
        <section className="panel">
          <h3>Today</h3>
          <p className="big-n">{fmtDuration(todayTotal)}<span> across {today.length} session{today.length === 1 ? '' : 's'}</span></p>
          <ul className="sessions">
            {today.slice(0, 10).map((s) => (
              <li key={s.id}><time>{new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><span>{tasks.find((t) => t.id === s.taskId)?.title ?? 'General focus'}</span><em>{fmtDuration(s.seconds)}</em></li>
            ))}
            {!today.length && <li className="muted">No sessions yet. Start one to see it here.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
