import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFLICT, emptyDB, TABLES, type DB, type TableName } from './types';
import type { Repo } from './repo';

const PAGE = 1000;
export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;
  constructor(private sb: SupabaseClient) {}
  async load(): Promise<DB> {
    const db = emptyDB() as unknown as Record<string, unknown[]>;
    await Promise.all(TABLES.map(async (t) => {
      const all: unknown[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.sb.from(t).select('*').range(from, from + PAGE - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        all.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      db[t] = all;
    }));
    return db as unknown as DB;
  }
  async upsert<T extends TableName>(table: T, rows: Partial<DB[T][number]>[]): Promise<DB[T]> {
    if (rows.length === 0) return [] as unknown as DB[T];
    const { data, error } = await this.sb.from(table).upsert(rows as never, { onConflict: CONFLICT[table] ?? 'id' }).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as unknown as DB[T];
  }
  async update<T extends TableName>(table: T, id: string, patch: Partial<DB[T][number]>) {
    const { error } = await this.sb.from(table).update(patch as never).eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  async remove(table: TableName, match: Record<string, unknown>) {
    let q = this.sb.from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
    const { error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
