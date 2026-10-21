import { describe, expect, it } from 'vitest';
import { bump, monthLabel, otOf, shiftMonth } from './overtime';

describe('שעות נוספות', () => {
  it('מעבר בין חודשים ושנים', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(shiftMonth({ year: 2026, month: 10 }, -10)).toEqual({ year: 2025, month: 12 });
  });
  it('חודש ללא רשומה מתחיל באפס', () => {
    expect(otOf([{ year: 2026, month: 9, frontal_hours: 3, pedagogical_hours: 2 }], { year: 2026, month: 10 })).toEqual({ frontal_hours: 0, pedagogical_hours: 0 });
    expect(otOf([{ year: 2026, month: 9, frontal_hours: 3, pedagogical_hours: 2 }], { year: 2026, month: 9 })).toEqual({ frontal_hours: 3, pedagogical_hours: 2 });
  });
  it('אין ערך שלילי', () => { expect(bump(0, -1)).toBe(0); expect(bump(2, -1)).toBe(1); expect(bump(2, 1)).toBe(3); });
  it('שם החודש בעברית עם שנה לועזית', () => { expect(monthLabel({ year: 2026, month: 10 })).toBe('אוקטובר 2026'); });
});
