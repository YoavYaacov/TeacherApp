-- 0009_student_identity.sql — תעודות זהות של תלמידים, מוצפנות, בטבלה נפרדת.
--
-- חשוב: כל השמות בקובץ מוגדרים עם הסכמה teacherapp. (הפרויקט משותף עם "הבנתי").
-- אין להריץ מול סכמת public.
--
-- עקרונות:
--  * ת"ז לא נשמרת בשום טבלה שה-API קורא (students וכו'), לכן לא נכנסת ל-select *, ל-to_jsonb,
--    לגיבוי app_backups, לייצוא קבצים ולייצוא Excel.
--  * הטבלה teacherapp_private.student_identity נמצאת בסכמה שאינה חשופה, עם RLS ובלי הרשאות ובלי policy.
--  * ללא מפתח זר מ-students: שחזור במצב replace מוחק ומכניס מחדש תלמידים (באותם מזהים), וקישור
--    מפתח זר היה מוחק את הת"ז. הקישור הוא לפי student_id (uuid) בלבד, לעולם לא לפי שם.
--  * הצפנה: pgp_sym_encrypt עם מפתח נפרד ב-Vault בשם teacherapp_identity_key (לא המפתח של "הבנתי").
--  * אין פונקציה שמחזירה ת"ז לדפדפן. הפונקציות מחזירות ספירות וסטטוס בלבד.
--
-- דרישות מוקדמות: pgcrypto, supabase_vault, והסוד teacherapp_identity_key קיים ב-Vault
-- (ראו docs/IDENTITY.md; נוצר פעם אחת בצד השרת, ללא צפייה בערך).

do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is required';
  end if;
  if not exists (select 1 from vault.secrets where name = 'teacherapp_identity_key') then
    raise exception 'Vault secret teacherapp_identity_key is missing. Create it first (docs/IDENTITY.md).';
  end if;
end $$;

create schema if not exists teacherapp_private;
revoke all on schema teacherapp_private from public, anon, authenticated;

create or replace function teacherapp_private.identity_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'teacherapp_identity_key' limit 1
$$;
revoke all on function teacherapp_private.identity_key() from public, anon, authenticated;

create or replace function teacherapp_private.is_valid_il_id(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s text; t int := 0; d int; i int;
begin
  if p is null or p !~ '^[0-9]{5,9}$' then return false; end if;
  s := lpad(p, 9, '0');
  if s = '000000000' then return false; end if;
  for i in 1..9 loop
    d := substr(s, i, 1)::int * case when i % 2 = 1 then 1 else 2 end;
    if d > 9 then d := d - 9; end if;
    t := t + d;
  end loop;
  return t % 10 = 0;
end $$;

create or replace function teacherapp_private.id_hash(p text)
returns bytea language sql stable security definer set search_path = '' as $$
  select extensions.hmac(convert_to('ta:idx:' || lpad(p, 9, '0'), 'UTF8'),
                         convert_to(teacherapp_private.identity_key(), 'UTF8'), 'sha256')
$$;
revoke all on function teacherapp_private.id_hash(text) from public, anon, authenticated;

create table if not exists teacherapp_private.student_identity (
  student_id uuid primary key,
  id_enc     bytea not null,
  id_hash    bytea not null unique,
  created_at timestamptz not null default now()
);
create table if not exists teacherapp_private.identity_backups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note       text,
  n          int not null,
  rows       jsonb not null   -- [{student_id, id_enc (hex), id_hash (hex)}]; מוצפן, חסר ערך בלי המפתח. נשמר עד 14 יום ולכל היותר 3
);
-- מטא-נתונים (תאריך ייצוא אחרון) ו"מצבות": תלמידים שהזהות שלהם נמחקה במכוון, כדי שקובץ גיבוי ישן לא יחזיר אותה
create table if not exists teacherapp_private.identity_meta (key text primary key, value text not null);
create table if not exists teacherapp_private.identity_erased (student_id uuid primary key, erased_at timestamptz not null default now());
alter table teacherapp_private.identity_meta   enable row level security;
alter table teacherapp_private.identity_erased enable row level security;
revoke all on teacherapp_private.identity_meta, teacherapp_private.identity_erased from public, anon, authenticated;
-- הזנת ת"ז חדשה (פעולה מכוונת) מבטלת מצבה
create or replace function teacherapp_private.clear_erased() returns trigger language plpgsql security definer set search_path = '' as $$
begin delete from teacherapp_private.identity_erased where student_id = new.student_id; return new; end $$;
drop trigger if exists student_identity_clear_erased on teacherapp_private.student_identity;
alter table teacherapp_private.student_identity  enable row level security;
alter table teacherapp_private.identity_backups  enable row level security;
revoke all on teacherapp_private.student_identity, teacherapp_private.identity_backups from public, anon, authenticated;
create trigger student_identity_clear_erased after insert on teacherapp_private.student_identity
  for each row execute function teacherapp_private.clear_erased();

-- ───────────── ייבוא תלמידים עם ת"ז (אטומי; מחזיר ספירות בלבד) ─────────────
-- p_rows: [{"first":"..","last":"..","cls":"..","id":".."}], id אופציונלי.
create or replace function teacherapp.import_students_with_ids(p_group uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare
  r jsonb; i int := 0; f text; l text; c text; v text; h bytea; sid uuid;
  n_new int := 0; n_matched int := 0; n_filled int := 0; errs jsonb := '[]'::jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'קלט לא תקין'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'יותר מדי שורות'; end if;
  if not exists (select 1 from study_groups where id = p_group) then raise exception 'הקבוצה לא נמצאה'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ta_ident:' || p_group::text, 0));

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    f := nullif(btrim(r ->> 'first'), ''); l := nullif(btrim(r ->> 'last'), '');
    c := nullif(btrim(r ->> 'cls'), '');
    v := nullif(regexp_replace(coalesce(r ->> 'id', ''), '\s', '', 'g'), '');
    if f is null or l is null then errs := errs || jsonb_build_object('row', i, 'reason', 'name'); continue; end if;
    if v is not null then
      if not teacherapp_private.is_valid_il_id(v) then errs := errs || jsonb_build_object('row', i, 'reason', 'id_invalid'); continue; end if;
      h := teacherapp_private.id_hash(v);
      if exists (select 1 from teacherapp_private.student_identity where id_hash = h) then
        -- אותה ת"ז כבר שייכת לתלמיד: תקין רק אם זה אותו תלמיד בקבוצה
        select s.id into sid from students s join enrollments e on e.student_id = s.id
          where e.group_id = p_group and e.left_at is null and s.first_name = f and s.last_name = l
            and exists (select 1 from teacherapp_private.student_identity x where x.student_id = s.id and x.id_hash = h) limit 1;
        if sid is null then errs := errs || jsonb_build_object('row', i, 'reason', 'id_duplicate'); continue; end if;
        n_matched := n_matched + 1; continue;
      end if;
    end if;

    select s.id into sid from students s join enrollments e on e.student_id = s.id
      where e.group_id = p_group and e.left_at is null and s.first_name = f and s.last_name = l
      order by s.created_at limit 1;
    if sid is not null then
      if v is null then n_matched := n_matched + 1; continue; end if;
      if exists (select 1 from teacherapp_private.student_identity where student_id = sid) then
        errs := errs || jsonb_build_object('row', i, 'reason', 'id_differs'); continue;   -- לא דורסים ת"ז קיימת
      end if;
      insert into teacherapp_private.student_identity (student_id, id_enc, id_hash)
        values (sid, extensions.pgp_sym_encrypt(lpad(v, 9, '0'), teacherapp_private.identity_key()), h);
      n_filled := n_filled + 1; continue;
    end if;

    insert into students (first_name, last_name, home_class) values (f, l, c) returning id into sid;
    insert into enrollments (student_id, group_id) values (sid, p_group);
    if v is not null then
      insert into teacherapp_private.student_identity (student_id, id_enc, id_hash)
        values (sid, extensions.pgp_sym_encrypt(lpad(v, 9, '0'), teacherapp_private.identity_key()), h);
    end if;
    n_new := n_new + 1;
  end loop;
  return jsonb_build_object('ok', true, 'created', n_new, 'matched', n_matched, 'filled', n_filled, 'errors', errs);
end $$;

-- הוספת/עדכון ת"ז לתלמיד קיים (אין החזרת ערך)
create or replace function teacherapp.set_student_identity(p_student uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare v text := regexp_replace(coalesce(p_id, ''), '\s', '', 'g'); h bytea;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if not exists (select 1 from students where id = p_student) then raise exception 'התלמיד לא נמצא'; end if;
  if not teacherapp_private.is_valid_il_id(v) then return jsonb_build_object('ok', false, 'reason', 'id_invalid'); end if;
  h := teacherapp_private.id_hash(v);
  if exists (select 1 from teacherapp_private.student_identity where id_hash = h and student_id <> p_student) then
    return jsonb_build_object('ok', false, 'reason', 'id_duplicate');
  end if;
  insert into teacherapp_private.student_identity (student_id, id_enc, id_hash)
    values (p_student, extensions.pgp_sym_encrypt(lpad(v, 9, '0'), teacherapp_private.identity_key()), h)
  on conflict (student_id) do update set id_enc = excluded.id_enc, id_hash = excluded.id_hash;
  return jsonb_build_object('ok', true);
end $$;

-- הוספת ת"ז למספר תלמידים קיימים לפי student_id (ייבוא רשימה). מחזיר ספירות ושגיאות לפי מספר שורה בלבד.
-- p_rows: [{"student_id": uuid, "id": ".."}]. לא דורס ת"ז קיימת של תלמיד.
create or replace function teacherapp.set_student_identities(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare r jsonb; i int := 0; sid uuid; v text; h bytea; n_ok int := 0; errs jsonb := '[]'::jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'קלט לא תקין'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'יותר מדי שורות'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin sid := (r ->> 'student_id')::uuid; exception when others then sid := null; end;
    v := regexp_replace(coalesce(r ->> 'id', ''), '\s', '', 'g');
    if sid is null or not exists (select 1 from students where id = sid) then errs := errs || jsonb_build_object('row', i, 'reason', 'student'); continue; end if;
    if not teacherapp_private.is_valid_il_id(v) then errs := errs || jsonb_build_object('row', i, 'reason', 'id_invalid'); continue; end if;
    h := teacherapp_private.id_hash(v);
    if exists (select 1 from teacherapp_private.student_identity where student_id = sid and id_hash = h) then n_ok := n_ok + 1; continue; end if;
    if exists (select 1 from teacherapp_private.student_identity where student_id = sid) then errs := errs || jsonb_build_object('row', i, 'reason', 'id_differs'); continue; end if;
    if exists (select 1 from teacherapp_private.student_identity where id_hash = h) then errs := errs || jsonb_build_object('row', i, 'reason', 'id_duplicate'); continue; end if;
    insert into teacherapp_private.student_identity (student_id, id_enc, id_hash)
      values (sid, extensions.pgp_sym_encrypt(lpad(v, 9, '0'), teacherapp_private.identity_key()), h);
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n_ok, 'errors', errs);
end $$;

-- אילו תלמידים יש להם ת"ז (מזהי תלמידים בלבד)
create or replace function teacherapp.students_with_id()
returns uuid[] language plpgsql stable security definer set search_path = 'teacherapp', 'pg_temp' as $$
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  return coalesce((select array_agg(student_id) from teacherapp_private.student_identity), '{}');
end $$;

-- ───────────── גיבוי, שחזור ומחיקה של זהויות ─────────────
-- שורת גיבוי: {student_id, id_enc (hex), id_hash (hex)}. אותו פורמט בגיבוי הפנימי ובחבילה החיצונית.
-- שחזור: רק לפי student_id של תלמיד שקיים. כל שורה נבדקת: פענוח במפתח הנוכחי, ו-hash תואם לערך המפוענח,
-- ת"ז תקינה, לא מצבה, אין לתלמיד ת"ז אחרת, והת"ז אינה של תלמיד אחר. לעולם לא לפי שם ולעולם לא דורס.
create or replace function teacherapp_private.restore_rows(p_rows jsonb, p_dry boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; k text := teacherapp_private.identity_key(); sid uuid; enc bytea; hh bytea; plain text; cur bytea;
  c jsonb := jsonb_build_object('restored', 0, 'same', 0, 'conflict', 0, 'duplicate', 0, 'no_student', 0, 'erased', 0, 'bad_row', 0);
  bucket text;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    bucket := null;
    begin
      sid := (r ->> 'student_id')::uuid; enc := decode(r ->> 'id_enc', 'hex'); hh := decode(r ->> 'id_hash', 'hex');
      plain := extensions.pgp_sym_decrypt(enc, k);
      if not teacherapp_private.is_valid_il_id(plain) or teacherapp_private.id_hash(plain) is distinct from hh then bucket := 'bad_row'; end if;
    exception when others then bucket := 'bad_row';
    end;
    plain := null;
    if bucket is null then
      if exists (select 1 from teacherapp_private.identity_erased where student_id = sid) then bucket := 'erased';
      elsif not exists (select 1 from teacherapp.students where id = sid) then bucket := 'no_student';
      else
        select id_hash into cur from teacherapp_private.student_identity where student_id = sid;
        if found then bucket := case when cur = hh then 'same' else 'conflict' end;
        elsif exists (select 1 from teacherapp_private.student_identity where id_hash = hh) then bucket := 'duplicate';
        else
          bucket := 'restored';
          if not p_dry then insert into teacherapp_private.student_identity (student_id, id_enc, id_hash) values (sid, enc, hh); end if;
        end if;
      end if;
    end if;
    c := jsonb_set(c, array[bucket], to_jsonb((c ->> bucket)::int + 1));
  end loop;
  return c;
end $$;
revoke all on function teacherapp_private.restore_rows(jsonb, boolean) from public, anon, authenticated;

create or replace function teacherapp_private.package_mac(p_created text, p_rows jsonb)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(
    convert_to('ta-identity-v1|' || p_created || '|' || count(*) || '|' ||
      coalesce(string_agg(x.student_id || '.' || x.id_enc || '.' || x.id_hash, ';' order by x.student_id), ''), 'UTF8'),
    extensions.hmac(convert_to('ta-backup-mac-v1', 'UTF8'), convert_to(teacherapp_private.identity_key(), 'UTF8'), 'sha256'),
    'sha256'), 'hex')
  from jsonb_to_recordset(p_rows) as x(student_id text, id_enc text, id_hash text)
$$;
revoke all on function teacherapp_private.package_mac(text, jsonb) from public, anon, authenticated;

create or replace function teacherapp_private.current_rows()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'id_enc', encode(id_enc, 'hex'), 'id_hash', encode(id_hash, 'hex'))
                           order by student_id), '[]'::jsonb) from teacherapp_private.student_identity
$$;
revoke all on function teacherapp_private.current_rows() from public, anon, authenticated;

-- גיבויים פנימיים: עד 14 יום ולכל היותר 3
create or replace function teacherapp_private.prune_backups() returns void language sql security definer set search_path = '' as $$
  delete from teacherapp_private.identity_backups
   where created_at < now() - interval '14 days'
      or id not in (select id from teacherapp_private.identity_backups order by created_at desc limit 3)
$$;
revoke all on function teacherapp_private.prune_backups() from public, anon, authenticated;

-- מחיקה מיידית של זהויות מהטבלה ומכל הגיבויים הפנימיים. מחזיר כמה זהויות פעילות נמחקו.
create or replace function teacherapp_private.purge(p_students uuid[], p_tombstone boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with d as (delete from teacherapp_private.student_identity where student_id = any(p_students) returning 1) select count(*) into n from d;
  update teacherapp_private.identity_backups b
     set rows = coalesce((select jsonb_agg(x) from jsonb_array_elements(b.rows) x where (x ->> 'student_id')::uuid <> all(p_students)), '[]'::jsonb)
   where exists (select 1 from jsonb_array_elements(b.rows) x where (x ->> 'student_id')::uuid = any(p_students));
  update teacherapp_private.identity_backups set n = jsonb_array_length(rows);
  if p_tombstone then
    insert into teacherapp_private.identity_erased (student_id) select unnest(p_students) on conflict do nothing;
  end if;
  perform teacherapp_private.prune_backups();
  return n;
end $$;
revoke all on function teacherapp_private.purge(uuid[], boolean) from public, anon, authenticated;

create or replace function teacherapp.identity_backup_create(p_note text default null)
returns uuid language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare bid uuid; rws jsonb := teacherapp_private.current_rows();
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  insert into teacherapp_private.identity_backups (note, n, rows) values (p_note, jsonb_array_length(rws), rws) returning id into bid;
  perform teacherapp_private.prune_backups();
  return bid;
end $$;

create or replace function teacherapp.identity_backup_restore(p_backup uuid)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare b jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select rows into b from teacherapp_private.identity_backups where id = p_backup;
  if b is null then raise exception 'גיבוי לא נמצא'; end if;
  return jsonb_build_object('ok', true) || teacherapp_private.restore_rows(b, false);
end $$;

-- מחיקת ת"ז של תלמיד בלבד (התלמיד נשאר). מיידי, כולל הגיבויים הפנימיים, ומונע שחזור מקובץ ישן.
create or replace function teacherapp.erase_student_identity(p_student uuid)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'erased', teacherapp_private.purge(array[p_student], true));
end $$;

-- חבילת גיבוי חיצונית: טקסט מוצפן בלבד (אין ת"ז גלויה ואין שמות) + חתימת HMAC-SHA256 במפתח נגזר מהמפתח הסודי.
create or replace function teacherapp.identity_export()
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare rws jsonb := teacherapp_private.current_rows(); created text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  insert into teacherapp_private.identity_meta (key, value) values ('last_export_at', created), ('last_export_n', jsonb_array_length(rws)::text)
    on conflict (key) do update set value = excluded.value;
  perform teacherapp_private.prune_backups();
  return jsonb_build_object('format', 'ta-identity-v1', 'created_at', created, 'n', jsonb_array_length(rws), 'rows', rws,
                            'mac', teacherapp_private.package_mac(created, rws));
end $$;

-- בדיקת חבילה (p_apply=false: ללא כתיבה) או שחזור ממנה (p_apply=true). קודם נבדקות שלמות וחתימה; רק אחר כך שורות.
create or replace function teacherapp.identity_import(p_package jsonb, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare rws jsonb; created text; res jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if jsonb_typeof(p_package) is distinct from 'object' or p_package ->> 'format' is distinct from 'ta-identity-v1'
     or jsonb_typeof(p_package -> 'rows') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;
  rws := p_package -> 'rows'; created := p_package ->> 'created_at';
  if jsonb_array_length(rws) > 5000 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  if created is null or created !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$' then return jsonb_build_object('ok', false, 'reason', 'format'); end if;
  begin
    if (p_package ->> 'n')::int is distinct from jsonb_array_length(rws) then return jsonb_build_object('ok', false, 'reason', 'count'); end if;
    if teacherapp_private.package_mac(created, rws) is distinct from (p_package ->> 'mac') then
      return jsonb_build_object('ok', false, 'reason', 'mac');   -- קובץ שונה או מפתח שונה
    end if;
  exception when others then return jsonb_build_object('ok', false, 'reason', 'format');
  end;
  perform pg_advisory_xact_lock(hashtextextended('ta_ident_import', 0));
  res := teacherapp_private.restore_rows(rws, not p_apply);
  return jsonb_build_object('ok', true, 'applied', p_apply, 'created_at', created, 'n', jsonb_array_length(rws)) || res;
end $$;

create or replace function teacherapp.identity_status()
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare k text := teacherapp_private.identity_key(); total int; readable int := 0; orphans int; x record; lx text;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select count(*) into total from teacherapp_private.student_identity;
  for x in select id_enc from teacherapp_private.student_identity loop
    begin
      perform extensions.pgp_sym_decrypt(x.id_enc, k);
      readable := readable + 1;
    exception when others then null;
    end;
  end loop;
  select count(*) into orphans from teacherapp_private.student_identity i where not exists (select 1 from students s where s.id = i.student_id);
  select value into lx from teacherapp_private.identity_meta where key = 'last_export_at';
  return jsonb_build_object('total', total, 'readable', readable, 'orphans', orphans,
    'backups', (select count(*) from teacherapp_private.identity_backups), 'last_export_at', lx);
end $$;

-- ───────────── מחיקה לצמיתות של קבוצה ─────────────
-- ארכוב וגריעה מקבוצה הם פעולות הניתנות לביטול ואינן נוגעות בזהות. מחיקה לצמיתות היא פעולה נפרדת:
-- הזהות של תלמיד שנמחק נמחקת מיד מהטבלה ומכל הגיבויים הפנימיים (ללא גיבוי זהויות לפני המחיקה).
-- גיבוי הנתונים הרגיל (create_data_backup) אינו מכיל ת"ז, ונשמר כמו קודם.
create or replace function teacherapp.delete_study_group(p_group uuid)
returns jsonb language plpgsql security definer set search_path = 'teacherapp', 'pg_temp' as $$
declare g study_groups; ev jsonb; backup_id uuid; n_stud int; n_grades int; sids uuid[]; n_ident int;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select * into g from study_groups where id = p_group for update;
  if not found then raise exception 'הקבוצה לא נמצאה'; end if;
  if g.archived_at is null then raise exception 'אפשר למחוק לצמיתות רק קבוצה שהועברה לארכיון'; end if;
  backup_id := create_data_backup('manual', 'לפני מחיקת הקבוצה: ' || g.name);

  select coalesce(array_agg(distinct student_id), '{}') into sids from enrollments where group_id = p_group;
  ev := _drop_group_events(p_group);
  with d as (delete from grades where event_id in (select id from assessment_events where group_id = p_group) returning 1) select count(*) into n_grades from d;
  delete from grade_policy_overrides where event_id in (select id from assessment_events where group_id = p_group);
  delete from final_grades where group_id = p_group;
  delete from assessment_events where group_id = p_group;
  delete from grade_categories where group_id = p_group;
  delete from enrollments where group_id = p_group;
  delete from study_groups where id = p_group;
  with d as (
    delete from students s where s.id = any(sids)
      and not exists (select 1 from enrollments e where e.student_id = s.id)
      and not exists (select 1 from grades x where x.student_id = s.id)
      and not exists (select 1 from final_grades f where f.student_id = s.id)
      and not exists (select 1 from grade_policy_overrides o where o.student_id = s.id)
    returning s.id) select count(*) into n_stud from d;
  n_ident := teacherapp_private.purge(coalesce((select array_agg(x) from unnest(sids) x where not exists (select 1 from students s where s.id = x)), '{}'), true);
  return jsonb_build_object('events', ev, 'grades', n_grades, 'students_deleted', n_stud, 'identities_deleted', n_ident, 'backup_id', backup_id);
end $$;

-- הרשאות: משתמש מחובר בלבד; הפונקציות עצמן בודקות is_owner()
revoke all on function teacherapp.import_students_with_ids(uuid, jsonb), teacherapp.set_student_identity(uuid, text), teacherapp.set_student_identities(jsonb),
  teacherapp.students_with_id(), teacherapp.identity_backup_create(text), teacherapp.identity_backup_restore(uuid),
  teacherapp.erase_student_identity(uuid), teacherapp.identity_export(), teacherapp.identity_import(jsonb, boolean),
  teacherapp.identity_status() from public, anon;
grant execute on function teacherapp.import_students_with_ids(uuid, jsonb), teacherapp.set_student_identity(uuid, text), teacherapp.set_student_identities(jsonb),
  teacherapp.students_with_id(), teacherapp.identity_backup_create(text), teacherapp.identity_backup_restore(uuid),
  teacherapp.erase_student_identity(uuid), teacherapp.identity_export(), teacherapp.identity_import(jsonb, boolean),
  teacherapp.identity_status() to authenticated;
