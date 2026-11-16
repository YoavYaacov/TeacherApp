import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { LocalRepo } from '../data/localRepo';
import { SupabaseRepo } from '../data/supabaseRepo';
import { StoreProvider } from '../data/store';
import { App } from './App';
import { applyTheme, type ThemeId } from './themes';
import { PrivacyPage, isPrivacyPath } from './PrivacyPage';
import { applyAnim, localAnim, initSliders } from './anim';

export function Root() {
  useEffect(() => initSliders(), []);
  useEffect(() => { applyAnim(localAnim()); try { applyTheme((localStorage.getItem('teacher-app:theme') as ThemeId) || 'sky-blue'); } catch { applyTheme('sky-blue'); } }, []);
  if (isPrivacyPath(window.location.pathname)) return <PrivacyPage />;
  if (!supabase) return <LocalApp />;
  return <AuthGate />;
}

function LocalApp() {
  const repo = useMemo(() => new LocalRepo(), []);
  return <StoreProvider repo={repo}><App userEmail={null} signOut={null} /></StoreProvider>;
}

function AuthGate() {
  const sb = supabase!;
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    // Supabase משדר SIGNED_IN/TOKEN_REFRESHED בכל חזרה לחלון. אם אותו משתמש, לא מחליפים את הסשן ולא מפעילים בדיקת הרשאה מחדש (זה מה שאיפס את האפליקציה).
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession((prev) => (prev && s && prev.user.id === s.user.id ? prev : s)));
    return () => sub.subscription.unsubscribe();
  }, [sb]);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    setOwner(null);
    if (!userId) return;
    void sb.rpc('is_owner').then(({ data, error }) => setOwner(!error && data === true));
  }, [userId, sb]);
  const repo = useMemo(() => new SupabaseRepo(sb), [sb]);

  if (session === undefined) return <div className="center-screen">טוען…</div>;
  if (!session) return <Login />;
  if (owner === null) return <div className="center-screen">בודק הרשאה…</div>;
  if (!owner) return (
    <div className="center-screen"><div className="card login">
      <h1>החשבון אינו מורשה</h1>
      <p>החשבון {session.user.email} אינו מוגדר כבעל המערכת. לא נטענו נתונים.</p>
      <button className="btn" onClick={() => sb.auth.signOut()}>התנתק</button>
    </div></div>);
  return <StoreProvider repo={repo}><App userEmail={session.user.email ?? null} signOut={() => sb.auth.signOut()} /></StoreProvider>;
}

function Login() {
  const sb = supabase!;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectTo = window.location.origin + window.location.pathname;
  // הפרויקט משותף ל"הבנתי": הרשמה חופשית כבויה, Google כבוי. הכניסה כאן לא יוצרת משתמשים לעולם (shouldCreateUser: false),
  // ומשתמש שאינו הבעלים נחסם אחרי הכניסה על ידי is_owner() ו-RLS.
  const signInPassword = async () => {
    setBusy(true); setMsg('');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg('הכניסה נכשלה. בדוק את המייל והסיסמה.');
  };
  const sendLink = async () => {
    setBusy(true); setMsg('');
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    setBusy(false);
    setMsg(error ? 'לא ניתן לשלוח קישור כניסה. בדוק שהמייל נכון.' : 'אם החשבון קיים, נשלח אליו קישור כניסה. פתח אותו באותו דפדפן.');
  };
  return (
    <div className="center-screen"><div className="card login">
      <h1>ניהול הוראה</h1>
      <p className="muted">כניסה למורה בלבד.</p>
      <label className="field">מייל
        <input className="input" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
      <label className="field" style={{ marginTop: 8 }}>סיסמה
        <input className="input" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && email && password && !busy) void signInPassword(); }} /></label>
      <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={!email || !password || busy} onClick={() => void signInPassword()}>כניסה</button>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
      <button className="btn" disabled={!email || busy} onClick={() => void sendLink()}>או שלח קישור כניסה למייל</button>
      {msg && <p role="status">{msg}</p>}
      <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}><a href="/privacy">מדיניות פרטיות</a></p>
    </div></div>
  );
}
