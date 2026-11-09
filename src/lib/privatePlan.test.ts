import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../data/types';
import { DEFAULT_AVAIL, check, emptyPlan, israelMinutes, mergeSpans, parseHM, readPlan, removeItem, schoolBlocks, stats, unplace, upsertItem, type PlanItem, type PrivatePlan } from './privatePlan';

const ev = (id: string, start: string, end: string, o: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, group_id: null, title: 't', start_at: start, end_at: end, status: 'confirmed', source: 'google', ...o });
const mk = (id: string, name: string, day: number | null, start: number | null, dur = 60, kind: 'fixed' | 'optional' = 'fixed'): PlanItem => ({ id, name, day, start, dur, kind });
const plan = (items: PlanItem[], avail = DEFAULT_AVAIL): PrivatePlan => ({ items, avail: JSON.parse(JSON.stringify(avail)) });
const NOW = new Date('2026-11-09T09:00:00+02:00');

describe('שעון ישראל', () => {
  it('דקות מחצות בחורף ובקיץ', () => {
    expect(israelMinutes(new Date('2026-11-09T08:00:00+02:00'))).toBe(480);
    expect(israelMinutes(new Date('2026-07-09T08:00:00+03:00'))).toBe(480);
  });
});
describe('בית ספר טיפוסי', () => {
  // שני שבועות רצופים של ראשון 08:00–08:45 ו-08:45–09:30, ואירוע חד-פעמי ביום שלישי
  const evs = [
    ev('a', '2026-11-01T08:00:00+02:00', '2026-11-01T08:45:00+02:00'), ev('b', '2026-11-08T08:00:00+02:00', '2026-11-08T08:45:00+02:00'),
    ev('c', '2026-11-01T08:45:00+02:00', '2026-11-01T09:30:00+02:00'), ev('d', '2026-11-08T08:45:00+02:00', '2026-11-08T09:30:00+02:00'),
    ev('e', '2026-11-03T10:00:00+02:00', '2026-11-03T11:00:00+02:00'),
  ];
  it('רק מה שחוזר, וטווחים צמודים מתמזגים', () => {
    const b = schoolBlocks(evs, NOW);
    expect(b[0]).toEqual([{ start: 480, end: 570 }]);
    expect(b[2]).toEqual([]);
  });
  it('מבוטלים, כל-היום, מחוץ לחלון ומוסתרים-לא-נספרים', () => {
    const x = schoolBlocks([ev('a', '2026-11-01T08:00:00+02:00', '2026-11-01T09:00:00+02:00', { status: 'cancelled' }), ev('b', '2026-11-08T08:00:00+02:00', '2026-11-08T09:00:00+02:00', { status: 'cancelled' }),
      ev('c', '2026-11-01T00:00:00+02:00', '2026-11-02T00:00:00+02:00', { all_day: true }), ev('d', '2026-11-08T00:00:00+02:00', '2026-11-09T00:00:00+02:00', { all_day: true }),
      ev('e', '2025-01-05T08:00:00+02:00', '2025-01-05T09:00:00+02:00'), ev('f', '2025-01-12T08:00:00+02:00', '2025-01-12T09:00:00+02:00')], NOW);
    expect(Object.values(x).every((a) => a.length === 0)).toBe(true);
  });
  it('mergeSpans', () => { expect(mergeSpans([{ start: 10, end: 20 }, { start: 20, end: 30 }, { start: 40, end: 50 }])).toEqual([{ start: 10, end: 30 }, { start: 40, end: 50 }]); });
});
describe('חוקי שיבוץ', () => {
  const school = { 0: [{ start: 480, end: 810 }], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  it('בית ספר חוסם', () => { expect(check(plan([]), school, { day: 0, start: 600, dur: 60 }).school).toBe(true); expect(check(plan([]), school, { day: 0, start: 810, dur: 60 }).school).toBe(false); });
  it('שני תלמידים באותה משבצת; שיעור אחר לא חופף', () => {
    const p = plan([mk('1', 'א', 2, 14 * 60)]);
    expect(check(p, school, { day: 2, start: 14 * 60 + 30, dur: 60 }).clash).toHaveLength(1);
    expect(check(p, school, { day: 2, start: 15 * 60, dur: 60 }).clash).toHaveLength(0);
    expect(check(p, school, { day: 2, start: 14 * 60, dur: 60 }, '1').clash).toHaveLength(0); // עריכת אותה שורה
  });
  it('120 דקות: כל הטווח צריך להיות פנוי', () => {
    const p = plan([mk('1', 'א', 2, 16 * 60 - 60 * 0)]);
    expect(check(plan([mk('1', 'א', 2, 11 * 60)]), school, { day: 2, start: 10 * 60, dur: 120 }).clash).toHaveLength(1);
    expect(check(p, school, { day: 2, start: 9 * 60, dur: 120 }).clash).toHaveLength(0);
  });
  it('זמינות: חלונות צמודים מכסים טווח ארוך; פער לא', () => {
    expect(check(plan([]), school, { day: 2, start: 14 * 60, dur: 120 }).outside).toBe(false); // 14:00 ו-15:00
    expect(check(plan([]), school, { day: 2, start: 15 * 60, dur: 120 }).outside).toBe(true); // 16:00 לא זמין
    expect(check(plan([]), school, { day: 5, start: 13 * 60 + 30, dur: 120 }).outside).toBe(false); // 13:30 ו-14:30
    expect(check(plan([]), school, { day: 1, start: 20 * 60 + 30, dur: 45 }).outside).toBe(false); // חצי שעה/רבעי שעה בתוך החלון
    expect(check(plan([]), school, { day: 1, start: 20 * 60 + 45, dur: 60 }).outside).toBe(true);
  });
  it('חצות', () => { expect(check(plan([]), school, { day: 6, start: 23 * 60, dur: 120 }).overflow).toBe(true); });
});
describe('פעולות', () => {
  it('הסרת שיבוץ: אין שיבוץ אחר => ממתין; יש אחר => השורה נמחקת', () => {
    const one = unplace(plan([mk('1', 'רגב', 1, 840)]), '1');
    expect(one.items).toHaveLength(1); expect(one.items[0].day).toBeNull();
    const two = unplace(plan([mk('1', 'רגב', 1, 840), mk('2', 'רגב', 3, 840, 60, 'optional')]), '2');
    expect(two.items.map((i) => i.id)).toEqual(['1']);
  });
  it('שינוי שם מתעדכן בכל שורות אותו תלמיד', () => {
    const p = upsertItem(plan([mk('1', 'רגב', 1, 840), mk('2', 'רגב', 3, 840, 60, 'optional'), mk('3', 'דרור', 2, 600)]), { ...mk('1', 'רגב י', 1, 840) });
    expect(p.items.map((i) => i.name)).toEqual(['רגב י', 'רגב י', 'דרור']);
  });
  it('הוספה ומחיקה', () => { const p = upsertItem(plan([]), mk('x', 'חדש', null, null, 120)); expect(p.items).toHaveLength(1); expect(removeItem(p, 'x').items).toHaveLength(0); });
  it('סטטיסטיקה: קבועים בלבד, ממתינים, משבצות פנויות', () => {
    const school = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const base = stats(plan([]), school).free;
    expect(base).toBe(Object.values(DEFAULT_AVAIL).flat().length);
    const s = stats(plan([mk('1', 'א', 2, 14 * 60, 120), mk('2', 'א', 3, 600, 60, 'optional'), mk('3', 'ב', 4, 20 * 60 + 30), mk('4', 'ג', null, null, 120)]), school);
    expect(s).toEqual({ students: 2, weekly: 2, waiting: 1, free: base - 4 }); // 14:00,15:00 ביום שלישי, 10:00 ברביעי (אופציונלי) ו-20:30 בחמישי תפוסים; האופציונלי לא נחשב לשיעור שבועי
  });
});
describe('קריאה מההגדרות', () => {
  it('אין תוכנית: ברירת מחדל עם הזמינות שלך', () => { const p = readPlan({}); expect(p.items).toEqual([]); expect(p.avail[2]).toContain(9 * 60); expect(p.avail[5]).toEqual([540, 600, 660, 810, 870]); });
  it('ערכים שבורים נזרקים', () => {
    const p = readPlan({ privatePlan: { items: [{ id: 'a', name: ' רגב ', day: 9, start: 5, dur: 60 }, { name: 'x' }, { id: 'b', name: 'דרור', day: 2, start: 600, dur: 60, kind: 'optional' }], avail: { 2: [600, 600, 'x', -5] } } });
    expect(p.items).toHaveLength(2); expect(p.items[0].day).toBeNull(); expect(p.items[0].name).toBe('רגב'); expect(p.items[1].kind).toBe('optional');
    expect(p.avail[2]).toEqual([600]); expect(p.avail[3]).toEqual([]); // זמינות שנשמרה ללא יום מסוים = ריקה, לא ברירת מחדל
  });
  it('parseHM', () => { expect(parseHM('14:30')).toBe(870); expect(parseHM('25:00')).toBeNull(); expect(parseHM('x')).toBeNull(); expect(emptyPlan().items).toEqual([]); });
});
