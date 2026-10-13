import { useState } from 'react';
import { CalendarDays, Database, Palette, SlidersHorizontal, Sparkles, Trash2, UserCog, type LucideIcon } from 'lucide-react';
import { useStore } from '../../data/store';
import { THEMES, applyTheme, type ThemeId } from '../themes';
import { applyAnim, localAnim, systemReducesMotion, type AnimMode } from '../anim';
import { defaultYear } from '../../lib/domain';
import { fmtDate } from '../../lib/util';
import type { AcademicYear } from '../../data/types';
import { BackupPanel } from './BackupPanel';
import { CalendarSettings } from './CalendarSettings';
import { AiSettings } from './AiSettings';

const CATS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'general', label: 'כללי', Icon: SlidersHorizontal },
  { id: 'appearance', label: 'מראה ועיצוב', Icon: Palette },
  { id: 'calendar', label: 'יומן וסנכרון', Icon: CalendarDays },
  { id: 'assistant', label: 'העוזר האישי', Icon: Sparkles },
  { id: 'backup', label: 'גיבויים ונתונים', Icon: Database },
  { id: 'account', label: 'חשבון ואבטחה', Icon: UserCog },
];

export function SettingsPage({ userEmail, signOut }: { userEmail: string | null; signOut: (() => void) | null }) {
  const [cat, setCat] = useState(() => { const h = sessionStorage.getItem('teacher-app:open'); sessionStorage.removeItem('teacher-app:open'); return h === 'calendar' ? 'calendar' : 'general'; });
  return (
    <>
      <div className="pagehead"><h1>הגדרות</h1></div>
      <div className="settings">
        <ul className="list" aria-label="קטגוריות הגדרות">{CATS.map(({ id, label, Icon }) => (
          <li key={id} style={{ padding: 0 }}><button className="nav-item catbtn" aria-current={cat === id ? 'true' : undefined} onClick={() => setCat(id)}><Icon size={18} aria-hidden />{label}</button></li>))}</ul>
        <section className="card">
          {cat === 'general' && <General />}
          {cat === 'appearance' && <Appearance />}
          {cat === 'calendar' && <CalendarSettings />}
          {cat === 'assistant' && <AiSettings />}
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
    <p className="muted">הבחירה נשמרת במסד הנתונים ומסונכרנת בין מכשירים (במצב מקומי: במכשיר הזה).</p>
    <AnimSetting /></>;
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
        <label className="field fl"><span>שם</span><input key={y.name} className="input" defaultValue={y.name} onBlur={(e) => e.target.value !== y.name && store.patchFast('academic_years', y.id, { name: e.target.value })} /></label>
        <div className="form two">{fields.map(([k, l]) => <label key={k} className="field fl"><span>{l}</span><input key={String(y[k])} className="input" type="date" defaultValue={String(y[k])} onBlur={(e) => e.target.value && e.target.value !== y[k] && store.patchFast('academic_years', y.id, { [k]: e.target.value })} /></label>)}</div>
        <p className="muted">מחצית א׳: {fmtDate(y.term1_start)}–{fmtDate(y.term1_end)} · מחצית ב׳: {fmtDate(y.term2_start)}–{fmtDate(y.term2_end)}</p>
        {(() => {
          const used = store.db.study_groups.filter((g) => g.academic_year_id === y.id).length;
          return <div className="row">
            <button className="btn danger" disabled={used > 0} onClick={async () => { if (confirm(`למחוק את שנת הלימודים "${y.name}"?`)) await store.del('academic_years', { id: y.id }); }}><Trash2 size={16} aria-hidden />מחק שנה</button>
            {used > 0 && <span className="muted">לא ניתן למחוק: {used} קבוצות (כולל בארכיון) משויכות לשנה הזו.</span>}
          </div>;
        })()}
      </div>))}
    <button className="btn" disabled={adding} onClick={async () => { setAdding(true); await store.save('academic_years', [{ ...defaultYear(years.length ? new Date(new Date(years[years.length - 1].end_date).getTime() + 86400000 * 90) : new Date()), archived_at: null }]); setAdding(false); }}>הוסף שנת לימודים</button></>;
}

function AnimSetting() {
  const store = useStore();
  const cur = (store.db.user_settings[0]?.prefs?.anim as AnimMode | undefined) ?? localAnim();
  const pick = (m: AnimMode) => { applyAnim(m); const u = store.db.user_settings[0]; store.saveFast('user_settings', [{ id: true, theme: u?.theme ?? 'sky-blue', prefs: { ...(u?.prefs ?? {}), anim: m } }]); };
  const OPT: [AnimMode, string, string][] = [['full', 'מלאות', 'מעברים, תנועה ותגובה ללחיצה'], ['minimal', 'מינימליות', 'רק מעברי עדינות (בלי תזוזה)'], ['off', 'כבויות', 'הכול מיידי']];
  return <><h2 style={{ marginTop: 24 }}>הנפשות</h2>
    <div className="seg" role="group" aria-label="הנפשות">{OPT.map(([m, l]) => <button key={m} aria-pressed={cur === m} onClick={() => pick(m)}>{l}</button>)}</div>
    <p className="muted">{OPT.find((o) => o[0] === cur)?.[2]}. ההנפשות קלות וקצרות (פחות מרבע שנייה) ולא משפיעות על מהירות העבודה.</p>
    {systemReducesMotion() && <p className="note-banner">המכשיר מבקש הפחתת תנועה, ולכן ההנפשות כבויות כאן בלי קשר להגדרה.</p>}</>;
}
