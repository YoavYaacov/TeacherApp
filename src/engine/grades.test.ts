import { describe, expect, it } from 'vitest';
import {
  approveCalculated, computeAnnual, computeCategory, computeTerm, finalStatus,
  manualOverride, resolveEventScore, roundHalfUp, validateAnnualWeights, validateTermConfig,
} from './grades';
import type { AssessmentEvent, Category, EventGrades, GradeCell, MakeupPolicy, TermConfig } from './types';

const sc = (value: number): GradeCell => ({ kind: 'score', value });
const ev = (id: string, weight: number | null = null, extra: Partial<AssessmentEvent> = {}): AssessmentEvent => ({
  id, weight, date: '2026-01-01', makeupPolicy: 'best', ...extra,
});
const cat = (id: string, weight: number, events: AssessmentEvent[], extra: Partial<Category> = {}): Category => ({
  id, name: id, weight, weightMode: 'custom', dropLowest: false, events, ...extra,
});
const g = (a: GradeCell, b?: GradeCell, policyOverride?: MakeupPolicy): EventGrades => ({ a, b, policyOverride });

describe('rounding', () => {
  it('half-up, float-safe', () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(84.5, 0)).toBe(85);
    expect(roundHalfUp(84.49, 0)).toBe(84);
  });
});

describe('resolveEventScore (מועד ב׳)', () => {
  it('best / latest / average', () => {
    expect(resolveEventScore(g(sc(60), sc(80)), 'best')).toBe(80);
    expect(resolveEventScore(g(sc(90), sc(70)), 'best')).toBe(90);
    expect(resolveEventScore(g(sc(90), sc(70)), 'latest')).toBe(70);
    expect(resolveEventScore(g(sc(60), sc(80)), 'average')).toBe(70);
  });
  it('מועד ב׳ חסר -> משתמשים בא׳, לא ממוצע עם ריק', () => {
    expect(resolveEventScore(g(sc(60), { kind: 'empty' }), 'average')).toBe(60);
    expect(resolveEventScore(g(sc(60)), 'average')).toBe(60);
    expect(resolveEventScore(g(sc(60), { kind: 'absent' }), 'latest')).toBe(60);
  });
  it('א׳ חסר ו-ב׳ קיים -> ב׳', () => {
    expect(resolveEventScore(g({ kind: 'absent' }, sc(75)), 'average')).toBe(75);
  });
  it('override ברמת תלמיד גובר על המדיניות', () => {
    expect(resolveEventScore(g(sc(90), sc(70), 'latest'), 'best')).toBe(70);
  });
  it('אפס אמיתי נספר; ריק/פטור/לא נבחן לא', () => {
    expect(resolveEventScore(g(sc(0)), 'best')).toBe(0);
    expect(resolveEventScore(g({ kind: 'empty' }), 'best')).toBeNull();
    expect(resolveEventScore(g({ kind: 'exempt' }), 'best')).toBeNull();
    expect(resolveEventScore(g({ kind: 'absent' }), 'best')).toBeNull();
    expect(resolveEventScore(undefined, 'best')).toBeNull();
  });
});

describe('computeCategory', () => {
  const c = cat('c', 100, [ev('e1', 50), ev('e2', 30), ev('e3', 20)]);
  it('ממוצע משוקלל מלא', () => {
    const r = computeCategory(c, { e1: g(sc(100)), e2: g(sc(50)), e3: g(sc(0)) });
    expect(r.average).toBeCloseTo(65);
    expect(r.missingEventIds).toEqual([]);
  });
  it('נרמול זמני כשחסר ציון', () => {
    const r = computeCategory(c, { e1: g(sc(100)), e2: g(sc(50)), e3: g({ kind: 'empty' }) });
    expect(r.average).toBeCloseTo((100 * 50 + 50 * 30) / 80);
    expect(r.missingEventIds).toEqual(['e3']);
  });
  it('אין ציונים -> null', () => {
    expect(computeCategory(c, {}).average).toBeNull();
  });
  it('אירוע מבוטל מוצא מהחישוב', () => {
    const c2 = cat('c', 100, [ev('e1', 50), ev('e2', 50, { cancelled: true })]);
    const r = computeCategory(c2, { e1: g(sc(80)), e2: g(sc(0)) });
    expect(r.average).toBe(80);
    expect(r.missingEventIds).toEqual([]);
  });
  it('משקלים שווים בהגדרה מפורשת', () => {
    const c2 = cat('c', 100, [ev('e1'), ev('e2')], { weightMode: 'equal' });
    expect(computeCategory(c2, { e1: g(sc(60)), e2: g(sc(100)) }).average).toBe(80);
  });
});

describe('ויתור על הנמוך ביותר', () => {
  const base = cat('c', 100, [ev('e1', 50), ev('e2', 30), ev('e3', 20)], { dropLowest: true });
  it('כבוי כברירת מחדל', () => {
    const off = { ...base, dropLowest: false };
    const r = computeCategory(off, { e1: g(sc(100)), e2: g(sc(40)), e3: g(sc(90)) });
    expect(r.droppedEventId).toBeNull();
  });
  it('משמיט את הנמוך ומחלק משקל יחסית', () => {
    const r = computeCategory(base, { e1: g(sc(100)), e2: g(sc(40)), e3: g(sc(90)) });
    expect(r.droppedEventId).toBe('e2');
    expect(r.average).toBeCloseTo((100 * 50 + 90 * 20) / 70);
  });
  it('ציון תקף יחיד לא מושמט', () => {
    const r = computeCategory(base, { e1: g(sc(30)) });
    expect(r.droppedEventId).toBeNull();
    expect(r.average).toBe(30);
  });
  it('0 אמיתי מושמט כנמוך; ריק לא נחשב', () => {
    const r = computeCategory(base, { e1: g(sc(70)), e2: g({ kind: 'empty' }), e3: g(sc(0)) });
    expect(r.droppedEventId).toBe('e3');
    expect(r.average).toBe(70);
  });
  it('תיקו: משקל גבוה יותר מושמט, אחר כך תאריך, אחר כך id', () => {
    const c = cat('c', 100, [ev('a', 60), ev('b', 40)], { dropLowest: true });
    expect(computeCategory(c, { a: g(sc(50)), b: g(sc(50)) }).droppedEventId).toBe('a');
    const d = cat('d', 100, [ev('x', 50, { date: '2026-02-01' }), ev('y', 50, { date: '2026-01-01' })], { dropLowest: true });
    expect(computeCategory(d, { x: g(sc(50)), y: g(sc(50)) }).droppedEventId).toBe('y');
    const e = cat('e', 100, [ev('m', 50), ev('k', 50)], { dropLowest: true });
    expect(computeCategory(e, { m: g(sc(50)), k: g(sc(50)) }).droppedEventId).toBe('k');
  });
  it('דטרמיניסטי: סדר האירועים לא משנה', () => {
    const c1 = cat('c', 100, [ev('a', 50), ev('b', 50)], { dropLowest: true });
    const c2 = cat('c', 100, [ev('b', 50), ev('a', 50)], { dropLowest: true });
    const gr = { a: g(sc(50)), b: g(sc(50)) };
    expect(computeCategory(c1, gr).droppedEventId).toBe(computeCategory(c2, gr).droppedEventId);
  });
  it('ויתור נעשה לכל תלמיד בנפרד', () => {
    const r1 = computeCategory(base, { e1: g(sc(10)), e2: g(sc(90)), e3: g(sc(90)) });
    const r2 = computeCategory(base, { e1: g(sc(90)), e2: g(sc(10)), e3: g(sc(90)) });
    expect(r1.droppedEventId).toBe('e1');
    expect(r2.droppedEventId).toBe('e2');
  });
  it('ויתור אחרי פתרון מועד ב׳', () => {
    const r = computeCategory(base, { e1: g(sc(40), sc(95)), e2: g(sc(60)), e3: g(sc(80)) });
    expect(r.droppedEventId).toBe('e2');
  });
});

describe('computeTerm', () => {
  const cfg: TermConfig = {
    categories: [cat('tests', 70, [ev('t1', 50), ev('t2', 50)]), cat('hw', 30, [ev('h1', 100)])],
  };
  it('מלא', () => {
    const r = computeTerm(cfg, { t1: g(sc(80)), t2: g(sc(60)), h1: g(sc(100)) });
    expect(r.calculated).toBeCloseTo(70 * 0.7 + 30);
    expect(r.partial).toBe(false);
  });
  it('קטגוריה בלי נתונים: מנרמלים ומסמנים partial', () => {
    const r = computeTerm(cfg, { t1: g(sc(80)), t2: g(sc(60)) });
    expect(r.calculated).toBe(70);
    expect(r.partial).toBe(true);
    expect(r.emptyCategoryIds).toEqual(['hw']);
  });
  it('אירוע חסר -> partial', () => {
    const r = computeTerm(cfg, { t1: g(sc(80)), h1: g(sc(100)) });
    expect(r.partial).toBe(true);
  });
  it('אין נתונים בכלל -> null', () => {
    const r = computeTerm(cfg, {});
    expect(r.calculated).toBeNull();
    expect(r.calculatedRounded).toBeNull();
  });
  it('0 אמיתי משפיע', () => {
    const r = computeTerm(cfg, { t1: g(sc(0)), t2: g(sc(0)), h1: g(sc(100)) });
    expect(r.calculated).toBeCloseTo(30);
  });
});

describe('ולידציה', () => {
  it('מזהה סכומי משקלים שגויים ולא מנרמל', () => {
    const bad: TermConfig = { categories: [cat('a', 60, [ev('x', 50), ev('y', 40)]), cat('b', 30, [ev('z', 100)])] };
    const codes = validateTermConfig(bad).map((i) => i.code);
    expect(codes).toContain('CATEGORY_WEIGHTS_SUM');
    expect(codes).toContain('EVENT_WEIGHTS_SUM');
  });
  it('תקין', () => {
    expect(validateTermConfig({ categories: [cat('a', 100, [ev('x', 100)])] })).toEqual([]);
    expect(validateTermConfig({ categories: [cat('a', 100, [ev('x'), ev('y')], { weightMode: 'equal' })] })).toEqual([]);
  });
  it('משקל חסר', () => {
    expect(validateTermConfig({ categories: [cat('a', 100, [ev('x', null)])] })[0].code).toBe('EVENT_WEIGHT_MISSING');
  });
  it('שנתי', () => {
    expect(validateAnnualWeights(50, 50)).toEqual([]);
    expect(validateAnnualWeights(60, 50)).toHaveLength(1);
  });
});

describe('ציון סופי: אישור, override והתיישנות', () => {
  it('אין ערך שמור -> אין ציון סופי', () => {
    expect(finalStatus(null, 80)).toEqual({ value: null, source: null, stale: false });
  });
  it('אישור שומר ערך מעוגל ולא דורס כשהמקור משתנה; מסומן stale', () => {
    const f = approveCalculated(84.6);
    expect(f.value).toBe(85);
    const same = finalStatus(f, 84.6);
    expect(same.stale).toBe(false);
    const changed = finalStatus(f, 70);
    expect(changed.value).toBe(85);
    expect(changed.stale).toBe(true);
  });
  it('override ידני נשמר, stale כשהחישוב השתנה', () => {
    const f = manualOverride(90, 84.6);
    expect(finalStatus(f, 84.6).stale).toBe(false);
    expect(finalStatus(f, 60)).toMatchObject({ value: 90, source: 'override', stale: true });
  });
  it('override לא חוקי נדחה; 0 חוקי', () => {
    expect(() => manualOverride(101, null)).toThrow();
    expect(() => manualOverride(-1, null)).toThrow();
    expect(manualOverride(0, null).value).toBe(0);
  });
});

describe('ציון שנתי', () => {
  it('50/50 מציונים סופיים', () => {
    expect(computeAnnual(80, 90).calculated).toBe(85);
  });
  it('משקלים מותאמים', () => {
    expect(computeAnnual(80, 90, 40, 60).calculated).toBe(86);
  });
  it('מחצית חסרה -> אין שנתי ולא ממציאים', () => {
    expect(computeAnnual(80, null)).toEqual({ calculated: null, calculatedRounded: null, missingTerms: [2] });
    expect(computeAnnual(null, null).missingTerms).toEqual([1, 2]);
  });
  it('משקלים לא חוקיים -> null', () => {
    expect(computeAnnual(80, 90, 70, 70).calculated).toBeNull();
  });
  it('0 כציון סופי חוקי', () => {
    expect(computeAnnual(0, 100).calculated).toBe(50);
  });
});
