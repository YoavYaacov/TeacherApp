-- 0003_google_calendar.sql — תשתית חיבור ל-Google Calendar (שלב 3א: ייבוא).
-- תוספות בלבד: אין שינוי/מחיקה של נתונים או הרשאות קיימים.

-- טוקן הרענון של Google. נגיש רק ל-Edge Function (service role). אין policies והרשאות נשללות מ-anon ומ-authenticated.
create table google_credentials (
  id boolean primary key default true check (id),
  refresh_token text not null,
  scope text,
  connected_at timestamptz not null default now()
);
-- state חד-פעמי לאימות החזרה מ-Google (OAuth). פג תוקף אחרי 10 דקות.
create table oauth_states (
  state text primary key,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table google_credentials enable row level security;
alter table oauth_states enable row level security;
revoke all on google_credentials, oauth_states from anon, authenticated;

-- מצב סנכרון: היומן שנבחר (שורה אחת), שם, אזור זמן ומועד סנכרון מלא אחרון
alter table calendar_sync_state add column if not exists calendar_name text;
alter table calendar_sync_state add column if not exists time_zone text;
alter table calendar_sync_state add column if not exists full_synced_at timestamptz;
alter table calendar_sync_state add column if not exists last_counts jsonb;

-- אירוע של יום שלם
alter table calendar_events add column if not exists all_day boolean not null default false;
