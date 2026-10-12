import { CONFLICT, emptyDB, TABLES, type DB, type TableName } from './types';
import type { Repo } from './repo';

const KEY = 'teacher-app:v1';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** מצב מקומי: הנתונים נשמרים ב-localStorage של הדפדפן/מכשיר הזה בלבד. */
export class LocalRepo implements Repo {
  readonly kind = 'local' as const;
  private db: DB = emptyDB();
  private persist() { localStorage.setItem(KEY, JSON.stringify(this.db)); }
  async load(): Promise<DB> {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); this.db = { ...emptyDB(), ...p }; }
    } catch { this.db = emptyDB(); }
    return structuredClone(this.db);
  }
  async upsert<T extends TableName>(table: T, rows: Partial<DB[T][number]>[]): Promise<DB[T]> {
    const keyCols = (CONFLICT[table] ?? 'id').split(',');
    const arr = this.db[table] as unknown as Record<string, unknown>[];
    const out: Record<string, unknown>[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const row = { ...r };
      if (keyCols[0] === 'id' && !row.id) row.id = uid();
      const i = arr.findIndex((x) => keyCols.every((k) => x[k] === row[k]));
      if (i >= 0) { arr[i] = { ...arr[i], ...row }; out.push(arr[i]); } else { arr.push(row); out.push(row); }
    }
    this.persist();
    return structuredClone(out) as unknown as DB[T];
  }
  async update<T extends TableName>(table: T, id: string, patch: Partial<DB[T][number]>) {
    const arr = this.db[table] as unknown as Record<string, unknown>[];
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr[i] = { ...arr[i], ...(patch as Record<string, unknown>) };
    this.persist();
  }
  async remove(table: TableName, match: Record<string, unknown>) {
    const arr = this.db[table] as unknown as Record<string, unknown>[];
    (this.db as unknown as Record<string, unknown[]>)[table] = arr.filter((x) => !Object.entries(match).every(([k, v]) => x[k] === v));
    this.persist();
  }
  async replaceAll(db: DB) {
    this.db = { ...emptyDB(), ...Object.fromEntries(TABLES.map((t) => [t, db[t] ?? []])) } as DB;
    this.persist();
  }
}
