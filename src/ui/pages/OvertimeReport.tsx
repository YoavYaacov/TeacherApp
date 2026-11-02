import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import { errText, gcal, type GStatus } from '../../lib/google';
import { canSendReport, monthKey, monthLabel, sendableFrom } from '../../lib/overtime';
import { buildReport, isEmail, type OtMailPrefs, type ReportSent } from '../../lib/overtimeMail';

/** חלון "שלח דיווח": נוסח קבוע שמוצג לאישור, ושליחה מהחשבון שלך ב-Gmail בלחיצה אחת. */
export function OvertimeReportModal({ ym, hours, onClose }: { ym: { year: number; month: number }; hours: number; onClose: () => void }) {
  const store = useStore();
  const cur = store.db.user_settings[0];
  const prefs = (cur?.prefs ?? {}) as { overtimeMail?: OtMailPrefs; overtimeReports?: Record<string, ReportSent> };
  const [to, setTo] = useState(prefs.overtimeMail?.to ?? '');
  const [name, setName] = useState(prefs.overtimeMail?.name ?? '');
  const [edited, setEdited] = useState<string | null>(null); // עריכה חד-פעמית של הגוף; אם לא נערך, הגוף נבנה מהנוסח הקבוע
  const [st, setSt] = useState<(GStatus & { error?: string }) | null | 'na'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const key = monthKey(ym);
  const sent = prefs.overtimeReports?.[key];
  const draft = buildReport(ym, hours, name || '…');
  const body = edited ?? draft.body;
  const subject = draft.subject;
  const cloud = store.kind === 'supabase';

  useEffect(() => { if (!cloud) { setSt('na'); return; } void gcal<GStatus>('status').then((s) => setSt(s)); }, [cloud]);
  const status = st === null || st === 'na' ? null : st;
  const ready = status && !status.error && status.connected && status.canSend === true;
  const timeOk = canSendReport(ym);
  const valid = timeOk && isEmail(to) && name.trim().length > 0 && hours > 0 && body.trim().length > 0;

  const grant = async () => {
    setBusy(true); setErr('');
    const r = await gcal<{ url: string }>('auth_url', { mail: true });
    if (r.error || !r.url) { setErr(errText(r.error ?? 'שגיאה')); setBusy(false); return; }
    window.location.href = r.url;
  };
  const send = async () => {
    setBusy(true); setErr('');
    const r = await gcal<{ ok?: boolean }>('send_report', { to: to.trim(), subject, body });
    if (r.error || !r.ok) { setErr(errText(r.error ?? 'השליחה נכשלה')); setBusy(false); return; }
    store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), overtimeMail: { to: to.trim(), name: name.trim() }, overtimeReports: { ...(prefs.overtimeReports ?? {}), [key]: { at: new Date().toISOString(), to: to.trim() } } } }]);
    setBusy(false); setDone(true);
  };

  if (done) return (
    <Modal title="הדיווח נשלח" onClose={onClose}>
      <p role="status">הדיווח לחודש {monthLabel(ym)} ({hours} שעות) נשלח אל <bdi dir="ltr">{to.trim()}</bdi>. עותק נשמר בתיקיית "נשלחו" ב-Gmail שלך.</p>
      <button className="btn primary" onClick={onClose}>סגור</button>
    </Modal>);

  return (
    <Modal title={`שליחת דיווח: ${monthLabel(ym)}`} onClose={onClose} wide>
      <div className="form">
        {sent && <p className="note-banner" role="status">דיווח לחודש הזה כבר נשלח ב-{new Date(sent.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} אל <bdi dir="ltr">{sent.to}</bdi>. שליחה נוספת תישלח שוב.</p>}
        {!timeOk && <p className="issue" role="status">אפשר לשלוח את הדיווח של {monthLabel(ym)} החל מ-{sendableFrom(ym)}.</p>}
        {timeOk && hours === 0 && <p className="issue" role="status">לא הוזנו שעות לחודש הזה, ולכן אין מה לדווח.</p>}
        <div className="row">
          <label className="field fl" style={{ flex: '1 1 260px' }}><span>נמען</span><input className="input" type="email" dir="ltr" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@school.org" /></label>
          <label className="field fl" style={{ flex: '1 1 200px' }}><span>שם לחתימה</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        </div>
        <label className="field fl"><span>נושא</span><input className="input" value={subject} readOnly /></label>
        <label className="field">ההודעה (אפשר לערוך לפני השליחה)
          <textarea className="input" rows={10} value={body} onChange={(e) => setEdited(e.target.value)} /></label>
        <p className="muted small">ההודעה תישלח מחשבון ה-Gmail שלך ותכלול רק את הסיכום החודשי, בלי פרטי תלמידים.</p>
        {!cloud && <p className="issue">שליחת מייל זמינה בגרסת הענן בלבד.</p>}
        {cloud && st === null && <p className="muted">בודק חיבור ל-Google…</p>}
        {cloud && status?.error && <p className="issue">{errText(status.error)}</p>}
        {cloud && status && !status.error && !status.connected && <p className="issue">Google עדיין לא מחובר. חבר אותו בהגדרות ← יומן וסנכרון.</p>}
        {cloud && status && !status.error && status.connected && status.canSend !== true && (<>
          <p className="issue">{status.canSend === undefined ? 'פונקציית השרת הותקנה בגרסה ישנה: יש להדביק את הגרסה החדשה ב-Supabase (ראה הוראות ההתקנה).' : 'כדי לשלוח מייל צריך לאשר פעם אחת הרשאת שליחה מ-Gmail.'}</p>
          {status.canSend === false && <button className="btn" disabled={busy} onClick={grant}><Mail size={16} aria-hidden />אשר הרשאת שליחה ב-Google</button>}
        </>)}
        {err && <p className="issue" role="alert">{err}</p>}
        {err && /הרשאת שליחה/.test(err) && <button className="btn" disabled={busy} onClick={grant}><Mail size={16} aria-hidden />אשר הרשאת שליחה ב-Google</button>}
        <div className="row">
          <button className="btn primary" disabled={!valid || !ready || busy} onClick={send}><Mail size={16} aria-hidden />{busy ? 'שולח…' : sent ? 'אשר ושלח שוב' : 'אשר ושלח'}</button>
          <button className="btn" disabled={busy} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </Modal>
  );
}
