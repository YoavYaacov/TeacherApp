import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, Copy, FileDown, FileText, Globe, GraduationCap, HelpCircle, ListChecks, MessageSquarePlus, Plus, Send, Settings2, Sparkles, Trash2, Users, UserRound, X } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { Modal } from '../Modal';
import { Markdown } from '../Markdown';
import type { AiContext, AiConversation, AiMessage } from '../../data/types';
import { runTurn, trimCut, CONTINUE_TEXT, type TurnResult } from '../../ai/agent';
import type { Block } from '../../ai/tools';
import { resetLabel, LIMIT_NOTE } from '../../ai/quota';
import { aiStatus, generate, isFail } from '../../ai/gemini';
import { getPrefs } from '../../ai/prefs';
import { makeAliasMap } from '../../ai/pseudo';
import { matchIntent } from '../../ai/local';
import { activeStudents, label } from '../../lib/domain';
import { MessageBlocks, Sources, AiActionsCtx } from './ChatBits';
import { regenerateEvaluation } from '../../ai/tasks';
import type { AiDraft } from '../../data/types';
import { Wizard, type TaskKind } from './AiWizards';
import { boot, saveView } from '../viewState';
import { copyRich, downloadDocx, downloadHtml, messageMarkdown } from '../exportActions';

const ctxTitle = (db: ReturnType<typeof useStore>['db'], c: AiContext) => {
  if (c.kind === 'system') return 'כל המערכת';
  const g = db.study_groups.find((x) => x.id === c.group_id)?.name ?? 'קבוצה';
  if (c.kind === 'group') return `קבוצה: ${g}`;
  if (c.kind === 'student') { const s = db.students.find((x) => x.id === c.student_id); return `תלמיד: ${s ? label(s) : ''} · ${g}`; }
  const e = db.calendar_events.find((x) => x.id === c.event_id);
  return `שיעור: ${g}${e ? ` · ${new Date(e.start_at).toLocaleDateString('he-IL')}` : ''}`;
};
const when = (s: string) => new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });

const QUICK: { kind: TaskKind | 'ask'; label: string; Icon: typeof Sparkles; hint: string }[] = [
  { kind: 'class', label: 'נתח כיתה', Icon: Users, hint: 'ממוצעים, התפלגות, שינויים והמלצות' },
  { kind: 'eval', label: 'הערכות לתעודה', Icon: FileText, hint: 'טיוטות אישיות לתלמיד או לכיתה' },
  { kind: 'student', label: 'נתח תלמיד', Icon: UserRound, hint: 'תיק תלמיד חכם' },
  { kind: 'plan', label: 'תכנן שיעור', Icon: BookOpen, hint: 'מערך שיעור מלא' },
  { kind: 'practice', label: 'צור תרגול', Icon: ListChecks, hint: 'תרגילים עם פתרונות ובדיקה' },
  { kind: 'summary', label: 'סכם שיעורים', Icon: GraduationCap, hint: 'תיעוד מהערות חופשיות' },
  { kind: 'ask', label: 'שאל על המערכת', Icon: HelpCircle, hint: 'למשל: אילו שיעורים לא תועדו?' },
];
const EXAMPLES = ['אילו שיעורים עדיין לא תועדו?', 'כמה שיעורים היו החודש?', 'מי השתפר הכי הרבה?', 'מה כדאי להכין לשיעור הבא?'];

let bootUsed = false; // שחזור שיחה פתוחה רק ברענון הדף; לחיצה על "העוזר האישי" תמיד פותחת שיחה חדשה
export function AssistantPage() {
  const store = useStore();
  const { db, kind } = store;
  const { aiCtx, clearAiCtx } = useNav();
  const prefs = getPrefs(db);
  const convs = useMemo(() => [...db.ai_conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [db.ai_conversations]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftCtx, setDraftCtx] = useState<AiContext>({ kind: 'system' });
  const restore = useRef(!bootUsed && boot.page === 'assistant');
  const [text, setText] = useState(() => (restore.current ? boot.chatText ?? '' : ''));
  useEffect(() => { saveView({ chatText: text }); }, [text]);
  useEffect(() => { saveView({ convId: activeId }); }, [activeId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; blocked?: boolean } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [usageInfo, setUsageInfo] = useState(false);
  const [pickCtx, setPickCtx] = useState(false);
  const [wizard, setWizard] = useState<TaskKind | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(Date.now()); const scrolled = useRef(false);
  const busyRef = useRef(false);

  const conv = convs.find((c) => c.id === activeId) ?? null;
  const ctx = conv?.context ?? draftCtx;
  const messages = useMemo(() => db.ai_messages.filter((m) => m.conversation_id === activeId).sort((a, b) => a.created_at.localeCompare(b.created_at)), [db.ai_messages, activeId]);

  // כניסה מכרטיס (תלמיד/קבוצה/שיעור): שיחה חדשה בהקשר הזה
  useEffect(() => {
    if (aiCtx) { setActiveId(null); setDraftCtx(aiCtx); clearAiCtx(); setErr(null); }
    else if (restore.current && boot.convId && convs.some((c) => c.id === boot.convId)) setActiveId(boot.convId);
    bootUsed = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = listRef.current; if (!el) return; const smooth = scrolled.current && document.documentElement.dataset.anim !== 'off'; scrolled.current = true; el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }, [messages.length, busy, activeId]);
  useEffect(() => {
    if (kind !== 'supabase') return;
    void aiStatus().then((s) => { if (isFail(s)) { if (s.error === 'not_deployed') setNotDeployed(true); return; } setUsage({ used: s.used, limit: s.limit }); if (s.blockedUntil) setBlockedUntil(s.blockedUntil); if (!s.configured) setErr({ message: 'העוזר עדיין לא הוגדר: חסר המפתח GEMINI_API_KEY ב-Supabase (ראה הוראות ההתקנה).' }); });
  }, [kind]);
  const blocked = !!blockedUntil && new Date(blockedUntil) > new Date();

  const ensureConv = useCallback(async (firstText: string): Promise<AiConversation> => {
    if (conv) return conv;
    const [c] = await store.save('ai_conversations', [{ title: firstText.slice(0, 48) || 'שיחה חדשה', context: draftCtx, updated_at: new Date().toISOString() }]);
    setActiveId(c.id); return c;
  }, [conv, draftCtx, store]);

  /** שולח הודעה ומקבל תשובה; מבטל כפילויות (לחיצה כפולה) */
  const post = useCallback(async (userText: string, produce: (c: AiConversation, history: AiMessage[]) => Promise<TurnResult>) => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setErr(null);
    try {
      const c = await ensureConv(userText);
      const history = db.ai_messages.filter((m) => m.conversation_id === c.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      await store.save('ai_messages', [{ conversation_id: c.id, role: 'user', content: userText, blocks: [], sources: [], created_at: new Date().toISOString() }]);
      const r = await produce(c, history);
      if (!r.ok) {
        if (r.blockedUntil) setBlockedUntil(r.blockedUntil);
        setErr({ message: r.message, blocked: r.error === 'quota_exhausted' || r.error === 'daily_limit' });
      } else {
        if (r.usage) setUsage(r.usage);
        await store.save('ai_messages', [{ conversation_id: c.id, role: 'assistant', content: r.text, blocks: r.truncated ? [...r.blocks, { type: 'truncated' }] : r.blocks, sources: r.sources, created_at: new Date(Date.now() + 1).toISOString() }]);
      }
      await store.patch('ai_conversations', c.id, { updated_at: new Date().toISOString() });
    } catch (e) { setErr({ message: `השמירה נכשלה: ${(e as Error).message}` }); }
    finally { busyRef.current = false; setBusy(false); }
  }, [db.ai_messages, ensureConv, store]);

  const send = async () => {
    const t = text.trim(); if (!t || busyRef.current) return;
    if (blocked && !matchIntent(db, t)) { setErr({ message: 'המכסה החינמית היומית נגמרה, ולכן שאלות שדורשות AI חסומות עד שתתחדש. שאלות עובדתיות על המערכת (שיעורים, תיעוד, ציונים) עדיין עובדות.', blocked: true }); return; }
    setText('');
    await post(t, (c, history) => runTurn({ db, conv: c, history, text: t, prefs, gen: generate }));
  };

  /** המשך תשובה שנקטעה: קריאה אחת קצרה, בלי לחזור על מה שנכתב; ההמשך מתחבר לאותה הודעה */
  const continueReply = async (m: AiMessage) => {
    if (busyRef.current || blocked) return; busyRef.current = true; setBusy(true); setErr(null);
    try {
      const c = db.ai_conversations.find((x) => x.id === m.conversation_id); if (!c) return;
      const history = db.ai_messages.filter((x) => x.conversation_id === c.id && x.created_at <= m.created_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const tail = trimCut(m.content).slice(-160);
      const r = await runTurn({ db, conv: c, history, text: CONTINUE_TEXT(tail), prefs, gen: generate, continuation: true });
      if (!r.ok) { if (r.blockedUntil) setBlockedUntil(r.blockedUntil); setErr({ message: r.message, blocked: r.error === 'quota_exhausted' || r.error === 'daily_limit' }); return; }
      if (r.usage) setUsage(r.usage);
      const head = trimCut(m.content); const glue = /^[\s.,;:!?)\]]/.test(r.text) || /\s$/.test(head) ? '' : ' ';
      await store.patch('ai_messages', m.id, { content: head + glue + r.text, blocks: [...(m.blocks as Block[]).filter((b) => b.type !== 'truncated'), ...(r.truncated ? [{ type: 'truncated' }] : [])] });
      await store.patch('ai_conversations', c.id, { updated_at: new Date().toISOString() });
    } catch (e) { setErr({ message: `ההמשך נכשל: ${(e as Error).message}` }); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const newChat = () => { setActiveId(null); setDraftCtx({ kind: 'system' }); setErr(null); setShowHist(false); };
  const del = async (c: AiConversation) => {
    if (!confirm(`למחוק את השיחה "${c.title}"?`)) return;
    await store.del('ai_messages', { conversation_id: c.id }); await store.del('ai_conversations', { id: c.id });
    if (activeId === c.id) newChat();
  };
  const setCtx = async (c: AiContext) => { if (conv) await store.patch('ai_conversations', conv.id, { context: c }); else setDraftCtx(c); setPickCtx(false); };
  const cloud = kind === 'supabase';
  const actions = useMemo(() => ({
    busy: regenBusy || busy,
    regenerate: async (d: AiDraft, note?: string) => {
      if (busyRef.current) return; busyRef.current = true; setRegenBusy(true); setErr(null);
      try {
        const c = db.ai_conversations.find((x) => x.id === d.conversation_id) ?? conv;
        if (!c) return;
        const r = await regenerateEvaluation({ db, conv: c, prefs, gen: generate, createDrafts: async () => [] }, d, note, async (id, payload) => { await store.patch('ai_drafts', id, { payload }); });
        if (!r.ok) setErr({ message: r.message, blocked: r.error === 'quota_exhausted' || r.error === 'daily_limit' }); else if (r.usage) setUsage(r.usage);
      } catch (e) { setErr({ message: `היצירה מחדש נכשלה: ${(e as Error).message}` }); }
      finally { busyRef.current = false; setRegenBusy(false); }
    },
  }), [regenBusy, busy, db, conv, prefs, store]);

  return (
    <AiActionsCtx.Provider value={actions}>
    <div className="chat">
      <header className="chat-head">
        <h1><Sparkles size={22} aria-hidden /> העוזר האישי</h1>
        <div className="row">
          <button className="btn sm" onClick={() => setShowHist((v) => !v)} aria-expanded={showHist}>שיחות ({convs.length})</button>
          <button className="btn sm" onClick={newChat}><MessageSquarePlus size={15} aria-hidden />חדשה</button>
        </div>
      </header>
      <div className="chat-ctx"><button className="chip" onClick={() => setPickCtx(true)} title="שינוי הקשר"><Settings2 size={14} aria-hidden /> {ctxTitle(db, ctx)}</button>
        {usage && <span className="muted small usage" title={LIMIT_NOTE(usage.limit)}>בקשות AI היום: {usage.used} מתוך {usage.limit} (מגבלה פנימית של TeacherApp) · מתאפס {resetLabel()} (שעון ישראל) <button className="linklike" aria-expanded={usageInfo} onClick={() => setUsageInfo((v) => !v)}>למה?</button></span>}
        {prefs.level === 'B' ? <span className="muted small" title="נתוני תלמידים נשלחים בכינויים בלבד, בלי שמות ובלי הערות פרטיות">פרטיות: כינויים</span> : <span className="muted small">פרטיות: נתונים מצטברים בלבד</span>}</div>
      {usageInfo && usage && <p className="note-banner" role="note">{LIMIT_NOTE(usage.limit)} הספירה מתחילה מחדש בכל חצות לפי שעון ארה״ב המערבית (אותו יום מכסה של Google), כלומר {resetLabel()} לפי שעון ישראל. שאלות עובדתיות על המערכת לא נספרות, כי הן לא משתמשות ב-AI.</p>}
      {showHist && <div className="hist card">
        {convs.length === 0 ? <p className="muted">אין שיחות שמורות</p> : <ul className="list">{convs.map((c) => (
          <li key={c.id}><button className="rowbtn" onClick={() => { setActiveId(c.id); setShowHist(false); setErr(null); }}><span><strong>{c.title}</strong><br /><small className="muted">{ctxTitle(db, c.context)}</small></span><span className="muted">{when(c.updated_at)}</span></button>
            <button className="icon-btn" aria-label={`מחק את השיחה ${c.title}`} onClick={() => void del(c)}><Trash2 size={16} /></button></li>))}</ul>}
      </div>}
      <div className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="muted">איך אפשר לעזור? בחר פעולה או כתוב בעברית חופשית.</p>
            <div className="quick">{QUICK.map(({ kind: k, label: l, Icon, hint }) => (
              <button key={k} className="quick-btn" onClick={() => (k === 'ask' ? document.getElementById('chat-input')?.focus() : setWizard(k))}><Icon size={18} aria-hidden /><strong>{l}</strong><small>{hint}</small></button>))}</div>
            <div className="examples">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => setText(e)}>{e}</button>)}</div>
            {!cloud && <p className="note-banner">מצב מקומי: שאלות עובדתיות על המערכת עובדות. יכולות ה-AI דורשות חיבור לענן (Supabase).</p>}
            {notDeployed && <p className="note-banner">פונקציית ה-AI עדיין לא הותקנה ב-Supabase. שאלות עובדתיות עובדות כבר עכשיו; להפעלת שאר היכולות ראה docs/SETUP.md סעיף ה׳.</p>}
          </div>)}
        {messages.map((m, i) => <Bubble key={m.id} fresh={Date.parse(m.created_at) >= mountedAt.current - 100} m={m} canContinue={i === messages.length - 1 && !busy} blocked={blocked} onContinue={() => void continueReply(m)} />)}
        {busy && <div className="msg assistant fresh"><div className="bubble typing" role="status">{progress ?? 'העוזר חושב'}<span className="dots" aria-hidden><i>.</i><i>.</i><i>.</i></span></div></div>}
      </div>
      {err && <div className={blocked ? 'note-banner' : 'issue-banner'} role="alert">{err.message}<button className="icon-btn" aria-label="סגור" onClick={() => setErr(null)}><X size={14} /></button></div>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea id="chat-input" className="input" rows={1} value={text} placeholder="כתוב כאן…" aria-label="הודעה לעוזר" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <button className="btn primary" type="submit" disabled={busy || !text.trim()} aria-label="שלח"><Send size={18} aria-hidden /></button>
        {messages.length > 0 && <button type="button" className="btn" aria-label="פעולות מהירות" onClick={() => setWizard('menu')}><Plus size={18} aria-hidden /></button>}
      </form>
      {pickCtx && <ContextPicker ctx={ctx} onPick={(c) => void setCtx(c)} onClose={() => setPickCtx(false)} />}
      {wizard && <Wizard kind={wizard} ctx={ctx} blocked={blocked} onClose={() => setWizard(null)} onProgress={setProgress} post={post} />}
    </div>
    </AiActionsCtx.Provider>
  );
}

function Bubble({ m, fresh, canContinue, blocked, onContinue }: { m: AiMessage; fresh: boolean; canContinue: boolean; blocked: boolean; onContinue: () => void }) {
  const store = useStore();
  const alias = useMemo(() => makeAliasMap(store.db.students, m.conversation_id), [store.db.students, m.conversation_id]);
  const [copied, setCopied] = useState<'' | 'rich' | 'plain'>('');
  const md = () => messageMarkdown(alias.restore(m.content), m.blocks);
  const copy = async () => { try { setCopied(await copyRich(md())); setTimeout(() => setCopied(''), 2500); } catch { /* ignore */ } };
  const truncated = (m.blocks as Block[]).some((b) => b.type === 'truncated');
  const hasMath = /\$|\\\(|\\\[/.test(m.content);
  if (m.role === 'user') return <div className={`msg user${fresh ? ' fresh' : ''}`}><div className="bubble" dir="auto">{m.content}</div></div>;
  return (
    <div className={`msg assistant${fresh ? ' fresh' : ''}`}><div className="bubble">
      <Markdown text={m.content} />
      <MessageBlocks blocks={m.blocks} />
      <Sources sources={m.sources as string[]} />
      {truncated && <div className="note-banner cut" role="status">התשובה נקטעה כי הגיעה למגבלת האורך.{' '}
        {canContinue ? <button className="btn sm" disabled={blocked} onClick={onContinue}>המשך תשובה</button> : <span className="muted">אפשר להמשיך רק את התשובה האחרונה בשיחה.</span>}</div>}
      <div className="bubble-tools">
        <button className="linklike" onClick={() => void copy()} title="מעתיק עם נוסחאות מעוצבות. להדבקה ב-Word כמשוואות ניתנות לעריכה העדף הורדת Word"><Copy size={13} aria-hidden /> {copied === 'rich' ? 'הועתק' : copied === 'plain' ? 'הועתק כטקסט' : 'העתק'}</button>
        <button className="linklike" onClick={() => downloadDocx(md())} title="קובץ Word עם משוואות אמיתיות הניתנות לעריכה"><FileDown size={13} aria-hidden /> Word{hasMath ? ' (עם משוואות)' : ''}</button>
        <button className="linklike" onClick={() => downloadHtml(md())} title="דף HTML עצמאי, מתאים להדפסה"><Globe size={13} aria-hidden /> HTML</button>
      </div>
    </div></div>
  );
}

function ContextPicker({ ctx, onPick, onClose }: { ctx: AiContext; onPick: (c: AiContext) => void; onClose: () => void }) {
  const { db } = useStore();
  const groups = db.study_groups.filter((g) => !g.archived_at);
  const [kindSel, setKindSel] = useState<AiContext['kind']>(ctx.kind);
  const [gid, setGid] = useState(ctx.kind === 'system' ? groups[0]?.id ?? '' : ctx.group_id);
  const students = gid ? activeStudents(db, gid) : [];
  const [sid, setSid] = useState(ctx.kind === 'student' ? ctx.student_id : students[0]?.id ?? '');
  const lessons = db.calendar_events.filter((e) => e.group_id === gid && !e.hidden && e.status === 'confirmed').sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 30);
  const [eid, setEid] = useState(ctx.kind === 'lesson' ? ctx.event_id : lessons[0]?.id ?? '');
  const apply = () => onPick(kindSel === 'system' ? { kind: 'system' } : kindSel === 'group' ? { kind: 'group', group_id: gid } : kindSel === 'student' ? { kind: 'student', group_id: gid, student_id: sid } : { kind: 'lesson', group_id: gid, event_id: eid });
  const ok = kindSel === 'system' || (!!gid && (kindSel === 'group' || (kindSel === 'student' && !!sid) || (kindSel === 'lesson' && !!eid)));
  return (
    <Modal title="הקשר השיחה" onClose={onClose}>
      <div className="form">
        <div className="seg" role="group" aria-label="סוג הקשר">{([['system', 'כל המערכת'], ['group', 'קבוצה'], ['student', 'תלמיד'], ['lesson', 'שיעור']] as const).map(([k, l]) => <button key={k} aria-pressed={kindSel === k} onClick={() => setKindSel(k)}>{l}</button>)}</div>
        {kindSel !== 'system' && <label className="field">קבוצה<select className="input" value={gid} onChange={(e) => { setGid(e.target.value); setSid(activeStudents(db, e.target.value)[0]?.id ?? ''); setEid(''); }}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
        {kindSel === 'student' && <label className="field">תלמיד<select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>}
        {kindSel === 'lesson' && <label className="field">שיעור<select className="input" value={eid} onChange={(e) => setEid(e.target.value)}><option value="">בחר…</option>{lessons.map((e) => <option key={e.id} value={e.id}>{new Date(e.start_at).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })} {new Date(e.start_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</option>)}</select></label>}
        <p className="muted">ההקשר נשמר לאורך השיחה ואפשר לשנות אותו בכל רגע.</p>
        <button className="btn primary" disabled={!ok} onClick={apply}><ChevronLeft size={16} aria-hidden />החל</button>
      </div>
    </Modal>
  );
}
