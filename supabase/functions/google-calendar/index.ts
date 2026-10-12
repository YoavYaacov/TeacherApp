// Edge Function: google-calendar — חיבור OAuth, בחירת יומן וייבוא אירועים (שלב 3א).
// Secrets נדרשים: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL.
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY מסופקים אוטומטית.)
// חשוב: להשבית "Verify JWT" לפונקציה זו (ה-callback של Google מגיע בלי JWT). כל פעולה אחרת מאמתת בעלים בעצמה.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const SB_URL = env('SUPABASE_URL');
const FN_URL = `${SB_URL}/functions/v1/google-calendar`;
const APP_URL = env('APP_URL').replace(/\/+$/, '');
const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
const admin = createClient(SB_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class ReauthError extends Error {}

async function requireOwner(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const user = createClient(SB_URL, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await user.rpc('is_owner');
  return !error && data === true;
}

async function accessToken(): Promise<string> {
  const { data } = await admin.from('google_credentials').select('refresh_token').eq('id', true).maybeSingle();
  if (!data) throw new ReauthError('not_connected');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new ReauthError('invalid_grant');
    throw new Error(`token: ${j.error_description ?? j.error}`);
  }
  return j.access_token as string;
}

async function g(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  let r!: Response;
  for (let i = 0; i < 3; i++) { // ניסיון חוזר על שגיאות זמניות (429/5xx/רשת)
    try { r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); } catch (e) { if (i === 2) throw e; await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; }
    if (r.status === 429 || r.status >= 500) { if (i < 2) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; } }
    break;
  }
  if (r.status === 401) throw new ReauthError('unauthorized');
  return r;
}

function zonedMidnight(date: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(utc - (asUtc - utc)).toISOString();
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

interface GEvent { id: string; status?: string; summary?: string; etag?: string; recurringEventId?: string; eventType?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }

async function sync(): Promise<Record<string, unknown>> {
  const { data: st } = await admin.from('calendar_sync_state').select('*').limit(1).maybeSingle();
  if (!st) return { error: 'no_calendar' };
  const calId: string = st.google_calendar_id, tz: string = st.time_zone ?? 'Asia/Jerusalem';
  try {
    const token = await accessToken();
    const staleFull = !st.full_synced_at || Date.now() - new Date(st.full_synced_at).getTime() > 120 * 86400000;
    let useToken: string | null = staleFull ? null : st.sync_token;
    // חלון סנכרון מלא: מתחילת שנת הלימודים (1.8) ועד שנה קדימה
    const now = new Date(); const ay = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const windowMin = new Date(Date.UTC(ay, 7, 1)).toISOString(); const windowMax = new Date(Date.now() + 365 * 86400000).toISOString();
    const items = new Map<string, GEvent>();
    let nextSyncToken: string | null = null, full = !useToken;

    for (let attempt = 0; attempt < 2; attempt++) {
      items.clear(); nextSyncToken = null; let pageToken: string | undefined;
      let gone = false;
      do {
        const params: Record<string, string> = { singleEvents: 'true', showDeleted: 'true', maxResults: '250' };
        if (useToken) params.syncToken = useToken;
        else { params.timeMin = windowMin; params.timeMax = windowMax; }
        if (pageToken) params.pageToken = pageToken;
        const r = await g(`calendars/${encodeURIComponent(calId)}/events`, token, params);
        if (r.status === 410) { gone = true; break; }
        if (!r.ok) throw new Error(`events: ${r.status} ${await r.text()}`);
        const j = await r.json();
        for (const e of (j.items ?? []) as GEvent[]) items.set(e.id, e);
        pageToken = j.nextPageToken; nextSyncToken = j.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      if (!gone) break;
      useToken = null; full = true; // הטוקן פג: סנכרון מלא מחדש
      if (attempt === 1) throw new Error('sync token expired twice');
    }

    const ids = [...items.keys()];
    const existing = new Map<string, { id: string; group_id: string | null; local_dirty: boolean }>();
    for (const part of chunk(ids, 80)) {
      const { data, error } = await admin.from('calendar_events').select('id,google_event_id,group_id,local_dirty').eq('google_calendar_id', calId).in('google_event_id', part);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) existing.set(r.google_event_id, r);
    }
    const { data: us } = await admin.from('user_settings').select('prefs').eq('id', true).maybeSingle();
    const rules = ((us?.prefs as Record<string, unknown> | null)?.titleRules ?? {}) as Record<string, string>;
    const { data: groups } = await admin.from('study_groups').select('id,name').is('archived_at', null);
    const byName = new Map((groups ?? []).map((x) => [norm(x.name), x.id]));
    const guess = (title: string) => rules[title] ?? byName.get(norm(title)) ?? null;

    const toInsert: Record<string, unknown>[] = [], toUpdate: Record<string, unknown>[] = [], cancelIds: string[] = [];
    let skipped = 0;
    for (const e of items.values()) {
      const ex = existing.get(e.id);
      if (e.status === 'cancelled') { if (ex) cancelIds.push(e.id); else skipped++; continue; }
      if ((e.eventType && e.eventType !== 'default') || !e.start || !e.end) { skipped++; continue; }
      const allDay = !!e.start.date;
      const row = {
        source: 'google', google_calendar_id: calId, google_event_id: e.id, recurring_event_id: e.recurringEventId ?? null,
        title: e.summary?.trim() || '(ללא כותרת)', all_day: allDay, etag: e.etag ?? null, status: 'confirmed',
        start_at: allDay ? zonedMidnight(e.start.date!, tz) : new Date(e.start.dateTime!).toISOString(),
        end_at: allDay ? zonedMidnight(e.end.date!, tz) : new Date(e.end.dateTime!).toISOString(),
      };
      if (ex) { if (!ex.local_dirty) toUpdate.push({ ...row, id: ex.id, group_id: ex.group_id ?? guess(row.title) }); else skipped++; } // שינוי מקומי שלא נדחף לא נדרס
      else toInsert.push({ ...row, group_id: guess(row.title) });
    }
    for (const part of chunk(toInsert, 200)) { const { error } = await admin.from('calendar_events').upsert(part, { onConflict: 'google_calendar_id,google_event_id' }); if (error) throw new Error(error.message); }
    for (const part of chunk(toUpdate, 200)) { const { error } = await admin.from('calendar_events').upsert(part, { onConflict: 'id' }); if (error) throw new Error(error.message); }
    for (const part of chunk(cancelIds, 80)) { const { error } = await admin.from('calendar_events').update({ status: 'cancelled' }).eq('google_calendar_id', calId).in('google_event_id', part); if (error) throw new Error(error.message); }

    // סנכרון מלא: אירוע שנעלם מ-Google בלי הודעת ביטול (למשל נמחק בזמן שהטוקן פג) מסומן כמבוטל. התיעוד נשמר.
    let vanished = 0;
    if (full) {
      const { data: live } = await admin.from('calendar_events').select('google_event_id').eq('google_calendar_id', calId).eq('status', 'confirmed').gte('start_at', windowMin).lte('start_at', windowMax);
      const gone = (live ?? []).map((r) => r.google_event_id as string).filter((id) => id && !items.has(id));
      for (const part of chunk(gone, 80)) { const { error } = await admin.from('calendar_events').update({ status: 'cancelled' }).eq('google_calendar_id', calId).in('google_event_id', part); if (error) throw new Error(error.message); }
      vanished = gone.length;
    }
    // הטוקן נשמר רק אחרי שכל הכתיבות הצליחו
    const counts = { created: toInsert.length, updated: toUpdate.length, cancelled: cancelIds.length + vanished, skipped, full };
    await admin.from('calendar_sync_state').update({ sync_token: nextSyncToken, last_synced_at: new Date().toISOString(), last_error: null, last_counts: counts, ...(full ? { full_synced_at: new Date().toISOString() } : {}) }).eq('google_calendar_id', calId);
    return { ok: true, ...counts };
  } catch (e) {
    const reauth = e instanceof ReauthError;
    await admin.from('calendar_sync_state').update({ last_error: reauth ? 'reauth_required' : (e as Error).message.slice(0, 300) }).eq('google_calendar_id', calId);
    return reauth ? { error: 'reauth_required' } : { error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  // חזרה מ-Google (דפדפן, ללא JWT): מאומת ע"י state חד-פעמי שנוצר עבור הבעלים
  if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
    const back = (q: string) => Response.redirect(`${APP_URL}/?google=${q}`, 302);
    const state = url.searchParams.get('state') ?? '';
    const { data: row } = await admin.from('oauth_states').select('state,expires_at').eq('state', state).maybeSingle();
    if (row) await admin.from('oauth_states').delete().eq('state', state);
    if (!row || new Date(row.expires_at) < new Date()) return back('state_invalid');
    if (url.searchParams.get('error')) return back('denied');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: FN_URL, grant_type: 'authorization_code' }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) return back('no_refresh_token');
    await admin.from('google_credentials').upsert({ id: true, refresh_token: j.refresh_token, scope: j.scope, connected_at: new Date().toISOString() });
    return back('connected');
  }

  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await requireOwner(req))) return json({ error: 'forbidden' }, 403);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ריק */ }

  try {
    switch (body.action) {
      case 'auth_url': {
        const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
        await admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
        await admin.from('oauth_states').insert({ state });
        const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        Object.entries({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: FN_URL, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).forEach(([k, v]) => u.searchParams.set(k, v));
        return json({ url: u.toString() });
      }
      case 'status': {
        const { data: c } = await admin.from('google_credentials').select('scope,connected_at').eq('id', true).maybeSingle();
        const { data: s } = await admin.from('calendar_sync_state').select('google_calendar_id,calendar_name,last_synced_at,last_error,last_counts').limit(1).maybeSingle();
        return json({ connected: !!c, connectedAt: c?.connected_at ?? null, calendar: s ? { id: s.google_calendar_id, name: s.calendar_name } : null, lastSyncedAt: s?.last_synced_at ?? null, lastError: s?.last_error ?? null, lastCounts: s?.last_counts ?? null });
      }
      case 'calendars': {
        const token = await accessToken();
        const r = await g('users/me/calendarList', token, { minAccessRole: 'reader', maxResults: '100' });
        if (!r.ok) throw new Error(`calendarList: ${r.status}`);
        const j = await r.json();
        return json({ calendars: (j.items ?? []).map((c: Record<string, unknown>) => ({ id: c.id, name: c.summaryOverride ?? c.summary, primary: !!c.primary, accessRole: c.accessRole, timeZone: c.timeZone })) });
      }
      case 'select_calendar': {
        const token = await accessToken();
        const id = String(body.id ?? '');
        const r = await g(`users/me/calendarList/${encodeURIComponent(id)}`, token);
        if (!r.ok) throw new Error('היומן לא נמצא או שאין גישה אליו');
        const c = await r.json();
        await admin.from('calendar_sync_state').delete().neq('google_calendar_id', id);
        await admin.from('calendar_sync_state').upsert({ google_calendar_id: id, calendar_name: c.summaryOverride ?? c.summary, time_zone: c.timeZone ?? 'Asia/Jerusalem', sync_token: null, full_synced_at: null, last_error: null });
        return json({ ok: true });
      }
      case 'sync': return json(await sync());
      case 'disconnect': {
        const { data } = await admin.from('google_credentials').select('refresh_token').eq('id', true).maybeSingle();
        if (data) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => undefined);
        await admin.from('google_credentials').delete().eq('id', true);
        await admin.from('calendar_sync_state').update({ sync_token: null, full_synced_at: null }).neq('google_calendar_id', '');
        return json({ ok: true });
      }
      default: return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    if (e instanceof ReauthError) return json({ error: 'reauth_required' });
    return json({ error: (e as Error).message }, 500);
  }
});
