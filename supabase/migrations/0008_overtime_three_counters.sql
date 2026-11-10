-- 0008_overtime_three_counters.sql — שלושה מונים נפרדים לשעות נוספות (בלי סכום).
-- פרונטליות = frontal_hours, פרטני = individual_hours (חדש), שהייה = pedagogical_hours (השם הישן של העמודה).
-- individual_hours ריק (null) מסמן שורה מהמודלים הקודמים (מונה יחיד / שני מונים): היא לא נמחקת ולא משתנה,
-- והאפליקציה מציגה אותה כחודש חדש (0, 0, שהייה 6) עם הערה על הסכום הישן. שמירה מחדש של החודש כותבת את שלוש העמודות.
-- בטוח להרצה פעם אחת ב-SQL Editor. גיבוי ישן שחסרה בו העמודה ישוחזר עם null, כלומר כשורה ישנה.
alter table overtime_hours add column individual_hours integer check (individual_hours is null or individual_hours >= 0);
