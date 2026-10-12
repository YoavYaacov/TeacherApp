import type { DB } from './types';

/** פעולות על קבוצה במצב מקומי; משקפות את פונקציות ה-SQL ב-0004. טהור: מחזיר DB חדש. */
export interface DropResult { deleted: number; hidden: number }

function dropEvents(db: DB, groupId: string): { db: DB; res: DropResult } {
  const mine = db.calendar_events.filter((e) => e.group_id === groupId);
  const ids = new Set(mine.map((e) => e.id));
  const internal = new Set(mine.filter((e) => e.source === 'internal').map((e) => e.id));
  return {
    res: { deleted: internal.size, hidden: mine.length - internal.size },
    db: {
      ...db,
      lesson_logs: db.lesson_logs.filter((l) => !ids.has(l.calendar_event_id)),
      calendar_events: db.calendar_events.filter((e) => !internal.has(e.id)).map((e) => (ids.has(e.id) ? { ...e, hidden: true, group_id: null } : e)),
    },
  };
}

export function deleteGroupLessons(db: DB, groupId: string) {
  const g = db.study_groups.find((x) => x.id === groupId);
  if (!g) throw new Error('הקבוצה לא נמצאה');
  if (!g.archived_at) throw new Error('אפשר למחוק שיעורים רק של קבוצה בארכיון');
  return dropEvents(db, groupId);
}

export function deleteGroup(db: DB, groupId: string) {
  const g = db.study_groups.find((x) => x.id === groupId);
  if (!g) throw new Error('הקבוצה לא נמצאה');
  if (!g.archived_at) throw new Error('אפשר למחוק לצמיתות רק קבוצה שהועברה לארכיון');
  const sids = new Set(db.enrollments.filter((e) => e.group_id === groupId).map((e) => e.student_id));
  const { db: d1, res } = dropEvents(db, groupId);
  const evIds = new Set(d1.assessment_events.filter((e) => e.group_id === groupId).map((e) => e.id));
  const d2: DB = {
    ...d1,
    grades: d1.grades.filter((x) => !evIds.has(x.event_id)),
    grade_policy_overrides: d1.grade_policy_overrides.filter((x) => !evIds.has(x.event_id)),
    final_grades: d1.final_grades.filter((x) => x.group_id !== groupId),
    assessment_events: d1.assessment_events.filter((x) => x.group_id !== groupId),
    grade_categories: d1.grade_categories.filter((x) => x.group_id !== groupId),
    enrollments: d1.enrollments.filter((x) => x.group_id !== groupId),
    study_groups: d1.study_groups.filter((x) => x.id !== groupId),
    ai_evaluations: d1.ai_evaluations.filter((x) => x.group_id !== groupId),
  };
  const keep = (id: string) => d2.enrollments.some((e) => e.student_id === id) || d2.grades.some((x) => x.student_id === id) || d2.final_grades.some((x) => x.student_id === id) || d2.grade_policy_overrides.some((x) => x.student_id === id);
  const gone = [...sids].filter((id) => !keep(id));
  const drop = new Set(gone);
  return { db: { ...d2, students: d2.students.filter((s) => !drop.has(s.id)), ai_evaluations: d2.ai_evaluations.filter((x) => !drop.has(x.student_id)) }, res: { events: res, students_deleted: gone.length } };
}

export function restoreHidden(db: DB) {
  const n = db.calendar_events.filter((e) => e.hidden).length;
  return { db: { ...db, calendar_events: db.calendar_events.map((e) => (e.hidden ? { ...e, hidden: false } : e)) }, n };
}
