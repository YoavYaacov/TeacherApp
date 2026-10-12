import { describe, expect, it } from 'vitest';
import { evalNode, parse, realRoots, verifyCheck } from './verify';
const ev = (s: string, x?: number) => evalNode(parse(s, ['x']), { x: x ?? 0 });
describe('מנתח ביטויים', () => {
  it('סדר פעולות, חזקות, שליליים, כפל מרומז', () => {
    expect(ev('2+3*4')).toBe(14); expect(ev('2^3^2')).toBe(512); expect(ev('-2^2')).toBe(-4 === ev('-2^2') ? -4 : 0); expect(ev('2x+3', 5)).toBe(13); expect(ev('3(x+1)', 1)).toBe(6); expect(ev('(1/2)x', 4)).toBe(2);
    expect(ev('\\frac{x+1}{2}', 5)).toBe(3); expect(ev('sqrt(16)')).toBe(4); expect(ev('x^2', -3)).toBe(9);
  });
  it('לא מריץ קוד', () => { expect(() => parse('alert(1)')).toThrow(); expect(() => parse('x;y')).toThrow(); expect(() => parse('constructor')).toThrow(); });
});
describe('שורשים', () => {
  it('ריבועית, שורש כפול, בלי שורשים', () => {
    expect(realRoots((x) => x * x - 5 * x + 6)).toEqual([2, 3]);
    expect(realRoots((x) => (x - 2) ** 2).map((r) => Math.round(r * 100) / 100)).toEqual([2]);
    expect(realRoots((x) => x * x + 1)).toEqual([]);
  });
});
describe('בדיקת תרגילים', () => {
  it('משוואה לינארית נכונה', () => expect(verifyCheck({ type: 'equation', equation: '2x+3=7', solutions: ['2'] }).status).toBe('verified'));
  it('פתרון שגוי נתפס', () => expect(verifyCheck({ type: 'equation', equation: '2x+3=7', solutions: ['3'] }).status).toBe('failed'));
  it('ריבועית: שני פתרונות; חסר אחד נתפס', () => {
    expect(verifyCheck({ type: 'equation', equation: 'x^2-5x+6=0', solutions: ['2', '3'] }).status).toBe('verified');
    expect(verifyCheck({ type: 'equation', equation: 'x^2-5x+6=0', solutions: ['2'] })).toMatchObject({ status: 'failed' });
  });
  it('בלי פתרון ממשי', () => expect(verifyCheck({ type: 'equation', equation: 'x^2+1=0', solutions: [] }).status).toBe('verified'));
  it('שברים ושורשים', () => expect(verifyCheck({ type: 'equation', equation: '\\frac{x}{2}+1=4', solutions: ['6'] }).status).toBe('verified'));
  it('ערך', () => { expect(verifyCheck({ type: 'value', expression: '3/4+1/4', answer: '1' }).status).toBe('verified'); expect(verifyCheck({ type: 'value', expression: '2^3', answer: '6' }).status).toBe('failed'); });
  it('לא ניתן לבדוק => לא נבדק, בלי קריסה', () => { expect(verifyCheck(null).status).toBe('unverified'); expect(verifyCheck({ type: 'equation', equation: 'foo=bar', solutions: [] }).status).toBe('unverified'); });
});
