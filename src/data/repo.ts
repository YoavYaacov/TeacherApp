import type { DB, TableName } from './types';
export interface Repo {
  readonly kind: 'local' | 'supabase';
  load(): Promise<DB>;
  /** upsert לפי CONFLICT; מחזיר את השורות כפי שנשמרו (כולל id שנוצר) */
  upsert<T extends TableName>(table: T, rows: Partial<DB[T][number]>[]): Promise<DB[T]>;
  /** עדכון חלקי לפי id (שונה מ-upsert: לא דורש את כל העמודות החובה) */
  update<T extends TableName>(table: T, id: string, patch: Partial<DB[T][number]>): Promise<void>;
  remove(table: TableName, match: Record<string, unknown>): Promise<void>;
  /** פעולות קבוצה בארכיון (0004). מחזירות סיכום; הלקוח טוען מחדש אחריהן. */
  deleteGroup(groupId: string): Promise<{ events: { deleted: number; hidden: number }; students_deleted: number }>;
  deleteGroupLessons(groupId: string): Promise<{ deleted: number; hidden: number }>;
  restoreHiddenEvents(): Promise<number>;
  /** ביצוע טיוטת AI שאושרה (הנתיב היחיד שבו ה-AI משנה נתוני מערכת). */
  applyDraft(draftId: string, payload: Record<string, unknown> | null, mode: 'fill' | 'append' | 'replace'): Promise<void>;
  /** החלפת כל הנתונים (שחזור מגיבוי) — מקומי בלבד */
  replaceAll?(db: DB): Promise<void>;
}
