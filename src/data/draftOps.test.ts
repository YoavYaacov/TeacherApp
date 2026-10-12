import { describe, expect, it } from 'vitest';
import { emptyDB } from './types';
import { applyDraftLocal } from './draftOps';
const base = () => { const d = emptyDB();
  d.enrollments = [{ id: 'e', student_id: 's', group_id: 'g', joined_at: '', left_at: null }];
  d.calendar_events = [{ id: 'ev', group_id: 'g', title: 't', start_at: '', end_at: '', status: 'confirmed', source: 'internal' }, { id: 'ev2', group_id: null, title: 't', start_at: '', end_at: '', status: 'confirmed', source: 'internal' }];
  d.lesson_logs = [{ calendar_event_id: 'ev', topic: 'ישן', learned: 'קיים', homework: null, private_note: 'סוד', completion: 'pending' }];
  d.ai_drafts = [
    { id: 'd1', conversation_id: null, kind: 'lesson_log', target: { calendar_event_id: 'ev' }, payload: { topic: 'חדש', learned: 'נוסף', homework: 'ש״ב', mark_done: true }, status: 'pending', created_at: '', applied_at: null },
    { id: 'd2', conversation_id: null, kind: 'evaluation', target: { group_id: 'g', student_id: 's', period: 'h1' }, payload: { text: 'טוב' }, status: 'pending', created_at: '', applied_at: null },
    { id: 'd3', conversation_id: null, kind: 'lesson_log', target: { calendar_event_id: 'ev2' }, payload: { learned: 'x' }, status: 'pending', created_at: '', applied_at: null },
  ];
  return d; };
describe('ביצוע טיוטה (מצב מקומי)', () => {
  it('fill לא דורס; ממלא ריק; לא נוגע בהערה פרטית; mark_done', () => {
    const l = applyDraftLocal(base(), 'd1', null, 'fill').lesson_logs[0];
    expect(l).toMatchObject({ topic: 'ישן', learned: 'קיים', homework: 'ש״ב', private_note: 'סוד', completion: 'done' });
  });
  it('append / replace', () => {
    expect(applyDraftLocal(base(), 'd1', null, 'append').lesson_logs[0].learned).toBe('קיים\n\nנוסף');
    expect(applyDraftLocal(base(), 'd1', null, 'replace').lesson_logs[0].learned).toBe('נוסף');
  });
  it('טיוטה לא מבוצעת פעמיים; שיעור לא משויך נדחה; מצב לא חוקי', () => {
    const once = applyDraftLocal(base(), 'd1', null, 'fill');
    expect(() => applyDraftLocal(once, 'd1', null, 'fill')).toThrow('כבר טופלה');
    expect(() => applyDraftLocal(base(), 'd3', null, 'fill')).toThrow('אינו משויך');
    expect(() => applyDraftLocal(base(), 'd1', null, 'x' as never)).toThrow();
  });
  it('הערכה: נשמרת, חוזרת מעדכנת, תלמיד לא רשום נדחה', () => {
    const a = applyDraftLocal(base(), 'd2', { text: 'ערוך' }, 'fill');
    expect(a.ai_evaluations).toHaveLength(1); expect(a.ai_evaluations[0].text).toBe('ערוך'); expect(a.ai_drafts.find((x) => x.id === 'd2')!.status).toBe('applied');
    const d = base(); d.enrollments = [];
    expect(() => applyDraftLocal(d, 'd2', null, 'fill')).toThrow('אינו רשום');
  });
});
