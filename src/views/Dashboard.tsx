import { useMemo } from 'react';
import { useStore } from '../store';
import { addDays, fmtDuration, startOfWeek, toISO, todayISO, fromISO } from '../lib/dates';
import { PRIORITY } from '../lib/utils';

interface Bar { label: string; value: number; title: string }

function Bars({ data, unit = '' }: { data: Bar[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars" role="img" aria-label={data.map((d) => `${d.label}: ${d.title}`).join(', ')}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={d.title}>
          <b>{d.value > 0 ? d.value + unit : ''}</b>
          <div className="bar-track"><i style={{ height: `${(d.value / max) * 100}%` }} /></div>
          <span>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" width="132" height="132" role="img" aria-label="Open tasks by project">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="12" />
        {total > 0 && data.filter((d) => d.value).map((d) => {
          const len = (d.value / total) * C;
          const el = <circle key={d.label} cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" />;
          acc += len;
          return el;
        })}
        <text x="50" y="54" textAnchor="middle" className="donut-n">{total}</text>
      </svg>
      <ul className="legend">{data.filter((d) => d.value).map((d) => <li key={d.label}><i style={{ background: d.color }} />{d.label}<em>{d.value}</em></li>)}</ul>
    </div>
  );
}

export function Dashboard() {
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.sessions);
  const projects = useStore((s) => s.projects);
  const weekStart = useStore((s) => s.settings.weekStart);

  const d = useMemo(() => {
    const today = todayISO();
    const live = tasks.filter((t) => !t.deleted);
    const open = live.filter((t) => t.status !== 'done' && !t.archived);
    const done = live.filter((t) => t.status === 'done');
    const doneBy = new Map<string, number>();
    for (const t of done) if (t.completedAt) { const k = toISO(new Date(t.completedAt)); doneBy.set(k, (doneBy.get(k) ?? 0) + 1); }
    const focusBy = new Map<string, number>();
    for (const s of sessions) { const k = toISO(new Date(s.at)); focusBy.set(k, (focusBy.get(k) ?? 0) + s.seconds); }
    const lastDays = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
    const wk = (iso: string) => fromISO(iso).toLocaleDateString(undefined, { weekday: 'narrow' });

    let streak = 0, cur = doneBy.get(today) ? today : addDays(today, -1);
    while (doneBy.get(cur)) { streak++; cur = addDays(cur, -1); }

    const week = lastDays(7);
    const heatStart = addDays(startOfWeek(today, weekStart), -15 * 7);
    const heat = Array.from({ length: 16 * 7 }, (_, i) => addDays(heatStart, i));
    const withEst = done.filter((t) => t.estimate && t.timeSpent > 0);
    const counts = new Map<string, number>();
    for (const t of open) counts.set(t.projectId ?? '', (counts.get(t.projectId ?? '') ?? 0) + 1);

    return {
      today, open: open.length, overdue: open.filter((t) => t.due && t.due < today).length, dueToday: open.filter((t) => t.due === today).length,
      doneWeek: week.reduce((n, k) => n + (doneBy.get(k) ?? 0), 0), streak,
      rate: done.length + open.length ? Math.round((done.length / (done.length + open.length)) * 100) : 0,
      focusWeek: week.reduce((n, k) => n + (focusBy.get(k) ?? 0), 0),
      completed: lastDays(14).map((k) => ({ label: wk(k), value: doneBy.get(k) ?? 0, title: `${fromISO(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${doneBy.get(k) ?? 0} completed` })),
      focus: week.map((k) => ({ label: wk(k), value: Math.round((focusBy.get(k) ?? 0) / 60), title: `${fmtDuration(focusBy.get(k) ?? 0)} focused` })),
      load: Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((k) => {
        const m = open.filter((t) => t.due === k).reduce((n, t) => n + (t.estimate ?? 0), 0);
        return { label: wk(k), value: m, title: `${fmtDuration(m * 60)} estimated, ${open.filter((t) => t.due === k).length} tasks` };
      }),
      projects: [...projects.map((p) => ({ label: p.name, value: counts.get(p.id) ?? 0, color: p.color })), { label: 'Inbox', value: counts.get('') ?? 0, color: 'var(--faint)' }],
      priorities: ([1, 2, 3, 4] as const).map((p) => ({ p, n: open.filter((t) => t.priority === p).length })),
      heat: heat.map((k) => ({ k, n: k > today ? -1 : doneBy.get(k) ?? 0 })),
      accuracy: withEst.length ? Math.round((withEst.reduce((n, t) => n + t.timeSpent / 60, 0) / withEst.reduce((n, t) => n + (t.estimate ?? 0), 0)) * 100) : null
    };
  }, [tasks, sessions, projects, weekStart]);

  const maxP = Math.max(1, ...d.priorities.map((x) => x.n));
  const level = (n: number) => (n < 0 ? 'x' : n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);

  return (
    <div className="page-body dash">
      <header className="page-head"><div><h1>Dashboard</h1><p>How your work is going, based on what you have logged.</p></div></header>
      <div className="stats">
        <div><b>{d.open}</b><span>open tasks</span></div>
        <div className={d.overdue ? 'bad' : ''}><b>{d.overdue}</b><span>overdue</span></div>
        <div><b>{d.dueToday}</b><span>due today</span></div>
        <div><b>{d.doneWeek}</b><span>done this week</span></div>
        <div><b>{d.streak}</b><span>day streak</span></div>
        <div><b>{d.rate}%</b><span>of all tasks done</span></div>
        <div><b>{fmtDuration(d.focusWeek)}</b><span>focused this week</span></div>
      </div>
      <div className="panels">
        <section className="panel wide"><h3>Completed in the last 14 days</h3><Bars data={d.completed} /></section>
        <section className="panel"><h3>Workload, next 7 days</h3><Bars data={d.load} unit="m" /><p className="panel-note">Minutes estimated for open tasks by due date.</p></section>
        <section className="panel"><h3>Focus minutes, last 7 days</h3><Bars data={d.focus} />{d.accuracy !== null && <p className="panel-note">On finished tasks you tracked {d.accuracy}% of the time you estimated.</p>}</section>
        <section className="panel"><h3>Open tasks by project</h3><Donut data={d.projects} /></section>
        <section className="panel"><h3>Open tasks by priority</h3>
          <ul className="hbars">{d.priorities.map(({ p, n }) => (
            <li key={p}><span>{PRIORITY[p].label}</span><div><i style={{ width: `${(n / maxP) * 100}%`, background: `var(--p${p})` }} /></div><em>{n}</em></li>
          ))}</ul>
        </section>
        <section className="panel wide"><h3>Completions, last 16 weeks</h3>
          <div className="heat" role="img" aria-label="Task completions per day over the last 16 weeks">
            {d.heat.map((c) => <i key={c.k} data-l={level(c.n)} title={c.n >= 0 ? `${c.k}: ${c.n} completed` : ''} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
