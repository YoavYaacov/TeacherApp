import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import type { AiContext, AiConversation, AiMessage } from '../../data/types';
import type { TurnResult } from '../../ai/agent';
import { generate } from '../../ai/gemini';
import { getPrefs, type AiPrefs } from '../../ai/prefs';
import { guessGender } from '../../ai/pseudo';
import { classAnalysis, evaluations, lessonPlan, lessonSummaryDraft, periodSummary, practice, studentFile, studentsOf, type TaskEnv } from '../../ai/tasks';
import { activeTerm, groupYear, label } from '../../lib/domain';
import { fmtDay, iso } from '../../lib/util';

export type TaskKind = 'class' | 'eval' | 'student' | 'plan' | 'practice' | 'summary' | 'menu';
export interface WizardProps {
  kind: TaskKind; ctx: AiContext; blocked: boolean; onClose(): void; onProgress(s: string | null): void;
  post(userText: string, produce: (c: AiConversation, h: AiMessage[]) => Promise<TurnResult>): Promise<void>;
}
const ctxGroup = (c: AiContext) => (c.kind === 'system' ? '' : c.group_id);
const ctxStudent = (c: AiContext) => (c.kind === 'student' ? c.student_id : '');
const TITLES: Record<TaskKind, string> = { class: 'ניתוח כיתה', eval: 'הערכות לתעודה', student: 'תיק תלמיד חכם', plan: 'תכנון שיעור', practice: 'יצירת תרגול', summary: 'סיכום ותיעוד שיעורים', menu: 'פעולות מהירות' };

export function Wizard(props: WizardProps) {
  const [kind, setKind] = useState<TaskKind>(props.kind);
  const store = useStore();
  const prefs = getPrefs(store.db);
  const env = (c: AiConversation): TaskEnv => ({ db: store.db, conv: c, prefs, gen: generate, createDrafts: (rows) => store.save('ai_drafts', rows as never), onProgress: (d, t) => props.onProgress(t > 3 ? `מכין הערכות… ${Math.min(d, t)}/${t}` : null) });
  const run = (userText: string, task: (e: TaskEnv) => Promise<TurnResult>) => { props.onClose(); void props.post(userText, async (c) => { try { return await task(env(c)); } finally { props.onProgress(null); } }); };
  const common = { ...props, env, run, prefs };
  return (
    <Modal title={TITLES[kind]} onClose={props.onClose}>
      {kind === 'menu' && <div className="quick">{(['class', 'eval', 'student', 'plan', 'practice', 'summary'] as TaskKind[]).map((k) => <button key={k} className="quick-btn" onClick={() => setKind(k)}><strong>{TITLES[k]}</strong></button>)}</div>}
      {kind === 'class' && <ClassForm {...common} />}
      {kind === 'student' && <StudentForm {...common} />}
      {kind === 'eval' && <EvalForm {...common} />}
      {kind === 'plan' && <PlanForm {...common} />}
      {kind === 'practice' && <PracticeForm {...common} />}
      {kind === 'summary' && <SummaryForm {...common} />}
    </Modal>
  );
}
interface FP extends WizardProps { env(c: AiConversation): TaskEnv; run(t: string, f: (e: TaskEnv) => Promise<TurnResult>): void; prefs: AiPrefs }

function GroupSelect({ value, onChange, optional }: { value: string; onChange(v: string): void; optional?: boolean }) {
  const { db } = useStore(); const gs = db.study_groups.filter((g) => !g.archived_at);
  return <label className="field">קבוצה<select className="input" value={value} onChange={(e) => onChange(e.target.value)}>{optional && <option value="">ללא קבוצה מסוימת</option>}{!optional && !value && <option value="">בחר…</option>}{gs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>;
}
const Blocked = ({ show }: { show: boolean }) => show ? <p className="note-banner">המכסה היומית של ה-AI נגמרה. אפשר עדיין לראות את החישובים, אבל הניסוח המילולי לא יהיה זמין עד שהמכסה תתחדש.</p> : null;
const Note = () => <p className="muted small">למודל נשלחים נתונים בכינויים בלבד (בלי שמות), ושמות שתכתוב כאן מוחלפים אוטומטית. הערות פרטיות לשיעורים לא נשלחות לעולם.</p>;

function ClassForm({ ctx, run, blocked, prefs }: FP) {
  const { db } = useStore(); const [gid, setGid] = useState(ctxGroup(ctx)); const g = db.study_groups.find((x) => x.id === gid);
  const [term, setTerm] = useState<0 | 1 | 2>(0);
  return <div className="form"><Blocked show={blocked} /><GroupSelect value={gid} onChange={setGid} />
    <label className="field">מחצית<select className="input" value={term} onChange={(e) => setTerm(Number(e.target.value) as 0 | 1 | 2)}><option value={0}>המחצית הפעילה{g ? ` (${activeTerm(groupYear(db, g)) === 1 ? 'א׳' : 'ב׳'})` : ''}</option><option value={1}>מחצית א׳</option><option value={2}>מחצית ב׳</option></select></label>
    {prefs.level === 'A' && <p className="muted small">רמת פרטיות א׳: למודל נשלחים נתונים מצטברים בלבד.</p>}<Note />
    <button className="btn primary" disabled={!g} onClick={() => run(`נתח את הכיתה ${g!.name}${term ? ` (מחצית ${term === 1 ? 'א׳' : 'ב׳'})` : ''}`, (e) => classAnalysis(e, { groupId: g!.id, term: term || undefined }))}>נתח</button></div>;
}

function StudentForm({ ctx, run, prefs }: FP) {
  const { db } = useStore(); const [gid, setGid] = useState(ctxGroup(ctx)); const studs = gid ? studentsOf(db, gid) : [];
  const [sid, setSid] = useState(ctxStudent(ctx)); const s = studs.find((x) => x.id === sid);
  return <div className="form">{prefs.level === 'A' && <p className="issue" role="alert">ניתוח תלמיד דורש לשלוח למודל את נתוני התלמיד בכינוי. הפעל רמת פרטיות ב׳ בהגדרות העוזר.</p>}
    <GroupSelect value={gid} onChange={(v) => { setGid(v); setSid(''); }} />
    <label className="field">תלמיד<select className="input" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">בחר…</option>{studs.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select></label><Note />
    <button className="btn primary" disabled={!s || prefs.level === 'A'} onClick={() => run(`בנה לי תיק תלמיד חכם עבור ${label(s!)}`, (e) => studentFile(e, { groupId: gid, studentId: s!.id }))}>בנה תיק</button></div>;
}

function EvalForm({ ctx, run, prefs, blocked }: FP) {
  const store = useStore(); const { db } = store;
  const [gid, setGid] = useState(ctxGroup(ctx)); const g = db.study_groups.find((x) => x.id === gid);
  const [period, setPeriod] = useState<'h1' | 'h2' | 'annual'>(() => (g && activeTerm(groupYear(db, g)) === 2 ? 'h2' : 'h1'));
  const studs = gid ? studentsOf(db, gid) : [];
  const [scope, setScope] = useState<'one' | 'all'>(ctx.kind === 'student' ? 'one' : 'all'); const [sid, setSid] = useState(ctxStudent(ctx));
  const [style, setStyle] = useState(prefs.evalStyle), [length, setLength] = useState(prefs.evalLength), [voice, setVoice] = useState(prefs.evalVoice);
  const [saveDefault, setSaveDefault] = useState(false); const [note, setNote] = useState('');
  const chosen = scope === 'all' ? studs : studs.filter((s) => s.id === sid);
  const [genders, setGenders] = useState<Record<string, 'm' | 'f' | ''>>({});
  useEffect(() => { setGenders(Object.fromEntries(studs.filter((s) => !s.gender).map((s) => [s.id, guessGender(s.first_name) ?? '']))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [gid]);
  const noGender = chosen.filter((s) => !s.gender);
  const go = async () => {
    if (!g) return;
    for (const s of noGender) if (genders[s.id]) await store.patch('students', s.id, { gender: genders[s.id] as 'm' | 'f' });
    if (saveDefault) { const cur = db.user_settings[0]; await store.save('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), ai: { ...((cur?.prefs?.ai as object) ?? {}), evalStyle: style, evalLength: length, evalVoice: voice } } }]); }
    const upd = { ...db, students: db.students.map((s) => (genders[s.id] ? { ...s, gender: genders[s.id] as 'm' | 'f' } : s)) };
    run(`כתוב הערכות לתעודה (${period === 'h1' ? 'מחצית א׳' : period === 'h2' ? 'מחצית ב׳' : 'שנתי'}) ל${scope === 'all' ? `כל תלמידי ${g.name}` : label(chosen[0])}`, (e) => evaluations({ ...e, db: upd }, { groupId: g.id, period, studentIds: chosen.map((s) => s.id), style, length, voice, notes: scope === 'one' && note.trim() ? { [chosen[0].id]: note.trim() } : undefined }));
  };
  if (prefs.level === 'A') return <p className="issue" role="alert">הערכות אישיות דורשות לשלוח למודל נתוני תלמידים בכינויים. הפעל רמת פרטיות ב׳ בהגדרות העוזר.</p>;
  return <div className="form"><Blocked show={blocked} /><GroupSelect value={gid} onChange={(v) => { setGid(v); setSid(''); }} />
    <div className="row"><label className="field">תקופה<select className="input" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}><option value="h1">מחצית א׳</option><option value="h2">מחצית ב׳</option><option value="annual">שנתי</option></select></label>
      <label className="field">עבור<select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="all">כל הכיתה</option><option value="one">תלמיד אחד</option></select></label></div>
    {scope === 'one' && <><label className="field">תלמיד<select className="input" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">בחר…</option>{studs.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select></label>
      <label className="field">מידע נוסף שתרצה שייכלל (אופציונלי: דברים שאתה יודע על התלמיד)<textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label></>}
    <div className="row"><label className="field">סגנון<select className="input" value={style} onChange={(e) => setStyle(e.target.value as typeof style)}><option value="encouraging">מעודד</option><option value="factual">עובדתי</option><option value="professional">מקצועי</option><option value="personal">אישי</option></select></label>
      <label className="field">אורך<select className="input" value={length} onChange={(e) => setLength(e.target.value as typeof length)}><option value="short">קצר</option><option value="medium">בינוני</option><option value="detailed">מפורט</option></select></label>
      <label className="field">גוף<select className="input" value={voice} onChange={(e) => setVoice(e.target.value as typeof voice)}><option value="third">גוף שלישי</option><option value="direct">פנייה לתלמיד</option></select></label></div>
    <label className="row"><input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} /> זכור כברירת מחדל</label>
    {noGender.length > 0 && <details open><summary>מגדר חסר ל-{noGender.length} תלמידים (נדרש לניסוח בעברית)</summary>
      <p className="muted small">ההצעה נגזרת מהשם הפרטי בלבד; תקן לפי הצורך. בלי בחירה ינוסח ניטרלית. הבחירה נשמרת בכרטיס התלמיד.</p>
      <ul className="list">{noGender.map((s) => <li key={s.id}><span>{label(s)}</span><span className="seg" role="group" aria-label={`מגדר ${label(s)}`}>{([['m', 'זכר'], ['f', 'נקבה'], ['', 'לא צוין']] as const).map(([v, l]) => <button key={v} aria-pressed={(genders[s.id] ?? '') === v} onClick={() => setGenders((x) => ({ ...x, [s.id]: v }))}>{l}</button>)}</span></li>)}</ul></details>}
    <Note /><p className="muted small">ההערכות מבוססות על ציונים בלבד, כי אין במערכת נתוני התנהגות או השתתפות. כתיבה לכיתה שלמה נעשית בקבוצות קטנות, וייתכן שתימשך דקה או יותר.</p>
    <button className="btn primary" disabled={!g || chosen.length === 0 || (scope === 'one' && !sid)} onClick={() => void go()}>הכן טיוטות ({chosen.length})</button></div>;
}

function PlanForm({ ctx, run, blocked }: FP) {
  const { db } = useStore(); const [gid, setGid] = useState(ctxGroup(ctx)); const g = db.study_groups.find((x) => x.id === gid);
  const [level, setLevel] = useState(g?.grade_level ?? ''); const [topic, setTopic] = useState(''); const [minutes, setMinutes] = useState('45'); const [goals, setGoals] = useState(''); const [notes, setNotes] = useState('');
  const [cl, setCl] = useState<'weak' | 'regular' | 'strong' | 'mixed'>('mixed'); const [hw, setHw] = useState(true);
  const recent = g ? [...new Set(db.calendar_events.filter((e) => e.group_id === g.id).sort((a, b) => b.start_at.localeCompare(a.start_at)).map((e) => db.lesson_logs.find((l) => l.calendar_event_id === e.id)?.topic?.trim()).filter((t): t is string => !!t))].slice(0, 5) : [];
  return <div className="form"><Blocked show={blocked} /><GroupSelect value={gid} onChange={(v) => { setGid(v); setLevel(db.study_groups.find((x) => x.id === v)?.grade_level ?? ''); }} optional />
    <label className="field">שכבה / רמה<input className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="למשל: י׳ 5 יח״ל" /></label>
    <label className="field">נושא<input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="למשל: משוואות ריבועיות" />{recent.length > 0 && <small className="muted">נושאים שתועדו לאחרונה: {recent.map((t) => <button key={t} className="chip" onClick={() => setTopic(t)}>{t}</button>)}</small>}</label>
    <div className="row"><label className="field">משך (דקות)<input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <label className="field">רמת הכיתה<select className="input" value={cl} onChange={(e) => setCl(e.target.value as typeof cl)}><option value="weak">חלשה</option><option value="regular">רגילה</option><option value="strong">חזקה</option><option value="mixed">מעורבת</option></select></label></div>
    <label className="field">מטרות (אופציונלי)<textarea className="input" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} /></label>
    <label className="field">הערות מיוחדות (אופציונלי)<textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <label className="row"><input type="checkbox" checked={hw} onChange={(e) => setHw(e.target.checked)} /> כלול שיעורי בית</label>
    <p className="muted small">לא נשלחים נתוני תלמידים. המערך הוא טיוטה לעריכה.</p>
    <button className="btn primary" disabled={!topic.trim() || !level.trim() || !(Number(minutes) > 0)} onClick={() => run(`תכנן שיעור: ${topic.trim()} (${level.trim()}, ${minutes} דקות)`, (e) => lessonPlan(e, { groupId: gid || undefined, level: level.trim(), topic: topic.trim(), minutes: Number(minutes), goals: goals.trim() || undefined, classLevel: cl, notes: notes.trim() || undefined, homework: hw }))}>תכנן</button></div>;
}

function PracticeForm({ ctx, run, blocked }: FP) {
  const { db } = useStore(); const [gid, setGid] = useState(ctxGroup(ctx)); const g = db.study_groups.find((x) => x.id === gid);
  const [level, setLevel] = useState(g?.grade_level ?? ''); const [topic, setTopic] = useState(''); const [notes, setNotes] = useState('');
  const [c, setC] = useState({ basic: 3, medium: 3, challenging: 2 });
  const num = (k: keyof typeof c) => <label className="field">{k === 'basic' ? 'בסיסיים' : k === 'medium' ? 'בינוניים' : 'אתגר'}<input className="input" inputMode="numeric" value={c[k]} onChange={(e) => setC({ ...c, [k]: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} /></label>;
  return <div className="form"><Blocked show={blocked} /><GroupSelect value={gid} onChange={(v) => { setGid(v); setLevel(db.study_groups.find((x) => x.id === v)?.grade_level ?? ''); }} optional />
    <label className="field">שכבה / רמה<input className="input" value={level} onChange={(e) => setLevel(e.target.value)} /></label>
    <label className="field">נושא<input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="למשל: משוואות עם שברים" /></label>
    <div className="row">{num('basic')}{num('medium')}{num('challenging')}</div>
    <label className="field">הערות (אופציונלי)<textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <p className="muted small">הפתרונות נבדקים חישובית כשאפשר (משוואות בנעלם אחד וערכים מספריים). מה שלא נבדק יסומן ככזה.</p>
    <button className="btn primary" disabled={!topic.trim() || !level.trim() || c.basic + c.medium + c.challenging === 0} onClick={() => run(`צור תרגול: ${topic.trim()} (${level.trim()})`, (e) => practice(e, { groupId: gid || undefined, level: level.trim(), topic: topic.trim(), counts: c, notes: notes.trim() || undefined }))}>צור תרגול</button></div>;
}

function SummaryForm({ ctx, run, blocked }: FP) {
  const { db } = useStore(); const [mode, setMode] = useState<'lesson' | 'period'>('lesson');
  const [gid, setGid] = useState(ctxGroup(ctx)); const now = new Date();
  const past = useMemo(() => db.calendar_events.filter((e) => e.group_id === gid && !e.hidden && e.status === 'confirmed' && new Date(e.start_at) <= now).sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 30), [db.calendar_events, gid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [eid, setEid] = useState(ctx.kind === 'lesson' ? ctx.event_id : ''); const [notes, setNotes] = useState('');
  const [from, setFrom] = useState(iso(new Date(now.getTime() - 7 * 86400000))); const [to, setTo] = useState(iso(now));
  const g = db.study_groups.find((x) => x.id === gid); const ev = past.find((e) => e.id === (eid || past[0]?.id));
  return <div className="form"><Blocked show={blocked} /><div className="seg" role="group" aria-label="סוג סיכום"><button aria-pressed={mode === 'lesson'} onClick={() => setMode('lesson')}>תיעוד שיעור מהערות</button><button aria-pressed={mode === 'period'} onClick={() => setMode('period')}>סיכום תקופה</button></div>
    <GroupSelect value={gid} onChange={(v) => { setGid(v); setEid(''); }} />
    {mode === 'lesson' ? <>
      <label className="field">שיעור<select className="input" value={ev?.id ?? ''} onChange={(e) => setEid(e.target.value)}>{past.map((e) => <option key={e.id} value={e.id}>{fmtDay(e.start_at)} · {new Date(e.start_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</option>)}</select></label>
      <label className="field">הערות חופשיות על השיעור<textarea className="input" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="מה למדנו, מה היה קשה, מה מתוכנן להמשך…" /></label>
      <p className="muted small">אארגן רק את מה שכתבת, בלי להוסיף. תקבל טיוטה לעריכה, ותיעוד קיים לא יידרס בלי אישורך.</p><Note />
      <button className="btn primary" disabled={!ev || !notes.trim()} onClick={() => run(`ארגן לי תיעוד לשיעור ${fmtDay(ev!.start_at)} של ${g?.name}`, (e) => lessonSummaryDraft(e, { eventId: ev!.id, notes }))}>הכן טיוטת תיעוד</button></> : <>
      <div className="row"><label className="field">מתאריך<input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="field">עד תאריך<input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
      <p className="muted small">הסיכום מבוסס על תיעוד השיעורים שכבר קיים (בלי הערות פרטיות).</p>
      <button className="btn primary" disabled={!g || from > to} onClick={() => run(`סכם את ההתקדמות של ${g!.name} בין ${from.split('-').reverse().join('.')} ל-${to.split('-').reverse().join('.')}`, (e) => periodSummary(e, { groupId: g!.id, from, to }))}>סכם</button></>}
  </div>;
}
