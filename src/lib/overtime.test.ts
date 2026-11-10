import { describe, expect, it } from 'vitest';
import { OT_FIRST, beforeFirst, bump, canSendReport, countersOf, nothingToReport, toRow, sendableFrom, monthKey, monthLabel, shiftMonth } from './overtime';
import { buildReport, REPORT_TO } from './overtimeMail';

describe('שעות נוספות', () => {
  it('מעבר בין חודשים ושנים', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(shiftMonth({ year: 2026, month: 10 }, -10)).toEqual({ year: 2025, month: 12 });
  });
  it('חודש בלי שורה: פרונטליות 0, פרטני 0, שהייה מתחילה מ-6', () => {
    expect(countersOf([], { year: 2026, month: 11 })).toEqual({ c: { frontal: 0, individual: 0, stay: 6 }, legacy: 0 });
  });
  it('שורה במודל החדש נקראת כמות שהיא; שהייה לא יורדת מ-6', () => {
    const rows = [{ year: 2026, month: 11, frontal_hours: 3, individual_hours: 2, pedagogical_hours: 8 }, { year: 2026, month: 12, frontal_hours: 0, individual_hours: 0, pedagogical_hours: 2 }];
    expect(countersOf(rows, { year: 2026, month: 11 }).c).toEqual({ frontal: 3, individual: 2, stay: 8 });
    expect(countersOf(rows, { year: 2026, month: 12 }).c.stay).toBe(6);
  });
  it('שורה ישנה (בלי individual_hours): ברירת מחדל, והסכום הישן רק כהערה', () => {
    expect(countersOf([{ year: 2026, month: 10, hours: 19, frontal_hours: 3, pedagogical_hours: 1 }], { year: 2026, month: 10 })).toEqual({ c: { frontal: 0, individual: 0, stay: 6 }, legacy: 19 });
    expect(countersOf([{ year: 2026, month: 10, frontal_hours: 3, pedagogical_hours: 2 }], { year: 2026, month: 10 }).legacy).toBe(5);
  });
  it('שמירה: שלוש עמודות, בלי hours', () => { expect(toRow({ year: 2026, month: 11 }, { frontal: 4, individual: 1, stay: 7 })).toEqual({ year: 2026, month: 11, frontal_hours: 4, individual_hours: 1, pedagogical_hours: 7 }); });
  it('אין מה לדווח כשהכול בברירת המחדל', () => { expect(nothingToReport({ frontal: 0, individual: 0, stay: 6 })).toBe(true); expect(nothingToReport({ frontal: 0, individual: 0, stay: 7 })).toBe(false); expect(nothingToReport({ frontal: 1, individual: 0, stay: 6 })).toBe(false); });
  it('מפתח חודש', () => { expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03'); });
  it('אין ערך שלילי, ושהייה לא יורדת מתחת למינימום', () => { expect(bump(0, -1)).toBe(0); expect(bump(2, -1)).toBe(1); expect(bump(2, 1)).toBe(3); expect(bump(6, -1, 6)).toBe(6); expect(bump(6, 1, 6)).toBe(7); });
  it('שם החודש בעברית עם שנה לועזית', () => { expect(monthLabel({ year: 2026, month: 10 })).toBe('אוקטובר 2026'); });
  it('נוסח המייל קבוע, הנמען קבוע', () => {
    const r = buildReport({ year: 2026, month: 10 }, { frontal: 4, individual: 0, stay: 7 });
    expect(r.subject).toBe('דיווח שעות נוספות – אוקטובר 2026');
    expect(r.body).toBe('שלום,\n\nלהלן דיווח השעות הנוספות שלי לחודש אוקטובר 2026:\n\nפרונטליות: 4\nפרטני: 0\nשהייה: 7\n\nבברכה,\nיואב יעקב');
    expect(REPORT_TO).toBe('israelp@amit.org.il');
  });
  it('החודש הראשון הוא אוקטובר 2026 ואין גלילה לפניו', () => {
    expect(OT_FIRST).toEqual({ year: 2026, month: 10 });
    expect(beforeFirst({ year: 2026, month: 10 })).toBe(true); // כפתור "הקודם" מושבת כאן
    expect(beforeFirst({ year: 2026, month: 11 })).toBe(false);
  });
  it('שליחה רק מה-1 לחודש שאחרי (שעון ישראל)', () => {
    const oct = { year: 2026, month: 10 };
    expect(canSendReport(oct, new Date('2026-10-31T23:59:00+02:00'))).toBe(false);
    expect(canSendReport(oct, new Date('2026-10-15T12:00:00+03:00'))).toBe(false);
    expect(canSendReport(oct, new Date('2026-10-31T22:30:00Z'))).toBe(true); // 00:30 ב-1.11 בישראל (UTC+2)
    expect(canSendReport(oct, new Date('2026-11-01T00:00:01+02:00'))).toBe(true);
    expect(canSendReport(oct, new Date('2027-03-01T12:00:00+02:00'))).toBe(true);
    expect(canSendReport({ year: 2026, month: 11 }, new Date('2026-11-02T12:00:00+02:00'))).toBe(false);
    expect(canSendReport({ year: 2026, month: 12 }, new Date('2027-01-01T00:00:00+02:00'))).toBe(true); // מעבר שנה
    expect(sendableFrom({ year: 2026, month: 12 })).toBe('1 בינואר 2027');
  });
});
