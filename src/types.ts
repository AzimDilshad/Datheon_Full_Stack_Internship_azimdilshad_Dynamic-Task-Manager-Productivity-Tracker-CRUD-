export type Status = 'todo' | 'doing' | 'review' | 'done';
export type Priority = 1 | 2 | 3 | 4;
export type Freq = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence { freq: Freq; interval: number }
export interface Subtask { id: string; title: string; done: boolean }
export interface Activity { at: number; text: string }

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: Status;
  priority: Priority;
  projectId: string | null;
  tags: string[];
  due: string | null;          // YYYY-MM-DD, local
  dueTime: string | null;      // HH:mm
  estimate: number | null;     // minutes
  subtasks: Subtask[];
  recurrence: Recurrence | null;
  blockedBy: string[];
  reminder: number | null;     // minutes before due
  remindedFor: string | null;  // due stamp already notified
  timeSpent: number;           // seconds
  timerStartedAt: number | null;
  order: number;
  created: number;
  updated: number;
  completedAt: number | null;
  archived: boolean;
  deleted: number | null;
  activity: Activity[];
}

export interface Project { id: string; name: string; color: string; updated: number }
export interface Session { id: string; at: number; seconds: number; taskId: string | null }
export interface Data { tasks: Task[]; projects: Project[]; tombstones: string[]; sessions: Session[] }

export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  theme: Theme;
  accent: string;
  weekStart: 0 | 1;
  pomodoro: { work: number; short: number; long: number; every: number };
  notifications: boolean;
  sound: boolean;
  syncKey: string;
  autoSync: boolean;
  syncedAt: number | null;
}

export type Scope =
  | { kind: 'all' | 'inbox' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'archive' | 'trash' }
  | { kind: 'project'; id: string }
  | { kind: 'tag'; tag: string };
export type Layout = 'list' | 'board' | 'calendar' | 'matrix';
export type Page = 'tasks' | 'dashboard' | 'focus' | 'settings';
export type SortKey = 'manual' | 'due' | 'priority' | 'created' | 'updated' | 'title';
export type GroupKey = 'none' | 'status' | 'priority' | 'project' | 'due';
export type PomoPhase = 'work' | 'short' | 'long';
export interface Pomo { phase: PomoPhase; endsAt: number | null; remaining: number; taskId: string | null; cycle: number }
export interface QuickDefaults { projectId: string | null; tags: string[]; due: string | null; priority: Priority | null }
