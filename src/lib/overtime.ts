import type { OvertimeHours } from '../data/types';
import { israelParts } from './week';
/** החודש הראשון ברשימה: אי אפשר לגלול אחורה לפניו */
export const OT_FIRST = { year: 2026, month: 10 };
export const monthOf = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth() + 1 });
/** חודש קודם/הבא, כולל מעבר בין דצמבר לינואר */
export const shiftMonth = (ym: { year: number; month: number }, delta: number) => {
  const t = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
};
export const monthLabel = (ym: { year: number; month: number }) => new Date(ym.year, ym.month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
export const monthKey = (ym: { year: number; month: number }) => `${ym.year}-${String(ym.month).padStart(2, '0')}`;
/** שלושה מונים נפרדים (בלי סכום): פרונטליות, פרטני ושהייה. שהייה מתחילה מ-6 (המינימום הקבוע) ואפשר רק להוסיף עליו. */
export interface OtCounters { frontal: number; individual: number; stay: number }
export const STAY_BASE = 6;
export const OT_DEFAULT: OtCounters = { frontal: 0, individual: 0, stay: STAY_BASE };
export const OT_LABELS: Record<keyof OtCounters, string> = { frontal: 'פרונטליות', individual: 'פרטני', stay: 'שהייה' };
/** מונים של חודש. שורה בלי individual_hours (מודל קודם) או חודש בלי שורה: ברירת המחדל; legacy = סך השעות שנרשמו בעבר בלי פירוט (לתצוגת הערה בלבד). */
export const countersOf = (rows: OvertimeHours[], ym: { year: number; month: number }): { c: OtCounters; legacy: number } => {
  const r = rows.find((x) => x.year === ym.year && x.month === ym.month);
  if (!r) return { c: { ...OT_DEFAULT }, legacy: 0 };
  if (typeof r.individual_hours === 'number') return { c: { frontal: r.frontal_hours ?? 0, individual: r.individual_hours, stay: Math.max(STAY_BASE, r.pedagogical_hours ?? 0) }, legacy: 0 };
  return { c: { ...OT_DEFAULT }, legacy: typeof r.hours === 'number' && r.hours > 0 ? r.hours : (r.frontal_hours ?? 0) + (r.pedagogical_hours ?? 0) };
};
export const toRow = (ym: { year: number; month: number }, c: OtCounters) => ({ year: ym.year, month: ym.month, frontal_hours: c.frontal, individual_hours: c.individual, pedagogical_hours: c.stay });
/** אין מה לדווח: שום חריגה מברירת המחדל (פרונטליות 0, פרטני 0, שהייה 6) */
export const nothingToReport = (c: OtCounters) => c.frontal === 0 && c.individual === 0 && c.stay === STAY_BASE;
/** שינוי בשעה אחת. שהייה לא יורדת מתחת ל-6, האחרים לא מתחת ל-0 */
export const bump = (v: number, delta: 1 | -1, min = 0) => Math.max(min, v + delta);
export const beforeFirst = (ym: { year: number; month: number }) => ym.year * 12 + ym.month <= OT_FIRST.year * 12 + OT_FIRST.month;
/** דיווח חודשי נשלח רק מה-1 לחודש שאחריו (לפי תאריך בישראל) */
export const canSendReport = (ym: { year: number; month: number }, now = new Date()) => {
  const p = israelParts(now);
  return p.y * 12 + p.m >= ym.year * 12 + ym.month + 1;
};
export const sendableFrom = (ym: { year: number; month: number }) => {
  const n = shiftMonth(ym, 1);
  return `1 ב${new Date(n.year, n.month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}`;
};
