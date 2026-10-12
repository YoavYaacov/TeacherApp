// בדיקת 0001+0002 על Postgres מקומי (PGlite) עם stub ל-auth. הרצה: npx tsx scripts/test-backup-sql.ts
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const OWNER = '00000000-0000-0000-0000-0000000000aa', STRANGER = '00000000-0000-0000-0000-0000000000bb';
const db = new PGlite();
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const as = async (uid: string | null) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  if (uid) await db.exec('set role authenticated');
};
const rpc = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, any>[];
const fail = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  insert into auth.users values ('${OWNER}', 'owner@x.com', now()), ('${STRANGER}', 'other@x.com', now());
`);
await db.exec(readFileSync('supabase/migrations/0001_init.sql', 'utf8'));
await db.exec(`insert into owner_config(email) values ('owner@x.com');
  grant usage on schema public to authenticated, anon; grant all on all tables in schema public to authenticated;
  grant execute on all functions in schema public to anon, authenticated;`);
await db.exec(readFileSync('supabase/migrations/0002_backup_restore.sql', 'utf8'));
await db.exec(`grant all on app_backups to authenticated; revoke insert, update on app_backups from authenticated;`);
await db.exec(readFileSync('supabase/migrations/0003_google_calendar.sql', 'utf8'));
await db.exec('grant all on google_credentials, oauth_states to authenticated, anon; revoke all on google_credentials, oauth_states from anon, authenticated;');

// נתונים
await as(OWNER);
await db.exec(`
  insert into academic_years(id,name,start_date,end_date,term1_start,term1_end,term2_start,term2_end) values ('11111111-1111-1111-1111-111111111111','תשפז','2026-09-01','2027-06-30','2026-09-01','2027-01-31','2027-02-01','2027-06-30');
  insert into study_groups(id,academic_year_id,name) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','יא 3');
  insert into students(id,first_name,last_name) values ('33333333-3333-3333-3333-333333333331','דנה','כהן'),('33333333-3333-3333-3333-333333333332','רן','לוי');
  insert into enrollments(student_id,group_id) select id,'22222222-2222-2222-2222-222222222222' from students;
  insert into grade_categories(id,group_id,term,name,weight) values ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',1,'מבחנים',100);
  insert into assessment_events(id,group_id,term,category_id,title,weight) values ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222',1,'44444444-4444-4444-4444-444444444444','מבחן 1',100);
  insert into grades(event_id,student_id,attempt,score) values ('55555555-5555-5555-5555-555555555555','33333333-3333-3333-3333-333333333331',1,85.50);
  insert into calendar_events(id,group_id,title,start_at,end_at) values ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','יא 3','2026-10-12 08:00+00','2026-10-12 08:45+00');
  insert into lesson_logs(calendar_event_id,topic) values ('66666666-6666-6666-6666-666666666666','פולינומים');
  insert into user_settings(id,theme) values (true,'espresso');`);

const admin = async (sql: string) => { await db.exec('reset role'); await db.exec(sql); await as(OWNER); };
const cnt = async (t: string) => Number((await rpc(`select count(*)::int c from ${t}`))[0].c);

// 1. הרשאות
await as(STRANGER);
ok((await fail(() => rpc('select export_backup()'))) !== null, 'זר: export_backup נדחה');
ok((await fail(() => rpc('select create_data_backup()'))) !== null, 'זר: create_data_backup נדחה');
ok((await fail(() => rpc("select restore_backup(null, '{}'::jsonb, 'merge', true)"))) !== null, 'זר: restore נדחה');
ok((await rpc('select count(*)::int c from app_backups'))[0].c === 0, 'זר: לא רואה גיבויים');
ok((await fail(() => rpc('select _snapshot()'))) !== null, 'פנימי _snapshot לא נגיש ל-authenticated');
ok((await fail(() => rpc("select _restore_core('{}'::jsonb,'merge')"))) !== null, 'פנימי _restore_core לא נגיש');
await as(OWNER);
ok((await fail(() => db.exec("insert into app_backups(kind,counts,data_hash,bytes,payload) values ('manual','{}','x',1,'{}')"))) !== null, 'בעלים לא יכול להכניס ישירות לטבלת גיבויים');

// 2. יצירת גיבוי
const a1 = (await rpc("select create_data_backup('auto') id"))[0].id;
ok(!!a1, 'גיבוי אוטומטי ראשון נוצר');
ok((await rpc("select create_data_backup('auto') id"))[0].id === null, 'גיבוי אוטומטי שני באותו יום מדולג');
await admin("update app_backups set created_at = now() - interval '2 days'");
ok((await rpc("select create_data_backup('auto') id"))[0].id === null, 'ללא שינוי בנתונים: מדולג');
await db.exec("update students set last_name='כהן-לוי' where first_name='דנה'");
const a2 = (await rpc("select create_data_backup('auto') id"))[0].id;
ok(!!a2 && a2 !== a1, 'אחרי שינוי: נוצר גיבוי חדש');
const man = (await rpc("select create_data_backup('manual','ידני') id"))[0].id;
ok(!!man, 'גיבוי ידני נוצר תמיד');

// 3. שמירת 30 אחרונים בלבד
for (let i = 0; i < 33; i++) {
  await admin(`update app_backups set created_at = now() - interval '3 days' where kind='auto'; update students set last_name='ש${i}' where first_name='רן'`);
  await rpc("select create_data_backup('auto')");
}
ok((await cnt("app_backups where kind='auto'")) === 30, 'נשמרים 30 גיבויים אוטומטיים בלבד');
ok((await cnt("app_backups where kind='manual'")) === 1, 'גיבוי ידני לא נמחק בגיזום');

// 4. ייצוא
const exp = (await rpc('select export_backup() e'))[0].e;
ok(exp.counts.students === 2 && exp.counts.grades === 1 && exp.data.grades[0].score === 85.5, 'export כולל נתונים וספירות');
const snapshot = JSON.parse(JSON.stringify(exp.data));

// 5. שחזור merge — dry-run לא משנה כלום
const before = await cnt('students');
const dry = (await rpc('select restore_backup(null, $1::jsonb, $2, true) r', [JSON.stringify(snapshot), 'merge']))[0].r;
ok(dry.ok && dry.dry && dry.inserted.students === 0 && dry.already_present.students === 2, 'merge dry-run: הכול כבר קיים, 0 להוספה');
// מחיקת נתון, merge משחזר רק את החסר
await db.exec("delete from grades");
const dry2 = (await rpc('select restore_backup(null, $1::jsonb, $2, true) r', [JSON.stringify(snapshot), 'merge']))[0].r;
ok(dry2.inserted.grades === 1, 'dry-run מזהה ציון חסר');
ok((await cnt('grades')) === 0, 'dry-run לא הוסיף בפועל');
await db.exec("update students set first_name='שונה' where last_name='כהן-לוי'");
const real = (await rpc('select restore_backup(null, $1::jsonb, $2, false) r', [JSON.stringify(snapshot), 'merge']))[0].r;
ok(real.ok && real.inserted.grades === 1 && (await cnt('grades')) === 1, 'merge בפועל: הציון חזר');
ok((await rpc("select count(*)::int c from students where first_name='שונה'"))[0].c === 1, 'merge לא דרס רשומה קיימת ששונתה');
ok(before === (await cnt('students')), 'merge לא שינה מספר תלמידים');

// 6. replace
await db.exec("delete from lesson_logs; delete from calendar_events;");
const noConfirm = await fail(() => rpc('select restore_backup(null, $1::jsonb, $2, false) r', [JSON.stringify(snapshot), 'replace']));
ok(noConfirm !== null, 'replace בלי אישור נדחה');
const dryR = (await rpc('select restore_backup(null, $1::jsonb, $2, true) r', [JSON.stringify(snapshot), 'replace']))[0].r;
ok(dryR.ok && dryR.inserted.calendar_events === 1 && (await cnt('calendar_events')) === 0, 'replace dry-run מתבטל');
const preCount = await cnt("app_backups where kind='pre_restore'");
const rr = (await rpc("select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE') r", [JSON.stringify(snapshot)]))[0].r;
ok(rr.ok && !!rr.pre_backup_id && (await cnt("app_backups where kind='pre_restore'")) === preCount + 1, 'replace יצר גיבוי pre_restore');
ok((await rpc("select count(*)::int c from students where first_name='שונה'"))[0].c === 0, 'replace החזיר את מצב הגיבוי');
ok((await cnt('calendar_events')) === 1 && (await cnt('lesson_logs')) === 1, 'replace שחזר אירועים ותיעוד');
// החזרה מגיבוי pre_restore (undo)
const undo = (await rpc("select restore_backup($1, null, 'replace', false, 'REPLACE') r", [rr.pre_backup_id]))[0].r;
ok(undo.ok && (await rpc("select count(*)::int c from students where first_name='שונה'"))[0].c === 1, 'אפשר לבטל שחזור דרך גיבוי pre_restore');

// 7. אטומיות: גיבוי פגום באמצע — שום דבר לא משתנה
const bad = JSON.parse(JSON.stringify(snapshot));
bad.lesson_logs.push({ calendar_event_id: '99999999-9999-9999-9999-999999999999', topic: 'x' }); // FK לא קיים
const studentsBefore = await cnt('students'), pre = await cnt('app_backups');
const badDry = (await rpc("select restore_backup(null, $1::jsonb, 'replace', true) r", [JSON.stringify(bad)]))[0].r;
ok(badDry.ok === false, 'dry-run מזהה גיבוי פגום');
const e = await fail(() => rpc("select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE') r", [JSON.stringify(bad)]));
ok(e !== null, 'שחזור פגום נכשל');
ok((await cnt('students')) === studentsBefore && (await cnt('grades')) === 1 && (await cnt('app_backups')) === pre, 'אטומי: אחרי כשל הכול כמו קודם (כולל ללא pre_restore יתום)');
const e2 = await fail(() => rpc("select restore_backup(null, '{\"students\": []}'::jsonb, 'replace', false, 'REPLACE') r"));
ok(e2 !== null && (await cnt('students')) === studentsBefore, 'גיבוי חלקי ב-replace נדחה בלי למחוק');

// 8. קובץ מקומי ללא created_at/id
const local = { academic_years: snapshot.academic_years.map(({ created_at, updated_at, ...r }: any) => r), study_groups: snapshot.study_groups.map(({ created_at, updated_at, ...r }: any) => r), students: [{ first_name: 'חדש', last_name: 'מקומי' }] };
await rpc("select restore_backup(null, $1::jsonb, 'merge', false) r", [JSON.stringify(local)]);
ok((await rpc("select count(*)::int c from students where last_name='מקומי' and id is not null and created_at is not null"))[0].c === 1, 'רשומה בלי id/created_at קיבלה ברירות מחדל');

// 8ב. 0003: טבלאות הטוקנים לא נגישות ללקוח; העמודות החדשות נכללות בגיבוי/שחזור
await as(OWNER);
ok((await fail(() => rpc('select * from google_credentials'))) !== null, 'google_credentials לא נגישה לבעלים דרך ה-API');
ok((await fail(() => rpc("insert into oauth_states(state) values ('x')"))) !== null, 'oauth_states לא נגישה דרך ה-API');
await db.exec("delete from calendar_events; insert into calendar_events(group_id,title,start_at,end_at,all_day) values ('22222222-2222-2222-2222-222222222222','יא 3','2026-10-12 00:00+00','2026-10-13 00:00+00',true)");
const exp2 = (await rpc('select export_backup() e'))[0].e;
ok(exp2.data.calendar_events[0].all_day === true, 'all_day נכלל בגיבוי');
await rpc("select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE')", [JSON.stringify(exp2.data)]);
ok((await rpc("select all_day from calendar_events limit 1"))[0].all_day === true, 'all_day משוחזר');

// 9. מחיקה ידנית של גיבוי ע"י בעלים, וזר לא
await as(STRANGER);
await db.exec(`delete from app_backups`);
await as(OWNER);
ok((await cnt('app_backups')) > 0, 'זר לא מחק גיבויים');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
