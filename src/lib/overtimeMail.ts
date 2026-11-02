// נוסח הדיווח החודשי במייל. הנוסח קבוע (אושר פעם אחת); בכל חודש מתמלאים רק החודש, מספר השעות והחתימה.
import { monthLabel } from './overtime';
export const isEmail = (s: string) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s.trim()) && s.trim().length <= 254;
export interface OtMailPrefs { to?: string; name?: string }
export interface ReportSent { at: string; to: string }
export function buildReport(ym: { year: number; month: number }, hours: number, name: string): { subject: string; body: string } {
  const m = monthLabel(ym);
  return {
    subject: `דיווח שעות נוספות – ${m}`,
    body: `שלום,\n\nלהלן דיווח השעות הנוספות שלי לחודש ${m}:\n\nסה״כ שעות נוספות: ${hours}\n\nבברכה,\n${name.trim()}`,
  };
}
