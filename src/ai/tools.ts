// כלי נתונים של העוזר. כל תשובה עובדתית מחושבת כאן, בקוד, מתוך נתוני המערכת.
// כל כלי מחזיר: model (מה שנשלח ל-Gemini, עם כינויים, ובלי נתוני תלמידים ברמה א׳), blocks (מה שמוצג, עם שמות אמיתיים), sources.
import type { DB, StudyGroup } from '../data/types';
import { activeStudents, groupYear, activeTerm, label, shownEvents } from '../lib/domain';
import { fmtDay, fmtTime } from '../lib/util';
import { classSummary, groupEvents, heldEvents, studentName, studentProfile, movements } from './analytics';
import type { AliasMap } from './pseudo';

export type Block =
  | { type: 'table'; title?: string; columns: string[]; rows: string[][]; note?: string }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'draft'; draftId: string }
  | { type: 'draft_bulk'; ids: string[] }
  | { type: 'truncated' }
  | { type: 'verify'; items: { question: string; status: 'verified' | 'failed' | 'unverified'; detail: string }[] };
export interface ToolCtx { db: DB; alias: AliasMap; now: Date; level: 'A' | 'B'; groupId?: string | null; studentId?: string | null }
export interface ToolResult { model: unknown; blocks: Block[]; sources: string[]; summary: string }
export interface Tool {
  name: string; description: string; studentLevel: boolean;
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string }>; required?: string[] };
  run(ctx: ToolCtx, args: Record<string, unknown>): ToolResult;
}

const norm = (s: string) => s.replace(/[׳'"״`]/g, '').replace(/\s+/g, ' ').trim();
export function resolveGroup(db: DB, arg: unknown, fallbackId?: string | null): StudyGroup | null {
  const live = db.study_groups.filter((g) => !g.archived_at);
  if (typeof arg === 'string' && arg.trim()) {
    const a = norm(arg);
    return live.find((g) => norm(g.name) === a) ?? live.find((g) => norm(g.name).includes(a) || a.includes(norm(g.name))) ?? null;
  }
  return (fallbackId ? db.study_groups.find((g) => g.id === fallbackId) : null) ?? (live.length === 1 ? live[0] : null);
}
export function resolveStudent(ctx: ToolCtx, arg: unknown): string | null {
  if (typeof arg === 'string' && arg.trim()) {
    const id = ctx.alias.idOf(arg.trim()); if (id) return id;
    const a = norm(arg); const m = ctx.db.students.filter((s) => norm(label(s)) === a || norm(`${s.first_name} ${s.last_name}`) === a);
    return m.length === 1 ? m[0].id : null;
  }
  return ctx.studentId ?? null;
}
const iso10 = (d: Date) => d.toISOString().slice(0, 10);
const need = (what: string): ToolResult => ({ model: { error: what }, blocks: [], sources: [], summary: what });
const noGroup = need('לא זוהתה קבוצה. יש לציין קבוצה או לפתוח את העוזר מתוך קבוצה.');
const termName = (t: number) => (t === 1 ? 'מחצית א׳' : 'מחצית ב׳');
const gname = (db: DB, id: string | null) => db.study_groups.find((g) => g.id === id)?.name ?? '';

export const TOOLS: Tool[] = [
  {
    name: 'list_groups', description: 'רשימת קבוצות הלימוד הפעילות ומספר התלמידים בכל אחת', studentLevel: false, parameters: { type: 'object', properties: {} },
    run: ({ db }) => {
      const gs = db.study_groups.filter((g) => !g.archived_at);
      const rows = gs.map((g) => [g.name, g.grade_level ?? '', String(activeStudents(db, g.id).length)]);
      return { model: gs.map((g, i) => ({ group: g.name, level: g.grade_level, students: Number(rows[i][2]) })), blocks: [{ type: 'table', columns: ['קבוצה', 'שכבה', 'תלמידים'], rows }], sources: ['קבוצות לימוד'], summary: `${gs.length} קבוצות פעילות` };
    },
  },
  {
    name: 'undocumented_lessons', description: 'שיעורים שהתקיימו ועדיין לא תועדו (ממתינים לתיעוד), לפי קבוצה אם צוינה', studentLevel: false,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה (אופציונלי)' }, days: { type: 'number', description: 'כמה ימים אחורה (אופציונלי, ברירת מחדל: הכול)' } } },
    run: (ctx, a) => {
      const { db, now } = ctx; const g = a.group ? resolveGroup(db, a.group, null) : null;
      if (a.group && !g) return need(`הקבוצה "${a.group}" לא נמצאה`);
      const since = a.days ? new Date(now.getTime() - Number(a.days) * 86400000) : null;
      const list = shownEvents(db).filter((e) => e.group_id && (!g || e.group_id === g.id) && e.status === 'confirmed' && new Date(e.end_at) < now && (!since || new Date(e.start_at) >= since)
        && (db.lesson_logs.find((l) => l.calendar_event_id === e.id)?.completion ?? 'pending') === 'pending').sort((x, y) => y.start_at.localeCompare(x.start_at));
      const rows = list.slice(0, 40).map((e) => [fmtDay(e.start_at), `${fmtTime(e.start_at)}–${fmtTime(e.end_at)}`, gname(db, e.group_id)]);
      return { model: { count: list.length, shown: rows.length, lessons: rows.map((r) => ({ date: r[0], group: r[2] })) }, blocks: [list.length ? { type: 'table', columns: ['תאריך', 'שעה', 'קבוצה'], rows, note: list.length > 40 ? `מוצגים 40 מתוך ${list.length}` : undefined } : { type: 'list', items: ['כל השיעורים מתועדים'] }], sources: ['יומן ותיעוד שיעורים'], summary: list.length ? `${list.length} שיעורים ממתינים לתיעוד` : 'כל השיעורים מתועדים' };
    },
  },
  {
    name: 'lessons_taught', description: 'מה תועד שנלמד בשיעורים של קבוצה בטווח תאריכים (נושא, מה נלמד, שיעורי בית). ברירת מחדל: 7 הימים האחרונים', studentLevel: false,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה' }, from: { type: 'string', description: 'תאריך התחלה YYYY-MM-DD' }, to: { type: 'string', description: 'תאריך סיום YYYY-MM-DD' } } },
    run: (ctx, a) => {
      const { db, now } = ctx; const g = resolveGroup(db, a.group, ctx.groupId); if (!g) return noGroup;
      const to = typeof a.to === 'string' ? new Date(`${a.to}T23:59:59`) : now, from = typeof a.from === 'string' ? new Date(`${a.from}T00:00:00`) : new Date(to.getTime() - 7 * 86400000);
      const evs = db.calendar_events.filter((e) => e.group_id === g.id && !e.hidden && e.status === 'confirmed' && new Date(e.start_at) >= from && new Date(e.start_at) <= to && new Date(e.start_at) <= now).sort((x, y) => x.start_at.localeCompare(y.start_at));
      const rows = evs.map((e) => { const l = db.lesson_logs.find((x) => x.calendar_event_id === e.id); return [fmtDay(e.start_at), l?.topic ?? '', l?.learned ?? '', l?.homework ?? '', l ? (l.completion === 'done' ? 'מתועד' : l.completion === 'not_needed' ? 'אין צורך' : 'ממתין') : 'ממתין']; });
      const has = rows.filter((r) => r[1] || r[2] || r[3]).length;
      return { model: { group: g.name, from: iso10(from), to: iso10(to), lessons: evs.length, documented: has, log: rows.map((r) => ({ date: r[0], topic: r[1], learned: r[2], homework: r[3] })) }, blocks: [evs.length ? { type: 'table', title: `${g.name}: ${iso10(from).split('-').reverse().join('.')} – ${iso10(to).split('-').reverse().join('.')}`, columns: ['תאריך', 'נושא', 'מה נלמד', 'שיעורי בית', 'תיעוד'], rows } : { type: 'list', items: ['לא נמצאו שיעורים בטווח הזה'] }], sources: [`תיעוד שיעורים: ${g.name}`], summary: `${evs.length} שיעורים, ${has} עם תיעוד` };
    },
  },
  {
    name: 'lesson_count', description: 'כמה שיעורים התקיימו/מתוכננים בחודש מסוים (לקבוצה אחת או לכולן)', studentLevel: false,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה (אופציונלי)' }, month: { type: 'string', description: 'חודש YYYY-MM (ברירת מחדל החודש הנוכחי)' } } },
    run: (ctx, a) => {
      const { db, now } = ctx; const g = a.group ? resolveGroup(db, a.group, null) : null; if (a.group && !g) return need(`הקבוצה "${a.group}" לא נמצאה`);
      const month = typeof a.month === 'string' && /^\d{4}-\d{2}$/.test(a.month) ? a.month : iso10(now).slice(0, 7);
      const evs = shownEvents(db).filter((e) => e.group_id && (!g || e.group_id === g.id) && iso10(new Date(new Date(e.start_at).getTime() + 3 * 3600000)).slice(0, 7) === month);
      const held = evs.filter((e) => e.status === 'confirmed' && new Date(e.end_at) < now).length, planned = evs.filter((e) => e.status === 'confirmed' && new Date(e.end_at) >= now).length, cancelled = evs.filter((e) => e.status === 'cancelled').length;
      return { model: { month, group: g?.name ?? 'כל הקבוצות', held, planned, cancelled }, blocks: [{ type: 'table', title: `${g?.name ?? 'כל הקבוצות'} · ${month.split('-').reverse().join('.')}`, columns: ['התקיימו', 'עתידיים', 'בוטלו'], rows: [[String(held), String(planned), String(cancelled)]] }], sources: ['יומן'], summary: `${held} שיעורים התקיימו, ${planned} עתידיים, ${cancelled} בוטלו` };
    },
  },
  {
    name: 'upcoming_lessons', description: 'השיעורים הקרובים (ברירת מחדל 7 ימים קדימה)', studentLevel: false,
    parameters: { type: 'object', properties: { days: { type: 'number', description: 'ימים קדימה' } } },
    run: ({ db, now }, a) => {
      const horizon = new Date(now.getTime() + (Number(a.days) || 7) * 86400000);
      const evs = shownEvents(db).filter((e) => e.group_id && e.status === 'confirmed' && new Date(e.end_at) >= now && new Date(e.start_at) <= horizon).sort((x, y) => x.start_at.localeCompare(y.start_at)).slice(0, 30);
      const rows = evs.map((e) => [fmtDay(e.start_at), `${fmtTime(e.start_at)}–${fmtTime(e.end_at)}`, gname(db, e.group_id)]);
      return { model: rows.map((r) => ({ date: r[0], time: r[1], group: r[2] })), blocks: [evs.length ? { type: 'table', columns: ['תאריך', 'שעה', 'קבוצה'], rows } : { type: 'list', items: ['אין שיעורים בטווח'] }], sources: ['יומן'], summary: `${evs.length} שיעורים קרובים` };
    },
  },
  {
    name: 'missing_grades', description: 'אילו תלמידים חסר להם ציון בהערכה האחרונה (או בהערכה לפי שם) בקבוצה', studentLevel: true,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה' }, assessment: { type: 'string', description: 'שם ההערכה (אופציונלי; ברירת מחדל האחרונה שיש בה ציונים)' } } },
    run: (ctx, a) => {
      const { db, alias } = ctx; const g = resolveGroup(db, a.group, ctx.groupId); if (!g) return noGroup;
      const evs = groupEvents(db, g); const held = heldEvents(evs);
      const ev = typeof a.assessment === 'string' && a.assessment ? evs.find((e) => norm(e.title).includes(norm(String(a.assessment)))) : held[held.length - 1];
      if (!ev) return need('לא נמצאה הערכה עם ציונים בקבוצה הזו');
      const rows = ev.missing.map((id) => [studentName(db, id)]), abs = [...ev.absent].map((id) => studentName(db, id));
      const model = ctx.level === 'B' ? { group: g.name, assessment: ev.title, missing: ev.missing.map(alias.alias), notTaken: [...ev.absent].map(alias.alias) } : { group: g.name, assessment: ev.title, missingCount: ev.missing.length, notTakenCount: ev.absent.size };
      return { model, blocks: [{ type: 'table', title: `${g.name}: ${ev.title} (${termName(ev.term)})`, columns: ['תלמיד ללא ציון'], rows: rows.length ? rows : [['אין. לכולם יש ציון, פטור או "לא נבחן"']], note: abs.length ? `סומנו "לא נבחן": ${abs.join(', ')}` : undefined }], sources: [`ציונים: ${ev.title}, ${g.name}`], summary: ev.missing.length ? `${ev.missing.length} תלמידים בלי ציון ב"${ev.title}"` : `לכולם יש ציון ב"${ev.title}"` };
    },
  },
  {
    name: 'class_stats', description: 'סטטיסטיקת כיתה: ממוצע, חציון, התפלגות, ממוצע לכל הערכה, תלמידים ללא ציון ושינויים בין הערכות (מחצית אחת)', studentLevel: false,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה' }, term: { type: 'number', description: '1 או 2 (ברירת מחדל המחצית הפעילה)' } } },
    run: (ctx, a) => {
      const { db, alias } = ctx; const g = resolveGroup(db, a.group, ctx.groupId); if (!g) return noGroup;
      const term = a.term === 1 || a.term === 2 ? a.term : undefined; const s = classSummary(db, g, term);
      const evRows = heldEvents(s.events).map((e) => [e.title, e.date ? new Date(e.date).toLocaleDateString('he-IL') : '', String(e.n), e.avg === null ? '' : String(e.avg), e.median === null ? '' : String(e.median), `${e.dist.fail}/${e.dist.mid}/${e.dist.good}/${e.dist.star}`, String(e.missing.length)]);
      const imp = s.movers.filter((m) => m.adjusted >= 10).sort((x, y) => y.adjusted - x.adjusted), dec = s.movers.filter((m) => m.adjusted <= -10).sort((x, y) => x.adjusted - y.adjusted);
      const blocks: Block[] = [
        { type: 'table', title: `${g.name} · ${termName(s.term)}`, columns: ['תלמידים', 'עם ממוצע ביניים', 'ממוצע', 'חציון', 'נכשלים (<56)', 'מצטיינים (90+)'], rows: [[String(s.students), String(s.termCalc.size), String(s.avg ?? '—'), String(s.median ?? '—'), String(s.dist.fail), String(s.dist.star)]] },
      ];
      if (evRows.length) blocks.push({ type: 'table', title: 'לפי הערכה', columns: ['הערכה', 'תאריך', 'נבחנו', 'ממוצע', 'חציון', 'נכשל/בינוני/טוב/מצטיין', 'חסר ציון'], rows: evRows, note: 'התפלגות: מתחת ל-56 / 56–79 / 80–89 / 90 ומעלה' });
      if (imp.length || dec.length) blocks.push({ type: 'table', title: 'שינויים בהערכה האחרונה', columns: ['תלמיד', 'שינוי מתוקן', 'ציון אחרון', 'ממוצע קודם'], rows: [...imp, ...dec].map((m) => [studentName(db, m.studentId), `${m.adjusted > 0 ? '+' : ''}${m.adjusted}`, String(m.latest), String(m.prevAvg)]), note: 'שינוי מתוקן = שינוי התלמיד פחות שינוי ממוצע הכיתה באותן הערכות. מוצגים שינויים של 10 נקודות ומעלה.' });
      const model: Record<string, unknown> = { group: g.name, term: s.term, students: s.students, avg: s.avg, median: s.median, distribution: s.dist, withoutTermAverage: s.noGrades.length, assessments: heldEvents(s.events).map((e) => ({ title: e.title, n: e.n, avg: e.avg, median: e.median, min: e.min, max: e.max, dist: e.dist, missing: e.missing.length })), methodNote: 'שינוי מתוקן = שינוי התלמיד פחות שינוי הממוצע הכיתתי; אין נתוני נושא בציונים' };
      if (ctx.level === 'B') { model.improved = imp.map((m) => ({ s: alias.alias(m.studentId), adj: m.adjusted, latest: m.latest, prev: m.prevAvg })); model.declined = dec.map((m) => ({ s: alias.alias(m.studentId), adj: m.adjusted, latest: m.latest, prev: m.prevAvg })); model.belowPass = s.belowPass.map(alias.alias); }
      return { model, blocks, sources: [`ציונים: ${g.name}, ${termName(s.term)}`], summary: s.avg === null ? 'אין עדיין ציונים' : `ממוצע ${s.avg}, חציון ${s.median}, ${s.dist.fail} מתחת ל-56` };
    },
  },
  {
    name: 'top_movers', description: 'מי השתפר או ירד הכי הרבה בהערכה האחרונה לעומת הציונים הקודמים שלו (מתוקן בשינוי ממוצע הכיתה)', studentLevel: true,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה' }, direction: { type: 'string', description: 'up או down' }, term: { type: 'number', description: '1 או 2' } } },
    run: (ctx, a) => {
      const { db, alias } = ctx; const g = resolveGroup(db, a.group, ctx.groupId); if (!g) return noGroup;
      const t = a.term === 1 || a.term === 2 ? a.term : activeTerm(groupYear(db, g)); const evs = groupEvents(db, g, t);
      const mv = movements(evs, activeStudents(db, g.id).map((s) => s.id));
      if (!mv.length) return need('אין מספיק הערכות עם ציונים (נדרשות לפחות שתיים) כדי להשוות');
      const sorted = [...mv].sort((x, y) => (a.direction === 'down' ? x.adjusted - y.adjusted : y.adjusted - x.adjusted)).slice(0, 5);
      return { model: { group: g.name, term: t, direction: a.direction === 'down' ? 'down' : 'up', rows: sorted.map((m) => ({ s: alias.alias(m.studentId), adj: m.adjusted, raw: m.delta, latest: m.latest, prevAvg: m.prevAvg })), basis: `ההערכה האחרונה: ${mv[0].latestTitle}` }, blocks: [{ type: 'table', title: `${g.name} · ${termName(t)} · ${a.direction === 'down' ? 'ירידה' : 'שיפור'} בהערכה "${mv[0].latestTitle}"`, columns: ['תלמיד', 'שינוי מתוקן', 'שינוי גולמי', 'ציון אחרון', 'ממוצע קודם'], rows: sorted.map((m) => [studentName(db, m.studentId), String(m.adjusted), String(m.delta), String(m.latest), String(m.prevAvg)]), note: 'שינוי מתוקן = שינוי התלמיד פחות שינוי ממוצע הכיתה.' }], sources: [`ציונים: ${g.name}, ${termName(t)}`], summary: `${studentName(db, sorted[0].studentId)}: שינוי מתוקן ${sorted[0].adjusted}` };
    },
  },
  {
    name: 'student_profile', description: 'נתוני תלמיד: ציוני הערכות מול ממוצע הכיתה, ממוצעי מחצית, מגמה, שינוי אחרון, נושאים שנלמדו. התלמיד מזוהה בכינוי (ST-n)', studentLevel: true,
    parameters: { type: 'object', properties: { student: { type: 'string', description: 'כינוי התלמיד, למשל ST-17' }, group: { type: 'string', description: 'שם קבוצה (אופציונלי)' } }, required: ['student'] },
    run: (ctx, a) => {
      const { db, alias } = ctx; const sid = resolveStudent(ctx, a.student); if (!sid) return need('התלמיד לא זוהה');
      const g = resolveGroup(db, a.group, ctx.groupId) ?? db.study_groups.find((x) => !x.archived_at && activeStudents(db, x.id).some((s) => s.id === sid));
      if (!g) return noGroup;
      const p = studentProfile(db, g, sid); if (!p) return need('התלמיד לא נמצא');
      const rows = p.assessments.filter((x) => x.status !== 'missing' || p.assessments.length).map((x) => [x.title, termName(x.term), x.status === 'score' ? String(x.score) : x.status === 'absent' ? 'לא נבחן' : x.status === 'exempt' ? 'פטור' : 'חסר', x.classAvg === null ? '' : String(x.classAvg), x.diff === null ? '' : `${x.diff > 0 ? '+' : ''}${x.diff}`]);
      const model = { student: alias.alias(sid), gender: p.student.gender ?? null, group: g.name, terms: p.terms.map((t) => ({ term: t.term, calculated: t.calculated, partial: t.partial, final: t.final })), annual: p.annual, assessments: p.assessments.map((x) => ({ title: x.title, term: x.term, score: x.score, status: x.status, classAvg: x.classAvg, diffFromClass: x.diff })), trend: p.trend, lastChange: p.move && { latest: p.move.latest, prevAvg: p.move.prevAvg, adjusted: p.move.adjusted }, recentLessonTopics: p.lessons.topics };
      return { model, blocks: [{ type: 'table', title: `${studentName(db, sid)} · ${g.name}`, columns: ['הערכה', 'מחצית', 'ציון', 'ממוצע כיתה', 'הפרש'], rows, note: `מגמה: ${p.trend.label}${p.trend.slope !== null ? ` (${p.trend.slope > 0 ? '+' : ''}${p.trend.slope} נק׳ להערכה)` : ''}${p.terms.map((t) => ` · ${termName(t.term)}: ${t.final ?? t.calculated ?? '—'}`).join('')}` }], sources: [`ציונים: ${studentName(db, sid)}, ${g.name}`, 'תיעוד שיעורים'], summary: `${p.assessments.filter((x) => x.status === 'score').length} ציונים, מגמה: ${p.trend.label}` };
    },
  },
  {
    name: 'next_lesson_prep', description: 'מה כדאי להכין לשיעור הבא של קבוצה: מועד השיעור הבא, מה תועד בשיעורים האחרונים, שיעורי בית אחרונים והערכות אחרונות', studentLevel: false,
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'שם קבוצה' } } },
    run: (ctx, a) => {
      const { db, now } = ctx; const g = resolveGroup(db, a.group, ctx.groupId); if (!g) return noGroup;
      const evs = db.calendar_events.filter((e) => e.group_id === g.id && !e.hidden && e.status === 'confirmed').sort((x, y) => x.start_at.localeCompare(y.start_at));
      const next = evs.find((e) => new Date(e.start_at) > now); const past = evs.filter((e) => new Date(e.start_at) <= now).slice(-3).reverse();
      const logs = past.map((e) => ({ date: fmtDay(e.start_at), ...(db.lesson_logs.find((l) => l.calendar_event_id === e.id) ?? {}) }));
      const sum = classSummary(db, g); const last = heldEvents(sum.events).slice(-1)[0];
      const items = [next ? `השיעור הבא: ${fmtDay(next.start_at)} ${fmtTime(next.start_at)}` : 'אין שיעור עתידי ביומן', ...logs.map((l) => `${l.date}: ${('topic' in l && l.topic) || 'לא תועד נושא'}${'homework' in l && l.homework ? ` · שיעורי בית: ${l.homework}` : ''}`), last ? `ההערכה האחרונה: ${last.title}, ממוצע ${last.avg}` : 'אין הערכות עם ציונים'];
      return { model: { group: g.name, nextLesson: next ? fmtDay(next.start_at) : null, lastLessons: logs.map((l) => ({ date: l.date, topic: 'topic' in l ? l.topic : null, learned: 'learned' in l ? l.learned : null, homework: 'homework' in l ? l.homework : null })), lastAssessment: last ? { title: last.title, avg: last.avg, belowPass: last.dist.fail } : null }, blocks: [{ type: 'list', title: `להכנה לשיעור הבא · ${g.name}`, items }], sources: ['יומן', 'תיעוד שיעורים', 'ציונים'], summary: items[0] };
    },
  },
];
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
export const declarations = (level: 'A' | 'B') => [{ functionDeclarations: TOOLS.filter((t) => level === 'B' || !t.studentLevel).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
