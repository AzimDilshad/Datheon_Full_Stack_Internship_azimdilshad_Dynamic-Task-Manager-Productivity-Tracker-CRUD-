import type { Priority, Status } from '../types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export const PROJECT_COLORS = ['#0f8f80', '#4f5bd5', '#d6457a', '#c97a0b', '#7a4de0', '#1f7fc4', '#c8402f', '#5f8f2d'];
export const hashColor = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
};

export const ACCENTS: Record<string, string> = {
  teal: '#0f8f80', indigo: '#4f5bd5', rose: '#d6457a', amber: '#b8690a', violet: '#7a4de0', sky: '#1f7fc4'
};

export const PRIORITY: Record<Priority, { label: string }> = {
  1: { label: 'Urgent' }, 2: { label: 'High' }, 3: { label: 'Normal' }, 4: { label: 'Low' }
};
export const STATUSES: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' }, { id: 'doing', label: 'In progress' },
  { id: 'review', label: 'In review' }, { id: 'done', label: 'Done' }
];
export const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)!.label;

/** Subsequence fuzzy match. Returns -1 when no match, otherwise a score (higher is better). */
export function fuzzy(q: string, text: string): number {
  q = q.toLowerCase(); text = text.toLowerCase();
  if (!q) return 0;
  const i = text.indexOf(q);
  if (i >= 0) return 100 - i;
  let qi = 0, score = 0, last = -2;
  for (let ti = 0; ti < text.length && qi < q.length; ti++) {
    if (text[ti] === q[qi]) { score += last === ti - 1 ? 5 : 1; last = ti; qi++; }
  }
  return qi === q.length ? score : -1;
}

export function download(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
