import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Project, Task } from '../types';
import { useStore } from '../store';
import { TaskRow } from '../components/TaskRow';
import { groupTasks, sortTasks, useVisibleIds } from './listing';
import { Dot } from '../components/ui';

export interface ViewCtx { projectsById: Map<string, Project>; blocked: Set<string>; today: string }

export function ListView({ tasks, ctx, mode }: { tasks: Task[]; ctx: ViewCtx; mode: 'normal' | 'trash' | 'archive' }) {
  const sort = useStore((s) => s.listSort);
  const groupKey = useStore((s) => s.listGroup);
  const projects = useStore((s) => s.projects);
  const cursorId = useStore((s) => s.cursorId);
  const selection = useStore((s) => s.selection);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const dragId = useRef<string | null>(null);

  const groups = useMemo(() => groupTasks(sortTasks(tasks, sort), groupKey, projects, ctx.today), [tasks, sort, groupKey, projects, ctx.today]);
  useVisibleIds(groups.filter((g) => !collapsed.has(g.id)).flatMap((g) => g.tasks.map((t) => t.id)));

  const drag = mode === 'normal' && sort === 'manual'
    ? { start: (id: string) => { dragId.current = id; }, drop: (target: string) => { if (dragId.current && dragId.current !== target) useStore.getState().moveTo(dragId.current, target); dragId.current = null; } }
    : undefined;

  const toggle = (id: string) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="list-wrap">
      {groups.map((g) => (
        <section key={g.id} className="group">
          {groupKey !== 'none' && (
            <button type="button" className="group-head" onClick={() => toggle(g.id)} aria-expanded={!collapsed.has(g.id)}>
              {collapsed.has(g.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              {g.color && <Dot color={g.color} />}
              <span>{g.title}</span><em>{g.tasks.length}</em>
            </button>
          )}
          {!collapsed.has(g.id) && (
            <ul className="rows">
              {g.tasks.map((t) => (
                <TaskRow key={t.id} t={t} project={t.projectId ? ctx.projectsById.get(t.projectId) : undefined} blocked={ctx.blocked.has(t.id)}
                  cursor={cursorId === t.id} selected={selection.includes(t.id)} today={ctx.today} mode={mode} drag={drag} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
