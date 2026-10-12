import { describe, expect, it } from 'vitest';
import { classAnalysis, evaluations, lessonSummaryDraft, practice, regenerateEvaluation, studentFile, lessonPlan, parseJson } from './tasks';
import { DEFAULT_PREFS } from './prefs';
import type { GenFn, GenOk } from './gemini';
import { emptyDB, type AiDraft, type DB } from '../data/types';

function fixture(): DB {
  const d = emptyDB();
  d.academic_years = [{ id: 'y', name: 'x', start_date: '2026-09-01', end_date: '2027-06-30', term1_start: '2026-09-01', term1_end: '2027-01-31', term2_start: '2027-02-01', term2_end: '2027-06-30', archived_at: null }];
  d.study_groups = [{ id: 'g', academic_year_id: 'y', name: 'י׳ 5 יח״ל', subject: 'מתמטיקה', grade_level: 'י', annual_weight_h1: 50, annual_weight_h2: 50, archived_at: null }];
  const S = (id: string, f: string, l: string, gender: 'm' | 'f' | null = null) => ({ id, first_name: f, last_name: l, home_class: null, archived_at: null, gender });
  d.students = [S('a', 'דנה', 'כהן', 'f'), S('b', 'רן', 'לוי', 'm'), S('c', 'יוסי', 'אברהם'), S('d', 'מיה', 'שחר', 'f')];
  d.enrollments = d.students.map((s) => ({ id: 'e' + s.id, student_id: s.id, group_id: 'g', joined_at: '2026-09-01', left_at: null }));
  d.grade_categories = [{ id: 'c1', group_id: 'g', term: 1, name: 'מבחנים', weight: 100, event_weight_mode: 'equal', drop_lowest: false, sort_order: 0 }];
  d.assessment_events = ['t1', 't2', 't3'].map((id, i) => ({ id, group_id: 'g', term: 1 as const, category_id: 'c1', title: `מבחן ${i + 1}`, event_date: `2026-10-0${i + 1}`, weight: null, makeup_policy: 'best' as const, cancelled_at: null, sort_order: i }));
  const G = (e: string, s: string, v: number) => ({ event_id: e, student_id: s, attempt: 1 as const, status: 'score' as const, score: v });
  d.grades = [G('t1', 'a', 70), G('t2', 'a', 75), G('t3', 'a', 90), G('t1', 'b', 80), G('t2', 'b', 60), G('t3', 'b', 55), G('t1', 'c', 90), G('t1', 'd', 60)];
  d.calendar_events = [{ id: 'ev', group_id: 'g', title: 't', start_at: '2026-10-05T08:00:00Z', end_at: '2026-10-05T08:45:00Z', status: 'confirmed', source: 'internal' }];
  return d;
}
const conv = { id: 'cv', title: 't', context: { kind: 'system' as const }, created_at: '', updated_at: '' };
const okGen = (text: string): GenOk => ({ ok: true, text, functionCalls: [], modelContent: null, redacted: 0, used: 1, limit: 100, usage: { in: 1, out: 1 } });
const mkDrafts = () => { const store: AiDraft[] = []; return { store, createDrafts: async (rows: Partial<AiDraft>[]) => rows.map((r, i) => { const d = { id: `d${store.length + i}`, applied_at: null, created_at: '', ...r } as AiDraft; store.push(d); return d; }) }; };

describe('הערכות לתעודה', () => {
  it('מבקש בקבוצות של 3, מחזיר טיוטות עם שם אמיתי, מדלג על תלמיד בלי ציונים, ושום שם לא יוצא', async () => {
    const db = fixture(); const reqs: string[] = [];
    const gen: GenFn = async (req) => {
      reqs.push(JSON.stringify(req));
      const facts = JSON.parse((req.contents as { parts: { text: string }[] }[])[0].parts[0].text.split('\n').slice(1).join('\n')) as { student: string; gender: string | null }[];
      return okGen(JSON.stringify({ evaluations: facts.map((f) => ({ student: f.student, text: `${f.student} הראה/תה התקדמות.`, missing_info: ['אין נתוני השתתפות'] })) }));
    };
    const { store, createDrafts } = mkDrafts();
    const r = await evaluations({ db, conv, prefs: DEFAULT_PREFS, gen, createDrafts }, { groupId: 'g', period: 'h1', studentIds: ['a', 'b', 'c', 'd'], style: 'professional', length: 'medium', voice: 'third', notes: { a: 'משתתפת פעילה, דנה כהן עזרה לחברים' } });
    expect(r.ok).toBe(true);
    expect(reqs.join()).not.toMatch(/דנה|כהן|רן|לוי|יוסי|אברהם|מיה|שחר/);
    expect(reqs).toHaveLength(2);                       // 4 תלמידים בקבוצות של 3
    expect(store).toHaveLength(4);
    expect(store.find((d) => d.target.student_id === 'a')!.payload.text).toMatch(/דנה כהן הראה/);   // הכינוי הוחזר לשם
    expect((store[0].payload.missing_info as string[]).some((m) => m.includes('התנהגות'))).toBe(true);
    expect(JSON.stringify(r)).toContain('draft_bulk');
    const prompt = reqs[0]; expect(prompt).toMatch(/gender[^a-z]+f/); expect(prompt).toContain('משתתפת פעילה'); // הערת מורה נכללת (בכינוי)
    expect(prompt).not.toContain('private_note');
  });
  it('תלמיד בלי ציונים בתקופה: אין הערכה', async () => {
    const db = fixture(); db.grades = db.grades.filter((g) => g.student_id !== 'd');
    const { store, createDrafts } = mkDrafts();
    const gen: GenFn = async (req) => { const s = /ST-\d+/.exec(JSON.stringify(req.contents))![0]; return okGen(JSON.stringify({ evaluations: [{ student: s, text: 'x' }] })); };
    const r = await evaluations({ db, conv, prefs: DEFAULT_PREFS, gen, createDrafts }, { groupId: 'g', period: 'h2', studentIds: ['d'], style: 'factual', length: 'short', voice: 'direct' });
    expect(r.ok && r.usedAI).toBe(false); expect(store).toHaveLength(0);
  });
  it('רמה א׳ חוסמת', async () => {
    const r = await evaluations({ db: fixture(), conv, prefs: { ...DEFAULT_PREFS, level: 'A' }, gen: async () => { throw new Error('x'); }, createDrafts: async () => [] }, { groupId: 'g', period: 'h1', studentIds: ['a'], style: 'factual', length: 'short', voice: 'third' });
    expect(!r.ok && r.error).toBe('level_a');
  });
  it('פלט לא תקין לא יוצר טיוטות מומצאות', async () => {
    const { store, createDrafts } = mkDrafts();
    const r = await evaluations({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen: async () => okGen('זה לא JSON'), createDrafts }, { groupId: 'g', period: 'h1', studentIds: ['a'], style: 'factual', length: 'short', voice: 'third' });
    expect(store).toHaveLength(0); expect(r.ok && JSON.stringify(r.blocks)).toContain('לא התקבלה הערכה תקינה');
  });
  it('יצירה מחדש מעדכנת את הטיוטה', async () => {
    const db = fixture(); let patched: Record<string, unknown> | null = null;
    const d = { id: 'd0', conversation_id: 'cv', kind: 'evaluation', target: { group_id: 'g', student_id: 'a', period: 'h1' }, payload: { text: 'ישן', params: { style: 'factual', length: 'short', voice: 'third' } }, status: 'pending', created_at: '', applied_at: null } as AiDraft;
    const gen: GenFn = async (req) => { const s = /ST-\d+/.exec(JSON.stringify(req.contents))![0]; return okGen(JSON.stringify({ evaluations: [{ student: s, text: `${s} חדש` }] })); };
    const r = await regenerateEvaluation({ db, conv, prefs: DEFAULT_PREFS, gen, createDrafts: async () => [] }, d, 'הערה', async (_id, p) => { patched = p; });
    expect(r.ok).toBe(true); expect(String(patched!.text)).toBe('דנה כהן חדש');
  });
});

describe('תרגול', () => {
  const ex = (tier: string, check: unknown) => ({ tier, question: '$2x+3=7$', solution: '$x=2$', answer: '2', check });
  it('בודק חישובית, מזהה פתרון שגוי ומחליף אותו בניסיון אחד', async () => {
    let n = 0;
    const gen: GenFn = async () => { n++; return okGen(JSON.stringify({ exercises: n === 1 ? [ex('basic', { type: 'equation', equation: '2x+3=7', variable: 'x', solutions: ['2'] }), ex('medium', { type: 'equation', equation: 'x^2-5x+6=0', variable: 'x', solutions: ['2'] }), ex('challenging', { type: 'none' })] : [ex('medium', { type: 'equation', equation: 'x^2-5x+6=0', variable: 'x', solutions: ['2', '3'] })] })); };
    const r = await practice({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen, createDrafts: async () => [] }, { level: 'י', topic: 'משוואות', counts: { basic: 1, medium: 1, challenging: 1 } });
    expect(n).toBe(2); expect(r.ok).toBe(true);
    const v = (r.ok ? r.blocks[0] : null) as { items: { status: string }[] };
    expect(v.items.map((i) => i.status)).toEqual(['verified', 'verified', 'unverified']);
    expect(r.ok && r.text).toContain('2 מתוך 3 תרגילים נבדקו חישובית');
    expect(r.ok && r.text).not.toContain('אי-התאמה');
  });
  it('אם התיקון נכשל: מסומן ככשל בבירור', async () => {
    const gen: GenFn = async () => okGen(JSON.stringify({ exercises: [ex('basic', { type: 'equation', equation: '2x+3=7', variable: 'x', solutions: ['5'] })] }));
    const r = await practice({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen, createDrafts: async () => [] }, { level: 'י', topic: 't', counts: { basic: 1, medium: 0, challenging: 0 } });
    expect(r.ok && r.text).toContain('אי-התאמה'); expect(r.ok && JSON.stringify(r.blocks)).toContain('failed');
  });
});

describe('תיעוד שיעור', () => {
  it('יוצר טיוטה מההערות בלבד, בלי שמירה', async () => {
    const { store, createDrafts } = mkDrafts(); let sent = '';
    const gen: GenFn = async (req) => { sent = JSON.stringify(req); return okGen(JSON.stringify({ topics: 'משוואות', what_done: 'פתרנו 5 תרגילים', difficulties: '', continuation: 'שברים אלגבריים', follow_up: 'עמ׳ 12' })); };
    const r = await lessonSummaryDraft({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen, createDrafts }, { eventId: 'ev', notes: 'דנה כהן התקשתה. פתרנו משוואות' });
    expect(sent).not.toMatch(/דנה|כהן/); expect(store[0].status).toBe('pending'); expect(store[0].payload).toMatchObject({ topic: 'משוואות', homework: 'עמ׳ 12', mark_done: false });
    expect(String(store[0].payload.learned)).toBe('פתרנו 5 תרגילים\nהמשך מתוכנן: שברים אלגבריים');   // בלי "קשיים" כשאין
    expect(r.ok).toBe(true);
  });
  it('שיעור לא משויך: נדחה', async () => {
    const db = fixture(); db.calendar_events[0].group_id = null;
    const r = await lessonSummaryDraft({ db, conv, prefs: DEFAULT_PREFS, gen: async () => okGen('{}'), createDrafts: async () => [] }, { eventId: 'ev', notes: 'x' });
    expect(r.ok).toBe(false);
  });
});

describe('ניתוח כיתה / תיק תלמיד / תכנון', () => {
  it('ניתוח כיתה: אם המכסה נגמרה, עדיין מחזיר את החישובים בקוד', async () => {
    const r = await classAnalysis({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen: async () => ({ ok: false, error: 'quota_exhausted', message: 'נגמרה' }), createDrafts: async () => [] }, { groupId: 'g' });
    expect(r.ok && !r.usedAI && r.blocks.length >= 2 && r.text.includes('נגמרה')).toBe(true);
    expect(r.ok && JSON.stringify(r.blocks)).toContain('אין בציונים נתוני נושאים');
  });
  it('ניתוח כיתה: ה-prompt בלי שמות', async () => {
    let sent = '';
    const r = await classAnalysis({ db: fixture(), conv, prefs: DEFAULT_PREFS, gen: async (q) => { sent = JSON.stringify(q); return okGen('## עובדות\nנתון'); }, createDrafts: async () => [] }, { groupId: 'g', term: 1 });
    expect(r.ok && r.usedAI).toBe(true); expect(sent).not.toMatch(/דנה|כהן|רן|לוי/);
  });
  it('תיק תלמיד: נתונים בכינוי, ובלי ציונים אין קריאה ל-AI', async () => {
    let sent = ''; const db = fixture();
    await studentFile({ db, conv, prefs: DEFAULT_PREFS, gen: async (q) => { sent = JSON.stringify(q); return okGen('## סיכום'); }, createDrafts: async () => [] }, { groupId: 'g', studentId: 'b' });
    expect(sent).not.toMatch(/רן|לוי/); expect(sent).toContain('ST-'); expect(sent).toContain('[עובדה]');
    db.grades = []; let called = false;
    const r = await studentFile({ db, conv, prefs: DEFAULT_PREFS, gen: async () => { called = true; return okGen('x'); }, createDrafts: async () => [] }, { groupId: 'g', studentId: 'b' });
    expect(called).toBe(false); expect(r.ok && r.usedAI).toBe(false);
  });
  it('תכנון שיעור עובד גם ברמה א׳ (בלי נתוני תלמידים)', async () => {
    let sent = '';
    const r = await lessonPlan({ db: fixture(), conv, prefs: { ...DEFAULT_PREFS, level: 'A' }, gen: async (q) => { sent = JSON.stringify(q); return okGen('## מטרות'); }, createDrafts: async () => [] }, { level: 'י', topic: 'משוואות ריבועיות', minutes: 45, classLevel: 'mixed', homework: true });
    expect(r.ok).toBe(true); expect(sent).toContain('45 דקות'); expect(sent).not.toMatch(/דנה|ST-/);
  });
  it('parseJson סלחני לגדרות קוד', () => { expect(parseJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 }); expect(parseJson('לא json')).toBeNull(); });
});
