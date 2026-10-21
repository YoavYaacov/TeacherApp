import type { OvertimeHours } from '../data/types';
export type OtKind = 'frontal_hours' | 'pedagogical_hours';
export const monthOf = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth() + 1 });
/** חודש קודם/הבא, כולל מעבר בין דצמבר לינואר */
export const shiftMonth = (ym: { year: number; month: number }, delta: number) => {
  const t = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(t / 12), month: (t % 12) + 1 };
};
export const monthLabel = (ym: { year: number; month: number }) => new Date(ym.year, ym.month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
export const otOf = (rows: OvertimeHours[], ym: { year: number; month: number }) => {
  const r = rows.find((x) => x.year === ym.year && x.month === ym.month);
  return { frontal_hours: r?.frontal_hours ?? 0, pedagogical_hours: r?.pedagogical_hours ?? 0 };
};
/** שינוי בשעה אחת, בלי ערך שלילי */
export const bump = (v: number, delta: 1 | -1) => Math.max(0, v + delta);
