# Taskbook 2

A full-featured task manager built with React, TypeScript and Vite. It works offline, stores everything in your browser, and can optionally sync across devices through a Vercel function and MongoDB.

## Features

**Capture**
- Natural-language quick add (`N`): `Call dentist tomorrow 5pm !1 #home @health ~30m`, repeats like `every 2 weeks` or `every mon`
- Inline add box on every list, with a live preview of what was understood

**Organise**
- Projects with colours, tags, four priority levels, five statuses of work (to do, in progress, in review, done) plus archive and trash (auto-purged after 30 days)
- Subtasks with progress, notes, estimates, dependencies ("blocked by", with cycle protection)
- Recurring tasks: completing one keeps a history copy and rolls the task to its next date
- Reminders through browser notifications

**Views**
- List with sorting, grouping (status, priority, project, due date), drag to reorder
- Kanban board with drag between columns
- Month calendar with drag-to-reschedule and an unscheduled tray
- Priority matrix (important vs. due soon); dragging a task between boxes adjusts it
- Smart lists: Inbox, Today, Upcoming, All, Overdue, Completed
- Search operators: `#project @tag p1 is:overdue is:blocked due:week has:subtasks status:doing -word`

**Work**
- Per-task time tracker and a Pomodoro focus timer that logs sessions to tasks
- Dashboard: completions, streak, workload forecast, focus time, estimate accuracy, project and priority breakdowns, 16-week heatmap

**Power-user**
- Command palette (`Ctrl/Cmd+K`), full keyboard navigation (`?` shows every shortcut), multi-select with bulk actions
- Unlimited undo and redo
- Import/export: JSON backup, CSV, and ICS calendar file; imports the original Taskbook format too
- Installable PWA with offline support; light, dark and system themes with six accent colours
- Optional cross-device sync with conflict-safe merging

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + UI smoke tests
npm run build      # type-check + production build into dist/
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel choose **Add New → Project** and import it. The framework is detected as Vite (settings are already in `vercel.json`).
3. Click **Deploy**. The app works immediately with data stored in each browser.

Or from the terminal: `npm i -g vercel && vercel --prod`.

### Optional: cross-device sync

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. In Vercel open **Settings → Environment Variables** and add `MONGODB_URI` (and optionally `MONGODB_DB`, `SYNC_SALT`; see `.env.example`). Redeploy.
3. In the app open **Settings → Sync between devices**, press **Generate**, and enter the same key on your other devices.

How it works: each device merges the cloud copy with its own data (newest edit per task wins, deletions are tracked) and pushes the result. The key is hashed before it reaches the database and acts as a password, so keep it private. Without `MONGODB_URI` the sync endpoint answers 501 and the app stays local.

## Moving from the first Taskbook

Open the new app on the same domain and your old tasks and categories are converted automatically. On a new domain, use **Export** in the old app and **Settings → Import** here.

## Structure

```
api/sync.ts           Vercel serverless function for optional sync
public/               PWA manifest, service worker, icons
src/store.ts          State, actions, undo history, persistence
src/lib/              Parsing, recurrence, filtering, merging, export, sync
src/components/       Sidebar, task row, task drawer, quick add, palette
src/views/            List, board, calendar, matrix, dashboard, focus, settings
tests/                Vitest unit and smoke tests
```
