// נוסח הדיווח החודשי במייל. הנוסח, הנמען והחתימה קבועים; בכל חודש מתמלאים רק החודש והשעות מהמונה.
// אותם ערכים מוגדרים גם בשרת (supabase/functions/google-calendar/index.ts): השרת הוא שקובע בפועל את הנמען והתוכן.
import { monthLabel } from './overtime';
export const REPORT_TO = 'israelp@amit.org.il';
export const REPORT_NAME = 'יואב יעקב';
export interface ReportSent { at: string; to: string }
export function buildReport(ym: { year: number; month: number }, hours: number): { subject: string; body: string } {
  const m = monthLabel(ym);
  return {
    subject: `דיווח שעות נוספות – ${m}`,
    body: `שלום,\n\nלהלן דיווח השעות הנוספות שלי לחודש ${m}:\n\nסה״כ שעות נוספות: ${hours}\n\nבברכה,\n${REPORT_NAME}`,
  };
}
