// שאלות עובדתיות שנענות בקוד בלבד, בלי לפנות ל-AI (חוסך מכסה, ומונע המצאות).
import type { DB } from '../data/types';
import { resolveGroup } from './tools';
import { iso } from '../lib/util';

export interface Intent { tool: string; args: Record<string, unknown> }
const norm = (s: string) => s.replace(/[׳'"״`]/g, '').replace(/\s+/g, ' ').trim();

export function groupInText(db: DB, text: string): string | undefined {
  const t = norm(text);
  return db.study_groups.filter((g) => !g.archived_at).sort((a, b) => b.name.length - a.name.length).find((g) => t.includes(norm(g.name)))?.name;
}
export function matchIntent(db: DB, text: string, now = new Date()): Intent | null {
  const t = text.trim();
  if (t.length > 140) return null;
  const group = groupInText(db, t);
  const g = group ? { group } : {};
  if (/(לא|עדיין לא) תועד|ממתינ\S* לתיעוד|חסר\S* תיעוד|תיעוד\S* (ממתינ|חסר|פתוח)|שיעורים.*(בלי|ללא) תיעוד/.test(t)) return { tool: 'undocumented_lessons', args: g };
  if (/כמה שיעורים/.test(t)) {
    const d = new Date(now); if (/שעבר|קודם/.test(t)) d.setMonth(d.getMonth() - 1);
    return { tool: 'lesson_count', args: { ...g, month: iso(d).slice(0, 7) } };
  }
  if (/מה (לימדתי|לימדנו|נלמד|עשינו)|מה למדנו/.test(t)) {
    if (/שבוע שעבר|שבוע האחרון/.test(t)) {
      const end = new Date(now); end.setDate(end.getDate() - end.getDay() - 1); const start = new Date(end); start.setDate(start.getDate() - 6);
      return { tool: 'lessons_taught', args: { ...g, from: iso(start), to: iso(end) } };
    }
    return { tool: 'lessons_taught', args: g };
  }
  if (/(אין|חסר\S*|בלי|ללא)( לו| להם| לה| להן)? ציון|לא קיבל\S* ציון|מי לא נבחן|ציונים חסרים/.test(t)) return { tool: 'missing_grades', args: g };
  if (/מי (השתפר|עלה|התקדם)|הכי השתפר|שיפור הכי/.test(t)) return { tool: 'top_movers', args: { ...g, direction: 'up' } };
  if (/מי (ירד|התדרדר)|הכי ירד|ירידה הכי/.test(t)) return { tool: 'top_movers', args: { ...g, direction: 'down' } };
  if (/ממוצע|התפלגות|סטטיסטיק|מצב ההישגים|הישגי הכיתה|הישגי הקבוצה/.test(t)) return { tool: 'class_stats', args: { ...g, ...(/מחצית ב/.test(t) ? { term: 2 } : /מחצית א/.test(t) ? { term: 1 } : {}) } };
  if (/(מה|איך) (להכין|אני מכין)|לקראת השיעור הבא|שיעור הבא/.test(t)) return { tool: 'next_lesson_prep', args: g };
  if (/שיעורים קרובים|מה יש לי (השבוע|מחר|היום)|לוח השיעורים/.test(t)) return { tool: 'upcoming_lessons', args: { days: /מחר|היום/.test(t) ? 2 : 7 } };
  if (/אילו קבוצות|רשימת הקבוצות|כמה קבוצות/.test(t)) return { tool: 'list_groups', args: {} };
  return null;
}
export const groupFor = (db: DB, name?: unknown, fallback?: string | null) => resolveGroup(db, name, fallback);
