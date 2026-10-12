-- 0004: מחיקת קבוצה לצמיתות (רק מקבוצה בארכיון), מחיקת/הסתרת שיעורי קבוצה, ושחזור אירועים מוסתרים.
-- לא משנה נתונים קיימים; מוסיף עמודה אחת עם ברירת מחדל.

alter table calendar_events add column if not exists hidden boolean not null default false;

-- מוחק/מסתיר את אירועי היומן של קבוצה. פנימי בלבד (לא נגיש ללקוח).
--   אירוע פנימי: נמחק (עם תיעוד השיעור שלו).
--   אירוע מ-Google: נשאר כשורה כדי שהייבוא לא יחזיר אותו, אך מוסתר ומנותק מהקבוצה. אין שום כתיבה ל-Google.
create or replace function _drop_group_events(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n_del int; n_hid int;
begin
  delete from lesson_logs where calendar_event_id in (select id from calendar_events where group_id = p_group);
  with d as (delete from calendar_events where group_id = p_group and source = 'internal' returning 1) select count(*) into n_del from d;
  with h as (update calendar_events set hidden = true, group_id = null, updated_at = now() where group_id = p_group returning 1) select count(*) into n_hid from h;
  return jsonb_build_object('deleted', n_del, 'hidden', n_hid);
end $$;

-- מחיקת שיעורי קבוצה בארכיון (הקבוצה, התלמידים והציונים נשארים)
create or replace function delete_group_lessons(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g study_groups; res jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select * into g from study_groups where id = p_group;
  if not found then raise exception 'הקבוצה לא נמצאה'; end if;
  if g.archived_at is null then raise exception 'אפשר למחוק שיעורים רק של קבוצה בארכיון'; end if;
  perform create_data_backup('manual', 'לפני מחיקת שיעורי הקבוצה: ' || g.name);
  res := _drop_group_events(p_group);
  return res;
end $$;

-- מחיקת קבוצה לצמיתות. רק מקבוצה בארכיון. אטומי: או שהכול נמחק או שדבר לא משתנה.
-- לפני המחיקה נוצר גיבוי ידני בתוך המסד (לא נמחק אוטומטית) שממנו אפשר לשחזר.
-- תלמידים שאינם רשומים באף קבוצה אחרת (גם לא בהיסטוריה) נמחקים; השאר נשארים.
create or replace function delete_study_group(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g study_groups; ev jsonb; backup_id uuid; n_stud int; n_grades int; sids uuid[];
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
    returning 1) select count(*) into n_stud from d;
  return jsonb_build_object('events', ev, 'grades', n_grades, 'students_deleted', n_stud, 'backup_id', backup_id);
end $$;

-- שחזור אירועים שהוסתרו (מגיעים חזרה ליומן כאירועים לא משויכים)
create or replace function restore_hidden_events() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  with u as (update calendar_events set hidden = false, updated_at = now() where hidden returning 1) select count(*) into n from u;
  return n;
end $$;

revoke all on function _drop_group_events(uuid) from public, anon, authenticated;
revoke all on function delete_group_lessons(uuid), delete_study_group(uuid), restore_hidden_events() from public, anon;
grant execute on function delete_group_lessons(uuid), delete_study_group(uuid), restore_hidden_events() to authenticated;
