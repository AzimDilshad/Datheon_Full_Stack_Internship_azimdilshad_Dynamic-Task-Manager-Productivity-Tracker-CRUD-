import type { Priority, Project, Recurrence } from '../types';
import { addDays, diffDays, fromISO, pad, toISO, todayISO } from './dates';

export interface Chip { kind: 'project' | 'tag' | 'priority' | 'date' | 'time' | 'repeat' | 'estimate'; text: string }
export interface Parsed {
  title: string;
  projectId?: string;
  tags: string[];
  priority?: Priority;
  due?: string;
  dueTime?: string;
  recurrence?: Recurrence;
  estimate?: number;
  chips: Chip[];
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const dayIndex = (w: string) => DAYS.indexOf(w.slice(0, 3).toLowerCase());
const WEEKDAY = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)';
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const UNIT: Record<string, Recurrence['freq']> = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };

function nextWeekday(from: string, idx: number) {
  const diff = (idx - fromISO(from).getDay() + 7) % 7;
  return addDays(from, diff === 0 ? 7 : diff);
}

/**
 * Natural-language quick add: "Pay rent every month 5th #home @bills !1 ~15m"
 * Understands #project, @tag, !1-!4 / !high, dates, times, repeats and ~estimates.
 */
export function parseQuick(input: string, ctx: { projects: Project[]; today?: string }): Parsed {
  const today = ctx.today ?? todayISO();
  let s = ` ${input} `;
  const out: Parsed = { title: '', tags: [], chips: [] };

  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void): boolean => {
    const m = re.exec(s);
    if (!m || fn(m) === false) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return true;
  };

  // estimate: ~30m, ~2h, ~1h30m
  take(/\s~(\d+)h(?:(\d+)m)?(?=\s)/i, (m) => {
    out.estimate = +m[1] * 60 + (m[2] ? +m[2] : 0);
    out.chips.push({ kind: 'estimate', text: `~${m[1]}h${m[2] ? ' ' + m[2] + 'm' : ''}` });
  }) || take(/\s~(\d+)m(?=\s)/i, (m) => {
    out.estimate = +m[1];
    out.chips.push({ kind: 'estimate', text: `~${m[1]}m` });
  });

  // priority
  take(/\s(?:!|p)([1-4])(?=\s)/i, (m) => {
    out.priority = +m[1] as Priority;
    out.chips.push({ kind: 'priority', text: `P${m[1]}` });
  }) || take(/\s!(urgent|high|med|medium|normal|low)(?=\s)/i, (m) => {
    const w = m[1].toLowerCase();
    out.priority = (w === 'urgent' ? 1 : w === 'high' ? 2 : w === 'low' ? 4 : 3) as Priority;
    out.chips.push({ kind: 'priority', text: `P${out.priority}` });
  });

  // #project (only when it matches an existing project)
  for (const m of [...s.matchAll(/\s#([\w-]+)(?=\s)/g)]) {
    const key = m[1].toLowerCase();
    const slug = (p: Project) => p.name.toLowerCase().replace(/\s+/g, '-');
    const p = ctx.projects.find((x) => slug(x) === key) ?? ctx.projects.find((x) => slug(x).startsWith(key));
    if (p) {
      out.projectId = p.id;
      out.chips.push({ kind: 'project', text: p.name });
      s = s.replace(m[0], ' ');
      break;
    }
  }

  // @tags
  while (take(/\s@([\w-]+)(?=\s)/, (m) => {
    const tag = m[1].toLowerCase();
    if (!out.tags.includes(tag)) out.tags.push(tag);
    out.chips.push({ kind: 'tag', text: '@' + tag });
  }));

  // repeat
  take(/\severy\s+(\d+)\s*(day|week|month|year)s?(?=\s)/i, (m) => {
    out.recurrence = { freq: UNIT[m[2].toLowerCase()], interval: Math.max(1, +m[1]) };
  }) ||
  take(/\s(?:every\s+weekdays?|weekdays)(?=\s)/i, () => { out.recurrence = { freq: 'weekdays', interval: 1 }; }) ||
  take(new RegExp(`\\severy\\s+${WEEKDAY}(?=\\s)`, 'i'), (m) => {
    out.recurrence = { freq: 'weekly', interval: 1 };
    out.due = nextWeekday(addDays(today, -1), dayIndex(m[1]));
  }) ||
  take(/\s(?:every\s+(day|week|month|year)|(daily|weekly|monthly|yearly))(?=\s)/i, (m) => {
    const w = (m[1] ?? m[2]).toLowerCase();
    out.recurrence = { freq: w.startsWith('day') || w === 'daily' ? 'daily' : w.startsWith('week') || w === 'weekly' ? 'weekly' : w.startsWith('month') || w === 'monthly' ? 'monthly' : 'yearly', interval: 1 };
  });
  if (out.recurrence) {
    const r = out.recurrence;
    out.chips.push({ kind: 'repeat', text: r.freq === 'weekdays' ? 'Weekdays' : r.interval > 1 ? `Every ${r.interval} ${r.freq.replace('ly', '').replace('dai', 'day')}s` : r.freq[0].toUpperCase() + r.freq.slice(1) });
  }

  // date
  const setDate = (d: string, label: string) => { out.due = d; out.chips.push({ kind: 'date', text: label }); };
  const hadWeekdayRepeat = !!out.due;
  if (!hadWeekdayRepeat) {
    take(/\s(today|tod|tonight)(?=\s)/i, () => setDate(today, 'Today')) ||
    take(/\s(tomorrow|tmrw|tmr|tom)(?=\s)/i, () => setDate(addDays(today, 1), 'Tomorrow')) ||
    take(/\sin\s+(\d+)\s*(day|week|month)s?(?=\s)/i, (m) => {
      const n = +m[1];
      const d = m[2].toLowerCase() === 'month' ? (() => { const x = fromISO(today); x.setMonth(x.getMonth() + n); return toISO(x); })() : addDays(today, n * (m[2].toLowerCase() === 'week' ? 7 : 1));
      setDate(d, `In ${n} ${m[2].toLowerCase()}${n > 1 ? 's' : ''}`);
    }) ||
    take(/\snext\s+week(?=\s)/i, () => setDate(nextWeekday(today, 1), 'Next week')) ||
    take(/\snext\s+month(?=\s)/i, () => { const x = fromISO(today); x.setMonth(x.getMonth() + 1, 1); setDate(toISO(x), 'Next month'); }) ||
    take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => { if (isNaN(fromISO(m[1]).getTime())) return false; setDate(m[1], m[1]); }) ||
    take(new RegExp(`\\s${MONTH}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?=\\s)`, 'i'), (m) => setMonthDay(m[1], +m[2], m[3] ? +m[3] : undefined)) ||
    take(new RegExp(`\\s(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?(?=\\s)`, 'i'), (m) => setMonthDay(m[2], +m[1], m[3] ? +m[3] : undefined)) ||
    take(new RegExp(`\\s(?:next\\s+|this\\s+|on\\s+)?${WEEKDAY}(?=\\s)`, 'i'), (m) => {
      const d = nextWeekday(today, dayIndex(m[1]));
      setDate(d, fromISO(d).toLocaleDateString(undefined, { weekday: 'short' }));
    });
  }
  function setMonthDay(mon: string, day: number, year?: number) {
    const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
    if (day < 1 || day > 31) return false;
    const base = fromISO(today);
    let d = new Date(year ?? base.getFullYear(), mi, day);
    if (d.getMonth() !== mi) return false; // e.g. Feb 31
    if (!year && toISO(d) < today) d = new Date(base.getFullYear() + 1, mi, day);
    setDate(toISO(d), `${day} ${MONTHS[mi][0].toUpperCase() + MONTHS[mi].slice(1)}`);
  }

  // time: 5pm, 5:30pm, 17:30
  const setTime = (h: number, m: number) => {
    out.dueTime = `${pad(h)}:${pad(m)}`;
    out.chips.push({ kind: 'time', text: out.dueTime });
  };
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (m) => {
    let h = +m[1];
    if (h < 1 || h > 12) return false;
    if (/pm/i.test(m[3]) && h < 12) h += 12;
    if (/am/i.test(m[3]) && h === 12) h = 0;
    setTime(h, m[2] ? +m[2] : 0);
  }) || take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => setTime(+m[1], +m[2]));

  if (out.dueTime && !out.due) { out.due = today; out.chips.unshift({ kind: 'date', text: 'Today' }); }
  if (out.recurrence && !out.due) { out.due = today; out.chips.unshift({ kind: 'date', text: 'Today' }); }

  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}

/** Days from today, handy for tests and labels. */
export const daysFrom = (iso: string, today = todayISO()) => diffDays(iso, today);
