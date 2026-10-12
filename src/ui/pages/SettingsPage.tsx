import { useState } from 'react';
import { CalendarDays, Database, Palette, SlidersHorizontal, UserCog, type LucideIcon } from 'lucide-react';
import { useStore } from '../../data/store';
import { THEMES, applyTheme, type ThemeId } from '../themes';
import { defaultYear } from '../../lib/domain';
import { fmtDate } from '../../lib/util';
import type { AcademicYear } from '../../data/types';
import { BackupPanel } from './BackupPanel';

const CATS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'general', label: 'כללי', Icon: SlidersHorizontal },
  { id: 'appearance', label: 'מראה ועיצוב', Icon: Palette },
  { id: 'calendar', label: 'יומן וסנכרון', Icon: CalendarDays },
  { id: 'backup', label: 'גיבויים ונתונים', Icon: Database },
  { id: 'account', label: 'חשבון ואבטחה', Icon: UserCog },
];

export function SettingsPage({ userEmail, signOut }: { userEmail: string | null; signOut: (() => void) | null }) {
  const [cat, setCat] = useState('general');
  return (
    <>
      <div className="pagehead"><h1>הגדרות</h1></div>
      <div className="settings">
        <ul className="list" aria-label="קטגוריות הגדרות">{CATS.map(({ id, label, Icon }) => (
          <li key={id} style={{ padding: 0 }}><button className="nav-item catbtn" aria-current={cat === id ? 'true' : undefined} onClick={() => setCat(id)}><Icon size={18} aria-hidden />{label}</button></li>))}</ul>
        <section className="card">
          {cat === 'general' && <General />}
          {cat === 'appearance' && <Appearance />}
          {cat === 'calendar' && <><h2>יומן וסנכרון</h2><p>כרגע השיעורים נשמרים בלוח פנימי. חיבור ל-Google Calendar יתווסף בגרסה הבאה, בלי צורך להזין מחדש שיעורים.</p></>}
          {cat === 'backup' && <BackupPanel />}
          {cat === 'account' && <><h2>חשבון ואבטחה</h2>
            {userEmail ? <><p>מחובר כ-{userEmail}. הגישה לנתונים מוגבלת לחשבון זה בלבד (RLS בצד השרת).</p>{signOut && <button className="btn" onClick={signOut}>התנתק</button>}</>
              : <p>מצב מקומי: אין התחברות. הנתונים נשמרים בדפדפן במכשיר הזה בלבד. כדי לעבוד מכמה מכשירים עם התחברות Google יש לחבר מסד נתונים (ראה docs/SETUP.md).</p>}</>}
        </section>
      </div>
    </>
  );
}

function Appearance() {
  const store = useStore();
  const cur = (store.db.user_settings[0]?.theme as ThemeId) ?? (localStorage.getItem('teacher-app:theme') as ThemeId) ?? 'sky-blue';
  const pick = (id: ThemeId) => {
    applyTheme(id);
    try { localStorage.setItem('teacher-app:theme', id); } catch { /* ignore */ }
    store.saveFast('user_settings', [{ id: true, theme: id, prefs: store.db.user_settings[0]?.prefs ?? {} }]);
  };
  return <><h2>ערכת נושא</h2>
    <div className="themes">{THEMES.map((t) => (
      <button key={t.id} className="theme-opt" aria-pressed={cur === t.id} onClick={() => pick(t.id)}>
        <div className="swatch" aria-hidden>{[t.bg, t.surface, t.sidebar, t.ink, t.accent].map((c) => <i key={c} style={{ background: c }} />)}</div>{t.name}</button>))}</div>
    <p className="muted">הבחירה נשמרת במסד הנתונים ומסונכרנת בין מכשירים (במצב מקומי: במכשיר הזה).</p></>;
}

function General() {
  const store = useStore();
  const years = store.db.academic_years;
  const [adding, setAdding] = useState(false);
  const fields: [keyof AcademicYear, string][] = [['start_date', 'תחילת שנה'], ['end_date', 'סיום שנה'], ['term1_start', 'מחצית א׳ מ-'], ['term1_end', 'עד'], ['term2_start', 'מחצית ב׳ מ-'], ['term2_end', 'עד']];
  return <><h2>שנות לימוד ומחציות</h2>
    <p className="muted">המחצית הפעילה (ברירת המחדל בטבלת הציונים) נקבעת לפי התאריכים. התאריכים ההתחלתיים הם הצעה; עדכן לפי לוח בית הספר.</p>
    {years.length === 0 && <p>שנת לימודים תיווצר אוטומטית עם יצירת הקבוצה הראשונה, או:</p>}
    {years.map((y) => (
      <div key={y.id} className="card" style={{ marginBottom: 12 }}>
        <label className="field">שם<input key={y.name} className="input" defaultValue={y.name} onBlur={(e) => e.target.value !== y.name && store.patchFast('academic_years', y.id, { name: e.target.value })} /></label>
        <div className="form two">{fields.map(([k, l]) => <label key={k} className="field">{l}<input key={String(y[k])} className="input" type="date" defaultValue={String(y[k])} onBlur={(e) => e.target.value && e.target.value !== y[k] && store.patchFast('academic_years', y.id, { [k]: e.target.value })} /></label>)}</div>
        <p className="muted">מחצית א׳: {fmtDate(y.term1_start)}–{fmtDate(y.term1_end)} · מחצית ב׳: {fmtDate(y.term2_start)}–{fmtDate(y.term2_end)}</p>
      </div>))}
    <button className="btn" disabled={adding} onClick={async () => { setAdding(true); await store.save('academic_years', [{ ...defaultYear(years.length ? new Date(new Date(years[years.length - 1].end_date).getTime() + 86400000 * 90) : new Date()), archived_at: null }]); setAdding(false); }}>הוסף שנת לימודים</button></>;
}
