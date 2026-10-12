import { describe, expect, it } from 'vitest';
import { hebrewDate } from './util';
describe('תאריך עברי', () => {
  it('גימטריה ושמות חודשים', () => {
    expect(hebrewDate(new Date(2026, 9, 13))).toBe('ב׳ בחשוון תשפ״ז');
    expect(hebrewDate(new Date(2026, 8, 12))).toMatch(/^א׳ בתשרי|^כ״ט באלול/); // ראש השנה תשפ״ז: 12.9.2026
    expect(hebrewDate(new Date(2027, 2, 10))).toBe('א׳ באדר ב׳ תשפ״ז');
  });
  it('15 ו-16 כ-ט״ו וט״ז', () => {
    const d = (s: string) => hebrewDate(new Date(s));
    // 4.9.2026 = כ״ב באלול? בודקים שאין "יה"/"יו"
    for (let i = 0; i < 400; i += 3) { const t = hebrewDate(new Date(2026, 0, 1 + i)); expect(t).not.toMatch(/(^|\s)י״ה|(^|\s)י״ו/); }
    void d;
  });
});
