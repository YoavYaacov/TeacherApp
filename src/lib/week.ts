// "שבוע" בישראל: ראשון עד שבת, לפי שעון ישראל (Asia/Jerusalem) ללא תלות באזור הזמן של המכשיר.
const TZ = 'Asia/Jerusalem';
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export interface IlParts { y: number; m: number; d: number; wd: number }
export function israelParts(t: Date): IlParts {
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(t)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, wd: WD[o.weekday] };
}
/** הרגע המדויק של 00:00 בשעון ישראל בתאריך נתון */
function israelMidnight(y: number, m: number, d: number): Date {
  let guess = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 3; i++) {
    const o: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(guess))) o[p.type] = p.value;
    const shown = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
    const diff = shown - guess; // היסט האזור באותו רגע
    guess = Date.UTC(y, m - 1, d) - diff;
  }
  return new Date(guess);
}
/** תחילת השבוע הבא = חצות שבין שבת לראשון (שעון ישראל). שיעור שמתחיל לפני הרגע הזה שייך לשבוע הנוכחי. */
export function endOfWeek(now: Date): Date {
  const p = israelParts(now);
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + (7 - p.wd)));
  return israelMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}
export interface TimedEvent { start_at: string; end_at: string }
/** שיעורים שנותרו: עוד לא הסתיימו, ומתחילים לפני סוף השבוע (שבת בחצות) */
export const remainingThisWeek = <T extends TimedEvent>(evs: T[], now: Date): T[] => {
  const end = endOfWeek(now).getTime();
  return evs.filter((e) => new Date(e.end_at) >= now && new Date(e.start_at).getTime() < end);
};
