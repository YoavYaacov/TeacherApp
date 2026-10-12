import { useEffect, useState } from 'react';
import { useStore } from '../../data/store';
import { getPrefs, type AiPrefs } from '../../ai/prefs';
import { aiStatus, isFail, type AiStatus } from '../../ai/gemini';

export function AiSettings() {
  const store = useStore(); const prefs = getPrefs(store.db);
  const [st, setSt] = useState<AiStatus | { error: string; message: string } | null>(null);
  useEffect(() => { if (store.kind !== 'supabase') return; void aiStatus().then((s) => setSt(isFail(s) ? { error: s.error, message: s.message } : s)); }, [store.kind]);
  const set = (patch: Partial<AiPrefs>) => { const cur = store.db.user_settings[0]; store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), ai: { ...((cur?.prefs?.ai as object) ?? {}), ...patch } } }]); };
  const sel = <K extends keyof AiPrefs>(k: K, label: string, opts: [AiPrefs[K], string][]) => <label className="field">{label}<select className="input" value={String(prefs[k])} onChange={(e) => set({ [k]: e.target.value } as Partial<AiPrefs>)}>{opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}</select></label>;
  return <>
    <h2>העוזר האישי</h2>
    <div className="bk-sec"><h3>מצב השירות</h3>
      {store.kind !== 'supabase' ? <p className="muted">מצב מקומי: שאלות עובדתיות על המערכת עובדות; יכולות ה-AI דורשות חיבור לענן.</p>
        : !st ? <p className="muted">בודק…</p>
        : 'error' in st ? <p className="issue" role="alert">{st.message}</p>
        : <><p>{st.configured ? <span className="badge ok">מוגדר</span> : <span className="badge danger">חסר מפתח</span>} מודל: <span dir="ltr">{st.model}</span> · שימוש היום: {st.used}/{st.limit} בקשות</p>
          {!st.configured && <p className="issue" role="alert">חסר הסוד GEMINI_API_KEY ב-Supabase. ראה docs/SETUP.md סעיף ה׳.</p>}
          {st.blockedUntil && <p className="note-banner">המכסה החינמית נגמרה. שאלות שדורשות AI חסומות עד {new Date(st.blockedUntil).toLocaleString('he-IL')}. שאלות עובדתיות עדיין עובדות.</p>}</>}
      <p className="muted small">העוזר משתמש רק במכסה החינמית של Gemini. אין אמצעי תשלום, ואם המכסה נגמרת הוא פשוט נעצר עד שתתחדש.</p></div>
    <div className="bk-sec"><h3>פרטיות</h3>
      <div className="seg" role="group" aria-label="רמת פרטיות"><button aria-pressed={prefs.level === 'B'} onClick={() => set({ level: 'B' })}>ב׳: נתוני תלמידים בכינויים</button><button aria-pressed={prefs.level === 'A'} onClick={() => set({ level: 'A' })}>א׳: נתונים מצטברים בלבד</button></div>
      <p className="muted">ב׳: למודל נשלחים ציונים וגרפי התקדמות עם כינוי אקראי (למשל ST-17) במקום שם; השם מוחזר רק בדפדפן שלך. ההערות הפרטיות והשמות לעולם לא נשלחים, ושרת הביניים מסיר שמות ופרטים מזהים גם אם נכתבו בטעות. א׳: למודל נשלחים ממוצעים והתפלגויות בלבד, ולכן הערכות אישיות ותיק תלמיד חכם כבויים.</p>
      <p className="muted">שים לב: במסלול החינמי Google רשאית להשתמש בתוכן לשיפור מוצריה. לכן ההפרדה בין שם לנתונים חשובה, והנתונים נשלחים רק כשצריך ניסוח.</p></div>
    <div className="bk-sec"><h3>העדפות</h3><div className="form">
      {sel('answerLength', 'אורך תשובות', [['short', 'קצר'], ['normal', 'בינוני'], ['detailed', 'מפורט']])}
      {sel('evalStyle', 'סגנון הערכות לתעודה', [['encouraging', 'מעודד'], ['factual', 'עובדתי'], ['professional', 'מקצועי'], ['personal', 'אישי']])}
      {sel('evalLength', 'אורך הערכות', [['short', 'קצר'], ['medium', 'בינוני'], ['detailed', 'מפורט']])}
      {sel('evalVoice', 'גוף ההערכות', [['third', 'גוף שלישי'], ['direct', 'פנייה לתלמיד']])}
      {sel('planDetail', 'רמת פירוט במערכי שיעור', [['brief', 'תמציתי'], ['full', 'מלא']])}
      {sel('practiceMode', 'תרגול', [['graded', 'מדורג'], ['challenging', 'מאתגר']])}
      <label className="field">מידע כללי עליך כמורה (אופציונלי, עד 300 תווים; נשלח כהנחיה)<textarea className="input" rows={2} maxLength={300} defaultValue={prefs.notes} onBlur={(e) => set({ notes: e.target.value })} /></label>
    </div></div></>;
}
