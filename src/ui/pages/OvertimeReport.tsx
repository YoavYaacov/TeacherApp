import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useStore } from '../../data/store';
import { Modal } from '../Modal';
import { errText, gcal, type GStatus } from '../../lib/google';
import { OT_LABELS, canSendReport, monthKey, monthLabel, nothingToReport, sendableFrom, type OtCounters } from '../../lib/overtime';
import { buildReport, REPORT_TO, type ReportSent } from '../../lib/overtimeMail';

/** חלון אישור שליחה: נמען, נושא וגוף קבועים (קריאה בלבד). השרת קובע אותם שוב ושולף את השעות בעצמו. */
export function OvertimeReportModal({ ym, counters, onClose }: { ym: { year: number; month: number }; counters: OtCounters; onClose: () => void }) {
  const store = useStore();
  const cur = store.db.user_settings[0];
  const prefs = (cur?.prefs ?? {}) as { overtimeReports?: Record<string, ReportSent> };
  const [st, setSt] = useState<(GStatus & { error?: string }) | null | 'na'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const key = monthKey(ym);
  const sent = prefs.overtimeReports?.[key];
  const { subject, body } = buildReport(ym, counters);
  const cloud = store.kind === 'supabase';

  useEffect(() => { if (!cloud) { setSt('na'); return; } void gcal<GStatus>('status').then((s) => setSt(s)); }, [cloud]);
  const status = st === null || st === 'na' ? null : st;
  const ready = status && !status.error && status.connected && status.canSend === true;
  const timeOk = canSendReport(ym);
  const empty = nothingToReport(counters);
  const valid = timeOk && !empty;

  const grant = async () => {
    setBusy(true); setErr('');
    const r = await gcal<{ url: string }>('auth_url', { mail: true });
    if (r.error || !r.url) { setErr(errText(r.error ?? 'שגיאה')); setBusy(false); return; }
    window.location.href = r.url;
  };
  const send = async () => {
    setBusy(true); setErr('');
    const r = await gcal<{ ok?: boolean }>('send_report', { year: ym.year, month: ym.month, counters });
    if (r.error || !r.ok) { setErr(errText(r.error ?? 'השליחה נכשלה')); setBusy(false); return; }
    store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), overtimeReports: { ...(prefs.overtimeReports ?? {}), [key]: { at: new Date().toISOString(), to: REPORT_TO } } } }]);
    setBusy(false); setDone(true);
  };

  if (done) return (
    <Modal title="הדיווח נשלח" onClose={onClose}>
      <p role="status">הדיווח לחודש {monthLabel(ym)} נשלח אל <bdi dir="ltr">{REPORT_TO}</bdi>. עותק נשמר בתיקיית "נשלחו" ב-Gmail שלך.</p>
      <button className="btn primary" onClick={onClose}>סגור</button>
    </Modal>);

  return (
    <Modal title={`שליחת דיווח: ${monthLabel(ym)}`} onClose={onClose} wide>
      <div className="form">
        {sent && <p className="note-banner" role="status">דיווח לחודש הזה כבר נשלח ב-{new Date(sent.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} אל <bdi dir="ltr">{sent.to}</bdi>. שליחה נוספת תישלח שוב.</p>}
        {!timeOk && <p className="issue" role="status">אפשר לשלוח את הדיווח של {monthLabel(ym)} החל מ-{sendableFrom(ym)}.</p>}
        {timeOk && empty && <p className="issue" role="status">אין חריגות לדיווח החודש הזה ({OT_LABELS.frontal} 0, {OT_LABELS.individual} 0, {OT_LABELS.stay} {counters.stay}).</p>}
        <dl className="ot-preview">
          <dt>מאת</dt><dd>חשבון ה-Gmail שלך</dd>
          <dt>אל</dt><dd><bdi dir="ltr" data-testid="ot-to">{REPORT_TO}</bdi></dd>
          <dt>נושא</dt><dd data-testid="ot-subject">{subject}</dd>
        </dl>
        <pre className="ot-body" data-testid="ot-body">{body}</pre>
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
          <button className="btn" disabled={busy} onClick={onClose}>ביטול</button>
          <button className="btn primary" disabled={!valid || !ready || busy} onClick={send}><Mail size={16} aria-hidden />{busy ? 'שולח…' : sent ? 'אשר ושלח שוב' : 'אשר ושלח'}</button>
        </div>
      </div>
    </Modal>
  );
}
