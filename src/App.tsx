import { Component, type ReactNode } from 'react';
import { useStore } from './store';
import { useHotkeys, useLifecycle, usePomoTicker, useReminders, useTheme } from './hooks';
import { cx, download } from './lib/utils';
import { toJSON } from './lib/export';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TaskDetail } from './components/TaskDetail';
import { QuickAdd } from './components/QuickAdd';
import { CommandPalette, Help, ProjectDialog, Toasts } from './components/Overlays';
import { TasksPage } from './views/TasksPage';
import { Dashboard } from './views/Dashboard';
import { Focus } from './views/Focus';
import { SettingsPage } from './views/SettingsPage';

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    const s = useStore.getState();
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>{this.state.error.message}</p>
        <p>Your tasks are still saved on this device. Download a backup, then reload.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => download('taskbook-backup.json', toJSON({ tasks: s.tasks, projects: s.projects, tombstones: s.tombstones, sessions: s.sessions }), 'application/json')}>Download backup</button>
          <button type="button" className="btn primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

function Shell() {
  useTheme(); useHotkeys(); useReminders(); usePomoTicker(); useLifecycle();
  const page = useStore((s) => s.page);
  const modal = useStore((s) => s.modal);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const selectedId = useStore((s) => s.selectedId);
  const hasSelected = useStore((s) => s.tasks.some((t) => t.id === s.selectedId));
  const ui = useStore((s) => s.ui);
  const drawer = page === 'tasks' && !!selectedId && hasSelected;

  return (
    <div className={cx('app', drawer && 'with-drawer')}>
      <div className={cx('sb-wrap', sidebarOpen && 'open')}><Sidebar /></div>
      {sidebarOpen && <div className="sb-scrim" onClick={() => ui({ sidebarOpen: false })} />}
      <div className="main">
        <Topbar />
        <main className="page" id="main">
          {page === 'tasks' && <TasksPage />}
          {page === 'dashboard' && <Dashboard />}
          {page === 'focus' && <Focus />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      {drawer && <TaskDetail id={selectedId!} key={selectedId} />}
      {modal === 'quick' && <QuickAdd />}
      {modal === 'palette' && <CommandPalette />}
      {modal === 'help' && <Help />}
      {modal === 'project' && <ProjectDialog />}
      <Toasts />
    </div>
  );
}

export default function App() {
  return <Boundary><Shell /></Boundary>;
}
