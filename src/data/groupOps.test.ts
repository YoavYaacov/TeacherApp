import { describe, expect, it } from 'vitest';
import { emptyDB, type DB } from './types';
import { deleteGroup, deleteGroupLessons, restoreHidden } from './groupOps';

const base = (): DB => {
  const d = emptyDB();
  d.study_groups = [{ id: 'g1', archived_at: '2026-01-01' }, { id: 'g2', archived_at: null }] as never;
  d.students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }] as never;
  d.enrollments = [{ id: 'e1', student_id: 's1', group_id: 'g1' }, { id: 'e2', student_id: 's2', group_id: 'g1' }, { id: 'e3', student_id: 's2', group_id: 'g2' }] as never;
  d.grade_categories = [{ id: 'c1', group_id: 'g1' }, { id: 'c2', group_id: 'g2' }] as never;
  d.assessment_events = [{ id: 'a1', group_id: 'g1' }, { id: 'a2', group_id: 'g2' }] as never;
  d.grades = [{ event_id: 'a1', student_id: 's1' }, { event_id: 'a2', student_id: 's2' }] as never;
  d.final_grades = [{ group_id: 'g1', student_id: 's1' }, { group_id: 'g2', student_id: 's2' }] as never;
  d.calendar_events = [{ id: 'i1', group_id: 'g1', source: 'internal' }, { id: 'x1', group_id: 'g1', source: 'google' }, { id: 'x2', group_id: 'g2', source: 'google' }] as never;
  d.lesson_logs = [{ calendar_event_id: 'i1' }, { calendar_event_id: 'x1' }, { calendar_event_id: 'x2' }] as never;
  return d;
};

describe('פעולות קבוצה בארכיון', () => {
  it('מחיקת קבוצה: מוחק את שלה בלבד, שומר תלמיד משותף, מסתיר אירוע Google', () => {
    const { db, res } = deleteGroup(base(), 'g1');
    expect(db.study_groups.map((g) => g.id)).toEqual(['g2']);
    expect(db.students.map((s) => s.id).sort()).toEqual(['s2', 's3']); // s1 נמחק; s2 בקבוצה אחרת; s3 לא היה בקבוצה
    expect(db.grades).toHaveLength(1); expect(db.final_grades).toHaveLength(1);
    expect(db.assessment_events.map((e) => e.id)).toEqual(['a2']);
    expect(db.calendar_events.find((e) => e.id === 'i1')).toBeUndefined();
    expect(db.calendar_events.find((e) => e.id === 'x1')).toMatchObject({ hidden: true, group_id: null });
    expect(db.calendar_events.find((e) => e.id === 'x2')).toMatchObject({ group_id: 'g2' });
    expect(db.lesson_logs.map((l) => l.calendar_event_id)).toEqual(['x2']);
    expect(res).toEqual({ events: { deleted: 1, hidden: 1 }, students_deleted: 1 });
  });
  it('מסרב לקבוצה פעילה', () => {
    expect(() => deleteGroup(base(), 'g2')).toThrow();
    expect(() => deleteGroupLessons(base(), 'g2')).toThrow();
  });
  it('מחיקת שיעורים משאירה קבוצה, תלמידים וציונים', () => {
    const { db } = deleteGroupLessons(base(), 'g1');
    expect(db.study_groups).toHaveLength(2); expect(db.grades).toHaveLength(2); expect(db.students).toHaveLength(3);
    expect(db.calendar_events.map((e) => e.id).sort()).toEqual(['x1', 'x2']);
  });
  it('שחזור מוסתרים', () => {
    const r = restoreHidden(deleteGroup(base(), 'g1').db);
    expect(r.n).toBe(1); expect(r.db.calendar_events.every((e) => !e.hidden)).toBe(true);
  });
});
