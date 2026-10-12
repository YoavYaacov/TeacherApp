import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { LocalRepo } from '../data/localRepo';
import { SupabaseRepo } from '../data/supabaseRepo';
import { StoreProvider } from '../data/store';
import { App } from './App';
import { applyTheme, type ThemeId } from './themes';

export function Root() {
  useEffect(() => { try { applyTheme((localStorage.getItem('teacher-app:theme') as ThemeId) || 'sky-blue'); } catch { applyTheme('sky-blue'); } }, []);
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
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [sb]);
  useEffect(() => {
    setOwner(null);
    if (!session) return;
    void sb.rpc('is_owner').then(({ data, error }) => setOwner(!error && data === true));
  }, [session, sb]);
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
  const [msg, setMsg] = useState('');
  const redirectTo = window.location.origin + window.location.pathname;
  return (
    <div className="center-screen"><div className="card login">
      <h1>ניהול הוראה</h1>
      <p className="muted">כניסה למורה בלבד.</p>
      <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })}>המשך עם Google</button>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
      <label className="field">או קישור כניסה למייל
        <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
      <button className="btn" style={{ marginTop: 8 }} disabled={!email}
        onClick={async () => { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }); setMsg(error ? `שגיאה: ${error.message}` : 'נשלח קישור כניסה למייל. פתח אותו באותו דפדפן.'); }}>שלח קישור</button>
      {msg && <p role="status">{msg}</p>}
    </div></div>
  );
}
