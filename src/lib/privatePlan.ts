// תכנון שיעורים פרטיים: מערכת שבועית קבועה. אין תאריכים ואין ישות "תלמיד": שם הוא רק תווית.
// הכול נשמר ב-user_settings.prefs.privatePlan (נכנס לגיבוי ולשחזור כמו שאר ההגדרות).
import type { CalendarEvent } from '../data/types';
import { israelParts } from './week';

export type Kind = 'fixed' | 'optional';
/** day: 0=ראשון … 6=מוצ״ש. day === null: ממתין לשיבוץ (dur ו-note הם הבקשה). start: דקות מחצות. */
export interface PlanItem { id: string; name: string; day: number | null; start: number | null; dur: number; kind: Kind; note?: string }
export interface PrivatePlan { items: PlanItem[]; avail: Record<number, number[]> }
export interface Span { start: number; end: number }

const hm = (h: number, m = 0) => h * 60 + m;
/** הזמינות ההתחלתית: כל מספר הוא תחילת חלון של שעה */
export const DEFAULT_AVAIL: Record<number, number[]> = {
  0: [hm(20, 30)], 1: [hm(14), hm(15), hm(20, 30)],
  2: [9, 10, 11, 12, 13, 14, 15].map((h) => hm(h)).concat(hm(20, 30)),
  3: [9, 10, 11, 12, 13, 14, 15].map((h) => hm(h)).concat(hm(20, 30)),
  4: [hm(20, 30)], 5: [hm(9), hm(10), hm(11), hm(13, 30), hm(14, 30)], 6: [hm(20, 30)],
};
export const emptyPlan = (): PrivatePlan => ({ items: [], avail: structuredCloneSafe(DEFAULT_AVAIL) });
function structuredCloneSafe<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }
export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'מוצ״ש'];
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'מוצ״ש'];
export const WINDOW = 60;

/** קריאה בטוחה מההגדרות: ערכים לא תקינים נזרקים ולא מפילים את המסך */
export function readPlan(prefs: unknown): PrivatePlan {
  const raw = ((prefs ?? {}) as { privatePlan?: Partial<PrivatePlan> }).privatePlan;
  if (!raw || typeof raw !== 'object') return emptyPlan();
  const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((i): i is PlanItem => !!i && typeof i.id === 'string' && typeof i.name === 'string' && num(i.dur, 15, 600))
    .map((i) => {
      const placed = num(i.day, 0, 6) && num(i.start, 0, 1439);
      return { id: i.id, name: i.name.trim(), day: placed ? i.day : null, start: placed ? i.start : null, dur: Math.round(i.dur), kind: i.kind === 'optional' ? 'optional' as const : 'fixed' as const, ...(i.note ? { note: String(i.note) } : {}) };
    });
  const avail: Record<number, number[]> = {};
  for (let d = 0; d < 7; d++) {
    const src = raw.avail && Array.isArray((raw.avail as Record<number, unknown>)[d]) ? ((raw.avail as Record<number, number[]>)[d]) : (raw.avail ? [] : DEFAULT_AVAIL[d]);
    avail[d] = [...new Set(src.filter((x) => num(x, 0, 1439)))].sort((a, b) => a - b);
  }
  return { items, avail };
}

// ───────── שעון ישראל ─────────
const tf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
export function israelMinutes(t: Date): number { const o: Record<string, string> = {}; for (const p of tf.formatToParts(t)) o[p.type] = p.value; return +o.hour * 60 + +o.minute; }
const dateKey = (t: Date) => { const p = israelParts(t); return `${p.y}-${p.m}-${p.d}`; };

/**
 * שעות בית הספר בשבוע טיפוסי, מתוך אירועי היומן המיובאים: אירוע נחשב רק אם אותו יום ושעות חזרו לפחות בשני תאריכים שונים
 * בחלון של 8 שבועות לכל כיוון (כך חג או אירוע חד-פעמי לא משנים את המפה). טווחים חופפים או צמודים מתמזגים.
 */
export function schoolBlocks(events: CalendarEvent[], now = new Date(), weeks = 8): Record<number, Span[]> {
  const lo = now.getTime() - weeks * 7 * 86400000, hi = now.getTime() + weeks * 7 * 86400000;
  const seen = new Map<string, { day: number; s: number; e: number; dates: Set<string> }>();
  for (const ev of events) {
    if (ev.status !== 'confirmed' || ev.all_day) continue;
    const st = new Date(ev.start_at), en = new Date(ev.end_at);
    if (st.getTime() < lo || st.getTime() > hi) continue;
    const s = israelMinutes(st), e = israelMinutes(en);
    if (dateKey(st) !== dateKey(en) || e <= s) continue;
    const day = israelParts(st).wd, k = `${day}|${s}|${e}`;
    const g = seen.get(k) ?? { day, s, e, dates: new Set<string>() };
    g.dates.add(dateKey(st)); seen.set(k, g);
  }
  const out: Record<number, Span[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const g of seen.values()) if (g.dates.size >= 2) out[g.day].push({ start: g.s, end: g.e });
  for (const d of Object.keys(out)) out[+d] = mergeSpans(out[+d]);
  return out;
}
export function mergeSpans(a: Span[]): Span[] {
  const s = [...a].sort((x, y) => x.start - y.start || x.end - y.end), r: Span[] = [];
  for (const x of s) { const l = r[r.length - 1]; if (l && x.start <= l.end) l.end = Math.max(l.end, x.end); else r.push({ ...x }); }
  return r;
}

// ───────── חוקי שיבוץ ─────────
export const spanOf = (i: Pick<PlanItem, 'start' | 'dur'>): Span => ({ start: i.start ?? 0, end: (i.start ?? 0) + i.dur });
export const overlap = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
export const isPlaced = (i: PlanItem) => i.day !== null && i.start !== null;
export interface Check { school: boolean; clash: PlanItem[]; outside: boolean; overflow: boolean }
/** כל הטווח של השיעור מכוסה בחלונות הזמינות (כל חלון: שעה מההתחלה שלו) */
export function covered(avail: number[], sp: Span): boolean {
  const spans = mergeSpans(avail.map((s) => ({ start: s, end: s + WINDOW })));
  return spans.some((x) => x.start <= sp.start && x.end >= sp.end);
}
/** בדיקת שיבוץ מוצע (day,start,dur) מול בית הספר, שיבוצים אחרים והזמינות. excludeId: השורה שנערכת. */
export function check(plan: PrivatePlan, school: Record<number, Span[]>, p: { day: number; start: number; dur: number }, excludeId?: string): Check {
  const sp: Span = { start: p.start, end: p.start + p.dur };
  return {
    school: (school[p.day] ?? []).some((b) => overlap(sp, b)),
    clash: plan.items.filter((i) => i.id !== excludeId && isPlaced(i) && i.day === p.day && overlap(sp, spanOf(i))),
    outside: !covered(plan.avail[p.day] ?? [], sp),
    overflow: sp.end > 24 * 60,
  };
}

/** שיעור כפול (120 דקות) נספר כשני שיעורים: שעה = שיעור, ומינימום אחד לכל שיבוץ */
export const lessonUnits = (dur: number) => Math.max(1, Math.floor(dur / 60));
export interface Stats { students: number; weekly: number; waiting: number; free: number }
export function stats(plan: PrivatePlan, school: Record<number, Span[]>): Stats {
  const norm = (n: string) => n.trim().toLowerCase();
  const fixed = plan.items.filter((i) => isPlaced(i) && i.kind === 'fixed');
  let free = 0;
  for (let d = 0; d < 7; d++) for (const s of plan.avail[d] ?? []) {
    const sp: Span = { start: s, end: s + WINDOW };
    if ((school[d] ?? []).some((b) => overlap(sp, b))) continue;
    if (plan.items.some((i) => isPlaced(i) && i.day === d && overlap(sp, spanOf(i)))) continue;
    free++;
  }
  return { students: new Set(fixed.map((i) => norm(i.name))).size, weekly: fixed.reduce((n, i) => n + lessonUnits(i.dur), 0), waiting: plan.items.filter((i) => !isPlaced(i)).length, free };
}

// ───────── פעולות (פונקציות טהורות על התוכנית) ─────────
export const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const parseHM = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (!m) return null; const v = +m[1] * 60 + +m[2]; return +m[1] < 24 && +m[2] < 60 ? v : null; };
export const durLabel = (d: number) => ({ 30: 'חצי שעה', 60: 'שעה', 90: 'שעה וחצי', 120: 'שעתיים', 150: 'שעתיים וחצי', 180: 'שלוש שעות' } as Record<number, string>)[d] ?? `${d} דק׳`;

/** שמירת שורה: הוספה או עדכון. שינוי שם מתעדכן בכל השורות של אותו שם. */
export function upsertItem(plan: PrivatePlan, item: PlanItem): PrivatePlan {
  const prev = plan.items.find((i) => i.id === item.id);
  let items = prev ? plan.items.map((i) => (i.id === item.id ? item : i)) : [...plan.items, item];
  if (prev && prev.name.trim() !== item.name.trim()) items = items.map((i) => (i.name.trim() === prev.name.trim() ? { ...i, name: item.name.trim() } : i));
  return { ...plan, items };
}
/** הסרת שיבוץ: אם לאותו שם יש שיבוץ אחר, השורה נמחקת; אחרת הוא עובר להמתנה (ממשיך להופיע ברשימה) */
export function unplace(plan: PrivatePlan, id: string): PrivatePlan {
  const it = plan.items.find((i) => i.id === id); if (!it) return plan;
  const other = plan.items.some((i) => i.id !== id && isPlaced(i) && i.name.trim() === it.name.trim());
  return { ...plan, items: other ? plan.items.filter((i) => i.id !== id) : plan.items.map((i) => (i.id === id ? { ...i, day: null, start: null, kind: 'fixed' as const } : i)) };
}
export const removeItem = (plan: PrivatePlan, id: string): PrivatePlan => ({ ...plan, items: plan.items.filter((i) => i.id !== id) });
