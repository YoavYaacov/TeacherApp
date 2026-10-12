import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { hebSort } from '../lib/util';

export type Dir = 'asc' | 'desc';
/** כיוון ברירת מחדל לעמודה: טקסט עולה (א״ב); תאריכים וציונים: החדש/הגבוה ראשון. */
export function useSort<K extends string>(initial: K, defaults: Partial<Record<K, Dir>> = {}) {
  const [s, setS] = useState<{ key: K; dir: Dir }>({ key: initial, dir: defaults[initial] ?? 'asc' });
  const toggle = (k: K) => setS((p) => (p.key === k ? { key: k, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: defaults[k] ?? 'asc' }));
  return { ...s, toggle };
}

/** מיון יציב; ערכים ריקים תמיד בסוף; תיקו => tie. */
export function sortRows<T, K extends string>(rows: T[], get: (r: T, k: K) => string | number | null | undefined, key: K, dir: Dir, tie?: (a: T, b: T) => number): T[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a, key), y = get(b, key);
    const xe = x === null || x === undefined || x === '', ye = y === null || y === undefined || y === '';
    if (xe !== ye) return xe ? 1 : -1;
    if (!xe && !ye) {
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : hebSort(String(x), String(y));
      if (c !== 0) return c * m;
    }
    return tie ? tie(a, b) : 0;
  });
}

export function SortTh<K extends string>({ k, sort, children, className }: { k: K; sort: { key: K; dir: Dir; toggle: (k: K) => void }; children: ReactNode; className?: string }) {
  const on = sort.key === k;
  return (
    <th className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={`sortbtn${on ? ' on' : ''}`} onClick={() => sort.toggle(k)}>
        {children}
        <span className="sortarrow" aria-hidden>{on && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
      </button>
    </th>
  );
}
