import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, Flag, Folder, Hash, Repeat, Timer } from 'lucide-react';
import { useStore } from '../store';
import { parseQuick, type Chip } from '../lib/parse';
import { fmtDay } from '../lib/dates';
import { Kbd, Modal } from './ui';

const ICON: Record<Chip['kind'], JSX.Element> = {
  project: <Folder size={13} />, tag: <Hash size={13} />, priority: <Flag size={13} />, date: <CalendarDays size={13} />,
  time: <Clock size={13} />, repeat: <Repeat size={13} />, estimate: <Timer size={13} />
};

export function QuickAdd() {
  const defaults = useStore((s) => s.quickDefaults);
  const projects = useStore((s) => s.projects);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const parsed = useMemo(() => parseQuick(text, { projects }), [text, projects]);
  const chips: Chip[] = [...parsed.chips];
  if (defaults.projectId && !parsed.projectId) { const p = projects.find((x) => x.id === defaults.projectId); if (p) chips.unshift({ kind: 'project', text: p.name }); }
  if (defaults.due && !parsed.due) chips.unshift({ kind: 'date', text: fmtDay(defaults.due) });

  const submit = (keepOpen: boolean) => {
    const st = useStore.getState();
    if (!st.quickCreate(text, defaults, notes)) return;
    if (keepOpen) { setText(''); setNotes(''); ref.current?.focus(); st.toast('Task added.'); }
    else st.ui({ modal: null });
  };

  return (
    <Modal label="Add a task" onClose={() => useStore.getState().ui({ modal: null })}>
      <form className="qa" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <input ref={ref} className="qa-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} aria-label="Task"
          placeholder="What needs doing?" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); } }} />
        <input className="qa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} aria-label="Notes" placeholder="Notes (optional)" />
        <div className="qa-chips" aria-live="polite">
          {chips.length ? chips.map((c, i) => <span key={i} className={`pill ${c.kind}`}>{ICON[c.kind]}{c.text}</span>)
            : <span className="qa-help">Type naturally: <code>Pay rent every month 1st #home !1 ~10m</code></span>}
        </div>
        <footer className="qa-foot">
          <span><Kbd>Enter</Kbd> add · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> add another · <Kbd>Esc</Kbd> close</span>
          <button type="submit" className="btn primary" disabled={!parsed.title}>Add task</button>
        </footer>
      </form>
    </Modal>
  );
}
