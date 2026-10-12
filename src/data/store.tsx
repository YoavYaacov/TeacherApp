import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONFLICT, emptyDB, type DB, type TableName } from './types';
import type { Repo } from './repo';
import { uid } from './localRepo';

type Row = Record<string, unknown>;
function mergeRows(arr: Row[], rows: Row[], table: TableName): Row[] {
  const keys = (CONFLICT[table] ?? 'id').split(',');
  const next = [...arr];
  for (const r of rows) {
    const i = next.findIndex((x) => keys.every((k) => x[k] === r[k]));
    if (i >= 0) next[i] = { ...next[i], ...r }; else next.push(r);
  }
  return next;
}

export interface Store {
  db: DB; ready: boolean; error: string | null; saving: number; kind: Repo['kind'];
  save<T extends TableName>(table: T, rows: Partial<DB[T][number]>[]): Promise<DB[T]>;
  /** שמירה אופטימית (לתאי ציון): מעדכן מיידית ושומר ברקע */
  saveFast<T extends TableName>(table: T, rows: Partial<DB[T][number]>[]): void;
  patch<T extends TableName>(table: T, id: string, patch: Partial<DB[T][number]>): Promise<void>;
  patchFast<T extends TableName>(table: T, id: string, patch: Partial<DB[T][number]>): void;
  del(table: TableName, match: Record<string, unknown>): Promise<void>;
  delFast(table: TableName, match: Record<string, unknown>): void;
  reload(): Promise<void>;
  repo: Repo;
  clearError(): void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error('no store'); return s; };

export function StoreProvider({ repo, children }: { repo: Repo; children: ReactNode }) {
  const [db, setDb] = useState<DB>(emptyDB());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const reload = useCallback(async () => {
    try { setDb(await repo.load()); setError(null); } catch (e) { setError(`טעינת הנתונים נכשלה: ${(e as Error).message}`); }
    setReady(true);
  }, [repo]);
  useEffect(() => { void reload(); }, [reload]);

  const store = useMemo<Store>(() => {
    const enqueue = <T,>(fn: () => Promise<T>) => {
      setSaving((n) => n + 1);
      const p = queue.current.then(fn);
      queue.current = p.catch(() => undefined).finally(() => setSaving((n) => n - 1));
      return p;
    };
    return {
      db, ready, error, saving, kind: repo.kind, repo,
      async save(table, rows) {
        try {
          const saved = await enqueue(() => repo.upsert(table, rows));
          setDb((d) => ({ ...d, [table]: mergeRows(d[table] as unknown as Row[], saved as unknown as Row[], table) }) as DB);
          return saved;
        } catch (e) { setError(`השמירה נכשלה: ${(e as Error).message}`); throw e; }
      },
      saveFast(table, rows) {
        const withIds = (rows as Row[]).map((r) => ((CONFLICT[table] ?? 'id') === 'id' && !r.id ? { ...r, id: uid() } : r));
        setDb((d) => ({ ...d, [table]: mergeRows(d[table] as unknown as Row[], withIds, table) }) as DB);
        enqueue(() => repo.upsert(table, withIds as never)).catch((e) => { setError(`השמירה נכשלה: ${(e as Error).message}`); void reload(); });
      },
      async patch(table, id, patch) {
        try {
          await enqueue(() => repo.update(table, id, patch));
          setDb((d) => ({ ...d, [table]: (d[table] as unknown as Row[]).map((x) => (x.id === id ? { ...x, ...(patch as Row) } : x)) }) as DB);
        } catch (e) { setError(`השמירה נכשלה: ${(e as Error).message}`); throw e; }
      },
      patchFast(table, id, patch) {
        setDb((d) => ({ ...d, [table]: (d[table] as unknown as Row[]).map((x) => (x.id === id ? { ...x, ...(patch as Row) } : x)) }) as DB);
        enqueue(() => repo.update(table, id, patch)).catch((e) => { setError(`השמירה נכשלה: ${(e as Error).message}`); void reload(); });
      },
      async del(table, match) {
        try {
          await enqueue(() => repo.remove(table, match));
          setDb((d) => ({ ...d, [table]: (d[table] as unknown as Row[]).filter((x) => !Object.entries(match).every(([k, v]) => x[k] === v)) }) as DB);
        } catch (e) { setError(`המחיקה נכשלה: ${(e as Error).message}`); throw e; }
      },
      delFast(table, match) {
        setDb((d) => ({ ...d, [table]: (d[table] as unknown as Row[]).filter((x) => !Object.entries(match).every(([k, v]) => x[k] === v)) }) as DB);
        enqueue(() => repo.remove(table, match)).catch((e) => { setError(`המחיקה נכשלה: ${(e as Error).message}`); void reload(); });
      },
      reload, clearError: () => setError(null),
    };
  }, [db, ready, error, saving, repo, reload]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
