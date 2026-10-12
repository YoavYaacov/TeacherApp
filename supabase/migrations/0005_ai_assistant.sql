-- 0005: העוזר האישי (AI). טבלאות שיחות, הודעות, טיוטות, הערכות תעודה ומונה שימוש.
-- הכתיבה בפועל לנתוני המערכת (תיעוד שיעור, הערכה) נעשית רק דרך ai_apply_draft אחרי אישור המשתמש.

-- מגדר (אופציונלי): נדרש לניסוח עברי תקין בהערכות אישיות. נמסר למודל כ-m/f בלבד, ללא שם.
alter table students add column if not exists gender text check (gender in ('m','f'));

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'שיחה חדשה',
  context jsonb not null default '{"kind":"system"}'::jsonb,   -- {kind: system|group|student|lesson, group_id?, student_id?, event_id?}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  blocks jsonb not null default '[]'::jsonb,       -- כרטיסים/טבלאות/טיוטות שנוצרו בקוד
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index on ai_messages (conversation_id, created_at);

create table ai_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references ai_conversations(id) on delete set null,
  kind text not null check (kind in ('lesson_log','evaluation')),
  target jsonb not null,           -- lesson_log: {calendar_event_id}; evaluation: {group_id, student_id, period}
  payload jsonb not null,          -- התוכן שיישמר (כפי שנערך על ידי המשתמש)
  status text not null default 'pending' check (status in ('pending','applied','cancelled')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index on ai_drafts (status, created_at desc);

create table ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references study_groups(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  period text not null check (period in ('h1','h2','annual')),
  text text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, student_id, period)
);

-- מונה שימוש יומי וחסימת מכסה. נכתב רק על ידי הפונקציה (service role).
create table ai_usage (
  day date primary key,
  requests int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  blocked_until timestamptz,
  last_error text
);
create table ai_requests (          -- מניעת בקשות כפולות
  request_id uuid primary key,
  created_at timestamptz not null default now()
);

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_drafts enable row level security;
alter table ai_evaluations enable row level security;
alter table ai_usage enable row level security;
alter table ai_requests enable row level security;
create policy owner_all on ai_conversations for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on ai_messages for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on ai_drafts for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_all on ai_evaluations for all to authenticated using (is_owner()) with check (is_owner());
create policy owner_read on ai_usage for select to authenticated using (is_owner());
revoke all on ai_usage, ai_requests from anon;
revoke insert, update, delete on ai_usage from authenticated;
revoke all on ai_requests from authenticated;
revoke all on ai_conversations, ai_messages, ai_drafts, ai_evaluations from anon;

-- ───────────── גיבוי: הטבלאות החדשות נכנסות (לא כולל מונים) ─────────────
create or replace function backup_tables() returns text[] language sql immutable as $$
  select array['academic_years','study_groups','students','enrollments','grade_categories',
               'assessment_events','grades','grade_policy_overrides','final_grades',
               'calendar_events','lesson_logs','user_settings',
               'ai_conversations','ai_messages','ai_drafts','ai_evaluations']
$$;

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
    elsif p_mode = 'replace' and t like 'ai\_%' then
      p_data := p_data || jsonb_build_object(t, '[]'::jsonb);   -- גיבוי ישן שנוצר לפני העוזר האישי: טבלאות ה-AI ריקות
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

-- ───────────── ביצוע טיוטה שאושרה: הנתיב היחיד שבו ה-AI כותב נתוני מערכת ─────────────
-- p_mode (לתיעוד שיעור): 'fill' ממלא רק שדות ריקים, 'append' מוסיף לטקסט קיים, 'replace' מחליף (דורש בחירה מפורשת).
create or replace function ai_apply_draft(p_draft uuid, p_payload jsonb default null, p_mode text default 'fill')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d ai_drafts; pl jsonb; ev calendar_events; cur lesson_logs; gid uuid; sid uuid; per text; txt text;
  f text; v text; old_v text; merged jsonb := '{}'::jsonb;
begin
  if not is_owner() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select * into d from ai_drafts where id = p_draft for update;
  if not found then raise exception 'הטיוטה לא נמצאה'; end if;
  if d.status <> 'pending' then raise exception 'הטיוטה כבר טופלה'; end if;
  if p_mode not in ('fill','append','replace') then raise exception 'מצב שמירה לא חוקי'; end if;
  pl := coalesce(p_payload, d.payload);
  if jsonb_typeof(pl) <> 'object' then raise exception 'תוכן הטיוטה לא תקין'; end if;

  if d.kind = 'lesson_log' then
    select * into ev from calendar_events where id = (d.target ->> 'calendar_event_id')::uuid;
    if not found then raise exception 'השיעור לא נמצא'; end if;
    if ev.group_id is null then raise exception 'השיעור אינו משויך לקבוצה'; end if;
    select * into cur from lesson_logs where calendar_event_id = ev.id;
    foreach f in array array['topic','learned','homework'] loop
      v := nullif(btrim(coalesce(pl ->> f, '')), '');
      if v is not null and length(v) > 6000 then raise exception 'השדה % ארוך מדי', f; end if;
      old_v := case f when 'topic' then cur.topic when 'learned' then cur.learned else cur.homework end;
      old_v := nullif(btrim(coalesce(old_v, '')), '');
      merged := merged || jsonb_build_object(f, case
        when v is null then old_v
        when old_v is null then v
        when p_mode = 'replace' then v
        when p_mode = 'append' then old_v || E'\n\n' || v
        else old_v end);                       -- fill: שדה קיים לא נדרס
    end loop;
    insert into lesson_logs(calendar_event_id, topic, learned, homework, completion, updated_at)
      values (ev.id, merged ->> 'topic', merged ->> 'learned', merged ->> 'homework',
              case when (pl ->> 'mark_done') = 'true' then 'done'::doc_completion else coalesce(cur.completion, 'pending') end, now())
      on conflict (calendar_event_id) do update set topic = excluded.topic, learned = excluded.learned,
        homework = excluded.homework, completion = excluded.completion, updated_at = now();
  elsif d.kind = 'evaluation' then
    gid := (d.target ->> 'group_id')::uuid; sid := (d.target ->> 'student_id')::uuid; per := d.target ->> 'period';
    txt := btrim(coalesce(pl ->> 'text', ''));
    if txt = '' then raise exception 'ההערכה ריקה'; end if;
    if length(txt) > 4000 then raise exception 'ההערכה ארוכה מדי'; end if;
    if not exists (select 1 from enrollments where group_id = gid and student_id = sid) then raise exception 'התלמיד אינו רשום בקבוצה'; end if;
    insert into ai_evaluations(group_id, student_id, period, text, params)
      values (gid, sid, per, txt, coalesce(pl -> 'params', '{}'::jsonb))
      on conflict (group_id, student_id, period) do update set text = excluded.text, params = excluded.params, updated_at = now();
  end if;
  update ai_drafts set status = 'applied', applied_at = now(), payload = pl where id = d.id;
  return jsonb_build_object('ok', true, 'kind', d.kind);
end $$;

revoke all on function ai_apply_draft(uuid, jsonb, text) from public, anon;
grant execute on function ai_apply_draft(uuid, jsonb, text) to authenticated;
