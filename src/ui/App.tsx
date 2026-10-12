import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, GraduationCap, Home, LogOut, Settings as Cog, Sparkles, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { gcal, type SyncResult } from '../lib/google';
import { useStore } from '../data/store';
import { applyTheme, type ThemeId } from './themes';
import { NavCtx, type Page } from './nav';
import type { AiContext } from '../data/types';
import { boot, saveView } from './viewState';
import { AssistantPage } from './pages/AssistantPage';
import { HomePage } from './pages/HomePage';
import { GroupsPage } from './pages/GroupsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';

// חזרה מ-Google (OAuth): ?google=<תוצאה> => פתיחת הגדרות > יומן והצגת התוצאה. מחושב פעם אחת בטעינת המודול.
const BOOT_GOOGLE = (() => {
  try {
    const u = new URL(window.location.href); const r = u.searchParams.get('google');
    if (!r) return false;
    sessionStorage.setItem('teacher-app:google-note', r); sessionStorage.setItem('teacher-app:open', 'calendar');
    u.searchParams.delete('google'); window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    return true;
  } catch { return false; }
})();

const HOME = { id: 'home' as Page, label: 'בית', Icon: Home }, GROUPS = { id: 'groups' as Page, label: 'קבוצות לימוד', Icon: GraduationCap }, CAL = { id: 'calendar' as Page, label: 'יומן', Icon: CalendarDays }, SET = { id: 'settings' as Page, label: 'הגדרות', Icon: Cog };
const AI = { id: 'assistant' as Page, label: 'עוזר אישי', Icon: Sparkles };
type NavItem = { id: Page; label: string; Icon: LucideIcon };
const NAV: NavItem[] = [HOME, { ...AI, label: 'העוזר האישי' }, GROUPS, CAL, SET];       // סרגל צד
const BOTTOM: NavItem[] = [HOME, GROUPS, AI, CAL, SET];                                   // סרגל תחתון: ✨ במרכז

export function App({ userEmail, signOut }: { userEmail: string | null; signOut: (() => void) | null }) {
  const store = useStore();
  const { db, ready, error, saving, kind } = store;
  const PAGES: Page[] = ['home', 'groups', 'calendar', 'settings', 'assistant'];
  const [page, setPage] = useState<Page>(BOOT_GOOGLE ? 'settings' : PAGES.includes(boot.page as Page) ? (boot.page as Page) : 'home');
  const [groupId, setGroupId] = useState<string | null>(BOOT_GOOGLE ? null : boot.groupId ?? null);
  useEffect(() => { saveView({ page, groupId }); }, [page, groupId]);
  // קבוצה ששוחזרה ואינה קיימת עוד: חוזרים לרשימת הקבוצות
  useEffect(() => { if (ready && groupId && !db.study_groups.some((g) => g.id === groupId)) { setGroupId(null); } }, [ready, groupId, db.study_groups]);
  const go = useCallback((p: Page, g: string | null = null) => { setPage(p); setGroupId(g); }, []);
  const [aiCtx, setAiCtx] = useState<AiContext | null>(null);
  const openAssistant = useCallback((ctx?: AiContext) => { setAiCtx(ctx ?? null); setPage('assistant'); setGroupId(null); }, []);
  const clearAiCtx = useCallback(() => setAiCtx(null), []);
  const nav = useMemo(() => ({ page, groupId, go, openAssistant, aiCtx, clearAiCtx }), [page, groupId, go, openAssistant, aiCtx, clearAiCtx]);

  const dbTheme = db.user_settings[0]?.theme as ThemeId | undefined;
  useEffect(() => { if (dbTheme) { applyTheme(dbTheme); try { localStorage.setItem('teacher-app:theme', dbTheme); } catch { /* ignore */ } } }, [dbTheme]);

  // גיבוי אוטומטי במסד (השרת מחליט אם לדלג: פעם ביום ורק אם יש שינוי). כשל שקט, לא חוסם עבודה.
  useEffect(() => {
    if (!ready || kind !== 'supabase' || !supabase) return;
    void supabase.rpc('create_data_backup', { p_kind: 'auto', p_note: null }).then(() => undefined, () => undefined);
  }, [ready, kind]);

  // ייבוא אוטומטי מ-Google Calendar: בפתיחה, כשחוזרים ללשונית, ובמרווח של 15 דקות כשהאפליקציה פתוחה.
  // לכל היותר פעם ב-5 דקות; נעצר לאחר "אין יומן"/"נדרש חיבור מחדש". כשל שקט.
  // גרסה חדשה של האפליקציה: בדיקה מול version.json (ללא מטמון) בכניסה, בחזרה ללשונית וכל 30 דקות.
  const [newVersion, setNewVersion] = useState(false);
  useEffect(() => {
    const check = async () => {
      try { const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return; const j = await r.json() as { v?: string }; if (j.v && j.v !== __BUILD_ID__) setNewVersion(true); } catch { /* מצב מקומי/ללא רשת */ }
    };
    void check();
    const iv = window.setInterval(() => void check(), 1800000);
    const vis = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const [gReauth, setGReauth] = useState(false);
  const gStop = useRef(false);
  const gBusy = useRef(false);
  const reloadRef = useRef(store.reload); reloadRef.current = store.reload;
  const savingRef = useRef(0); savingRef.current = saving;
  useEffect(() => {
    if (!ready || kind !== 'supabase' || !supabase) return;
    const run = async () => {
      if (gStop.current || gBusy.current || document.hidden) return;
      try { const last = Number(sessionStorage.getItem('teacher-app:last-gsync') ?? 0); if (Date.now() - last < 300000) return; sessionStorage.setItem('teacher-app:last-gsync', String(Date.now())); } catch { /* ignore */ }
      gBusy.current = true;
      try {
        const r = await gcal<SyncResult>('sync');
        if (r.error === 'no_calendar' || r.error === 'not_deployed' || r.error === 'forbidden') gStop.current = true;
        else if (r.error === 'reauth_required') { gStop.current = true; setGReauth(true); }
        else if (r.ok && ((r.created ?? 0) + (r.updated ?? 0) + (r.cancelled ?? 0)) > 0) {
          // לא טוענים מחדש בזמן שיש שמירות בהמשך, כדי לא להציג מצב ישן מעל עריכה שעוד לא נשמרה
          for (let i = 0; i < 40 && savingRef.current > 0; i++) await new Promise((res) => setTimeout(res, 250));
          await reloadRef.current();
        }
      } catch { /* שקט */ } finally { gBusy.current = false; }
    };
    void run();
    const iv = window.setInterval(() => void run(), 900000);
    const vis = () => { if (!document.hidden) void run(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, [ready, kind]);

  if (!ready) return <div className="center-screen">טוען נתונים…</div>;
  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <nav className="sidebar" aria-label="ניווט ראשי">
          <div className="brand">
            <span className="brand-ic" aria-hidden><GraduationCap size={22} /></span>
            <span><strong>ניהול הוראה</strong><small>מערכת אישית למורה</small></span>
          </div>
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className="nav-item" aria-current={page === id ? 'page' : undefined} onClick={() => (id === 'assistant' ? openAssistant() : go(id))}>
              <Icon size={20} aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <div className="shell">
          <header className="topbar">
            <span className="status" role="status">{saving > 0 ? 'שומר…' : 'הכול נשמר'}</span>
            {kind === 'local' && <span className="pill" title="הנתונים נשמרים בדפדפן של המכשיר הזה בלבד. גבה אותם ב״הגדרות > גיבויים ונתונים״.">מצב מקומי</span>}
            {userEmail && <span className="muted" dir="ltr">{userEmail}</span>}
            {signOut && <button className="icon-btn" aria-label="התנתק" title="התנתק" onClick={signOut}><LogOut size={18} /></button>}
          </header>
          <main>
            <div className={`page${page === 'assistant' ? ' chatpage' : ''}`}>
              {newVersion && <div className="note-banner" role="status">יצאה גרסה חדשה של האפליקציה. <button className="btn sm" onClick={() => window.location.reload()}>רענן עכשיו</button></div>}
              {gReauth && page !== 'settings' && <div className="note-banner" role="status">החיבור ל-Google Calendar פג ולכן אירועים חדשים לא מיובאים. <button className="btn sm" onClick={() => { try { sessionStorage.setItem('teacher-app:open', 'calendar'); } catch { /* ignore */ } go('settings'); }}>חבר מחדש</button></div>}
              {error && <div className="issue-banner" role="alert">{error} <button className="btn sm" onClick={store.clearError}>סגור</button></div>}
              {page === 'home' && <HomePage />}
              {page === 'groups' && <GroupsPage />}
              {page === 'calendar' && <CalendarPage />}
              {page === 'assistant' && <AssistantPage />}
              {page === 'settings' && <SettingsPage userEmail={userEmail} signOut={signOut} />}
            </div>
          </main>
        </div>
        <nav className="bottomnav" aria-label="ניווט תחתון">
          {BOTTOM.map(({ id, label, Icon }) => (
            <button key={id} className={`nav-item${id === 'assistant' ? ' nav-ai' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => (id === 'assistant' ? openAssistant() : go(id))}>
              <Icon size={id === 'assistant' ? 24 : 22} aria-hidden /> {label}
            </button>
          ))}
        </nav>
      </div>
    </NavCtx.Provider>
  );
}
