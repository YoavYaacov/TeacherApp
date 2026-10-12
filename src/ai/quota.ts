// מועד איפוס המכסה היומית: יום המכסה של Gemini מסתיים בחצות שעון האוקיינוס השקט (America/Los_Angeles).
// העוזר סופר את הבקשות לפי אותו יום, ולכן המונה של TeacherApp מתאפס באותו רגע. כאן מחשבים אותו ומציגים בשעון ישראל.
const pt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ptMinuteOfDay = (d: Date) => { const p = Object.fromEntries(pt.formatToParts(d).map((x) => [x.type, x.value])); return Number(p.hour) * 60 + Number(p.minute); };

/** הרגע הקרוב שבו שעון הפסיפי עובר חצות (מדויק גם סביב מעבר שעון קיץ) */
export function nextPacificMidnight(now = new Date()): Date {
  let t = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60000);
  // קפיצה גסה עד סביבת החצות, ואז צעדי דקה (לכל היותר שעה) עד ששעון הפסיפי מראה 00:00
  const left = 24 * 60 - ptMinuteOfDay(t);
  if (left > 90) t = new Date(t.getTime() + (left - 90) * 60000);
  for (let i = 0; i < 400 && ptMinuteOfDay(t) !== 0; i++) t = new Date(t.getTime() + 60000);
  return t;
}
const il = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', ...o }).format(d);
const ilDay = (d: Date) => il(d, { year: 'numeric', month: '2-digit', day: '2-digit' });

/** "היום ב-10:00" / "מחר ב-09:00" לפי שעון ישראל */
export function resetLabel(now = new Date()): string {
  const r = nextPacificMidnight(now);
  const when = ilDay(r) === ilDay(now) ? 'היום' : 'מחר';
  return `${when} ב-${il(r, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}
export const LIMIT_NOTE = (limit: number) => `${limit} היא מגבלה פנימית של TeacherApp (אפשר לשנות בסוד AI_DAILY_LIMIT), לא המכסה של Google. המכסה החינמית של Google נפרדת ועשויה להיגמר קודם, ואז העוזר נחסם עד שהיא מתחדשת.`;
