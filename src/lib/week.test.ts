import { describe, expect, it } from 'vitest';
import { endOfWeek, remainingThisWeek } from './week';

// 2026-10-17 הוא שבת; 2026-10-18 ראשון. (אוקטובר: שעון קיץ בישראל עד 25.10, UTC+3)
const il = (s: string) => new Date(`${s}+03:00`);
describe('סוף השבוע (שעון ישראל)', () => {
  it('בכל יום בשבוע הסוף הוא חצות שבת→ראשון', () => {
    const expected = il('2026-10-18T00:00:00').getTime();
    for (const s of ['2026-10-11T00:00:01', '2026-10-14T12:00:00', '2026-10-16T23:00:00', '2026-10-17T23:59:59']) expect(endOfWeek(il(s)).getTime()).toBe(expected);
  });
  it('בחצות לראשון מתחיל שבוע חדש', () => {
    expect(endOfWeek(il('2026-10-18T00:00:00')).getTime()).toBe(il('2026-10-25T00:00:00').getTime() + 0 /* עדיין +03 עד 02:00 */);
    expect(endOfWeek(il('2026-10-17T23:59:59')).getTime()).toBeLessThan(endOfWeek(il('2026-10-18T00:00:00')).getTime());
  });
  it('עובד גם כשהמכשיר ב-UTC: 21:30 UTC בשבת = 00:30 ראשון בישראל', () => {
    expect(endOfWeek(new Date('2026-10-17T21:30:00Z')).getTime()).toBe(il('2026-10-25T00:00:00').getTime());
  });
  it('מעבר שעון חורף (25.10.2026) לא מזיז את החצות', () => {
    // שבוע 25.10–31.10 כולו כבר UTC+2
    expect(endOfWeek(new Date('2026-10-28T10:00:00Z')).getTime()).toBe(new Date('2026-10-31T22:00:00Z').getTime());
  });
});
describe('שיעורים שנותרו השבוע', () => {
  const ev = (s: string, e: string) => ({ start_at: il(s).toISOString(), end_at: il(e).toISOString() });
  const evs = [ev('2026-10-14T08:00:00', '2026-10-14T08:45:00'), ev('2026-10-15T10:00:00', '2026-10-15T10:45:00'), ev('2026-10-17T20:00:00', '2026-10-17T20:45:00'), ev('2026-10-18T08:00:00', '2026-10-18T08:45:00')];
  it('הספירה יורדת ככל ששיעורים מסתיימים', () => {
    expect(remainingThisWeek(evs, il('2026-10-14T07:00:00')).length).toBe(3);
    expect(remainingThisWeek(evs, il('2026-10-14T08:30:00')).length).toBe(3); // בתוך השיעור: עדיין נספר
    expect(remainingThisWeek(evs, il('2026-10-14T09:00:00')).length).toBe(2);
    expect(remainingThisWeek(evs, il('2026-10-16T12:00:00')).length).toBe(1);
  });
  it('שיעור ביום ראשון הבא לא נספר, ומתחיל להיספר בשבוע החדש', () => {
    expect(remainingThisWeek(evs, il('2026-10-12T00:00:00')).some((e) => e.start_at === evs[3].start_at)).toBe(false);
    expect(remainingThisWeek(evs, il('2026-10-17T20:10:00')).length).toBe(1); // שיעור במוצאי שבת נספר עד שהוא מסתיים
    expect(remainingThisWeek(evs, il('2026-10-17T23:59:59')).length).toBe(0);
    expect(remainingThisWeek(evs, il('2026-10-18T00:00:00')).length).toBe(1); // השיעור של ראשון הוא כבר בשבוע החדש
    expect(remainingThisWeek(evs, il('2026-10-18T09:00:00')).length).toBe(0);
  });
});
