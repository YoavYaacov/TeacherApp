import { TABLES, type DB, type TableName } from '../data/types';

export const BACKUP_FORMAT = 'teacher-app-backup';
export interface Envelope {
  format: typeof BACKUP_FORMAT; version: 2; exportedAt: string; source: 'supabase' | 'local';
  counts: Record<string, number>; checksum: string; data: Partial<DB>;
}
export interface ParsedBackup {
  data: Partial<DB>; counts: Record<string, number>; exportedAt: string | null;
  /** true = סכום ביקורת תואם; null = קובץ ישן ללא סכום ביקורת */
  verified: boolean | null;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const countsOf = (data: Partial<DB>): Record<string, number> =>
  Object.fromEntries(TABLES.filter((t) => Array.isArray(data[t])).map((t) => [t, (data[t] as unknown[]).length]));

export async function buildEnvelope(data: Partial<DB>, source: Envelope['source']): Promise<Envelope> {
  const ordered = Object.fromEntries(TABLES.map((t) => [t, data[t] ?? []])) as Partial<DB>;
  return { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), source, counts: countsOf(ordered), checksum: await sha256(JSON.stringify(ordered)), data: ordered };
}

/** פענוח ואימות קובץ גיבוי. זורק שגיאה בעברית אם הקובץ פגום. */
export async function parseBackupFile(text: string): Promise<ParsedBackup> {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('הקובץ אינו JSON תקין (ייתכן שנקטע או נפגם)'); }
  if (!j || typeof j !== 'object' || !j.data || typeof j.data !== 'object' || Array.isArray(j.data)) throw new Error('זה לא קובץ גיבוי של האפליקציה');
  if (j.format !== undefined && j.format !== BACKUP_FORMAT) throw new Error('זה לא קובץ גיבוי של האפליקציה');
  const data = j.data as Record<string, unknown>;
  for (const t of Object.keys(data)) if (!TABLES.includes(t as TableName)) throw new Error(`טבלה לא מוכרת בקובץ: ${t}`);
  for (const t of TABLES) {
    const v = data[t];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error(`הטבלה ${t} בקובץ אינה תקינה`);
  }
  if (!TABLES.some((t) => Array.isArray(data[t]))) throw new Error('הקובץ ריק מנתונים');
  const counts = countsOf(data as Partial<DB>);
  let verified: boolean | null = null;
  if (typeof j.checksum === 'string') {
    if ((await sha256(JSON.stringify(data))) !== j.checksum) throw new Error('סכום הביקורת לא תואם: הקובץ שונה או נפגם. לא ניתן לשחזר ממנו');
    verified = true;
  }
  if (j.counts && typeof j.counts === 'object') {
    for (const t of TABLES) if (j.counts[t] !== undefined && j.counts[t] !== (counts[t] ?? 0)) throw new Error(`מספר הרשומות בטבלה ${t} אינו תואם למה שנרשם בקובץ`);
  }
  return { data: data as Partial<DB>, counts, exportedAt: typeof j.exportedAt === 'string' ? j.exportedAt : null, verified };
}

export const TABLE_LABEL: Record<string, string> = {
  academic_years: 'שנות לימוד', study_groups: 'קבוצות לימוד', students: 'תלמידים', enrollments: 'שיוכי תלמידים',
  grade_categories: 'קטגוריות ציון', assessment_events: 'אירועי הערכה', grades: 'ציונים', grade_policy_overrides: 'חריגי מועד ב׳',
  final_grades: 'ציונים סופיים', calendar_events: 'שיעורים ואירועי יומן', lesson_logs: 'תיעוד שיעורים', user_settings: 'הגדרות',
  ai_conversations: 'שיחות עוזר', ai_messages: 'הודעות עוזר', ai_drafts: 'טיוטות עוזר', ai_evaluations: 'הערכות תעודה',
};
