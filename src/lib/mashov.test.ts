import { describe, expect, it } from 'vitest';
import { parseMashovLine, parseStudentLine } from './util';

describe('ייבוא ממשו"ב', () => {
  it('שורה מלאה: משפחה, פרטי, שם נוסף, מין, כיתה', () => {
    const p = parseStudentLine("4\t337037808\tאשכנזי שלמה מיכאל\tז\tט\t3\t22/07/2012\tרעננה\tאחד העם 32 מיקוד 4321117");
    expect(p).toEqual({ last: 'אשכנזי', first: 'שלמה מיכאל', cls: 'ט׳3', gender: 'm', mashov: true });
  });
  it('שם בשני חלקים וכתובת עם גרשיים', () => {
    const p = parseMashovLine('31\t336872684\tקולודני רפאל נתנאל\tז\tט\t1\t20/04/2012\tרעננה\t"אח""י דקר 60 מיקוד 4325995"');
    expect(p?.last).toBe('קולודני'); expect(p?.first).toBe('רפאל נתנאל'); expect(p?.cls).toBe('ט׳1');
  });
  it('נקבה, ושורות כותרת אינן תלמידים', () => {
    expect(parseMashovLine('1\t217493568\tכהן דנה\tנ\tי\t2\t01/01/2011\tx\ty')?.gender).toBe('f');
    expect(parseMashovLine("מס'\tת.ז\tשם התלמיד\tמין\tשכבה\tמקבילה\tתאריך לידה\tישוב 1\tכתובת 1")).toBeNull();
    expect(parseMashovLine('עתודה מדעית -מתמטיקה ט1-ט6 יעקב יואב (101) - אלפון')).toBeNull();
  });
  it('הפורמט הפשוט הישן עדיין עובד', () => {
    expect(parseStudentLine('כהן\tדני\tז1')).toEqual({ last: 'כהן', first: 'דני', cls: 'ז׳1' });
  });
});
