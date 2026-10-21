// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { useStore } from '../src/store';

Object.assign(globalThis, { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

describe('app smoke test', () => {
  it('renders every page and layout without crashing', () => {
    render(<App />);
    expect(screen.getAllByText('Taskbook').length).toBeGreaterThan(0);
    const st = () => useStore.getState();
    for (const layout of ['list', 'board', 'calendar', 'matrix'] as const) {
      for (const kind of ['today', 'all', 'inbox', 'upcoming', 'overdue', 'completed', 'archive', 'trash'] as const) {
        act(() => { st().ui({ layout }); st().navigate('tasks', { kind }); });
      }
    }
    for (const page of ['dashboard', 'focus', 'settings'] as const) act(() => st().navigate(page));
    act(() => st().navigate('tasks', { kind: 'all' }));
    expect(st().tasks.length).toBeGreaterThan(0);
  });

  it('creates, edits and completes a task through the UI', () => {
    render(<App />);
    const st = () => useStore.getState();
    act(() => { st().ui({ layout: 'list' }); st().navigate('tasks', { kind: 'all' }); });
    const input = screen.getByLabelText('Add a task') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Write tests tomorrow !1 @qa' } });
    fireEvent.submit(input.closest('form')!);
    const t = st().tasks.find((x) => x.title === 'Write tests')!;
    expect(t).toBeTruthy();
    expect(t.priority).toBe(1);
    expect(t.tags).toEqual(['qa']);
    act(() => st().ui({ selectedId: t.id }));
    expect(screen.getByLabelText('Task details')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Complete Write tests'));
    expect(st().tasks.find((x) => x.id === t.id)!.status).toBe('done');
    act(() => st().undo());
    expect(st().tasks.find((x) => x.id === t.id)!.status).toBe('todo');
    act(() => { st().openQuick(); });
    expect(screen.getByLabelText('Task')).toBeTruthy();
    act(() => { st().ui({ modal: 'palette' }); });
    expect(screen.getByLabelText('Command')).toBeTruthy();
    act(() => { st().ui({ modal: 'help' }); });
    expect(screen.getByText('Shortcuts and quick add')).toBeTruthy();
  });
});
