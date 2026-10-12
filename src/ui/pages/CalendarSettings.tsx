import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useStore } from '../../data/store';
import { errText, gcal, type GCalendar, type GStatus, type SyncResult } from '../../lib/google';

const when = (s: string) => new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const NOTE: Record<string, string> = { connected: 'החיבור ל-Google הושלם. בחר יומן לייבוא.', denied: 'החיבור בוטל ב-Google.', state_invalid: 'הבקשה פגה. נסה שוב.', no_refresh_token: 'Google לא החזיר הרשאה מתמשכת. נסה שוב (ודא שאישרת את כל ההרשאות).' };

export function CalendarSettings() {
  const store = useStore();
  const [st, setSt] = useState<(GStatus & { error?: string }) | null>(null);
  const [cals, setCals] = useState<GCalendar[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => { const g = sessionStorage.getItem('teacher-app:google-note'); sessionStorage.removeItem('teacher-app:google-note'); return g ? NOTE[g] ?? '' : ''; });

  const load = useCallback(async () => {
    const s = await gcal<GStatus>('status');
    setSt(s);
    if (!s.error && s.connected && !s.calendar) {
      const c = await gcal<{ calendars: GCalendar[] }>('calendars');
      if (c.error) setMsg(errText(c.error)); else setCals(c.calendars);
    }
  }, []);
  useEffect(() => { if (store.kind === 'supabase') void load(); }, [store.kind, load]);

  if (store.kind !== 'supabase') return <><h2>יומן וסנכרון</h2><p>חיבור ל-Google Calendar זמין בגרסת הענן בלבד. כרגע השיעורים נשמרים בלוח פנימי.</p></>;
  if (!st) return <><h2>יומן וסנכרון</h2><p className="muted">טוען…</p></>;

  const connect = async () => {
    setBusy(true); setMsg('');
    const r = await gcal<{ url: string }>('auth_url');
    if (r.error || !r.url) { setMsg(errText(r.error ?? 'שגיאה')); setBusy(false); return; }
    window.location.href = r.url;
  };
  const choose = async () => {
    setBusy(true); setMsg('');
    const r = await gcal('select_calendar', { id: pick });
    if (r.error) setMsg(errText(r.error)); else { setCals(null); await runSync(); }
    await load(); setBusy(false);
  };
  const runSync = async () => {
    setBusy(true); setMsg('');
    const r = await gcal<SyncResult>('sync');
    if (r.error) setMsg(`הייבוא נכשל: ${errText(r.error)}`);
    else { await store.reload(); setMsg(`הייבוא הושלם: ${r.created} חדשים, ${r.updated} עודכנו, ${r.cancelled} בוטלו.`); }
    await load(); setBusy(false);
  };
  const disconnect = async () => {
    if (!confirm('לנתק את Google Calendar? האירועים שכבר יובאו יישארו באפליקציה.')) return;
    setBusy(true); await gcal('disconnect'); setCals(null); await load(); setBusy(false);
  };

  const needReauth = st.lastError === 'reauth_required';
  const imported = store.db.calendar_events.filter((e) => e.source === 'google').length;
  return <>
    <h2>יומן וסנכרון</h2>
    {st.error ? <p className="issue" role="alert">{errText(st.error)}{st.error === 'not_deployed' && ' (ראה docs/SETUP.md סעיף ד׳)'}</p> : <>
      <p className="muted">ייבוא אירועים מיומן Google ייעודי (קריאה בלבד בשלב זה: האפליקציה לא משנה דבר ב-Google). השיעורים הפנימיים הקיימים נשמרים כמות שהם.</p>
      {(!st.connected || needReauth) && <div className="row"><button className="btn primary" disabled={busy} onClick={connect}>{needReauth ? 'חבר מחדש את Google' : 'חבר את Google Calendar'}</button></div>}
      {st.connected && !needReauth && !st.calendar && <div className="bk-sec">
        <h3>בחירת יומן</h3>
        {!cals ? <p className="muted">טוען יומנים…</p> : <div className="row">
          <select className="input" aria-label="יומן" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">בחר יומן…</option>{cals.map((c) => <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (ראשי)' : ''}</option>)}</select>
          <button className="btn primary" disabled={!pick || busy} onClick={choose}>בחר וייבא</button></div>}
        <p className="muted">מומלץ יומן ייעודי להוראה, ולא היומן האישי הראשי.</p>
      </div>}
      {st.connected && st.calendar && <div className="bk-sec">
        <p>יומן מחובר: <strong>{st.calendar.name}</strong> · {imported} אירועים מיובאים</p>
        <p className="muted">{st.lastSyncedAt ? `סנכרון אחרון: ${when(st.lastSyncedAt)}` : 'עדיין לא בוצע ייבוא'}{st.lastError && !needReauth ? ` · שגיאה אחרונה: ${st.lastError}` : ''}. הייבוא רץ אוטומטית בפתיחת האפליקציה.</p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={runSync}><RefreshCw size={16} aria-hidden />ייבא עכשיו</button>
          <button className="btn" disabled={busy} onClick={() => setSt({ ...st, calendar: null })}>החלף יומן</button>
          <button className="btn" disabled={busy} onClick={disconnect}>נתק</button></div>
      </div>}
    </>}
    {msg && <p role="status" className="bk-msg">{msg}</p>}
  </>;
}
