-- 0007_overtime_single_counter.sql — מונה שעות נוספות יחיד.
-- מוסיף עמודה hours וממלא אותה בסכום שתי הכמויות הישנות לכל חודש. העמודות הישנות נשארות (לא נמחקות) ופשוט אינן בשימוש.
-- בטוח להרצה פעם אחת ב-SQL Editor, אחרי 0006. לא מוחק נתונים.

alter table overtime_hours add column hours integer not null default 0 check (hours >= 0);
update overtime_hours set hours = frontal_hours + pedagogical_hours;

-- תאימות לאחור: שחזור מגיבוי ישן (לפני המיגרציה) מכניס שורות בלי hours. הטריגר ממלא אותן מסכום הכמויות הישנות.
create or replace function overtime_hours_compat() returns trigger language plpgsql as $$
begin
  if new.hours = 0 and (new.frontal_hours + new.pedagogical_hours) > 0 then
    new.hours := new.frontal_hours + new.pedagogical_hours;
  end if;
  return new;
end $$;
create trigger trg_overtime_hours_compat before insert on overtime_hours for each row execute function overtime_hours_compat();
