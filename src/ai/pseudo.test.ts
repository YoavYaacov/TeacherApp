import { describe, expect, it } from 'vitest';
import { makeAliasMap, guessGender } from './pseudo';
const S = (id: string, first_name: string, last_name: string) => ({ id, first_name, last_name, home_class: null, archived_at: null });
const studs = [S('1', 'דנה', 'כהן'), S('2', 'רן', 'לוי'), S('3', 'דנה', 'לוי'), S('4', 'יוסי', 'אברהם')];
describe('כינויים', () => {
  const m = makeAliasMap(studs, 'conv-1');
  it('שם מלא בשני הסדרים וקידומות עברית', () => {
    const t = m.pseudonymize('הציון של דנה כהן וגם לוי רן, ולדנה כהן יש שיפור');
    expect(t).not.toMatch(/דנה|כהן|רן|לוי/);
    expect(t).toContain(m.alias('1')); expect(t).toContain(m.alias('2'));
    expect(t).toMatch(/ל ?ST-\d+ /.test(t) ? /./ : /ולST-|לST-/);
  });
  it('שם בודד דו-משמעי מוסתר, חד-משמעי מקבל כינוי', () => {
    expect(m.pseudonymize('דנה')).toBe('[שם]');         // דנה כהן / דנה לוי
    expect(m.pseudonymize('כהן')).toBe(m.alias('1'));
    expect(m.pseudonymize('יוסי')).toBe(m.alias('4'));
  });
  it('שחזור הפיך, ולא נוגע בטקסט רגיל', () => {
    expect(m.restore(`${m.alias('2')} שיפר`)).toBe('רן לוי שיפר');
    expect(m.pseudonymize('פתרו משוואה ריבועית x^2=4')).toBe('פתרו משוואה ריבועית x^2=4');
  });
  it('כינוי קבוע בשיחה ושונה בין שיחות', () => {
    expect(makeAliasMap(studs, 'conv-1').alias('1')).toBe(m.alias('1'));
    const others = ['a', 'b', 'c', 'd', 'e'].map((s) => makeAliasMap(studs, s).alias('1'));
    expect(new Set([...others, m.alias('1')]).size).toBeGreaterThan(1);
  });
  it('deep על אובייקט', () => {
    expect(m.deep({ a: ['רן לוי'], n: 5 })).toEqual({ a: [m.alias('2')], n: 5 });
  });
  it('ניחוש מגדר זהיר', () => {
    expect(guessGender('דנה')).toBe('f'); expect(guessGender('רן')).toBe('m'); expect(guessGender('שיר')).toBeNull(); expect(guessGender('יהודה')).toBe('m');
  });
});
