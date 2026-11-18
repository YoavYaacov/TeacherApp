// ת"ז תלמידים: עיבוד בזיכרון הטופס בלבד.
// כללים: אין שמירה ב-localStorage, אין console.log, אין החזקה ב-store או בסטייט גלובלי.
// הערכים נשלחים לשרת דרך RPC (תוצאה: ספירות בלבד) ומוצפנים שם. אין פונקציה שמחזירה ת"ז.
import { unzipSync, strFromU8 } from 'fflate';
import { supabase } from './supabase';

/** ת"ז ישראלית: 5–9 ספרות, ריפוד באפסים, ספרת ביקורת. */
export function isValidIlId(raw: string): boolean {
  const p = raw.replace(/\s/g, '');
  if (!/^\d{5,9}$/.test(p)) return false;
  const s = p.padStart(9, '0');
  if (s === '000000000') return false;
  let t = 0;
  for (let i = 0; i < 9; i++) { let d = Number(s[i]) * (i % 2 === 0 ? 1 : 2); if (d > 9) d -= 9; t += d; }
  return t % 10 === 0;
}

/** מסווה ספרות ארוכות לתצוגה (למשל שורה לא תקינה בתצוגה מקדימה). */
export const maskDigits = (s: string) => s.replace(/\d{5,}/g, '•••');

const cells = (line: string) => (line.includes('\t') ? line.split('\t') : line.includes(',') || line.includes(';') ? line.split(/[,;]/) : line.split(/\s+/)).map((x) => x.trim().replace(/^"|"$/g, ''));

/** מפריד ת"ז משורה. שורת משו"ב נשארת כמות שהיא (המפענח שלה מתעלם מהת"ז) והת"ז נלקחת מהעמודה השנייה.
 *  בשורה רגילה: התא הראשון שכולו 5–9 ספרות מוצא החוצה. */
export function splitIdFromLine(line: string): { line: string; id: string | null } {
  const parts = cells(line);
  if (parts.length >= 6 && /^\d{1,3}$/.test(parts[0]) && /^\d{5,9}$/.test(parts[1])) return { line, id: parts[1] };
  const k = parts.findIndex((c) => /^\d{5,9}$/.test(c));
  if (k < 0) return { line, id: null };
  const rest = parts.filter((_, i) => i !== k);
  return { line: rest.join('\t'), id: parts[k] };
}

/** קריאת גיליון ראשון מקובץ xlsx לטקסט מופרד בטאבים (ערכים שמורים; ללא חישוב נוסחאות). */
export function xlsxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const get = (n: string) => (files[n] ? strFromU8(files[n]) : '');
  const dec = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e === 'amp' ? '&' : e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
  const textOf = (xml: string) => dec([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
  const col = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const xml = get('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error('xlsx');
  const lines: string[] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm[1]);
      if (!ref || !cm[2]) continue;
      const type = /\bt="([^"]+)"/.exec(cm[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
      row[col(ref[1])] = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(cm[2]) : v != null ? dec(v) : '';
    }
    const line = Array.from(row, (x) => x ?? '').join('\t');
    if (line.trim()) lines.push(line);
  }
  return lines.join('\n');
}

export type IdError = { row: number; reason: 'student' | 'id_invalid' | 'id_differs' | 'id_duplicate' };
export interface IdResult { saved: number; errors: IdError[] }

/** שולח זוגות (student_id, ת"ז) לשרת. מחזיר ספירות וקודי שגיאה בלבד. */
export async function saveIdentities(rows: { student_id: string; id: string }[]): Promise<IdResult> {
  if (!supabase) throw new Error('cloud only');
  const { data, error } = await supabase.rpc('set_student_identities', { p_rows: rows });
  if (error) throw new Error('שמירת הת״ז נכשלה');   // הודעה קבועה: לא מעבירים טקסט שגיאה שעלול לכלול נתונים
  return data as IdResult;
}

/** מזהי תלמידים שיש להם ת"ז שמורה (ללא הערכים). */
export async function fetchStudentsWithId(): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase.rpc('students_with_id');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data as string[]);
}

export const reasonText: Record<IdError['reason'], string> = {
  student: 'התלמיד לא נמצא', id_invalid: 'ת״ז לא תקינה', id_differs: 'כבר שמורה ת״ז אחרת', id_duplicate: 'הת״ז כבר שייכת לתלמיד אחר',
};

// ───────── חבילת גיבוי זהויות חיצונית (טקסט מוצפן בלבד + חתימה) ─────────
export interface IdentityStatus { total: number; readable: number; orphans: number; backups: number; last_export_at: string | null }
export interface PackageCheck { ok: boolean; reason?: 'format' | 'count' | 'mac' | 'too_big'; applied?: boolean; created_at?: string; n?: number;
  restored?: number; same?: number; conflict?: number; duplicate?: number; no_student?: number; erased?: number; bad_row?: number }

export async function identityStatus(): Promise<IdentityStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('identity_status');
  return error ? null : (data as IdentityStatus);
}
export async function identityExport(): Promise<unknown> {
  if (!supabase) throw new Error('cloud only');
  const { data, error } = await supabase.rpc('identity_export');
  if (error) throw new Error('הייצוא נכשל');
  return data;
}
/** apply=false: בדיקה בלבד (ללא כתיבה). */
export async function identityImport(pkg: unknown, apply: boolean): Promise<PackageCheck> {
  if (!supabase) throw new Error('cloud only');
  const { data, error } = await supabase.rpc('identity_import', { p_package: pkg, p_apply: apply });
  if (error) throw new Error('הפעולה נכשלה');
  return data as PackageCheck;
}
export const packageReason: Record<string, string> = {
  format: 'הקובץ אינו חבילת זהויות תקינה.', count: 'הקובץ פגום (מספר השורות אינו תואם).',
  mac: 'החתימה אינה תקפה: הקובץ שונה, או שהמפתח במסד אינו המפתח שיצר אותו.', too_big: 'הקובץ גדול מדי.',
};
export const daysSince = (iso: string | null): number | null => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

/** מחיקת הת"ז של תלמיד בלבד (התלמיד נשאר). מיידי, כולל הגיבויים הפנימיים. */
export async function eraseIdentity(studentId: string): Promise<void> {
  if (!supabase) throw new Error('cloud only');
  const { error } = await supabase.rpc('erase_student_identity', { p_student: studentId });
  if (error) throw new Error('המחיקה נכשלה');
}
