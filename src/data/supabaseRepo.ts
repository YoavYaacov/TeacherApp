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
        if (error) {
          // טבלאות העוזר (0005) ושעות נוספות (0006) אופציונליות עד שהמיגרציה הורצה: האפליקציה ממשיכה לעבוד בלעדיהן
          if ((t.startsWith('ai_') || t === 'overtime_hours') && /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message}`)) break;
          throw new Error(`${t}: ${error.message}`);
        }
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
  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  deleteGroup(id: string) { return this.rpc<{ events: { deleted: number; hidden: number }; students_deleted: number }>('delete_study_group', { p_group: id }); }
  deleteGroupLessons(id: string) { return this.rpc<{ deleted: number; hidden: number }>('delete_group_lessons', { p_group: id }); }
  async applyDraft(id: string, payload: Record<string, unknown> | null, mode: 'fill' | 'append' | 'replace') { await this.rpc('ai_apply_draft', { p_draft: id, p_payload: payload, p_mode: mode }); }
  restoreHiddenEvents() { return this.rpc<number>('restore_hidden_events'); }
}
