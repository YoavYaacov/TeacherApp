// בדיקת 0001+0002 על Postgres מקומי (PGlite) עם stub ל-auth. הרצה: npx tsx scripts/test-ai-sql.ts
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
await db.exec(readFileSync('supabase/migrations/0005_ai_assistant.sql', 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated; revoke insert, update, delete on ai_usage from authenticated; revoke all on ai_requests from authenticated; revoke insert, update on app_backups from authenticated;
  grant execute on all functions in schema public to authenticated;
  revoke all on function _drop_group_events(uuid), _snapshot(), _restore_core(jsonb,text) from public, anon, authenticated;`);
const G = '22222222-2222-2222-2222-222222222222', S1 = '33333333-3333-3333-3333-333333333331', S2 = '33333333-3333-3333-3333-333333333332';
const EV = '66666666-6666-6666-6666-666666666601', EV2 = '66666666-6666-6666-6666-666666666602';
await as(OWNER);
await db.exec(`
  insert into academic_years(id,name,start_date,end_date,term1_start,term1_end,term2_start,term2_end) values ('11111111-1111-1111-1111-111111111111','x','2026-09-01','2027-06-30','2026-09-01','2027-01-31','2027-02-01','2027-06-30');
  insert into study_groups(id,academic_year_id,name) values ('${G}','11111111-1111-1111-1111-111111111111','יא 3');
  insert into students(id,first_name,last_name) values ('${S1}','דנה','כהן'),('${S2}','רן','לוי');
  insert into enrollments(student_id,group_id) values ('${S1}','${G}');
  insert into calendar_events(id,group_id,title,start_at,end_at) values ('${EV}','${G}','a','2026-10-12 08:00+00','2026-10-12 08:45+00'),('${EV2}',null,'b','2026-10-13 08:00+00','2026-10-13 08:45+00');
  insert into lesson_logs(calendar_event_id,topic,learned,private_note) values ('${EV}','קיים','טקסט קיים','סודי');
  insert into ai_conversations(id,title) values ('77777777-7777-7777-7777-777777777777','t');
  insert into ai_drafts(id,kind,target,payload) values
   ('88888888-8888-8888-8888-888888888801','lesson_log','{"calendar_event_id":"${EV}"}','{"topic":"חדש","learned":"נוסף","homework":"ש״ב","mark_done":true}'),
   ('88888888-8888-8888-8888-888888888802','lesson_log','{"calendar_event_id":"${EV}"}','{"learned":"עוד"}'),
   ('88888888-8888-8888-8888-888888888803','lesson_log','{"calendar_event_id":"${EV2}"}','{"learned":"x"}'),
   ('88888888-8888-8888-8888-888888888804','evaluation','{"group_id":"${G}","student_id":"${S1}","period":"h1"}','{"text":"התקדם יפה","params":{"style":"warm"}}'),
   ('88888888-8888-8888-8888-888888888805','evaluation','{"group_id":"${G}","student_id":"${S2}","period":"h1"}','{"text":"לא רשום"}');`);
const cnt = async (t: string) => Number((await rpc(`select count(*)::int c from ${t}`))[0].c);
const D = (n: number) => `88888888-8888-8888-8888-88888888880${n}`;
const log = async () => (await rpc(`select * from lesson_logs where calendar_event_id='${EV}'`))[0];

await as(STRANGER);
ok((await fail(() => rpc('select ai_apply_draft($1)', [D(1)]))) !== null, 'זר: ai_apply_draft נדחה');
ok((await rpc('select count(*)::int c from ai_conversations'))[0].c === 0, 'זר: לא רואה שיחות');
await as(OWNER);
ok((await fail(() => db.exec("insert into ai_usage(day) values (current_date)"))) !== null, 'בעלים לא כותב ישירות למונה שימוש');

// fill: שדות קיימים לא נדרסים, ריקים מתמלאים
await rpc('select ai_apply_draft($1, null, $2)', [D(1), 'fill']);
let l = await log();
ok(l.topic === 'קיים' && l.learned === 'טקסט קיים', 'fill: לא דורס תיעוד קיים');
ok(l.homework === 'ש״ב', 'fill: ממלא שדה ריק');
ok(l.completion === 'done', 'mark_done סימן כמתועד');
ok(l.private_note === 'סודי', 'הערה פרטית לא נגעה');
ok((await fail(() => rpc('select ai_apply_draft($1)', [D(1)])))?.includes('כבר טופלה') ?? false, 'טיוטה שבוצעה לא מבוצעת שוב');
// append
await rpc('select ai_apply_draft($1, null, $2)', [D(2), 'append']);
l = await log(); ok(l.learned === 'טקסט קיים\n\nעוד', 'append: מוסיף בסוף');
// replace דורש בחירה מפורשת - על טיוטה חדשה
await db.exec(`insert into ai_drafts(id,kind,target,payload) values ('88888888-8888-8888-8888-888888888806','lesson_log','{"calendar_event_id":"${EV}"}','{"learned":"מחליף"}')`);
await rpc('select ai_apply_draft($1, null, $2)', ['88888888-8888-8888-8888-888888888806', 'replace']);
l = await log(); ok(l.learned === 'מחליף', 'replace: מחליף');
ok((await fail(() => rpc('select ai_apply_draft($1, null, $2)', [D(3), 'fill']))) !== null, 'שיעור לא משויך: נדחה');
ok((await fail(() => rpc('select ai_apply_draft($1, null, $2)', [D(4), 'bogus']))) !== null, 'מצב לא חוקי נדחה');
// הערכה
await rpc('select ai_apply_draft($1)', [D(4)]);
ok((await rpc("select text from ai_evaluations where student_id=$1", [S1]))[0]?.text === 'התקדם יפה', 'הערכה נשמרה');
ok((await fail(() => rpc('select ai_apply_draft($1)', [D(5)]))) !== null, 'תלמיד שאינו בקבוצה: נדחה');
ok((await rpc("select status from ai_drafts where id=$1", [D(5)]))[0].status === 'pending', 'טיוטה שנדחתה נשארת ממתינה');
await db.exec(`insert into ai_drafts(id,kind,target,payload) values ('88888888-8888-8888-8888-888888888807','evaluation','{"group_id":"${G}","student_id":"${S1}","period":"h1"}','{"text":"גרסה חדשה"}')`);
await rpc('select ai_apply_draft($1)', ['88888888-8888-8888-8888-888888888807']);
ok((await cnt('ai_evaluations')) === 1 && (await rpc("select text from ai_evaluations"))[0].text === 'גרסה חדשה', 'הערכה חוזרת מעדכנת');

// גיבוי כולל טבלאות AI ושחזור גיבוי ישן (בלי טבלאות AI) ב-replace
await db.exec(`insert into ai_messages(conversation_id,role,content) values ('77777777-7777-7777-7777-777777777777','user','שלום')`);
const exp = (await rpc('select export_backup() b'))[0].b;
ok(exp.data.ai_messages?.length === 1 && exp.data.ai_conversations?.length === 1, 'גיבוי כולל הודעות ושיחות');
const old = { ...exp.data }; delete old.ai_conversations; delete old.ai_messages; delete old.ai_drafts; delete old.ai_evaluations;
const r = (await rpc("select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE') r", [JSON.stringify(old)]))[0].r;
ok(await cnt('ai_messages') === 0 && await cnt('students') === 2, `שחזור גיבוי ישן ב-replace מתרוקן טבלאות AI (${JSON.stringify(r).slice(0, 80)})`);
await rpc("select restore_backup(null, $1::jsonb, 'replace', false, 'REPLACE') r", [JSON.stringify(exp.data)]);
ok(await cnt('ai_messages') === 1 && await cnt('ai_evaluations') === 1, 'שחזור גיבוי חדש מחזיר שיחות והערכות');
// מחיקת קבוצה מוחקת הערכות (cascade)
await db.exec(`update study_groups set archived_at = now() where id='${G}'`);
await rpc('select delete_study_group($1)', [G]);
ok((await cnt('ai_evaluations')) === 0, 'מחיקת קבוצה מנקה הערכות AI');
console.log(fails ? `\n${fails} FAILED` : '\nכל הבדיקות עברו');
process.exit(fails ? 1 : 0);
