// בדיקת 0001+0002 על Postgres מקומי (PGlite) עם stub ל-auth. הרצה: npx tsx scripts/test-group-sql.ts
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
await db.exec('reset role');
await db.exec(readFileSync('supabase/migrations/0004_group_cleanup.sql', 'utf8'));
await db.exec(`grant execute on all functions in schema public to authenticated;
  revoke all on function _drop_group_events(uuid), _snapshot(), _restore_core(jsonb,text) from public, anon, authenticated;`);
const G = '22222222-2222-2222-2222-222222222222', G2 = '22222222-2222-2222-2222-2222222222bb';
const S1 = '33333333-3333-3333-3333-333333333331', S2 = '33333333-3333-3333-3333-333333333332';
await as(OWNER);
await db.exec(`
  insert into academic_years(id,name,start_date,end_date,term1_start,term1_end,term2_start,term2_end) values ('11111111-1111-1111-1111-111111111111','x','2026-09-01','2027-06-30','2026-09-01','2027-01-31','2027-02-01','2027-06-30');
  insert into study_groups(id,academic_year_id,name,archived_at) values ('${G}','11111111-1111-1111-1111-111111111111','יא 3', now()), ('${G2}','11111111-1111-1111-1111-111111111111','יב 1', null);
  insert into students(id,first_name,last_name) values ('${S1}','דנה','כהן'),('${S2}','רן','לוי');
  insert into enrollments(student_id,group_id) values ('${S1}','${G}'),('${S2}','${G}'),('${S2}','${G2}');
  insert into grade_categories(id,group_id,term,name,weight) values ('44444444-4444-4444-4444-444444444444','${G}',1,'מ',100),('44444444-4444-4444-4444-4444444444bb','${G2}',1,'מ',100);
  insert into assessment_events(id,group_id,term,category_id,title,weight) values ('55555555-5555-5555-5555-555555555555','${G}',1,'44444444-4444-4444-4444-444444444444','א',100),('55555555-5555-5555-5555-5555555555bb','${G2}',1,'44444444-4444-4444-4444-4444444444bb','ב',100);
  insert into grades(event_id,student_id,attempt,score) values ('55555555-5555-5555-5555-555555555555','${S1}',1,80),('55555555-5555-5555-5555-5555555555bb','${S2}',1,90);
  insert into grade_policy_overrides(event_id,student_id,policy) values ('55555555-5555-5555-5555-555555555555','${S1}','best');
  insert into final_grades(group_id,student_id,period,value,source) values ('${G}','${S1}','h1',80,'approved'),('${G2}','${S2}','h1',90,'approved');
  insert into calendar_events(id,group_id,title,start_at,end_at,source,google_calendar_id,google_event_id) values
    ('66666666-6666-6666-6666-666666666601','${G}','a','2026-10-12 08:00+00','2026-10-12 08:45+00','internal',null,null),
    ('66666666-6666-6666-6666-666666666602','${G}','a','2026-10-13 08:00+00','2026-10-13 08:45+00','google','c','e1'),
    ('66666666-6666-6666-6666-666666666603','${G2}','b','2026-10-13 09:00+00','2026-10-13 09:45+00','google','c','e2');
  insert into lesson_logs(calendar_event_id,topic) values ('66666666-6666-6666-6666-666666666601','x'),('66666666-6666-6666-6666-666666666602','y'),('66666666-6666-6666-6666-666666666603','z');`);
const cnt = async (t: string) => Number((await rpc(`select count(*)::int c from ${t}`))[0].c);

await as(STRANGER);
ok((await fail(() => rpc('select delete_study_group($1)', [G]))) !== null, 'זר: delete_study_group נדחה');
ok((await fail(() => rpc('select delete_group_lessons($1)', [G]))) !== null, 'זר: delete_group_lessons נדחה');
ok((await fail(() => rpc('select restore_hidden_events()'))) !== null, 'זר: restore_hidden_events נדחה');
await as(OWNER);
ok((await fail(() => rpc("select _drop_group_events($1)", [G]))) !== null, 'פנימי _drop_group_events לא נגיש');
ok((await fail(() => rpc('select delete_study_group($1)', [G2]))) !== null, 'קבוצה פעילה: מחיקה נדחית');
ok((await cnt('study_groups')) === 2, 'קבוצה פעילה לא נמחקה');

// מחיקת שיעורים בלבד
const l = (await rpc('select delete_group_lessons($1) r', [G]))[0].r;
ok(l.deleted === 1 && l.hidden === 1, `מחיקת שיעורים: ${JSON.stringify(l)}`);
ok((await cnt('enrollments')) === 3 && (await cnt('grades')) === 2, 'שיעורים בלבד: תלמידים וציונים נשארו');
ok((await rpc("select hidden, group_id from calendar_events where id='66666666-6666-6666-6666-666666666602'"))[0].hidden === true, 'אירוע Google הוסתר');
ok((await cnt('app_backups')) === 1, 'נוצר גיבוי ידני לפני המחיקה');

// החזרה
ok((await rpc('select restore_hidden_events() n'))[0].n === 1, 'אירוע מוסתר הוחזר');
// החזרה אינה מחזירה שיוך; מחזירים להסתרה לצורך בדיקת מחיקת קבוצה
await as(OWNER);
await db.exec(`update calendar_events set group_id='${G}', hidden=false where id='66666666-6666-6666-6666-666666666602'`);

// מחיקת קבוצה
const r = (await rpc('select delete_study_group($1) r', [G]))[0].r;
ok(r.students_deleted === 1, `נמחק תלמיד יחיד שלא בקבוצה אחרת: ${JSON.stringify(r)}`);
ok((await cnt('study_groups')) === 1, 'הקבוצה נמחקה, השנייה נשארה');
ok((await cnt('students')) === 1, 'תלמיד משותף נשאר');
ok((await cnt('grades')) === 1 && (await cnt('final_grades')) === 1 && (await cnt('assessment_events')) === 1 && (await cnt('grade_categories')) === 1 && (await cnt('grade_policy_overrides')) === 0, 'נתוני הקבוצה השנייה שלמים, של הנמחקת נמחקו');
ok((await cnt('enrollments')) === 1, 'רישומים: נשאר אחד');
ok((await cnt('calendar_events')) === 2, 'אירוע פנימי נמחק; Google נשארו כשורות');
ok((await rpc("select count(*)::int c from calendar_events where hidden and group_id is null"))[0].c === 1, 'אירוע Google של הקבוצה מוסתר ומנותק');
ok((await cnt('lesson_logs')) === 1, 'תיעוד של הקבוצה הנמחקת נמחק');
ok((await cnt('app_backups')) === 2, 'גיבוי לפני כל מחיקה');
// שחזור מהגיבוי שלפני המחיקה
const bk = (await rpc("select id from app_backups where note like '%לפני מחיקת הקבוצה%' limit 1"))[0].id;
const rest = await fail(() => rpc("select restore_backup($1, null, 'replace', true, null)", [bk]));
console.log('restore (info):', rest ?? 'ok');
console.log(fails ? `\n${fails} FAILED` : '\nכל הבדיקות עברו');
process.exit(fails ? 1 : 0);
