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
/** מונה יחיד. שורה ישנה (לפני המונה היחיד, למשל משחזור מגיבוי ישן) ללא hours: סכום שתי הכמויות הישנות. */
export const hoursOf = (rows: OvertimeHours[], ym: { year: number; month: number }): number => {
  const r = rows.find((x) => x.year === ym.year && x.month === ym.month);
  if (!r) return 0;
  return typeof r.hours === 'number' ? r.hours : (r.frontal_hours ?? 0) + (r.pedagogical_hours ?? 0);
};
/** שינוי בשעה אחת, בלי ערך שלילי */
export const bump = (v: number, delta: 1 | -1) => Math.max(0, v + delta);
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
