import type { AiPrefs } from './prefs';
import type { AiContext, DB } from '../data/types';
import type { AliasMap } from './pseudo';

export function contextLine(db: DB, ctx: AiContext, alias: AliasMap): string {
  if (ctx.kind === 'system') return 'הקשר השיחה: כל המערכת.';
  const g = db.study_groups.find((x) => x.id === ctx.group_id)?.name ?? '';
  if (ctx.kind === 'group') return `הקשר השיחה: הקבוצה "${g}".`;
  if (ctx.kind === 'student') return `הקשר השיחה: התלמיד ${alias.alias(ctx.student_id)} בקבוצה "${g}".`;
  const ev = db.calendar_events.find((e) => e.id === ctx.event_id);
  return `הקשר השיחה: שיעור של הקבוצה "${g}"${ev ? ` בתאריך ${new Date(ev.start_at).toLocaleDateString('he-IL')}` : ''}.`;
}
export const MATH_RULES = 'מתמטיקה: כתוב ביטויים בתחביר LaTeX בתוך $...$ (בשורה) או $$...$$ (בשורה נפרדת). לדוגמה $\\frac{x+1}{2}$, $x^{2}$, $\\sqrt{3}$, $2x+3=7$. אל תכתוב ביטויים מתמטיים כטקסט רגיל. אל תטען שפתרון "נבדק" אלא אם הוא נבדק בפועל בכלי.';

export function systemPrompt(db: DB, ctx: AiContext, alias: AliasMap, prefs: AiPrefs, now: Date): string {
  const len = prefs.answerLength === 'short' ? 'תשובות קצרות וממוקדות.' : prefs.answerLength === 'detailed' ? 'תשובות מפורטות.' : 'תשובות בהיקף בינוני.';
  return [
    'אתה "העוזר האישי": עוזר למורה למתמטיקה בבית ספר בישראל, בתוך מערכת ניהול ההוראה שלו. ענה תמיד בעברית ברורה ומקצועית. ' + len,
    `התאריך היום: ${now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
    contextLine(db, ctx, alias),
    'כללים מחייבים:',
    '1. כל עובדה על נתוני המערכת (ציונים, שיעורים, תיעוד, תלמידים) חייבת להגיע מהכלים שברשותך. אם אין כלי מתאים או שהכלי מחזיר שגיאה או חוסר נתונים, אמור זאת במפורש. לעולם אל תמציא נתונים, ציונים, התנהגויות, מאמץ או יכולות.',
    '2. תלמידים מופיעים כקודים כמו ST-17. השתמש בקוד בדיוק כפי שהוא. אל תנסה לנחש שמות. אל תתן אבחנות פסיכולוגיות או תוויות.',
    '3. בניתוח, הבחן במפורש בין עובדה (נתון), פרשנות והמלצה. ציין את מקור המסקנות המשמעותיות (איזה ציון/הערכה/תיעוד).',
    '4. אין בציונים נתוני נושאים. אל תסיק קושי בנושא מציון כללי. ניתן להציע שיעור חיזוק רק על נושא שהמורה ציין או שמופיע בתיעוד השיעורים.',
    '5. אתה מכין טיוטות והצעות בלבד. שום שמירה או שינוי במערכת לא נעשים על ידך; המורה מאשר ושומר בעצמו.',
    '6. עיצוב: כותרות קצרות עם ##, רשימות עם -, וטבלאות markdown כשיש השוואה. בלי הקדמות מיותרות.',
    MATH_RULES,
    prefs.notes.trim() ? `העדפות המורה: ${prefs.notes.trim().slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');
}
