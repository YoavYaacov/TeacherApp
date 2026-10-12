import type { DB, StudyGroup, Student, AcademicYear } from '../data/types';
import { iso } from './util';

export const activeEnrollments = (db: DB, groupId: string) => db.enrollments.filter((e) => e.group_id === groupId && !e.left_at);
export const activeStudents = (db: DB, groupId: string): Student[] =>
  activeEnrollments(db, groupId).map((e) => db.students.find((s) => s.id === e.student_id)).filter((s): s is Student => !!s);

export function defaultYear(now = new Date()): Omit<AcademicYear, 'id' | 'archived_at'> {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `${y}–${y + 1}`, start_date: iso(new Date(y, 8, 1)), end_date: iso(new Date(y + 1, 5, 30)),
    term1_start: iso(new Date(y, 8, 1)), term1_end: iso(new Date(y + 1, 0, 31)),
    term2_start: iso(new Date(y + 1, 1, 1)), term2_end: iso(new Date(y + 1, 5, 30)),
  };
}
/** מחצית פעילה לפי תאריכי שנת הלימודים; fallback מחצית א׳ */
export function activeTerm(year: AcademicYear | undefined, now = new Date()): 1 | 2 {
  if (!year) return 1;
  const t = iso(now);
  if (t >= year.term2_start && t <= year.term2_end) return 2;
  return 1;
}
export const groupYear = (db: DB, g: StudyGroup) => db.academic_years.find((y) => y.id === g.academic_year_id);
export const label = (s: Student) => `${s.last_name} ${s.first_name}`;
