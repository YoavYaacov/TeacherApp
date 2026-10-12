import { describe, expect, it } from 'vitest';
import { emptyDB, type DB } from '../data/types';
import { makeAliasMap } from './pseudo';
import { TOOLS, declarations, type ToolCtx } from './tools';
import { classSummary, movements, groupEvents, trend } from './analytics';

const S = (id: string, f: string, l: string) => ({ id, first_name: f, last_name: l, home_class: null, archived_at: null });
function fixture(): DB {
  const d = emptyDB();
  d.academic_years = [{ id: 'y', name: 'x', start_date: '2026-09-01', end_date: '2027-06-30', term1_start: '2026-09-01', term1_end: '2027-01-31', term2_start: '2027-02-01', term2_end: '2027-06-30', archived_at: null }];
  d.study_groups = [{ id: 'g', academic_year_id: 'y', name: 'י׳ 5 יח״ל', subject: 'מתמטיקה', grade_level: 'י', annual_weight_h1: 50, annual_weight_h2: 50, archived_at: null }];
  d.students = [S('a', 'דנה', 'כהן'), S('b', 'רן', 'לוי'), S('c', 'יוסי', 'אברהם'), S('d', 'מיה', 'שחר')];
  d.enrollments = d.students.map((s) => ({ id: 'e' + s.id, student_id: s.id, group_id: 'g', joined_at: '2026-09-01', left_at: null }));
  d.grade_categories = [{ id: 'c1', group_id: 'g', term: 1, name: 'מבחנים', weight: 100, event_weight_mode: 'equal', drop_lowest: false, sort_order: 0 }];
  d.assessment_events = ['t1', 't2', 't3'].map((id, i) => ({ id, group_id: 'g', term: 1 as const, category_id: 'c1', title: `מבחן ${i + 1}`, event_date: `2026-10-0${i + 1}`, weight: null, makeup_policy: 'best' as const, cancelled_at: null, sort_order: i }));
  const G = (e: string, s: string, v: number | null) => v === null ? [] : [{ event_id: e, student_id: s, attempt: 1 as const, status: 'score' as const, score: v }];
  // a: 70,70,95 (משתפר) | b: 80,80,50 (יורד) | c: 90,90,none (חסר באחרון) | d: 60,60,65
  d.grades = [...G('t1', 'a', 70), ...G('t2', 'a', 70), ...G('t3', 'a', 95), ...G('t1', 'b', 80), ...G('t2', 'b', 80), ...G('t3', 'b', 50), ...G('t1', 'c', 90), ...G('t2', 'c', 90), ...G('t1', 'd', 60), ...G('t2', 'd', 60), ...G('t3', 'd', 65)];
  d.calendar_events = [
    { id: 'l1', group_id: 'g', title: 't', start_at: '2026-10-05T08:00:00Z', end_at: '2026-10-05T08:45:00Z', status: 'confirmed', source: 'internal' },
    { id: 'l2', group_id: 'g', title: 't', start_at: '2026-10-06T08:00:00Z', end_at: '2026-10-06T08:45:00Z', status: 'confirmed', source: 'internal' },
    { id: 'l3', group_id: 'g', title: 't', start_at: '2026-10-20T08:00:00Z', end_at: '2026-10-20T08:45:00Z', status: 'confirmed', source: 'internal' },
  ];
  d.lesson_logs = [{ calendar_event_id: 'l1', topic: 'משוואות', learned: 'פתרון', homework: 'עמ׳ 5', private_note: 'סודי-דנה כהן', completion: 'done' }];
  return d;
}
const ctx = (db: DB, level: 'A' | 'B' = 'B'): ToolCtx => ({ db, alias: makeAliasMap(db.students, 'c'), now: new Date('2026-10-12T10:00:00Z'), level, groupId: 'g' });
const run = (n: string, db: DB, a: Record<string, unknown> = {}, level: 'A' | 'B' = 'B') => TOOLS.find((t) => t.name === n)!.run(ctx(db, level), a);

describe('אנליטיקה', () => {
  it('סטטיסטיקות הערכה וכיתה מחושבות נכון', () => {
    const db = fixture(); const g = db.study_groups[0];
    const ev = groupEvents(db, g, 1);
    expect(ev.map((e) => [e.n, e.avg])).toEqual([[4, 75], [4, 75], [3, 70]]);
    expect(ev[2].missing).toEqual(['c']);
    const s = classSummary(db, g, 1);
    expect(s.termCalc.get('a')).toBe(78.3); expect(s.avg).toBe(75); expect(s.median).toBe(74.2);
  });
  it('שינוי מתוקן בכיתה', () => {
    const db = fixture(); const mv = movements(groupEvents(db, db.study_groups[0], 1), ['a', 'b', 'c', 'd']);
    const a = mv.find((m) => m.studentId === 'a')!, b = mv.find((m) => m.studentId === 'b')!;
    expect(a.delta).toBe(25); expect(b.delta).toBe(-30);
    expect(a.classDelta).toBe(-5); // ממוצע המבחן האחרון 70 מול 75 לאותם מבחנים
    expect(a.adjusted).toBe(30); expect(mv.find((m) => m.studentId === 'c')).toBeUndefined(); // בלי ציון אחרון: לא מושווה
  });
  it('מגמה דורשת 3 ציונים', () => {
    expect(trend([70, 80]).label).toBe('אין מספיק נתונים'); expect(trend([60, 70, 80]).label).toBe('עלייה'); expect(trend([80, 79, 81]).label).toBe('יציב'); expect(trend([90, 80, 70]).label).toBe('ירידה');
  });
});

describe('כלים', () => {
  it('missing_grades: חסר לתלמיד אחד; מודל ברמה ב׳ עם כינוי, ברמה א׳ רק מספר', () => {
    const db = fixture();
    const b = run('missing_grades', db); const a = run('missing_grades', db, {}, 'A');
    expect(JSON.stringify(b.model)).toMatch(/ST-\d+/); expect(JSON.stringify(b.model)).not.toMatch(/יוסי|אברהם/);
    expect(b.blocks[0]).toMatchObject({ rows: [['אברהם יוסי']] });
    expect(JSON.stringify(a.model)).not.toMatch(/ST-/); expect((a.model as { missingCount: number }).missingCount).toBe(1);
  });
  it('class_stats: אין שמות במודל גם ברמה ב׳ (כינויים בלבד), ואין נתוני תלמידים ברמה א׳', () => {
    const db = fixture(); const b = JSON.stringify(run('class_stats', db).model), a = JSON.stringify(run('class_stats', db, {}, 'A').model);
    expect(b).not.toMatch(/דנה|כהן|רן|לוי|אברהם|שחר|מיה/); expect(b).toMatch(/ST-/); expect(a).not.toMatch(/ST-/);
    expect(a).toContain('"avg":75,');
  });
  it('lessons_taught לא חושף הערה פרטית', () => {
    const db = fixture(); const r = run('lessons_taught', db, { from: '2026-10-01', to: '2026-10-12' });
    expect(JSON.stringify(r)).not.toContain('סודי'); expect(JSON.stringify(r.model)).toContain('משוואות');
  });
  it('undocumented_lessons ו-lesson_count', () => {
    const db = fixture();
    expect((run('undocumented_lessons', db).model as { count: number }).count).toBe(1); // l2 בלבד; l3 עתידי; l1 מתועד
    expect(run('lesson_count', db, { month: '2026-10' }).model).toMatchObject({ held: 2, planned: 1 });
  });
  it('student_profile לפי כינוי', () => {
    const db = fixture(); const c = ctx(db); const alias = c.alias.alias('b');
    const r = TOOLS.find((t) => t.name === 'student_profile')!.run(c, { student: alias });
    expect(r.summary).toContain('3 ציונים'); expect(JSON.stringify(r.model)).not.toMatch(/רן|לוי/);
    expect((r.blocks[0] as { title: string }).title).toContain('לוי רן');
  });
  it('top_movers מסדר לפי שינוי מתוקן', () => {
    const db = fixture(); const up = run('top_movers', db, { direction: 'up' }); const dn = run('top_movers', db, { direction: 'down' });
    expect((up.blocks[0] as { rows: string[][] }).rows[0][0]).toBe('כהן דנה'); expect((dn.blocks[0] as { rows: string[][] }).rows[0][0]).toBe('לוי רן');
  });
  it('רמה א׳ לא חושפת כלים ברמת תלמיד למודל', () => {
    const names = (declarations('A')[0].functionDeclarations).map((f) => f.name);
    expect(names).not.toContain('student_profile'); expect(names).not.toContain('missing_grades'); expect(names).toContain('class_stats');
    expect(declarations('B')[0].functionDeclarations.map((f) => f.name)).toContain('student_profile');
  });
});
