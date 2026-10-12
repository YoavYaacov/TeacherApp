import { describe, expect, it } from 'vitest';
import { nextPacificMidnight, resetLabel } from './quota';
const ilHM = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
describe('איפוס המכסה', () => {
  it('חצות פסיפי = 10:00 בישראל כששני האזורים בשעון קיץ/חורף תואם', () => {
    // 2026-07-15: ישראל UTC+3, פסיפי UTC-7 => 10:00
    expect(ilHM(nextPacificMidnight(new Date('2026-07-15T12:00:00Z')))).toBe('10:00');
    // 2026-12-15: ישראל UTC+2, פסיפי UTC-8 => 10:00
    expect(ilHM(nextPacificMidnight(new Date('2026-12-15T12:00:00Z')))).toBe('10:00');
  });
  it('בשבועות שבהם מעבר השעון לא מסונכרן: 09:00 (ישראל בחורף, ארה״ב עדיין בקיץ)', () => {
    // 2026-10-29: ישראל חזרה לשעון חורף (UTC+2), ארה״ב עדיין קיץ (UTC-7) => 09:00
    expect(ilHM(nextPacificMidnight(new Date('2026-10-29T12:00:00Z')))).toBe('09:00');
  });
  it('תמיד בעתיד, בתוך 24 שעות, ותווית יום', () => {
    const now = new Date('2026-10-13T08:00:00Z'); const r = nextPacificMidnight(now);
    expect(r.getTime()).toBeGreaterThan(now.getTime()); expect(r.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 3600000);
    expect(resetLabel(new Date('2026-10-13T05:00:00Z'))).toMatch(/^היום ב-/); // 08:00 בישראל, האיפוס ב-09:00 או 10:00 באותו יום
    expect(resetLabel(new Date('2026-10-13T12:00:00Z'))).toMatch(/^מחר ב-/);
  });
  it('בדיוק על החצות עובר ליום הבא', () => {
    const r = nextPacificMidnight(new Date('2026-10-13T07:00:00Z')); // 00:00 פסיפי (UTC-7)
    expect(r.toISOString()).toBe('2026-10-14T07:00:00.000Z');
  });
});
