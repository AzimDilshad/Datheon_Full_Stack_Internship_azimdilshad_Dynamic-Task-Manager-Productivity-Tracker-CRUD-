import { Calendar, Columns3, Command, Grid2x2, ListTodo, Menu, Redo2, Search, Undo2, X } from 'lucide-react';
import type { Layout } from '../types';
import { useStore } from '../store';
import { Seg } from './ui';

export function Topbar() {
  const { page, layout, query, scope, past, future, ui, undo, redo } = useStore();
  const special = scope.kind === 'trash' || scope.kind === 'archive' || scope.kind === 'completed';
  return (
    <header className="topbar">
      <button type="button" className="iconbtn menu" aria-label="Open menu" onClick={() => ui({ sidebarOpen: true })}><Menu size={19} /></button>
      {page === 'tasks' && !special && (
        <Seg<Layout> label="Layout" value={layout} onChange={(v) => ui({ layout: v })} options={[
          { id: 'list', label: <><ListTodo size={15} /><span>List</span></>, title: 'List (V L)' },
          { id: 'board', label: <><Columns3 size={15} /><span>Board</span></>, title: 'Board (V B)' },
          { id: 'calendar', label: <><Calendar size={15} /><span>Calendar</span></>, title: 'Calendar (V C)' },
          { id: 'matrix', label: <><Grid2x2 size={15} /><span>Matrix</span></>, title: 'Priority matrix (V M)' }
        ]} />
      )}
      <span className="spacer" />
      {page === 'tasks' && (
        <div className="search">
          <Search size={15} aria-hidden />
          <input id="search" type="search" value={query} onChange={(e) => ui({ query: e.target.value })} placeholder="Search (press /)" aria-label="Search tasks" />
          {query && <button type="button" className="iconbtn small" aria-label="Clear search" onClick={() => ui({ query: '' })}><X size={13} /></button>}
        </div>
      )}
      <button type="button" className="iconbtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button>
      <button type="button" className="iconbtn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button>
      <button type="button" className="btn small palette-btn" onClick={() => ui({ modal: 'palette' })}><Command size={14} />Commands</button>
    </header>
  );
}
