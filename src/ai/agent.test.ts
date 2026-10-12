import { describe, expect, it } from 'vitest';
import { runTurn, outputBudget, trimCut, CONTINUE_TEXT } from './agent';
import { DEFAULT_PREFS } from './prefs';
import type { GenFn, GenReq } from './gemini';
import { emptyDB, type DB } from '../data/types';

function fixture(): DB {
  const d = emptyDB();
  d.academic_years = [{ id: 'y', name: 'x', start_date: '2026-09-01', end_date: '2027-06-30', term1_start: '2026-09-01', term1_end: '2027-01-31', term2_start: '2027-02-01', term2_end: '2027-06-30', archived_at: null }];
  d.study_groups = [{ id: 'g', academic_year_id: 'y', name: 'י׳ 5 יח״ל', subject: 'מתמטיקה', grade_level: 'י', annual_weight_h1: 50, annual_weight_h2: 50, archived_at: null }];
  d.students = [{ id: 'a', first_name: 'דנה', last_name: 'כהן', home_class: null, archived_at: null }, { id: 'b', first_name: 'רן', last_name: 'לוי', home_class: null, archived_at: null }];
  d.enrollments = d.students.map((s) => ({ id: 'e' + s.id, student_id: s.id, group_id: 'g', joined_at: '2026-09-01', left_at: null }));
  d.grade_categories = [{ id: 'c1', group_id: 'g', term: 1, name: 'מבחנים', weight: 100, event_weight_mode: 'equal', drop_lowest: false, sort_order: 0 }];
  d.assessment_events = [{ id: 't1', group_id: 'g', term: 1, category_id: 'c1', title: 'מבחן 1', event_date: '2026-10-01', weight: null, makeup_policy: 'best', cancelled_at: null, sort_order: 0 }];
  d.grades = [{ event_id: 't1', student_id: 'a', attempt: 1, status: 'score', score: 80 }];
  return d;
}
const conv = { id: 'conv-1', title: 't', context: { kind: 'system' as const }, created_at: '', updated_at: '' };
const noAI: GenFn = async () => { throw new Error('לא אמור לקרוא ל-AI'); };

describe('סוכן', () => {
  it('שאלה עובדתית נענית בקוד בלי AI', async () => {
    const r = await runTurn({ db: fixture(), conv, history: [], text: 'מי אין לו ציון במבחן האחרון בי׳ 5 יח״ל?', prefs: DEFAULT_PREFS, gen: noAI });
    expect(r.ok && !r.usedAI && r.text.includes('1 תלמידים')).toBe(true);
    expect(r.ok && JSON.stringify(r.blocks)).toContain('לוי רן');
  });
  it('שאלה חופשית: AI עם כלי, כינויים ל-Gemini ושמות בתצוגה', async () => {
    const seen: GenReq[] = []; let n = 0;
    const gen: GenFn = async (req) => {
      seen.push(JSON.parse(JSON.stringify(req))); n++;
      if (n === 1) return { ok: true, text: '', functionCalls: [{ name: 'class_stats', args: { group: 'י׳ 5 יח״ל' } }], modelContent: { role: 'model', parts: [{ functionCall: { name: 'class_stats', args: {} } }] }, redacted: 0, used: 1, limit: 100, usage: { in: 1, out: 1 } };
      const alias = /ST-\d+/.exec(JSON.stringify(req.contents))?.[0] ?? 'ST-0';
      return { ok: true, text: `הממוצע 80. ${alias} בלי ציון.`, functionCalls: [], modelContent: null, redacted: 0, used: 2, limit: 100, usage: { in: 1, out: 1 } };
    };
    const r = await runTurn({ db: fixture(), conv, history: [], text: 'תן לי תמונת מצב על רן לוי בכיתה', prefs: DEFAULT_PREFS, gen });
    expect(JSON.stringify(seen)).not.toMatch(/רן|לוי|דנה|כהן/);       // שום שם לא יצא
    expect(seen[0].contents).toHaveLength(1);
    expect(r.ok && r.usedAI && r.blocks.length > 0 && r.sources.length > 0).toBe(true);
    expect(r.ok && r.text).toMatch(/רן לוי|דנה כהן/);                 // הכינוי הוחזר לשם בתצוגה בלבד
  });
  it('רמה א׳: כלי תלמידים לא מוצהרים למודל', async () => {
    let tools: unknown;
    const gen: GenFn = async (req) => { tools = req.tools; return { ok: true, text: 'שלום', functionCalls: [], modelContent: null, redacted: 0, used: 1, limit: 1, usage: { in: 0, out: 0 } }; };
    await runTurn({ db: fixture(), conv, history: [], text: 'שלום, מה שלומך', prefs: { ...DEFAULT_PREFS, level: 'A' }, gen });
    expect(JSON.stringify(tools)).not.toContain('student_profile'); expect(JSON.stringify(tools)).toContain('class_stats');
  });
  it('שגיאת מכסה מועברת כמות שהיא', async () => {
    const gen: GenFn = async () => ({ ok: false, error: 'quota_exhausted', message: 'נגמרה' });
    const r = await runTurn({ db: fixture(), conv, history: [], text: 'ספר לי בדיחה על מתמטיקה', prefs: DEFAULT_PREFS, gen });
    expect(!r.ok && r.error).toBe('quota_exhausted');
  });
  it('היסטוריה נשלחת מכוּנה', async () => {
    let sent = '';
    const gen: GenFn = async (req) => { sent = JSON.stringify(req.contents); return { ok: true, text: 'בסדר', functionCalls: [], modelContent: null, redacted: 0, used: 1, limit: 1, usage: { in: 0, out: 0 } }; };
    const history = [{ id: 'm', conversation_id: 'conv-1', role: 'assistant' as const, content: 'דנה כהן שיפרה', blocks: [], sources: [], created_at: '' }];
    await runTurn({ db: fixture(), conv, history, text: 'המשך', prefs: DEFAULT_PREFS, gen });
    expect(sent).not.toMatch(/דנה|כהן/); expect(sent).toMatch(/ST-/);
  });

  describe('תשובות שנקטעות', () => {
    const okGen = (text: string, finishReason: string | null, seen?: { req?: unknown[] }): GenFn => async (req) => { seen?.req?.push(req); return { ok: true, text, functionCalls: [], modelContent: null, redacted: 0, used: 1, limit: 9, usage: { in: 1, out: 1 }, finishReason }; };
    it('finishReason=MAX_TOKENS מסמן truncated וחותך נוסחה פתוחה', async () => {
      const r = await runTurn({ db: fixture(), conv, history: [], text: 'פתור את המשוואה', prefs: DEFAULT_PREFS, gen: okGen('שלב 1: $x^2 + 3x', 'MAX_TOKENS') });
      expect(r.ok && r.truncated).toBe(true); expect(r.ok && r.text).toBe('שלב 1:');
    });
    it('תשובה רגילה לא מסומנת; נקטעה בלי טקסט => הודעה ברורה', async () => {
      const a = await runTurn({ db: fixture(), conv, history: [], text: 'שלום, מה נשמע', prefs: DEFAULT_PREFS, gen: okGen('שלום', 'STOP') });
      expect(a.ok && a.truncated).toBeUndefined();
      const b = await runTurn({ db: fixture(), conv, history: [], text: 'שלום, מה נשמע', prefs: DEFAULT_PREFS, gen: okGen('', 'MAX_TOKENS') });
      expect(!b.ok && b.error).toBe('truncated_empty');
    });
    it('המשך: בלי כלים, בלי ניתוב מקומי, ההיסטוריה כוללת את החלק שנכתב, והפלט מוגבל', async () => {
      const seen: { req: any[] } = { req: [] };
      const history = [{ id: 'm', conversation_id: 'conv-1', role: 'assistant' as const, content: 'שלב 1: מעבירים אגפים. שלב 2:', blocks: [], sources: [], created_at: '' }];
      const r = await runTurn({ db: fixture(), conv, history, text: CONTINUE_TEXT('שלב 2:'), prefs: DEFAULT_PREFS, gen: okGen('שלב 3: מקבלים x=2.', 'STOP', seen), continuation: true });
      expect(r.ok && r.text).toBe('שלב 3: מקבלים x=2.');
      expect(seen.req).toHaveLength(1); expect(seen.req[0].tools).toBeUndefined(); expect(seen.req[0].maxOutputTokens).toBe(4096);
      expect(JSON.stringify(seen.req[0].contents)).toContain('מעבירים אגפים'); expect(JSON.stringify(seen.req[0].contents)).toContain('בלי לחזור');
    });
    it('מגבלת פלט לפי סוג הבקשה', () => {
      const p = DEFAULT_PREFS;
      expect(outputBudget('מה שלומך', p)).toBe(2560);
      expect(outputBudget('מה שלומך', { ...p, answerLength: 'short' })).toBe(1536);
      expect(outputBudget('פתור את המשוואה x^2=4 עם כל הסעיפים', p)).toBe(4096);
      expect(outputBudget('פתור תרגיל', { ...p, answerLength: 'detailed' })).toBe(6144);
      expect(outputBudget('x', p, true)).toBe(4096);
      expect(outputBudget('פתור', { ...p, answerLength: 'short' })).toBe(4096); // פתרון מתמטי מקבל מקום גם בבקשה "קצרה"
    });
    it('trimCut: חותך נוסחה פתוחה ומשאיר שלמות', () => {
      expect(trimCut('א $x+1$ ב $y')).toBe('א $x+1$ ב'); expect(trimCut('ok  ')).toBe('ok');
      expect(trimCut('$$a=b$$ ו-$$c')).toBe('$$a=b$$ ו-'.trimEnd()); expect(trimCut('$$a=b$$ סוף')).toBe('$$a=b$$ סוף');
      expect(trimCut('הנה \\(x+1')).toBe('הנה'); expect(trimCut('הנה \\(x+1\\) ו')).toBe('הנה \\(x+1\\) ו');
    });
  });
});
