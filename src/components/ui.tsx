import type { ReactNode } from 'react';
import { Flag } from 'lucide-react';
import type { Priority } from '../types';
import { cx } from '../lib/utils';

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

export function Modal({ label, onClose, wide, children }: { label: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={cx(value === o.id && 'on')} aria-pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export const PriorityFlag = ({ p, size = 14 }: { p: Priority; size?: number }) => (
  <Flag size={size} aria-hidden style={{ color: `var(--p${p})` }} fill={p < 4 ? `var(--p${p})` : 'none'} />
);

export const Dot = ({ color }: { color: string }) => <span className="dot" style={{ background: color }} aria-hidden />;

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}

export const Field = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <label className={cx('field', wide && 'wide')}><span>{label}</span>{children}</label>
);
