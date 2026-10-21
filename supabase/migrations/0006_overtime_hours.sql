-- 0006_overtime_hours.sql — מעקב שעות נוספות חודשי.
-- מוסיף טבלה אחת (overtime_hours): רשומה אחת לכל חודש לועזי, עם שתי כמויות שעות.
-- אינו משנה טבלאות או נתונים קיימים. בטוח להרצה פעם אחת ב-SQL Editor.
-- הטבלה נכנסת לגיבוי ולשחזור (backup_tables). גיבוי ישן שאינו כולל אותה ישוחזר כשהיא ריקה.

create table overtime_hours (
  year  integer not null check (year between 2000 and 2200),
  month integer not null check (month between 1 and 12),
  frontal_hours     integer not null default 0 check (frontal_hours >= 0),
  pedagogical_hours integer not null default 0 check (pedagogical_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (year, month)
);
create trigger trg_overtime_hours_updated before update on overtime_hours for each row execute function set_updated_at();

alter table overtime_hours enable row level security;
create policy owner_all on overtime_hours for all to authenticated using (is_owner()) with check (is_owner());
revoke all on overtime_hours from anon;

-- ───────────── גיבוי: הטבלה החדשה נכנסת ─────────────
create or replace function backup_tables() returns text[] language sql immutable as $$
  select array['academic_years','study_groups','students','enrollments','grade_categories',
               'assessment_events','grades','grade_policy_overrides','final_grades',
               'calendar_events','lesson_logs','user_settings',
               'ai_conversations','ai_messages','ai_drafts','ai_evaluations',
               'overtime_hours']
$$;

-- שחזור: זהה ל-0005, ובנוסף גיבוי ישן ללא overtime_hours נחשב כטבלה ריקה (במצב "החלף הכול")
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
    elsif p_mode = 'replace' and (t like 'ai\_%' or t = 'overtime_hours') then
      p_data := p_data || jsonb_build_object(t, '[]'::jsonb);   -- גיבוי ישן שנוצר לפני העוזר האישי / השעות הנוספות: הטבלאות האלה ריקות
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
