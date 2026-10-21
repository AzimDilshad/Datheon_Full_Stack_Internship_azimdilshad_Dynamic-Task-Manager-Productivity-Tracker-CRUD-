import type { Data, Project, Settings, Task } from '../types';

export function toJSON(d: Data, settings?: Settings) {
  return JSON.stringify({ app: 'taskbook', version: 2, exportedAt: new Date().toISOString(), ...d, settings: settings && { ...settings, syncKey: '' } }, null, 2);
}

const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCSV(tasks: Task[], projects: Project[]) {
  const name = (id: string | null) => projects.find((p) => p.id === id)?.name ?? '';
  const head = ['title', 'status', 'priority', 'project', 'tags', 'due', 'due_time', 'estimate_min', 'time_spent_min', 'subtasks_done', 'subtasks_total', 'repeat', 'created', 'completed', 'notes'];
  const rows = tasks.filter((t) => !t.deleted).map((t) => [
    t.title, t.status, t.priority, name(t.projectId), t.tags.join(' '), t.due ?? '', t.dueTime ?? '', t.estimate ?? '',
    Math.round(t.timeSpent / 60), t.subtasks.filter((s) => s.done).length, t.subtasks.length,
    t.recurrence ? `${t.recurrence.freq}/${t.recurrence.interval}` : '', new Date(t.created).toISOString(),
    t.completedAt ? new Date(t.completedAt).toISOString() : '', t.notes
  ].map(q).join(','));
  return [head.join(','), ...rows].join('\r\n');
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

/** iCalendar (VTODO) export so due dates show up in Apple/Google/Outlook calendars. */
export function toICS(tasks: Task[], projects: Project[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taskbook//EN', 'CALSCALE:GREGORIAN'];
  for (const t of tasks) {
    if (t.deleted || !t.due) continue;
    const ymd = t.due.replace(/-/g, '');
    lines.push('BEGIN:VTODO', `UID:${t.id}@taskbook`, `DTSTAMP:${stamp(new Date())}`, `SUMMARY:${esc(t.title)}`);
    lines.push(t.dueTime ? `DUE:${ymd}T${t.dueTime.replace(':', '')}00` : `DUE;VALUE=DATE:${ymd}`);
    lines.push(`PRIORITY:${({ 1: 1, 2: 3, 3: 5, 4: 9 } as const)[t.priority]}`);
    lines.push(`STATUS:${t.status === 'done' ? 'COMPLETED' : t.status === 'doing' ? 'IN-PROCESS' : 'NEEDS-ACTION'}`);
    const proj = projects.find((p) => p.id === t.projectId);
    const cats = [...(proj ? [proj.name] : []), ...t.tags];
    if (cats.length) lines.push(`CATEGORIES:${cats.map(esc).join(',')}`);
    if (t.notes) lines.push(`DESCRIPTION:${esc(t.notes)}`);
    if (t.recurrence) {
      const r = t.recurrence;
      lines.push(r.freq === 'weekdays'
        ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
        : `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval}`);
    }
    lines.push('END:VTODO');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
