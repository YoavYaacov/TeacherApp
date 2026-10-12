-- 0002_backup_restore.sql — גיבוי ושחזור נתונים בתוך Supabase.
-- אין שינוי בטבלאות או בהרשאות קיימות. נוספים: טבלה app_backups ושלוש פונקציות לבעלים בלבד.
-- בטוח להרצה פעם אחת ב-SQL Editor. אינו נוגע בנתונים קיימים.

-- ───────────── טבלת גיבויים (תוכן הנתונים בלבד; ללא טוקנים והתחברות) ─────────────
create table app_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('auto', 'manual', 'pre_restore')),
  note text,
  counts jsonb not null,
  data_hash text not null,
  bytes integer not null,
  payload jsonb not null
);
create index on app_backups (kind, created_at desc);

alter table app_backups enable row level security;
-- כתיבה רק דרך הפונקציות למטה; ללא policy ל-insert/update. הבעלים יכול לקרוא ולמחוק.
create policy owner_read   on app_backups for select to authenticated using (is_owner());
create policy owner_delete on app_backups for delete to authenticated using (is_owner());
revoke all on app_backups from anon;
revoke insert, update on app_backups from authenticated;

-- ───────────── פנימי: רשימת הטבלאות בסדר הכנסה בטוח (הורים לפני ילדים) ─────────────
create or replace function backup_tables() returns text[] language sql immutable as $$
  select array['academic_years','study_groups','students','enrollments','grade_categories',
               'assessment_events','grades','grade_policy_overrides','final_grades',
               'calendar_events','lesson_logs','user_settings']
$$;

-- תמונת מצב עקבית: שאילתה אחת => snapshot אחד לכל הטבלאות
create or replace function _snapshot() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q text; res jsonb;
begin
  select 'select jsonb_build_object(' || string_agg(
           format('%L, (select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)), ''[]''::jsonb) from public.%I x)', t, t), ', ')
         || ')'
    into q from unnest(backup_tables()) t;
  execute q into res;
  return res;
end $$;

create or replace function _counts(p jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_array_length(p -> k)), '{}'::jsonb)
  from unnest(backup_tables()) k where p ? k
$$;

-- ליבת השחזור (טרנזקציה אחת של הפונקציה הקוראת: הכול או כלום)
create or replace function _restore_core(p_data jsonb, p_mode text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tabs text[] := backup_tables();
  t text; n int; i int; len int; sel text; cols text;
  ins jsonb := '{}'; skipped jsonb := '{}'; del jsonb := '{}';
begin
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'קובץ גיבוי לא תקין'; end if;
  foreach t in array tabs loop
    if p_data ? t then
      if jsonb_typeof(p_data -> t) <> 'array' then raise exception 'טבלה % בגיבוי אינה תקינה', t; end if;
    elsif p_mode = 'replace' then
      raise exception 'בגיבוי חסרה הטבלה %', t;
    end if;
  end loop;

  if p_mode = 'replace' then
    delete from push_sent where true;
    for i in reverse array_length(tabs, 1) .. 1 loop
      execute format('delete from public.%I where true', tabs[i]);
      get diagnostics n = row_count;
      del := del || jsonb_build_object(tabs[i], n);
    end loop;
  end if;

  foreach t in array tabs loop
    continue when not (p_data ? t);
    -- עמודות חובה עם ברירת מחדל (id, created_at, ...) שחסרות בקובץ מקבלות את ברירת המחדל
    select string_agg(case when a.atthasdef and a.attnotnull
                           then format('coalesce(r.%I, %s)', a.attname, pg_get_expr(d.adbin, d.adrelid))
                           else format('r.%I', a.attname) end, ', ' order by a.attnum),
           string_agg(format('%I', a.attname), ', ' order by a.attnum)
      into sel, cols
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) r on conflict do nothing',
                   t, cols, sel, t) using p_data -> t;
    get diagnostics n = row_count;
    len := jsonb_array_length(p_data -> t);
    if p_mode = 'replace' and n <> len then
      raise exception 'בטבלה % יש רשומות כפולות או סותרות בגיבוי (%/%)', t, n, len;
    end if;
    ins := ins || jsonb_build_object(t, n);
    skipped := skipped || jsonb_build_object(t, len - n);
  end loop;

  return jsonb_build_object('mode', p_mode, 'inserted', ins, 'already_present', skipped, 'deleted', del);
end $$;

-- ───────────── API לבעלים ─────────────

-- ייצוא נתונים טריים מהשרת (לקובץ גיבוי)
create or replace function export_backup() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare snap jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  snap := _snapshot();
  return jsonb_build_object('data', snap, 'counts', _counts(snap));
end $$;

-- יצירת גיבוי בתוך המסד. auto: לכל היותר אחד ליום ורק אם יש שינוי; שומר 30 אחרונים בלבד.
-- manual: תמיד נוצר ואינו נמחק אוטומטית.
create or replace function create_data_backup(p_kind text default 'manual', p_note text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare snap jsonb; h text; cnt jsonb; total bigint; last_auto timestamptz; last_hash text; new_id uuid;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if p_kind not in ('auto', 'manual') then raise exception 'סוג גיבוי לא חוקי'; end if;
  snap := _snapshot(); cnt := _counts(snap); h := md5(snap::text);
  if p_kind = 'auto' then
    select coalesce(sum(value::bigint), 0) into total from jsonb_each_text(cnt);
    if total = 0 then return null; end if;                               -- אין מה לגבות
    select max(created_at) into last_auto from app_backups where kind = 'auto';
    if last_auto is not null and last_auto > now() - interval '20 hours' then return null; end if;
    select data_hash into last_hash from app_backups order by created_at desc limit 1;
    if last_hash = h then return null; end if;                           -- לא השתנה מאז הגיבוי האחרון
  end if;
  insert into app_backups (kind, note, counts, data_hash, bytes, payload)
    values (p_kind, p_note, cnt, h, octet_length(snap::text), snap) returning id into new_id;
  if p_kind = 'auto' then
    delete from app_backups where kind = 'auto'
      and id not in (select id from app_backups where kind = 'auto' order by created_at desc limit 30);
  end if;
  return new_id;
end $$;

-- שחזור מקובץ (p_data) או מגיבוי שמור (p_backup_id).
-- p_dry = true: הרצת ניסיון מלאה שמתבטלת (rollback) ומחזירה מה היה קורה, או את השגיאה.
-- p_mode = 'merge'  : מוסיף רק רשומות חסרות; לא משנה ולא מוחק דבר קיים.
-- p_mode = 'replace': מחליף הכול; דורש p_confirm = 'REPLACE', ויוצר קודם גיבוי pre_restore.
create or replace function restore_backup(
  p_backup_id uuid default null, p_data jsonb default null,
  p_mode text default 'merge', p_dry boolean default true, p_confirm text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare data jsonb; cur jsonb; res jsonb; pre_id uuid; hh text;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if p_mode not in ('merge', 'replace') then raise exception 'מצב שחזור לא חוקי'; end if;
  if (p_backup_id is null) = (p_data is null) then raise exception 'יש לציין מקור שחזור אחד'; end if;
  if p_backup_id is not null then
    select payload into data from app_backups where id = p_backup_id;
    if data is null then raise exception 'הגיבוי לא נמצא'; end if;
  else
    data := p_data;
  end if;
  cur := _snapshot();

  if p_dry then
    begin
      res := _restore_core(data, p_mode);
      raise exception '__dryrun__';
    exception when others then
      if sqlerrm <> '__dryrun__' then
        return jsonb_build_object('ok', false, 'error', sqlerrm);
      end if;
    end;
    return res || jsonb_build_object('ok', true, 'dry', true, 'backup_counts', _counts(data), 'current_counts', _counts(cur));
  end if;

  if p_mode = 'replace' then
    if p_confirm is distinct from 'REPLACE' then raise exception 'נדרש אישור מפורש להחלפת כל הנתונים'; end if;
    hh := md5(cur::text);
    insert into app_backups (kind, note, counts, data_hash, bytes, payload)
      values ('pre_restore', 'אוטומטי: לפני שחזור מלא', _counts(cur), hh, octet_length(cur::text), cur)
      returning id into pre_id;
  end if;
  res := _restore_core(data, p_mode);
  return res || jsonb_build_object('ok', true, 'dry', false, 'pre_backup_id', pre_id);
end $$;

-- הרשאות: הפונקציות הפנימיות לא נגישות ל-API כלל; ה-API לבעלים מאומת בלבד (וגם נבדק is_owner() בגוף הפונקציה)
revoke all on function backup_tables(), _snapshot(), _counts(jsonb), _restore_core(jsonb, text) from public, anon, authenticated;
revoke all on function export_backup(), create_data_backup(text, text), restore_backup(uuid, jsonb, text, boolean, text) from public, anon;
grant execute on function export_backup(), create_data_backup(text, text), restore_backup(uuid, jsonb, text, boolean, text) to authenticated;
