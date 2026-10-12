import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, GraduationCap, Home, LogOut, Settings as Cog, type LucideIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../data/store';
import { applyTheme, type ThemeId } from './themes';
import { NavCtx, type Page } from './nav';
import { HomePage } from './pages/HomePage';
import { GroupsPage } from './pages/GroupsPage';
import { CalendarPage } from './pages/CalendarPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'בית', Icon: Home },
  { id: 'groups', label: 'קבוצות לימוד', Icon: GraduationCap },
  { id: 'calendar', label: 'יומן', Icon: CalendarDays },
  { id: 'settings', label: 'הגדרות', Icon: Cog },
];

export function App({ userEmail, signOut }: { userEmail: string | null; signOut: (() => void) | null }) {
  const store = useStore();
  const { db, ready, error, saving, kind } = store;
  const [page, setPage] = useState<Page>('home');
  const [groupId, setGroupId] = useState<string | null>(null);
  const go = useCallback((p: Page, g: string | null = null) => { setPage(p); setGroupId(g); }, []);
  const nav = useMemo(() => ({ page, groupId, go }), [page, groupId, go]);

  const dbTheme = db.user_settings[0]?.theme as ThemeId | undefined;
  useEffect(() => { if (dbTheme) { applyTheme(dbTheme); try { localStorage.setItem('teacher-app:theme', dbTheme); } catch { /* ignore */ } } }, [dbTheme]);

  // גיבוי אוטומטי במסד (השרת מחליט אם לדלג: פעם ביום ורק אם יש שינוי). כשל שקט, לא חוסם עבודה.
  useEffect(() => {
    if (!ready || kind !== 'supabase' || !supabase) return;
    void supabase.rpc('create_data_backup', { p_kind: 'auto', p_note: null }).then(() => undefined, () => undefined);
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
            <button key={id} className="nav-item" aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
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
            <div className="page">
              {error && <div className="issue-banner" role="alert">{error} <button className="btn sm" onClick={store.clearError}>סגור</button></div>}
              {page === 'home' && <HomePage />}
              {page === 'groups' && <GroupsPage />}
              {page === 'calendar' && <CalendarPage />}
              {page === 'settings' && <SettingsPage userEmail={userEmail} signOut={signOut} />}
            </div>
          </main>
        </div>
        <nav className="bottomnav" aria-label="ניווט תחתון">
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className="nav-item" aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={22} aria-hidden /> {label}
            </button>
          ))}
        </nav>
      </div>
    </NavCtx.Provider>
  );
}
