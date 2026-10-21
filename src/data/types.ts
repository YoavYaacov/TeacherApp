// שורות DB (שמות עמודות זהים לסכמה כדי שה-Repo יהיה דק).
export interface AcademicYear { id: string; name: string; start_date: string; end_date: string; term1_start: string; term1_end: string; term2_start: string; term2_end: string; archived_at: string | null }
export interface StudyGroup { id: string; academic_year_id: string; name: string; subject: string; grade_level: string | null; annual_weight_h1: number; annual_weight_h2: number; archived_at: string | null }
export interface Student { id: string; first_name: string; last_name: string; home_class: string | null; archived_at: string | null; gender?: 'm' | 'f' | null }
export interface Enrollment { id: string; student_id: string; group_id: string; joined_at: string; left_at: string | null }
export interface GradeCategory { id: string; group_id: string; term: 1 | 2; name: string; weight: number; event_weight_mode: 'equal' | 'custom'; drop_lowest: boolean; sort_order: number }
export interface AssessmentEventRow { id: string; group_id: string; term: 1 | 2; category_id: string; title: string; event_date: string | null; weight: number | null; makeup_policy: 'best' | 'latest' | 'average'; cancelled_at: string | null; sort_order: number }
export interface GradeRow { event_id: string; student_id: string; attempt: 1 | 2; status: 'score' | 'exempt' | 'absent'; score: number | null }
export interface PolicyOverride { event_id: string; student_id: string; policy: 'best' | 'latest' | 'average' }
export interface FinalGradeRow { group_id: string; student_id: string; period: 'h1' | 'h2' | 'annual'; value: number; source: 'approved' | 'override'; basis_calculated: number | null }
export interface CalendarEvent { id: string; group_id: string | null; title: string; start_at: string; end_at: string; status: 'confirmed' | 'cancelled'; source: 'internal' | 'google'; local_dirty?: boolean; google_calendar_id?: string | null; google_event_id?: string | null; recurring_event_id?: string | null; etag?: string | null; all_day?: boolean; hidden?: boolean }
export interface LessonLog { calendar_event_id: string; topic: string | null; learned: string | null; homework: string | null; private_note: string | null; completion: 'pending' | 'done' | 'not_needed' }
export type AiContext = { kind: 'system' } | { kind: 'group'; group_id: string } | { kind: 'student'; group_id: string; student_id: string } | { kind: 'lesson'; group_id: string; event_id: string };
export interface AiConversation { id: string; title: string; context: AiContext; created_at: string; updated_at: string }
export interface AiMessage { id: string; conversation_id: string; role: 'user' | 'assistant'; content: string; blocks: unknown[]; sources: unknown[]; created_at: string }
export interface AiDraft { id: string; conversation_id: string | null; kind: 'lesson_log' | 'evaluation'; target: Record<string, string>; payload: Record<string, unknown>; status: 'pending' | 'applied' | 'cancelled'; created_at: string; applied_at: string | null }
export interface AiEvaluation { id: string; group_id: string; student_id: string; period: 'h1' | 'h2' | 'annual'; text: string; params: Record<string, unknown>; created_at: string; updated_at: string }
/** שעות נוספות: רשומה אחת לכל חודש לועזי (שנה+חודש 1–12) */
export interface OvertimeHours { year: number; month: number; frontal_hours: number; pedagogical_hours: number }
export interface UserSettings { id: true; theme: string; prefs: Record<string, unknown> }

export interface DB {
  academic_years: AcademicYear[]; study_groups: StudyGroup[]; students: Student[]; enrollments: Enrollment[];
  grade_categories: GradeCategory[]; assessment_events: AssessmentEventRow[]; grades: GradeRow[];
  grade_policy_overrides: PolicyOverride[]; final_grades: FinalGradeRow[];
  calendar_events: CalendarEvent[]; lesson_logs: LessonLog[]; user_settings: UserSettings[];
  ai_conversations: AiConversation[]; ai_messages: AiMessage[]; ai_drafts: AiDraft[]; ai_evaluations: AiEvaluation[];
  overtime_hours: OvertimeHours[];
}
export type TableName = keyof DB;
export const TABLES: TableName[] = ['academic_years','study_groups','students','enrollments','grade_categories','assessment_events','grades','grade_policy_overrides','final_grades','calendar_events','lesson_logs','user_settings','ai_conversations','ai_messages','ai_drafts','ai_evaluations','overtime_hours'];
/** מפתחות ייחודיים לצורך upsert (ברירת מחדל: id) */
export const CONFLICT: Partial<Record<TableName, string>> = {
  grades: 'event_id,student_id,attempt', grade_policy_overrides: 'event_id,student_id',
  final_grades: 'group_id,student_id,period', lesson_logs: 'calendar_event_id', user_settings: 'id', overtime_hours: 'year,month',
};
export const emptyDB = (): DB => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;
