-- 0001_init.sql — סכמה ראשונית. משתמש מורשה יחיד, RLS על כל הטבלאות.
-- לפני הרצה: החלף את כתובת המייל ב-owner_config (שלב 1 ב-docs/SETUP.md).
-- אין להזין נתוני אמת לפני אישור מדיניות בית הספר (ראה PLAN.md §8).


-- ───────────── בעלים יחיד ─────────────
create table owner_config (
  id boolean primary key default true check (id),       -- singleton
  email text not null
);
alter table owner_config enable row level security;
-- אין policy => אף אחד לא קורא/כותב דרך ה-API. הגישה רק דרך is_owner() (security definer).

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public, auth as $$
  -- בעלים = המשתמש המחובר, שהמייל שלו מאומת ב-auth.users ותואם ל-owner_config
  select exists (
    select 1 from auth.users u join owner_config o on lower(o.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function is_owner() from public, anon;
grant execute on function is_owner() to authenticated;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── enums ─────────────
create type makeup_policy as enum ('best', 'latest', 'average');
create type grade_status  as enum ('score', 'exempt', 'absent');   -- "ריק" = אין שורה
create type final_period  as enum ('h1', 'h2', 'annual');
create type final_source  as enum ('approved', 'override');
create type doc_completion as enum ('pending', 'done', 'not_needed');

-- ───────────── שנות לימוד וקבוצות ─────────────
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  term1_start date not null, term1_end date not null,
  term2_start date not null, term2_end date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date < end_date),
  check (term1_start <= term1_end and term1_end < term2_start and term2_start <= term2_end),
  check (term1_start >= start_date and term2_end <= end_date)
);

create table study_groups (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id),
  name text not null,
  subject text not null default 'מתמטיקה',
  grade_level text,
  annual_weight_h1 numeric(5,2) not null default 50,
  annual_weight_h2 numeric(5,2) not null default 50,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (annual_weight_h1 >= 0 and annual_weight_h2 >= 0 and annual_weight_h1 + annual_weight_h2 = 100)
);
create index on study_groups (academic_year_id) where archived_at is null;

-- ───────────── תלמידים ושיוכים ─────────────
create table students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  home_class text,                       -- כיתת אם (מנורמלת באפליקציה)
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on students (last_name, first_name);
create index on students (home_class);

-- גריעה = סגירת שיוך (left_at), לא מחיקה.
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  group_id uuid not null references study_groups(id),
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now(),
  check (left_at is null or left_at >= joined_at)
);
create unique index enrollments_one_active on enrollments (student_id, group_id) where left_at is null;
create index on enrollments (group_id) where left_at is null;

-- ───────────── הערכה וציונים ─────────────
create table grade_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups(id),
  term smallint not null check (term in (1, 2)),
  name text not null,
  weight numeric(5,2) not null check (weight >= 0 and weight <= 100),
  event_weight_mode text not null default 'custom' check (event_weight_mode in ('equal', 'custom')),
  drop_lowest boolean not null default false,
  sort_order int not null default 0,
  unique (id, group_id, term)
);
create index on grade_categories (group_id, term);

create table assessment_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  term smallint not null,
  category_id uuid not null,
  title text not null,
  event_date date,
  weight numeric(5,2) check (weight is null or (weight >= 0 and weight <= 100)),
  makeup_policy makeup_policy not null default 'best',
  cancelled_at timestamptz,               -- נשמר בהיסטוריה, מוצא מהחישוב
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- מבטיח שקבוצה/מחצית של האירוע זהות לאלה של הקטגוריה
  foreign key (category_id, group_id, term) references grade_categories (id, group_id, term)
);
create index on assessment_events (group_id, term);

-- "ריק" = היעדר שורה. attempt 1 = מועד א', 2 = מועד ב'.
create table grades (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references assessment_events(id),
  student_id uuid not null references students(id),
  attempt smallint not null default 1 check (attempt in (1, 2)),
  status grade_status not null default 'score',
  score numeric(5,2),
  updated_at timestamptz not null default now(),
  unique (event_id, student_id, attempt),
  check ((status = 'score' and score is not null and score >= 0 and score <= 100)
      or (status <> 'score' and score is null))
);
create index on grades (student_id);

-- override של מדיניות מועד ב' ברמת תלמיד (נשמר גם כשמדיניות המבחן משתנה)
create table grade_policy_overrides (
  event_id uuid not null references assessment_events(id),
  student_id uuid not null references students(id),
  policy makeup_policy not null,
  primary key (event_id, student_id)
);

-- ציון סופי (מאושר או ידני) + snapshot של החישוב לצורך זיהוי התיישנות
create table final_grades (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups(id),
  student_id uuid not null references students(id),
  period final_period not null,
  value numeric(5,2) not null check (value >= 0 and value <= 100),
  source final_source not null,
  basis_calculated numeric(7,4),
  updated_at timestamptz not null default now(),
  unique (group_id, student_id, period)
);

-- ───────────── יומן ושיעורים ─────────────
create table calendar_sync_state (
  google_calendar_id text primary key,
  sync_token text,
  channel_id text, channel_resource_id text, channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'internal' check (source in ('internal','google')),
  google_calendar_id text,                           -- null בלוח פנימי
  google_event_id text,
  recurring_event_id text,
  group_id uuid references study_groups(id),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  etag text,
  local_dirty boolean not null default false,       -- שינוי מקומי שטרם נדחף
  updated_at timestamptz not null default now(),
  unique (google_calendar_id, google_event_id)
);
create index on calendar_events (start_at);
create index on calendar_events (group_id, start_at);

create table lesson_logs (
  calendar_event_id uuid primary key references calendar_events(id),
  topic text, learned text, homework text, private_note text,
  completion doc_completion not null default 'pending',
  updated_at timestamptz not null default now()
);

-- ───────────── הגדרות, push, גיבויים, audit ─────────────
create table user_settings (
  id boolean primary key default true check (id),
  theme text not null default 'sky-blue'
    check (theme in ('sky-blue','olive-paper','executive-navy','espresso','desert-sand','terracotta')),
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table push_subscriptions (
  endpoint text primary key,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create table push_sent (               -- push אחד בלבד לכל שיעור
  calendar_event_id uuid primary key references calendar_events(id),
  sent_at timestamptz not null default now()
);

create table backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('scheduled', 'manual')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  restore_verified_at timestamptz
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  table_name text not null,
  row_id text,
  action text not null,
  -- ללא תוכן שמות/ציונים מלא: רק מזהים ושדות שהשתנו
  changed_columns text[]
);

create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text; cols text[];
begin
  rid := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', '');
  if tg_op = 'UPDATE' then
    select array_agg(k) into cols from jsonb_object_keys(to_jsonb(new)) k
      where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k and k <> 'updated_at';
  end if;
  insert into audit_log(table_name, row_id, action, changed_columns) values (tg_table_name, rid, tg_op, cols);
  return coalesce(new, old);
end $$;

create trigger audit_final_grades after insert or update or delete on final_grades for each row execute function audit_row();
create trigger audit_enrollments  after insert or update or delete on enrollments  for each row execute function audit_row();
create trigger audit_students     after update or delete on students     for each row execute function audit_row();
create trigger audit_events       after update or delete on assessment_events for each row execute function audit_row();
create trigger audit_categories   after update or delete on grade_categories for each row execute function audit_row();

-- updated_at
do $$ declare t text; begin
  foreach t in array array['academic_years','study_groups','students','assessment_events','grades','final_grades','calendar_events','lesson_logs','user_settings']
  loop execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t); end loop;
end $$;

-- ───────────── RLS: הכל רק לבעלים ─────────────
do $$ declare t text; begin
  foreach t in array array[
    'academic_years','study_groups','students','enrollments','grade_categories','assessment_events','grades',
    'grade_policy_overrides','final_grades','calendar_sync_state','calendar_events','lesson_logs',
    'user_settings','push_subscriptions','push_sent','backups','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;
-- audit_log: קריאה בלבד לבעלים
drop policy owner_all on audit_log;
create policy owner_read on audit_log for select to authenticated using (is_owner());

-- בלי הרשאות ל-anon בכלל
revoke all on all tables in schema public from anon;
revoke all on owner_config from authenticated;
