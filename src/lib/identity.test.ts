import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidIlId, maskDigits, splitIdFromLine, xlsxToText } from './identity';
import { buildXlsx } from './xlsx';
import { parseStudentLine } from './util';
import { TABLES } from '../data/types';

const read = (p: string) => readFileSync(p, 'utf8');
/** מקור בלי הערות (כדי שהזכרת מילה בהערה לא תיחשב שימוש) */
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|--)/.test(l)).join('\n');

describe('אימות ת"ז', () => {
  it('מקבל תקינות ומרפד באפסים', () => { expect(isValidIlId('123456782')).toBe(true); expect(isValidIlId('000000018')).toBe(true); expect(isValidIlId('18')).toBe(false); expect(isValidIlId('1 2 3 4 5 6 7 8 2')).toBe(true); });
  it('דוחה ספרת ביקורת, פורמט ואפסים', () => { for (const b of ['123456789', '12ab', '', '000000000', '1234567890']) expect(isValidIlId(b)).toBe(false); });
});

describe('הפרדת ת"ז משורה', () => {
  it('שורה רגילה (טאבים): התא המספרי יוצא והשם נשאר', () => {
    const r = splitIdFromLine('כהן\tדני\tז׳1\t123456782');
    expect(r.id).toBe('123456782'); expect(r.line).not.toMatch(/\d{5}/);
    expect(parseStudentLine(r.line)).toMatchObject({ last: 'כהן', first: 'דני', cls: 'ז׳1' });
  });
  it('ת"ז באמצע השורה', () => { const r = splitIdFromLine('123456782\tכהן\tדני'); expect(r.id).toBe('123456782'); expect(parseStudentLine(r.line)).toMatchObject({ last: 'כהן', first: 'דני' }); });
  it('שורת משו"ב: הת"ז נלקחת מהעמודה השנייה', () => { expect(splitIdFromLine('3\t123456782\tכהן דני\tז\tז\t1').id).toBe('123456782'); });
  it('בלי ת"ז', () => { expect(splitIdFromLine('כהן\tדני\tז׳1')).toEqual({ line: 'כהן\tדני\tז׳1', id: null }); });
  it('התצוגה מסווה ספרות ארוכות', () => { expect(maskDigits('כהן 123456782 דני')).not.toMatch(/\d{5}/); });
});

describe('קובץ Excel', () => {
  it('קורא גיליון לטקסט מופרד בטאבים, כולל ת"ז כטקסט', () => {
    const bytes = buildXlsx([{ name: 'a', rows: [['משפחה', 'פרטי', 'ת"ז'], ['כהן', 'דני', '123456782'], ['לוי', 'מיכל', '000000018']] }]);
    const t = xlsxToText(bytes);
    const lines = t.split('\n');
    expect(lines.length).toBe(3);
    expect(splitIdFromLine(lines[1]).id).toBe('123456782');
    expect(splitIdFromLine(lines[2]).id).toBe('000000018');
  });
});

describe('אבטחה: הת"ז לא נכנסת לטבלאות, לגיבוי, לאחסון מקומי או ללוגים', () => {
  it('אין טבלת זהויות ב-TABLES (ולכן לא ב-select * ולא בייצוא)', () => { for (const t of TABLES) expect(String(t)).not.toMatch(/ident|tz/i); });
  it('הגיבוי בשרת אינו כולל את טבלת הזהויות', () => {
    const m = read('supabase/migrations/0002_backup_restore.sql');
    expect(m).not.toMatch(/student_identity/);
    const m9 = read('supabase/migrations/0009_student_identity.sql');
    expect(m9).not.toMatch(/create or replace function (teacherapp\.)?backup_tables/);
  });
  it('סוג Student ו-students ללא שדה ת"ז', () => {
    const t = read('src/data/types.ts');
    const block = /interface Student\b[\s\S]*?\n}/.exec(t)?.[0] ?? '';
    expect(block).toContain('first_name');
    expect(block).not.toMatch(/id_number|tz|identity|national/i);
  });
  it('אין localStorage / sessionStorage / console בקוד הת"ז', () => {
    for (const p of ['src/lib/identity.ts']) expect(code(p)).not.toMatch(/localStorage|sessionStorage|console\.|indexedDB/);
    const ui = read('src/ui/pages/StudentsTab.tsx');
    expect(ui).not.toMatch(/localStorage|sessionStorage|console\./);
  });
  it('הממשק לא מציג ערך ת"ז שנשלף מהשרת: אין RPC שמחזיר ת"ז', () => {
    const m9 = read('supabase/migrations/0009_student_identity.sql');
    expect(m9).not.toMatch(/pgp_sym_decrypt\([^)]*\)\s*(into|as)\s+(text|id)/i);
    const funcs = [...m9.matchAll(/create or replace function teacherapp\.(\w+)\(([^)]*)\)\s*returns (\w+(\[\])?)/g)].map((m) => `${m[1]}:${m[3]}`);
    expect(funcs).toEqual(expect.arrayContaining(['students_with_id:uuid[]', 'import_students_with_ids:jsonb', 'identity_status:jsonb']));
    expect(funcs.some((f) => /:(text|bytea)$/.test(f))).toBe(false);
  });
  it('כל השמות במיגרציה מוגדרים עם סכמה (לא public)', () => {
    const m9 = code('supabase/migrations/0009_student_identity.sql');
    expect(m9).not.toMatch(/\bpublic\./);
    for (const m of m9.matchAll(/create (?:or replace )?(function|table) (?:if not exists )?([\w.]+)/g)) expect(m[2]).toMatch(/^teacherapp(_private)?\./);
  });
  it('הרשאות: אין grant לטבלה ול-anon', () => {
    const m9 = read('supabase/migrations/0009_student_identity.sql');
    expect(m9).toMatch(/revoke all on teacherapp_private\.student_identity/);
    expect(m9).not.toMatch(/grant (select|insert|update|delete|all)/i);
    expect(m9).not.toMatch(/to anon/);
  });
  it('מפתח נפרד מזה של "הבנתי"', () => { const m9 = read('supabase/migrations/0009_student_identity.sql'); expect(m9).toContain('teacherapp_identity_key'); expect(m9).not.toContain('hevanti_identity_key'); });
  it('חבילת גיבוי: חתימה בשרת, אין אחסון מקומי, מוצגת בענן בלבד, ללא ערכי ת"ז', () => {
    const m9 = code('supabase/migrations/0009_student_identity.sql');
    expect(m9).toMatch(/hmac\(/); expect(m9).toContain("'mac'"); expect(m9).toContain("'ta-identity-v1'");
    const ui = code('src/ui/pages/IdentityBackup.tsx');
    expect(ui).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(code('src/ui/pages/BackupPanel.tsx')).toContain('{cloud && <IdentityBackup />}');
  });
  it('מחיקה לצמיתות מנקה זהויות ולא יוצרת גיבוי זהויות חדש', () => {
    const m9 = code('supabase/migrations/0009_student_identity.sql');
    const del = /function teacherapp\.delete_study_group[\s\S]*?end \$\$;/.exec(m9)?.[0] ?? '';
    expect(del).toContain('teacherapp_private.purge(');
    expect(del).not.toContain('identity_backup_create');
  });
  it('גיבויים פנימיים: עד 14 יום ו-3 לכל היותר', () => {
    const m9 = code('supabase/migrations/0009_student_identity.sql');
    expect(m9).toContain("interval '14 days'"); expect(m9).toContain('limit 3');
  });
});
