import { createContext, useContext, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, X } from 'lucide-react';
import type { Block } from '../../ai/tools';
import { useStore } from '../../data/store';
import type { AiDraft } from '../../data/types';
import { label } from '../../lib/domain';
import { fmtDay } from '../../lib/util';

export interface AiActions { regenerate(d: AiDraft, note?: string): Promise<void>; busy: boolean }
export const AiActionsCtx = createContext<AiActions>({ regenerate: async () => undefined, busy: false });

const PERIOD: Record<string, string> = { h1: 'מחצית א׳', h2: 'מחצית ב׳', annual: 'שנתי' };

export function BlockView({ b }: { b: Block }) {
  if (b.type === 'table') return (
    <div className="ai-card">{b.title && <strong>{b.title}</strong>}
      <div className="md-table"><table className="dt"><thead><tr>{b.columns.map((c) => <th key={c} dir="auto">{c}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} dir="auto">{c}</td>)}</tr>)}</tbody></table></div>
      {b.note && <small className="muted">{b.note}</small>}</div>);
  if (b.type === 'list') return <div className="ai-card">{b.title && <strong>{b.title}</strong>}<ul>{b.items.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></div>;
  if (b.type === 'verify') return (
    <div className="ai-card"><strong>בדיקה חישובית של הפתרונות</strong>
      <ul className="verify">{b.items.map((x, i) => <li key={i} className={x.status}>{x.status === 'verified' ? <Check size={14} aria-hidden /> : x.status === 'failed' ? <X size={14} aria-hidden /> : <span aria-hidden>•</span>} <span dir="auto">{x.question}: {x.status === 'verified' ? 'נבדק חישובית. ' : x.status === 'failed' ? 'נמצאה אי-התאמה. ' : 'לא נבדק חישובית. '}{x.detail}</span></li>)}</ul></div>);
  if (b.type === 'draft') return <DraftCard id={b.draftId} />;
  if (b.type === 'draft_bulk') return <BulkBar ids={b.ids} />;
  return null;
}
export function MessageBlocks({ blocks }: { blocks: unknown[] }) {
  return <>{(blocks as Block[]).map((b, i) => <BlockView key={i} b={b} />)}</>;
}
export function Sources({ sources }: { sources: string[] }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return <div className="sources"><button className="linklike" aria-expanded={open} onClick={() => setOpen(!open)}>מקורות ({sources.length})</button>{open && <ul>{sources.map((s) => <li key={s}>{s}</li>)}</ul>}</div>;
}

type Mode = 'fill' | 'append' | 'replace';

/** כרטיס טיוטה: מציג בדיוק מה יישמר ולמי, מאפשר עריכה, יצירה מחדש, ביטול ואישור. שום דבר לא נשמר בלי לחיצה על "אשר ושמור". */
export function DraftCard({ id }: { id: string }) {
  const store = useStore(); const { db } = store; const actions = useContext(AiActionsCtx);
  const d = db.ai_drafts.find((x) => x.id === id);
  const [f, setF] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>('fill'); const [markDone, setMarkDone] = useState(false);
  const [note, setNote] = useState(''); const [askNote, setAskNote] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const payloadKey = JSON.stringify(d?.payload ?? {});
  useEffect(() => { if (d) setF({ text: String(d.payload.text ?? ''), topic: String(d.payload.topic ?? ''), learned: String(d.payload.learned ?? ''), homework: String(d.payload.homework ?? '') }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [payloadKey]);
  if (!d) return null;
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const persistEdit = () => { if (d.status === 'pending') void store.patch('ai_drafts', d.id, { payload: { ...d.payload, ...f } }); };

  if (d.kind === 'evaluation') {
    const s = db.students.find((x) => x.id === d.target.student_id); const g = db.study_groups.find((x) => x.id === d.target.group_id);
    const existing = db.ai_evaluations.find((e) => e.group_id === d.target.group_id && e.student_id === d.target.student_id && e.period === d.target.period);
    const missing = (d.payload.missing_info as string[] | undefined) ?? [];
    const approve = async () => { setBusy(true); setMsg(''); try { await store.repo.applyDraft(d.id, { ...d.payload, text: f.text }, 'fill'); await store.reload(); } catch (e) { setMsg(`השמירה נכשלה, שום דבר לא נשמר: ${(e as Error).message}`); } setBusy(false); };
    return (
      <div className={`ai-card draft ${d.status}`}>
        <div className="draft-head"><strong>{s ? label(s) : 'תלמיד'}</strong><span className="muted"> · {g?.name} · {PERIOD[d.target.period]}</span>
          {d.status === 'applied' && <span className="badge ok">נשמר</span>}{d.status === 'cancelled' && <span className="badge">בוטל</span>}</div>
        <textarea className="input" rows={4} dir="auto" value={f.text ?? ''} disabled={d.status !== 'pending'} aria-label={`הערכה עבור ${s ? label(s) : ''}`} onChange={(e) => set('text', e.target.value)} onBlur={persistEdit} />
        {missing.length > 0 && d.status === 'pending' && <details className="muted small"><summary>מידע שחסר ({missing.length})</summary><ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul></details>}
        {existing && d.status === 'pending' && <p className="issue" role="status">קיימת כבר הערכה שמורה לתלמיד זה לתקופה זו ({new Date(existing.updated_at).toLocaleDateString('he-IL')}). השמירה תחליף אותה.<details><summary>הצג את הקיימת</summary>{existing.text}</details></p>}
        {d.status === 'pending' && <>
          {askNote && <label className="field">הערה ליצירה מחדש (אופציונלי: מידע שרצית שייכלל)<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>}
          <div className="row">
            <button className="btn primary sm" disabled={busy || !f.text?.trim()} onClick={() => void approve()}>אשר ושמור</button>
            <button className="btn sm" disabled={busy || actions.busy} onClick={() => { if (!askNote) setAskNote(true); else { void actions.regenerate(d, note); setAskNote(false); setNote(''); } }}><RefreshCw size={14} aria-hidden />{askNote ? 'צור' : 'צור מחדש'}</button>
            <CopyBtn text={f.text ?? ''} />
            <button className="btn sm" disabled={busy} onClick={() => void store.patch('ai_drafts', d.id, { status: 'cancelled' })}>בטל</button>
          </div>
          {msg && <p className="issue" role="alert">{msg}</p>}
        </>}
      </div>);
  }

  // תיעוד שיעור
  const ev = db.calendar_events.find((e) => e.id === d.target.calendar_event_id); const g = db.study_groups.find((x) => x.id === ev?.group_id);
  const cur = db.lesson_logs.find((l) => l.calendar_event_id === d.target.calendar_event_id);
  const hasExisting = !!(cur && (cur.topic || cur.learned || cur.homework));
  const approve = async () => { setBusy(true); setMsg(''); try { await store.repo.applyDraft(d.id, { topic: f.topic, learned: f.learned, homework: f.homework, mark_done: markDone }, mode); await store.reload(); } catch (e) { setMsg(`השמירה נכשלה, שום דבר לא נשמר: ${(e as Error).message}`); } setBusy(false); };
  return (
    <div className={`ai-card draft ${d.status}`}>
      <div className="draft-head"><strong>תיעוד שיעור</strong><span className="muted"> · {g?.name} · {ev ? fmtDay(ev.start_at) : ''}</span>
        {d.status === 'applied' && <span className="badge ok">נשמר</span>}{d.status === 'cancelled' && <span className="badge">בוטל</span>}</div>
      {([['topic', 'נושא'], ['learned', 'מה נלמד'], ['homework', 'שיעורי בית / משימות המשך']] as const).map(([k, l]) => (
        <label key={k} className="field">{l}<textarea className="input" rows={k === 'learned' ? 4 : 2} dir="auto" value={f[k] ?? ''} disabled={d.status !== 'pending'} onChange={(e) => set(k, e.target.value)} onBlur={persistEdit} /></label>))}
      {d.status === 'pending' && <>
        {hasExisting && <div className="issue" role="status"><strong>כבר קיים תיעוד לשיעור הזה:</strong>
          <div dir="auto">{[cur?.topic && `נושא: ${cur.topic}`, cur?.learned && `נלמד: ${cur.learned}`, cur?.homework && `שיעורי בית: ${cur.homework}`].filter(Boolean).join(' · ')}</div>
          <div className="seg" role="group" aria-label="איך לשמור מול התיעוד הקיים">{([['fill', 'השלם שדות ריקים בלבד'], ['append', 'הוסף אחרי הקיים'], ['replace', 'החלף את הקיים']] as const).map(([m, l]) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}</div>
          {mode === 'replace' && <p>שים לב: ההחלפה תמחק את הטקסט הקיים בשדות האלה.</p>}</div>}
        <label className="row"><input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} /> סמן את השיעור כמתועד</label>
        <div className="row"><button className="btn primary sm" disabled={busy || !(f.topic || f.learned || f.homework)} onClick={() => void approve()}>אשר ושמור</button>
          <CopyBtn text={[f.topic, f.learned, f.homework].filter(Boolean).join('\n')} />
          <button className="btn sm" disabled={busy} onClick={() => void store.patch('ai_drafts', d.id, { status: 'cancelled' })}>בטל</button></div>
        {msg && <p className="issue" role="alert">{msg}</p>}
      </>}
    </div>);
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }}><Copy size={14} aria-hidden />{ok ? 'הועתק' : 'העתק'}</button>;
}

/** אישור קבוצתי: מציג מה ישתנה לפני שמירה */
function BulkBar({ ids }: { ids: string[] }) {
  const store = useStore(); const { db } = store;
  const pending = ids.map((i) => db.ai_drafts.find((d) => d.id === i)).filter((d): d is AiDraft => !!d && d.status === 'pending');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  if (!pending.length) return null;
  const replacing = pending.filter((d) => db.ai_evaluations.some((e) => e.group_id === d.target.group_id && e.student_id === d.target.student_id && e.period === d.target.period)).length;
  const run = async () => {
    if (!confirm(`לשמור ${pending.length} הערכות?\n${replacing ? `${replacing} מהן יחליפו הערכה קיימת של אותו תלמיד.\n` : ''}ההערכות יישמרו בדיוק כפי שהן מופיעות (כולל העריכות שלך).`)) return;
    setBusy(true); setMsg(''); let done = 0;
    try { for (const d of pending) { await store.repo.applyDraft(d.id, { ...d.payload }, 'fill'); done++; } } catch (e) { setMsg(`נשמרו ${done} מתוך ${pending.length}. נעצר בשגיאה: ${(e as Error).message}`); }
    await store.reload(); if (done === pending.length) setMsg(`נשמרו ${done} הערכות.`); setBusy(false);
  };
  return <div className="row"><button className="btn primary" disabled={busy} onClick={() => void run()}>אשר ושמור את כל {pending.length} ההערכות</button>{msg && <span role="status">{msg}</span>}</div>;
}
