import { build } from 'esbuild';
import { tables } from './fake-sb.mjs';
await build({ entryPoints: [new URL('../../supabase/functions/google-calendar/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: new URL('./.fn.mjs', import.meta.url).pathname, alias: { 'npm:@supabase/supabase-js@2': new URL('./fake-sb.mjs', import.meta.url).pathname }, logLevel: 'error' });
let handler; const envs = { SUPABASE_URL: 'https://x.supabase.co', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 's', APP_URL: 'https://app.test' };
globalThis.Deno = { env: { get: (k) => envs[k] }, serve: (h) => { handler = h; } };
let events = []; let calls = []; let gone = false;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); calls.push(u.pathname + '?' + u.searchParams.toString());
  if (u.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'at', refresh_token: 'rt', scope: 's' });
  if (u.pathname.endsWith('/events')) { if (gone && u.searchParams.get('syncToken')) { gone = false; return new Response('', { status: 410 }); } return Response.json({ items: events, nextSyncToken: 'tok' + calls.length }); }
  return new Response('{}', { status: 404 });
};
await import(new URL('./.fn.mjs', import.meta.url).pathname);
const post = (b) => handler(new Request('https://x/f', { method: 'POST', headers: { Authorization: 'Bearer u' }, body: JSON.stringify(b) })).then((r) => r.json());
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
tables.google_credentials = [{ id: true, refresh_token: 'rt' }];
tables.calendar_sync_state = [{ google_calendar_id: 'cal1', calendar_name: 'הוראה', time_zone: 'Asia/Jerusalem', sync_token: null, full_synced_at: null }];
tables.study_groups = [{ id: 'g1', name: 'יא 3', archived_at: null }];
tables.user_settings = [{ id: true, prefs: { titleRules: { 'מתמטיקה ח1': 'g2' } } }];
events = [
  { id: 'e1', summary: 'יא 3', etag: 'a', start: { dateTime: '2026-10-13T08:00:00+03:00' }, end: { dateTime: '2026-10-13T08:45:00+03:00' } },
  { id: 'e2', summary: 'ישיבת צוות', start: { dateTime: '2026-10-13T10:00:00+03:00' }, end: { dateTime: '2026-10-13T11:00:00+03:00' } },
  { id: 'e3', summary: 'חופש', start: { date: '2026-10-14' }, end: { date: '2026-10-15' } },
  { id: 'e4', summary: 'מתמטיקה ח1', recurringEventId: 'r1', start: { dateTime: '2026-10-15T09:00:00+03:00' }, end: { dateTime: '2026-10-15T09:45:00+03:00' } },
  { id: 'e5', summary: 'פוקוס', eventType: 'focusTime', start: { dateTime: '2026-10-15T09:00:00+03:00' }, end: { dateTime: '2026-10-15T09:45:00+03:00' } },
];
let r = await post({ action: 'sync' });
ok(r.ok && r.created === 4 && r.skipped === 1 && r.full, 'סנכרון ראשון: 4 חדשים, פוקוס דולג, מלא');
const ev = tables.calendar_events;
ok(ev.find((e) => e.google_event_id === 'e1').group_id === 'g1', 'התאמת קבוצה לפי שם');
ok(ev.find((e) => e.google_event_id === 'e2').group_id === null, 'אירוע לא קשור נשאר בלי קבוצה');
ok(ev.find((e) => e.google_event_id === 'e4').group_id === 'g2', 'כלל כותרת שמור מופעל');
ok(ev.find((e) => e.google_event_id === 'e3').all_day && ev.find((e) => e.google_event_id === 'e3').start_at === '2026-10-13T21:00:00.000Z', 'יום שלם בשעון ישראל');
ok(ev.find((e) => e.google_event_id === 'e1').start_at === '2026-10-13T05:00:00.000Z', 'זמן מומר ל-UTC');
// סנכרון שני: אותם אירועים => אפס כפילויות
tables.calendar_events.find((e) => e.google_event_id === 'e2').group_id = 'g1'; // המשתמש שייך ידנית
events = events.slice(0, 4).map((e) => ({ ...e, summary: e.id === 'e1' ? 'יא 3 (שונה)' : e.summary }));
r = await post({ action: 'sync' });
ok(r.ok && r.created === 0 && r.updated === 4 && !r.full, 'סנכרון שני אינקרמנטלי (syncToken), בלי חדשים');
ok(tables.calendar_events.length === 4, 'אין כפילויות');
ok(tables.calendar_events.find((e) => e.google_event_id === 'e2').group_id === 'g1', 'שיוך ידני לא נדרס');
ok(tables.calendar_events.find((e) => e.google_event_id === 'e1').title === 'יא 3 (שונה)', 'שינוי כותרת ב-Google התעדכן');
// שינוי שעה (גם באירוע חוזר: אותו מזהה מופע, זמן חדש): השיוך נשמר
tables.calendar_events.find((e) => e.google_event_id === 'e4').group_id = 'g1';
events = [{ id: 'e4', recurringEventId: 'r1', summary: 'מתמטיקה ח1', start: { dateTime: '2026-10-15T11:00:00+03:00' }, end: { dateTime: '2026-10-15T11:45:00+03:00' } }];
r = await post({ action: 'sync' });
const e4 = tables.calendar_events.find((e) => e.google_event_id === 'e4');
ok(e4.start_at === '2026-10-15T08:00:00.000Z' && e4.group_id === 'g1' && tables.calendar_events.filter((e) => e.google_event_id === 'e4').length === 1, 'שינוי שעה באירוע חוזר: עודכן, שיוך נשמר, בלי כפילות');
// תיעוד נשמר ליד אירוע שעודכן
tables.lesson_logs = [{ calendar_event_id: e4.id, topic: 'x' }];
events = [{ id: 'e4', recurringEventId: 'r1', summary: 'מתמטיקה ח1', start: { dateTime: '2026-10-15T12:00:00+03:00' }, end: { dateTime: '2026-10-15T12:45:00+03:00' } }];
await post({ action: 'sync' });
ok(tables.calendar_events.find((e) => e.google_event_id === 'e4').id === e4.id && tables.lesson_logs.length === 1, 'מזהה הרשומה (ולכן התיעוד) לא משתנה בעדכון');
// ביטול ב-Google
events = [{ id: 'e1', status: 'cancelled' }, { id: 'zz', status: 'cancelled' }];
r = await post({ action: 'sync' });
ok(r.cancelled === 1 && r.skipped === 1 && tables.calendar_events.find((e) => e.google_event_id === 'e1').status === 'cancelled', 'ביטול: קיים סומן, לא-מוכר דולג');
// local_dirty
tables.calendar_events.find((e) => e.google_event_id === 'e3').local_dirty = true;
events = [{ id: 'e3', summary: 'שונה בגוגל', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }];
r = await post({ action: 'sync' });
ok(r.skipped === 1 && tables.calendar_events.find((e) => e.google_event_id === 'e3').title === 'חופש', 'שינוי מקומי לא נדחף לא נדרס');
// 410
gone = true; events = [];
r = await post({ action: 'sync' });
ok(r.ok && r.full, '410 => סנכרון מלא מחדש');
ok(r.cancelled >= 1 && tables.calendar_events.find((e) => e.google_event_id === 'e4').status === 'cancelled', 'סנכרון מלא: אירוע שנעלם בלי הודעה סומן מבוטל (לא נמחק)');
ok(tables.calendar_events.length === 4, 'שום שורה לא נמחקה');
// אירוע שחזר + כלל שיוך חדש לאירוע בלי קבוצה
tables.user_settings[0].prefs.titleRules['ישיבת צוות'] = 'g1'; tables.calendar_events.find((e) => e.google_event_id === 'e2').group_id = null;
events = [{ id: 'e2', summary: 'ישיבת צוות', start: { dateTime: '2026-10-13T10:00:00+03:00' }, end: { dateTime: '2026-10-13T11:00:00+03:00' } }, { id: 'e4', summary: 'מתמטיקה ח1', start: { dateTime: '2026-10-15T09:00:00+03:00' }, end: { dateTime: '2026-10-15T09:45:00+03:00' } }];
r = await post({ action: 'sync' });
ok(tables.calendar_events.find((e) => e.google_event_id === 'e4').status === 'confirmed', 'אירוע שבוטל וחזר ב-Google חוזר לפעיל');
ok(tables.calendar_events.find((e) => e.google_event_id === 'e2').group_id === 'g1', 'אירוע בלי קבוצה מקבל שיוך לפי כלל חדש');
// כשל באמצע: הטוקן לא מתקדם
const tokBefore = tables.calendar_sync_state[0].sync_token;
globalThis.fetch = async (url) => (String(url).includes('oauth2') ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : new Response('', { status: 500 }));
r = await post({ action: 'sync' });
ok(r.error === 'reauth_required' && tables.calendar_sync_state[0].sync_token === tokBefore && tables.calendar_sync_state[0].last_error === 'reauth_required', 'invalid_grant => דורש חיבור מחדש, הטוקן לא השתנה');
// הרשאות
globalThis.createClientDeny = true;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
