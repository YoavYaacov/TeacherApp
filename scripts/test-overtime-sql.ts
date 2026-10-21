// בדיקת מיגרציה 0006 (שעות נוספות) על Postgres מקומי (PGlite). הרצה: npx tsx scripts/test-overtime-sql.ts
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const OWNER = '00000000-0000-0000-0000-0000000000aa', STRANGER = '00000000-0000-0000-0000-0000000000bb';
const db = new PGlite();
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const as = async (uid: string | null) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`); if (uid) await db.exec('set role authenticated'); };
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, any>[];
const fail = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
const mig = (n: string) => db.exec(readFileSync(`supabase/migrations/${n}.sql`, 'utf8'));

await db.exec(`
  create role anon nologin; create role authenticated nologin; create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  insert into auth.users values ('${OWNER}', 'owner@x.com', now()), ('${STRANGER}', 'other@x.com', now());`);
await mig('0001_init');
await db.exec(`insert into owner_config(email) values ('owner@x.com'); grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to anon, authenticated;`);
await mig('0002_backup_restore');
await mig('0003_google_calendar');
await mig('0004_group_cleanup');
await mig('0005_ai_assistant');
await db.exec(`grant all on all tables in schema public to authenticated; revoke insert, update, delete on ai_usage from authenticated; revoke all on ai_requests from authenticated; revoke insert, update on app_backups from authenticated; grant all on google_credentials, oauth_states to authenticated, anon; revoke all on google_credentials, oauth_states from anon, authenticated; grant execute on all functions in schema public to authenticated;`);
await as(OWNER);
await db.exec(`insert into user_settings(id,theme) values (true,'sky-blue');`);
const oldBackup = (await q('select export_backup() j'))[0].j.data; // גיבוי "ישן": ללא overtime_hours
await as(null);

await mig('0006_overtime_hours');
await db.exec(`grant all on overtime_hours to authenticated; grant execute on all functions in schema public to authenticated;`);

await as(OWNER);
await db.exec(`insert into overtime_hours(year,month,frontal_hours,pedagogical_hours) values (2026,12,3,2),(2027,1,1,0);`);
ok((await q('select count(*)::int c from overtime_hours'))[0].c === 2, 'בעלים כותב וקורא');
ok((await fail(() => db.exec(`insert into overtime_hours(year,month,frontal_hours) values (2026,12,9)`))) !== null, 'חודש כפול נדחה (מפתח ראשי)');
ok((await fail(() => db.exec(`insert into overtime_hours(year,month,frontal_hours) values (2026,5,-1)`))) !== null, 'שעות שליליות נדחות');
ok((await fail(() => db.exec(`insert into overtime_hours(year,month) values (2026,13)`))) !== null, 'חודש 13 נדחה');
await db.exec(`insert into overtime_hours(year,month,frontal_hours,pedagogical_hours) values (2026,12,5,5) on conflict (year,month) do update set frontal_hours=excluded.frontal_hours, pedagogical_hours=excluded.pedagogical_hours`);
ok((await q('select frontal_hours f from overtime_hours where year=2026 and month=12'))[0].f === 5, 'upsert לפי (שנה,חודש)');

await as(STRANGER);
ok((await q('select count(*)::int c from overtime_hours'))[0].c === 0, 'זר לא רואה נתונים');
ok((await fail(() => db.exec(`insert into overtime_hours(year,month) values (2030,1)`))) !== null, 'זר לא כותב');
await as(null);
await db.exec('set role anon');
ok((await fail(() => q('select * from overtime_hours'))) !== null, 'anon ללא גישה');

await as(OWNER);
const snap = (await q('select export_backup() j'))[0].j;
ok(Array.isArray(snap.data.overtime_hours) && snap.data.overtime_hours.length === 2, 'ייצוא גיבוי כולל שעות נוספות');
ok(snap.counts.overtime_hours === 2, 'ספירת הגיבוי כוללת שעות נוספות');
const bid = (await q(`select create_data_backup('manual','t') id`))[0].id;
await db.exec(`delete from overtime_hours`);
await q(`select restore_backup($1, null, 'replace', false, 'REPLACE')`, [bid]);
ok((await q('select count(*)::int c from overtime_hours'))[0].c === 2, 'שחזור "החלף הכול" מחזיר שעות נוספות');
// גיבוי ישן ללא הטבלה
const r = (await q(`select restore_backup(null, $1::jsonb, 'replace', true, null) j`, [JSON.stringify(oldBackup)]))[0].j;
ok(r.ok === true, 'גיבוי ישן ללא overtime_hours מתקבל במצב החלפה (dry): ' + (r.error ?? ''));
await q(`select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE')`, [JSON.stringify(oldBackup)]);
ok((await q('select count(*)::int c from overtime_hours'))[0].c === 0, 'שחזור גיבוי ישן מרוקן את השעות הנוספות (כמו שהיה אז)');
// מיזוג
await db.exec(`insert into overtime_hours(year,month,frontal_hours) values (2026,10,4)`);
await q(`select restore_backup(null, $1::jsonb, 'merge', false, null) j`, [JSON.stringify({ overtime_hours: [{ year: 2026, month: 10, frontal_hours: 99, pedagogical_hours: 0 }, { year: 2026, month: 9, frontal_hours: 2, pedagogical_hours: 1 }] })]);
ok((await q('select frontal_hours f from overtime_hours where year=2026 and month=10'))[0].f === 4, 'מיזוג לא דורס חודש קיים');
ok((await q('select count(*)::int c from overtime_hours'))[0].c === 2, 'מיזוג מוסיף חודש חסר');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
