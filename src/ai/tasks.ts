// משימות פדגוגיות (שלב ג׳). כל משימה: איסוף נתונים וחישוב בקוד → בקשת ניסוח מ-Gemini (נתונים מכוּנים) → בדיקה → הצגה/טיוטה.
// שום משימה לא שומרת נתוני מערכת; טיוטות נשמרות כ-ai_drafts (ממתינות) ומבוצעות רק באישור המורה (ai_apply_draft).
import type { AiConversation, AiDraft, DB, Student } from '../data/types';
import { makeAliasMap, type AliasMap } from './pseudo';
import { TOOLS, type Block, type ToolCtx } from './tools';
import { studentProfile, classSummary, heldEvents, groupEvents, type StudentProfile } from './analytics';
import { verifyCheck, type Check } from './verify';
import { MATH_RULES } from './prompts';
import type { AiPrefs } from './prefs';
import type { GenFn, GenFail } from './gemini';
import type { TurnResult } from './agent';
import { activeStudents, label } from '../lib/domain';
import { fmtDay } from '../lib/util';

export interface TaskEnv {
  db: DB; conv: AiConversation; prefs: AiPrefs; gen: GenFn; now?: Date;
  createDrafts(rows: Partial<AiDraft>[]): Promise<AiDraft[]>;
  onProgress?(done: number, total: number): void;
}
const tool = (n: string) => TOOLS.find((t) => t.name === n)!;
const mkCtx = (env: TaskEnv, alias: AliasMap): ToolCtx => ({ db: env.db, alias, now: env.now ?? new Date(), level: env.prefs.level, groupId: env.conv.context.kind === 'system' ? null : env.conv.context.group_id });
const ok = (text: string, blocks: Block[] = [], sources: string[] = [], usedAI = true, extra: Partial<{ redacted: number; usage: { used: number; limit: number } }> = {}): TurnResult => ({ ok: true, text, blocks, sources, usedAI, redacted: extra.redacted ?? 0, usage: extra.usage });
const err = (error: string, message: string): GenFail => ({ ok: false, error, message });
const periodName = (p: string) => (p === 'h1' ? 'מחצית א׳' : p === 'h2' ? 'מחצית ב׳' : 'שנתי');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** קריאה ל-Gemini עם ניסיון חוזר אחד כשיש הגבלת קצב (לדקה) */
async function ask(env: TaskEnv, alias: AliasMap, system: string, user: string, opts: { schema?: unknown; max?: number; temp?: number } = {}) {
  const run = () => env.gen({ system: alias.pseudonymize(system), contents: [{ role: 'user', parts: [{ text: alias.pseudonymize(user) }] }], schema: opts.schema, maxOutputTokens: opts.max ?? 3072, temperature: opts.temp ?? 0.5 });
  let r = await run();
  if (!r.ok && r.error === 'rate_limited' && (r.retryAfterSec ?? 30) <= 65) { await sleep(((r.retryAfterSec ?? 30) + 1) * 1000); r = await run(); }
  return r;
}
export function parseJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t) as T; } catch { const m = /\{[\s\S]*\}/.exec(t); if (m) { try { return JSON.parse(m[0]) as T; } catch { /* ignore */ } } return null; }
}
const needLevelB = (env: TaskEnv) => env.prefs.level === 'B' ? null : err('level_a', 'משימה זו דורשת נתוני תלמידים (בכינויים). אפשר להפעיל זאת בהגדרות העוזר, רמת פרטיות ב׳.');

// ───────────────────────── 1. ניתוח כיתה ─────────────────────────
export async function classAnalysis(env: TaskEnv, p: { groupId: string; term?: 1 | 2 }): Promise<TurnResult> {
  const g = env.db.study_groups.find((x) => x.id === p.groupId); if (!g) return err('no_group', 'הקבוצה לא נמצאה');
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const stats = tool('class_stats').run(mkCtx(env, alias), { group: g.name, term: p.term });
  const recentTopics = [...new Set(env.db.calendar_events.filter((e) => e.group_id === g.id && !e.hidden && e.status === 'confirmed').sort((a, b) => b.start_at.localeCompare(a.start_at)).map((e) => env.db.lesson_logs.find((l) => l.calendar_event_id === e.id)?.topic?.trim()).filter((t): t is string => !!t))].slice(0, 6);
  const blocks: Block[] = [...stats.blocks, { type: 'list', title: 'חיזוק לפי נושא', items: ['אין בציונים נתוני נושאים, ולכן לא ניתן לקבוע באיזה נושא הקושי. ציון כללי אינו מעיד על נושא.', recentTopics.length ? `נושאים שתועדו לאחרונה: ${recentTopics.join(' · ')}` : 'לא תועדו נושאים בשיעורים אחרונים.', 'אם תרצה שיעור חיזוק על נושא מסוים, בחר ״תכנן שיעור״ וציין את הנושא.'] }];
  const s = classSummary(env.db, g, p.term);
  if (s.avg === null) return ok('אין עדיין ציונים בקבוצה הזו, ולכן אין מה לנתח.', stats.blocks, stats.sources, false);
  const system = 'אתה יועץ פדגוגי למורה למתמטיקה. נתח כיתה על סמך הנתונים בלבד. מבנה חובה: ## עובדות (מהנתונים), ## פרשנות (זהירה, מסומנת כפרשנות), ## המלצות הוראה, ## סיכום קצר לישיבת צוות (3–4 משפטים). אל תסיק קושי בנושא מציון כללי. אל תמציא נתונים שאינם בקלט. תלמידים מופיעים כקודים ST-n בלבד. ציין בסוגריים את מקור כל מסקנה משמעותית (איזו הערכה). ' + MATH_RULES;
  const r = await ask(env, alias, system, `נתוני הכיתה (JSON):\n${JSON.stringify(stats.model)}`, { max: 2500 });
  if (!r.ok) return r.error === 'quota_exhausted' || r.error === 'daily_limit' || r.error === 'local_mode' || r.error === 'not_deployed' || r.error === 'not_configured'
    ? ok(`${stats.summary}. ניתוח מילולי (פרשנות והמלצות) לא זמין כרגע: ${r.message}`, blocks, stats.sources, false) : r;
  return ok(alias.restore(r.text), blocks, stats.sources, true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

// ───────────────────────── 2. תיק תלמיד חכם ─────────────────────────
export async function studentFile(env: TaskEnv, p: { groupId: string; studentId: string }): Promise<TurnResult> {
  const lv = needLevelB(env); if (lv) return lv;
  const g = env.db.study_groups.find((x) => x.id === p.groupId); const pr = g && studentProfile(env.db, g, p.studentId);
  if (!g || !pr) return err('no_student', 'התלמיד או הקבוצה לא נמצאו');
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const res = tool('student_profile').run(mkCtx(env, alias), { student: alias.alias(p.studentId), group: g.name });
  if (pr.assessments.every((a) => a.status !== 'score')) return ok('אין עדיין ציונים לתלמיד הזה, ולכן אין מה לנתח.', res.blocks, res.sources, false);
  const system = 'אתה יועץ פדגוגי למורה למתמטיקה ובונה "תיק תלמיד" על סמך הנתונים בלבד. מבנה חובה (כותרות ##): סיכום הישגים; מגמת ציונים לאורך זמן; חוזקות (רק אם הנתונים תומכים); קשיים או פערים מתועדים (רק מהנתונים); שינויים בין תקופות; המלצות להוראה ולתרגול; נקודות לשיחה עם התלמיד/ההורים; שאלות להמשך (מה חסר כדי להבין טוב יותר). כל משפט מסומן [עובדה] / [פרשנות] / [המלצה]. לכל מסקנה משמעותית ציין מקור בסוגריים (איזה מבחן/ציון/תיעוד). אסור: אבחנות פסיכולוגיות או תוויות, המצאת התנהגות/מאמץ/יכולות, והסקת קושי בנושא מציון כללי. אם הנתונים מועטים (פחות מ-3 ציונים) אמור זאת במפורש ואל תסיק מגמה. התלמיד מופיע כקוד ST-n. ' + MATH_RULES;
  const r = await ask(env, alias, system, `נתוני התלמיד (JSON):\n${JSON.stringify(res.model)}`, { max: 3000 });
  if (!r.ok) return r;
  return ok(alias.restore(r.text), res.blocks, res.sources, true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

// ───────────────────────── 3. הערכות לתעודה ─────────────────────────
export interface EvalParams { groupId: string; period: 'h1' | 'h2' | 'annual'; studentIds: string[]; style: AiPrefs['evalStyle']; length: AiPrefs['evalLength']; voice: AiPrefs['evalVoice']; notes?: Record<string, string> }
const STYLE = { encouraging: 'מעודד ותומך, בלי להסתיר קשיים אמיתיים', factual: 'עובדתי ויבש, מבוסס מספרים', professional: 'מקצועי ומאוזן', personal: 'אישי וחם, בלי להמציא פרטים אישיים' };
const LENGTH = { short: '1–2 משפטים (עד 40 מילים)', medium: '3–4 משפטים (60–90 מילים)', detailed: '5–7 משפטים (110–160 מילים)' };
export const EVAL_SCHEMA = { type: 'object', properties: { evaluations: { type: 'array', items: { type: 'object', properties: { student: { type: 'string' }, text: { type: 'string' }, missing_info: { type: 'array', items: { type: 'string' } } }, required: ['student', 'text'] } } }, required: ['evaluations'] };

/** נתוני תלמיד להערכה: רק מה שנתמך בנתונים, ורשימת חוסרים שנקבעת בקוד */
export function evalFacts(db: DB, pr: StudentProfile, period: EvalParams['period'], alias: AliasMap, note?: string) {
  const terms = period === 'annual' ? [1, 2] : [period === 'h1' ? 1 : 2];
  const as = pr.assessments.filter((a) => terms.includes(a.term));
  const scored = as.filter((a) => a.status === 'score');
  const missing: string[] = [];
  if (scored.length === 0) missing.push('אין ציונים בתקופה');
  else if (scored.length < 3) missing.push('פחות מ-3 ציונים: אין מגמה אמינה');
  const miss = as.filter((a) => a.status === 'missing' && heldTitle(db, pr, a.title)).length; if (miss) missing.push(`${miss} הערכות ללא ציון`);
  missing.push('אין במערכת נתוני התנהגות, השתתפות או מאמץ; ההערכה מבוססת ציונים בלבד' + (note ? ' ובהערת המורה' : ''));
  const t = pr.terms.filter((x) => terms.includes(x.term));
  return { missing, facts: { student: alias.alias(pr.student.id), gender: pr.student.gender ?? null, period: periodName(period), termSummaries: t.map((x) => ({ term: x.term, calculated: x.calculated, final: x.final })), annual: period === 'annual' ? pr.annual : undefined, assessments: scored.map((a) => ({ title: a.title, score: a.score, classAvg: a.classAvg, diffFromClass: a.diff })), trend: scored.length >= 3 ? pr.trend : { label: 'אין מספיק נתונים' }, lastChange: pr.move && { latest: pr.move.latest, previousAvg: pr.move.prevAvg, changeVsClassAdjusted: pr.move.adjusted }, teacherNote: note?.trim() || undefined }, scoredCount: scored.length };
}
const heldTitle = (db: DB, pr: StudentProfile, title: string) => heldEvents(groupEvents(db, pr.group)).some((e) => e.title === title);

const evalSystem = (p: Pick<EvalParams, 'style' | 'length' | 'voice'>) => [
  'אתה עוזר למורה למתמטיקה בישראל וכותב הערכות אישיות לתעודה, בעברית תקנית. לכל תלמיד כתוב הערכה נפרדת.',
  `סגנון: ${STYLE[p.style]}. אורך: ${LENGTH[p.length]}. ${p.voice === 'direct' ? 'פנייה ישירה לתלמיד (אתה/את) לפי המגדר.' : 'בגוף שלישי על התלמיד, ובפתיחה הזכר אותו בקוד ST-n בדיוק כפי שנמסר (המורה יחליף בשם).'}`,
  'כללים מחייבים: כתוב אך ורק על סמך הנתונים שנמסרו. אסור להמציא התנהגות, מאמץ, השתתפות, מוטיבציה, יכולות, אישיות או הרגלי למידה שאינם בנתונים. אזכר התקדמות/חוזקות/קשיים רק כשהנתונים תומכים בכך (מגמה, ציון מול ממוצע הכיתה, שינוי אחרון). אל תכתוב הערכה בתבנית זהה לכולם. אל תחשוף ציונים או נתונים של תלמידים אחרים.',
  'אם הנתונים דלים כתוב בזהירות ואל תסיק מגמה. החזר ב-missing_info רשימת מידע שחסר כדי לכתוב הערכה עשירה יותר (למשל: אין נתוני השתתפות). השתמש במגדר (gender: m/f) לצורת הלשון; אם null השתמש בניסוח ניטרלי.',
  'אל תכלול את המילים "ST-n" אלא בפתיחה בגוף שלישי. אל תכלול אבחנות או תוויות.',
].join('\n');

export async function evaluations(env: TaskEnv, p: EvalParams): Promise<TurnResult> {
  const lv = needLevelB(env); if (lv) return lv;
  const g = env.db.study_groups.find((x) => x.id === p.groupId); if (!g) return err('no_group', 'הקבוצה לא נמצאה');
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const items: { sid: string; facts: ReturnType<typeof evalFacts>['facts']; missing: string[] }[] = []; const skipped: string[] = [];
  for (const sid of p.studentIds) {
    const pr = studentProfile(env.db, g, sid); if (!pr) continue;
    const f = evalFacts(env.db, pr, p.period, alias, p.notes?.[sid]);
    if (f.scoredCount === 0) { skipped.push(`${label(pr.student)}: אין ציונים ב${periodName(p.period)}, לא נכתבה הערכה`); continue; }
    items.push({ sid, facts: f.facts, missing: f.missing });
  }
  if (!items.length) return ok('לא נכתבו הערכות: אין ציונים לתלמידים שנבחרו בתקופה הזו.', [{ type: 'list', items: skipped }], [], false);
  const BATCH = 3; const out = new Map<string, { text: string; missing_info: string[] }>(); let redacted = 0; let usage: { used: number; limit: number } | undefined; const failed: string[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    env.onProgress?.(i, items.length);
    const batch = items.slice(i, i + BATCH);
    const r = await ask(env, alias, evalSystem(p), `נתוני התלמידים (JSON). כתוב הערכה לכל אחד, והחזר את הקוד שלו בשדה student:\n${JSON.stringify(batch.map((b) => b.facts))}`, { schema: EVAL_SCHEMA, max: 3000, temp: 0.6 });
    if (!r.ok) { if (out.size === 0 && r.error !== 'rate_limited') return r; failed.push(...batch.map((b) => label(env.db.students.find((s) => s.id === b.sid)!))); continue; }
    redacted += r.redacted; usage = { used: r.used, limit: r.limit };
    const parsed = parseJson<{ evaluations?: { student: string; text: string; missing_info?: string[] }[] }>(r.text);
    for (const e of parsed?.evaluations ?? []) { const sid = alias.idOf(String(e.student).trim()); if (sid && batch.some((b) => b.sid === sid) && e.text?.trim()) out.set(sid, { text: alias.restore(e.text.trim()), missing_info: (e.missing_info ?? []).map(String) }); }
    for (const b of batch) if (!out.has(b.sid)) failed.push(label(env.db.students.find((s) => s.id === b.sid)!));
  }
  env.onProgress?.(items.length, items.length);
  const rows = items.filter((b) => out.has(b.sid)).map((b) => ({ conversation_id: env.conv.id, kind: 'evaluation' as const, target: { group_id: g.id, student_id: b.sid, period: p.period }, payload: { text: out.get(b.sid)!.text, missing_info: [...new Set([...b.missing, ...out.get(b.sid)!.missing_info])], params: { style: p.style, length: p.length, voice: p.voice, period: p.period } }, status: 'pending' as const }));
  const drafts = rows.length ? await env.createDrafts(rows) : [];
  const blocks: Block[] = drafts.map((d) => ({ type: 'draft' as const, draftId: d.id }));
  if (drafts.length > 1) blocks.push({ type: 'draft_bulk', ids: drafts.map((d) => d.id) });
  const notes = [...skipped, ...failed.map((n) => `${n}: לא התקבלה הערכה תקינה מהמודל, נסה ליצור שוב`)];
  if (notes.length) blocks.push({ type: 'list', title: 'לתשומת לב', items: notes });
  return ok(`הכנתי ${drafts.length} טיוטות הערכה ל${periodName(p.period)} בקבוצה ${g.name}. כל הערכה מבוססת על הציונים בלבד. עיין, ערוך ואשר: שום דבר לא נשמר עד שתאשר.`, blocks, [`ציונים: ${g.name}, ${periodName(p.period)}`], true, { redacted, usage });
}

/** יצירה מחדש של הערכה אחת (עם הערה אופציונלית מהמורה); מעדכנת את הטיוטה */
export async function regenerateEvaluation(env: TaskEnv, d: AiDraft, note: string | undefined, patchDraft: (id: string, payload: Record<string, unknown>) => Promise<void>): Promise<TurnResult> {
  const lv = needLevelB(env); if (lv) return lv;
  const g = env.db.study_groups.find((x) => x.id === d.target.group_id); const pr = g && studentProfile(env.db, g, d.target.student_id);
  if (!g || !pr) return err('no_student', 'התלמיד לא נמצא');
  const params = (d.payload.params ?? {}) as Partial<EvalParams>;
  const pp = { style: params.style ?? env.prefs.evalStyle, length: params.length ?? env.prefs.evalLength, voice: params.voice ?? env.prefs.evalVoice };
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const f = evalFacts(env.db, pr, d.target.period as EvalParams['period'], alias, note);
  const r = await ask(env, alias, evalSystem(pp) + '\nזוהי הערכה חלופית: נסח אחרת מהניסוח הקודם.', `נתוני התלמיד (JSON):\n${JSON.stringify([f.facts])}`, { schema: EVAL_SCHEMA, temp: 0.8 });
  if (!r.ok) return r;
  const parsed = parseJson<{ evaluations?: { student: string; text: string; missing_info?: string[] }[] }>(r.text); const e = parsed?.evaluations?.[0];
  if (!e?.text?.trim()) return err('bad_output', 'לא התקבלה הערכה תקינה. נסה שוב.');
  await patchDraft(d.id, { ...d.payload, text: alias.restore(e.text.trim()), missing_info: [...new Set([...f.missing, ...(e.missing_info ?? [])])] });
  return ok('נוצרה הערכה חלופית.', [], [], true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

// ───────────────────────── 4. תכנון שיעור ותרגול ─────────────────────────
export interface PlanParams { groupId?: string; level: string; topic: string; minutes: number; goals?: string; classLevel: 'weak' | 'regular' | 'strong' | 'mixed'; notes?: string; homework: boolean }
const CL = { weak: 'כיתה חלשה', regular: 'כיתה רגילה', strong: 'כיתה חזקה', mixed: 'כיתה מעורבת' };
export async function lessonPlan(env: TaskEnv, p: PlanParams): Promise<TurnResult> {
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const g = p.groupId ? env.db.study_groups.find((x) => x.id === p.groupId) : null;
  const system = `אתה מתודיקן מנוסה בהוראת מתמטיקה בישראל. בנה מערך שיעור מעשי בעברית. מבנה חובה (כותרות ##): מטרות השיעור; פתיחה (עד 5–7 דקות); הסבר מרכזי; דוגמאות פתורות (עם פתרון מלא שלב אחר שלב); תרגול בכיתה; תרגול מדורג (בסיסי / בינוני / אתגר); טעויות נפוצות ואיך להתמודד איתן; סיכום ובדיקת הבנה${p.homework ? '; שיעורי בית' : ''}. חלק את הזמן לפי משך השיעור. ${env.prefs.planDetail === 'brief' ? 'הצג בקצרה.' : 'פרט.'} אל תטען שפתרון "נבדק". ${MATH_RULES}`;
  const user = [`שכבה/רמה: ${p.level}`, g ? `קבוצה: ${g.name}` : '', `נושא: ${p.topic}`, `משך: ${p.minutes} דקות`, `רמת הכיתה: ${CL[p.classLevel]}`, p.goals ? `מטרות: ${p.goals}` : '', p.notes ? `הערות מיוחדות: ${p.notes}` : ''].filter(Boolean).join('\n');
  const r = await ask(env, alias, system, user, { max: 4096, temp: 0.6 });
  if (!r.ok) return r;
  return ok(alias.restore(r.text), [], [], true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

export interface PracticeParams { groupId?: string; level: string; topic: string; counts: { basic: number; medium: number; challenging: number }; notes?: string }
export const PRACTICE_SCHEMA = { type: 'object', properties: { exercises: { type: 'array', items: { type: 'object', properties: { tier: { type: 'string' }, question: { type: 'string' }, solution: { type: 'string' }, answer: { type: 'string' }, check: { type: 'object', properties: { type: { type: 'string' }, equation: { type: 'string' }, variable: { type: 'string' }, solutions: { type: 'array', items: { type: 'string' } }, expression: { type: 'string' }, answer: { type: 'string' } } } }, required: ['tier', 'question', 'solution', 'answer'] } } }, required: ['exercises'] };
interface Ex { tier: 'basic' | 'medium' | 'challenging'; question: string; solution: string; answer: string; check?: Check & { type: string } }
const TIER = { basic: 'רמה בסיסית', medium: 'רמה בינונית', challenging: 'רמת אתגר' };
const practiceSystem = `אתה מורה למתמטיקה בישראל שמכין תרגילים עם פתרונות מלאים בעברית. לכל תרגיל: tier (basic/medium/challenging), question, solution (פתרון מלא שלב אחר שלב, ב-LaTeX), answer (תשובה סופית קצרה), ו-check לבדיקה חישובית כשאפשר: משוואה במשתנה אחד => {"type":"equation","equation":"2x+3=7","variable":"x","solutions":["2"]} (כתוב את המשוואה בתחביר פשוט: * לכפל, ^ לחזקה, / לחילוק, sqrt(...) לשורש, בלי LaTeX, ו-solutions עם כל הפתרונות הממשיים); ביטוי מספרי => {"type":"value","expression":"3/4+1/4","answer":"1"}; אחרת {"type":"none"}. ודא שהפתרון נכון. ${MATH_RULES}`;
export async function practice(env: TaskEnv, p: PracticeParams): Promise<TurnResult> {
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const total = p.counts.basic + p.counts.medium + p.counts.challenging;
  if (!total) return err('bad_request', 'יש לבחור לפחות תרגיל אחד');
  const user = `שכבה/רמה: ${p.level}\nנושא: ${p.topic}\nכמות: ${p.counts.basic} בסיסיים, ${p.counts.medium} בינוניים, ${p.counts.challenging} אתגר.${p.notes ? `\nהערות: ${p.notes}` : ''}${env.prefs.practiceMode === 'challenging' ? '\nהעדפה: נטה לתרגילים מאתגרים.' : '\nהעדפה: תרגול מדורג.'}`;
  let r = await ask(env, alias, practiceSystem, user, { schema: PRACTICE_SCHEMA, max: 6000, temp: 0.5 });
  if (!r.ok) return r;
  let used = { used: r.used, limit: r.limit }; let redacted = r.redacted;
  let exs = (parseJson<{ exercises?: Ex[] }>(r.text)?.exercises ?? []).filter((e) => e?.question && e?.solution);
  if (!exs.length) return err('bad_output', 'לא התקבלו תרגילים תקינים. נסה שוב.');
  let results = exs.map((e) => verifyCheck(e.check as Check | undefined));
  // ניסיון תיקון אחד לתרגילים שנכשלו בבדיקה
  const bad = results.map((v, i) => (v.status === 'failed' ? i : -1)).filter((i) => i >= 0);
  if (bad.length) {
    const fix = await ask(env, alias, practiceSystem, `התרגילים הבאים נכשלו בבדיקה חישובית (${bad.map((i) => results[i].detail).join('; ')}). החלף כל אחד בתרגיל חדש באותה רמה והחזר רק אותם:\n${JSON.stringify(bad.map((i) => ({ tier: exs[i].tier, question: exs[i].question })))}`, { schema: PRACTICE_SCHEMA, max: 4000, temp: 0.4 });
    if (fix.ok) { used = { used: fix.used, limit: fix.limit }; redacted += fix.redacted; const re = (parseJson<{ exercises?: Ex[] }>(fix.text)?.exercises ?? []).filter((e) => e?.question && e?.solution); bad.forEach((i, k) => { if (re[k]) { exs[i] = re[k]; results[i] = verifyCheck(re[k].check as Check | undefined); } }); }
  }
  exs = exs.map((e) => ({ ...e, tier: (['basic', 'medium', 'challenging'] as const).includes(e.tier) ? e.tier : 'medium' }));
  const sheet: string[] = ['## דף תרגול'], key: string[] = ['## פתרונות מלאים']; let n = 0;
  for (const tier of ['basic', 'medium', 'challenging'] as const) {
    const list = exs.map((e, i) => ({ e, i })).filter((x) => x.e.tier === tier); if (!list.length) continue;
    sheet.push(`### ${TIER[tier]}`); key.push(`### ${TIER[tier]}`);
    for (const { e } of list) { n++; sheet.push(`**${n}.** ${e.question}`); key.push(`**${n}.** ${e.question}\n\n${e.solution}\n\n**תשובה:** ${e.answer}`); }
  }
  const numbered = (() => { let k = 0; const order: number[] = []; for (const tier of ['basic', 'medium', 'challenging'] as const) exs.forEach((e, i) => { if (e.tier === tier) order.push(i); }); return order.map((i) => ({ i, n: ++k })); })();
  const vb: Block = { type: 'verify', items: numbered.map(({ i, n: num }) => ({ question: `תרגיל ${num}`, status: results[i].status, detail: results[i].detail })) };
  const failed = results.filter((v) => v.status === 'failed').length, verified = results.filter((v) => v.status === 'verified').length;
  const head = failed ? `שים לב: ב-${failed} תרגילים נמצאה אי-התאמה בפתרון ואין להשתמש בהם לפני בדיקה ידנית.` : '';
  return ok([head, `${verified} מתוך ${exs.length} תרגילים נבדקו חישובית; השאר לא נבדקו (ראה פירוט). בדוק בעצמך לפני שימוש בכיתה.`, '', ...sheet, '', ...key].filter((x) => x !== undefined).join('\n\n').replace(/\n{3,}/g, '\n\n'), [vb], [], true, { redacted, usage: used });
}

// ───────────────────────── 5. סיכום ותיעוד שיעור ─────────────────────────
export const SUMMARY_SCHEMA = { type: 'object', properties: { topics: { type: 'string' }, what_done: { type: 'string' }, difficulties: { type: 'string' }, continuation: { type: 'string' }, follow_up: { type: 'string' } }, required: ['topics', 'what_done'] };
export async function lessonSummaryDraft(env: TaskEnv, p: { eventId: string; notes: string }): Promise<TurnResult> {
  const ev = env.db.calendar_events.find((e) => e.id === p.eventId); if (!ev?.group_id) return err('no_lesson', 'השיעור לא נמצא או שאינו משויך לקבוצה');
  if (!p.notes.trim()) return err('bad_request', 'יש לכתוב הערות על השיעור');
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const system = 'אתה מסייע למורה לתעד שיעור. קבל הערות חופשיות וארגן אותן בעברית תמציתית לפי השדות: topics (נושאי השיעור), what_done (מה נעשה), difficulties (קשיים שהוזכרו), continuation (המשך מתוכנן), follow_up (משימות מעקב/שיעורי בית). חובה: השתמש רק במידע שבהערות. אל תוסיף, אל תסיק ואל תמציא. שדה שאין לו מידע בהערות השאר ריק (מחרוזת ריקה). שמות תלמידים אם הופיעו הם בקודים ST-n; אל תנסה לנחש שמות. ' + MATH_RULES;
  const r = await ask(env, alias, system, `הערות המורה:\n${p.notes}`, { schema: SUMMARY_SCHEMA, max: 1500, temp: 0.2 });
  if (!r.ok) return r;
  const j = parseJson<Record<string, string>>(r.text); if (!j) return err('bad_output', 'לא התקבל סיכום תקין. נסה שוב.');
  const f = (k: string) => alias.restore(String(j[k] ?? '').trim());
  const learned = [f('what_done'), f('difficulties') && `קשיים: ${f('difficulties')}`, f('continuation') && `המשך מתוכנן: ${f('continuation')}`].filter(Boolean).join('\n');
  const [d] = await env.createDrafts([{ conversation_id: env.conv.id, kind: 'lesson_log', target: { calendar_event_id: ev.id }, payload: { topic: f('topics'), learned, homework: f('follow_up'), mark_done: false }, status: 'pending' }]);
  return ok(`ארגנתי את ההערות לטיוטת תיעוד לשיעור ${fmtDay(ev.start_at)}. הטיוטה כוללת רק מה שכתבת. עיין, ערוך ואשר; שום דבר לא נשמר עד שתאשר.`, [{ type: 'draft', draftId: d.id }], [`הערות המורה לשיעור ${fmtDay(ev.start_at)}`], true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

export async function periodSummary(env: TaskEnv, p: { groupId: string; from: string; to: string }): Promise<TurnResult> {
  const g = env.db.study_groups.find((x) => x.id === p.groupId); if (!g) return err('no_group', 'הקבוצה לא נמצאה');
  const alias = makeAliasMap(env.db.students, env.conv.id);
  const res = tool('lessons_taught').run(mkCtx(env, alias), { group: g.name, from: p.from, to: p.to });
  const m = res.model as { lessons: number; documented: number };
  if (!m.documented) return ok(`בטווח שנבחר יש ${m.lessons} שיעורים, אך אין בהם תיעוד שאפשר לסכם.`, res.blocks, res.sources, false);
  const r = await ask(env, alias, 'סכם בעברית את ההתקדמות של הקבוצה על סמך תיעוד השיעורים בלבד: ## נושאים שנלמדו, ## קצב והתקדמות, ## קשיים שתועדו, ## המשך מומלץ. אל תוסיף מידע שלא בתיעוד, וציין כשהתיעוד חלקי. ' + MATH_RULES, `תיעוד השיעורים (JSON):\n${JSON.stringify(res.model)}`, { max: 2000, temp: 0.3 });
  if (!r.ok) return r;
  return ok(alias.restore(r.text), res.blocks, res.sources, true, { redacted: r.redacted, usage: { used: r.used, limit: r.limit } });
}

// ───────────────────────── עזרים לממשק ─────────────────────────
export const studentsOf = (db: DB, groupId: string): Student[] => activeStudents(db, groupId).sort((a, b) => label(a).localeCompare(label(b), 'he'));

