import { describe, expect, it } from 'vitest';
import { emptyDB } from '../data/types';
import { computeInsights } from './insights';

const S = (id: string, f: string) => ({ id, first_name: f, last_name: 'ל', home_class: null, archived_at: null });
function db() {
  const d = emptyDB();
  d.academic_years = [{ id: 'y', name: 'x', start_date: '2026-09-01', end_date: '2027-06-30', term1_start: '2026-09-01', term1_end: '2027-01-31', term2_start: '2027-02-01', term2_end: '2027-06-30', archived_at: null }];
  d.study_groups = [{ id: 'g', academic_year_id: 'y', name: 'י׳ 5', subject: 'מתמטיקה', grade_level: 'י', annual_weight_h1: 50, annual_weight_h2: 50, archived_at: null }];
  d.students = [S('a', 'דנה'), S('b', 'רן'), S('c', 'יוסי'), S('d', 'מיה')];
  d.enrollments = d.students.map((s) => ({ id: 'e' + s.id, student_id: s.id, group_id: 'g', joined_at: '2026-09-01', left_at: null }));
  d.grade_categories = [{ id: 'c1', group_id: 'g', term: 1, name: 'מבחנים', weight: 100, event_weight_mode: 'equal', drop_lowest: false, sort_order: 0 }];
  d.assessment_events = ['t1', 't2', 't3'].map((id, i) => ({ id, group_id: 'g', term: 1 as const, category_id: 'c1', title: `מבחן ${i + 1}`, event_date: `2026-10-0${i + 1}`, weight: null, makeup_policy: 'best' as const, cancelled_at: null, sort_order: i }));
  const G = (e: string, s: string, v: number) => ({ event_id: e, student_id: s, attempt: 1 as const, status: 'score' as const, score: v });
  d.grades = [G('t1', 'a', 80), G('t2', 'a', 80), G('t3', 'a', 80), G('t1', 'b', 90), G('t2', 'b', 90), G('t3', 'b', 50), G('t1', 'c', 70), G('t2', 'c', 70), G('t1', 'd', 70), G('t2', 'd', 70), G('t3', 'd', 80)];
  return d;
}
describe('תובנות בדף הבית', () => {
  it('מזהה ציון חסר, ירידה ותיעודים; מכבד הסתרה', () => {
    const d = db();
    const ins = computeInsights(d, [{ id: 'x', group_id: 'g' }], {});
    const kinds = ins.map((i) => i.kind);
    expect(kinds).toContain('docs'); expect(kinds).toContain('grades'); expect(kinds).toContain('drop');
    expect(ins.length).toBeLessThanOrEqual(4);
    const hidden = computeInsights(d, [{ id: 'x', group_id: 'g' }], Object.fromEntries(ins.map((i) => [i.id, 'x'])));
    expect(hidden).toEqual([]);
  });
  it('בלי נתונים אין תובנות; קבוצה בארכיון מדולגת', () => {
    expect(computeInsights(emptyDB(), [], {})).toEqual([]);
    const d = db(); d.study_groups[0].archived_at = '2026-10-01';
    expect(computeInsights(d, [], {})).toEqual([]);
  });
});
