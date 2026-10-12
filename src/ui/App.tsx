import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, GraduationCap, Home, Settings as Cog, type LucideIcon } from 'lucide-react';
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

  if (!ready) return <div className="center-screen">טוען נתונים…</div>;
  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <nav className="sidebar" aria-label="ניווט ראשי">
          <div className="brand">ניהול הוראה</div>
          {NAV.map(({ id, label, Icon }) => (
            <button key={id} className="nav-item" aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={20} aria-hidden /> {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div className="side-foot">{saving > 0 ? 'שומר…' : 'הכול נשמר'}{kind === 'local' ? ' · מצב מקומי' : ''}{userEmail ? <><br />{userEmail}</> : null}</div>
          {signOut && <button className="nav-item" onClick={signOut}>התנתק</button>}
        </nav>
        <main>
          {kind === 'local' && <div className="demo-banner" role="note">מצב מקומי: הנתונים נשמרים בדפדפן של המכשיר הזה בלבד. גבה אותם מדי פעם ב״הגדרות &gt; גיבויים ונתונים״.</div>}
          {error && <div className="issue-banner" role="alert">{error} <button className="btn sm" onClick={store.clearError}>סגור</button></div>}
          {page === 'home' && <HomePage />}
          {page === 'groups' && <GroupsPage />}
          {page === 'calendar' && <CalendarPage />}
          {page === 'settings' && <SettingsPage userEmail={userEmail} signOut={signOut} />}
        </main>
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
