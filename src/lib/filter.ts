import type { Project, Scope, Task } from '../types';
import { addDays, todayISO } from './dates';

export const sameScope = (a: Scope, b: Scope) =>
  a.kind === b.kind && (a as { id?: string }).id === (b as { id?: string }).id && (a as { tag?: string }).tag === (b as { tag?: string }).tag;

export function scopeTitle(s: Scope, projects: Project[]) {
  switch (s.kind) {
    case 'project': return projects.find((p) => p.id === s.id)?.name ?? 'Project';
    case 'tag': return '@' + s.tag;
    case 'inbox': return 'Inbox';
    case 'today': return 'Today';
    case 'upcoming': return 'Upcoming';
    case 'overdue': return 'Overdue';
    case 'completed': return 'Completed';
    case 'archive': return 'Archive';
    case 'trash': return 'Trash';
    default: return 'All tasks';
  }
}

export function inScope(t: Task, s: Scope, today = todayISO()): boolean {
  if (s.kind === 'trash') return t.deleted !== null;
  if (t.deleted !== null) return false;
  if (s.kind === 'archive') return t.archived;
  if (t.archived) return false;
  const open = t.status !== 'done';
  switch (s.kind) {
    case 'all': return true;
    case 'inbox': return !t.projectId && open;
    case 'today': return !!t.due && t.due <= today && (open || t.due === today);
    case 'upcoming': return !!t.due && t.due > today && t.due <= addDays(today, 14) && open;
    case 'overdue': return open && !!t.due && t.due < today;
    case 'completed': return t.status === 'done';
    case 'project': return t.projectId === s.id;
    case 'tag': return t.tags.includes(s.tag);
  }
}

export function scopeDefaults(s: Scope, today = todayISO()) {
  return {
    projectId: s.kind === 'project' ? s.id : null,
    tags: s.kind === 'tag' ? [s.tag] : [],
    due: s.kind === 'today' ? today : s.kind === 'upcoming' ? addDays(today, 1) : null,
    priority: null
  };
}

/**
 * Search operators: #project @tag p1 is:done|open|overdue|blocked|recurring|running
 * due:today|tomorrow|week|none|overdue  has:notes|subtasks|estimate  status:doing  -negate  plain words
 */
export function matchesQuery(t: Task, query: string, ctx: { projects: Project[]; blocked?: Set<string>; today?: string }): boolean {
  const today = ctx.today ?? todayISO();
  const projectName = ctx.projects.find((p) => p.id === t.projectId)?.name.toLowerCase() ?? '';
  const hay = [t.title, t.notes, t.tags.join(' '), t.subtasks.map((s) => s.title).join(' '), projectName].join(' ').toLowerCase();
  return query.trim().split(/\s+/).filter(Boolean).every((raw) => {
    const neg = raw.startsWith('-') && raw.length > 1;
    const tok = (neg ? raw.slice(1) : raw).toLowerCase();
    let ok: boolean;
    if (tok.startsWith('#') && tok.length > 1) ok = projectName.includes(tok.slice(1).replace(/-/g, ' '));
    else if (tok.startsWith('@') && tok.length > 1) ok = t.tags.some((x) => x.includes(tok.slice(1)));
    else if (/^p[1-4]$/.test(tok)) ok = t.priority === +tok[1];
    else if (tok.startsWith('status:')) ok = t.status === tok.slice(7);
    else if (tok.startsWith('is:')) {
      const v = tok.slice(3);
      ok = v === 'done' ? t.status === 'done' : v === 'open' ? t.status !== 'done'
        : v === 'overdue' ? t.status !== 'done' && !!t.due && t.due < today
        : v === 'blocked' ? !!ctx.blocked?.has(t.id) : v === 'recurring' ? !!t.recurrence
        : v === 'running' ? t.timerStartedAt !== null : true;
    } else if (tok.startsWith('due:')) {
      const v = tok.slice(4);
      ok = v === 'today' ? t.due === today : v === 'tomorrow' ? t.due === addDays(today, 1)
        : v === 'week' ? !!t.due && t.due >= today && t.due <= addDays(today, 7)
        : v === 'none' ? !t.due : v === 'overdue' ? t.status !== 'done' && !!t.due && t.due < today : true;
    } else if (tok.startsWith('has:')) {
      const v = tok.slice(4);
      ok = v === 'notes' ? !!t.notes : v === 'subtasks' ? t.subtasks.length > 0 : v === 'estimate' ? t.estimate !== null : true;
    } else ok = hay.includes(tok);
    return neg ? !ok : ok;
  });
}
