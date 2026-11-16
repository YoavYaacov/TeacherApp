// שומר מבני: TeacherApp חולקת פרויקט Supabase עם "הבנתי", ולכן כל לקוח Supabase (דפדפן ושתי פונקציות) חייב לפנות לסכמה teacherapp בלבד,
// ואסור שתישאר הפניה לסודות בלי הקידומת TA_ או הרשמת משתמשים מהכניסה.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const clientCalls = (src: string) => src.split('\n').filter((l) => /createClient(<[^>]*>)?\(/.test(l) && !/^import /.test(l.trim()));

describe('סכמת teacherapp', () => {
  it('לקוח הדפדפן מוגדר לסכמה teacherapp', () => {
    const s = read('src/lib/supabase.ts');
    expect(s).toContain("TA_SCHEMA = 'teacherapp'");
    const calls = clientCalls(s);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('db: { schema: TA_SCHEMA }');
  });
  for (const fn of ['google-calendar', 'ai-assistant']) {
    it(`כל לקוחות Supabase ב-${fn} פונים ל-teacherapp`, () => {
      const calls = clientCalls(read(`supabase/functions/${fn}/index.ts`));
      expect(calls.length).toBe(2);
      for (const c of calls) expect(c).toContain("db: { schema: 'teacherapp' }");
    });
    it(`הסודות ב-${fn} בקידומת TA_`, () => {
      const s = read(`supabase/functions/${fn}/index.ts`);
      const names = [...s.matchAll(/env\('([A-Z_]+)'\)/g)].map((m) => m[1]).filter((n) => !n.startsWith('SUPABASE_') && n !== 'AI_TEST');
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(n.startsWith('TA_')).toBe(true);
    });
  }
  it('הכניסה לא יוצרת משתמשים ואין התחברות Google', () => {
    const s = read('src/ui/Root.tsx');
    expect(s).not.toMatch(/signInWithOAuth|provider:\s*'google'/);
    expect(s).not.toMatch(/signUp\(/);
    expect(s).toContain('shouldCreateUser: false');
  });
  it('אין הפניה קשיחה ל-public או ל-Accept-Profile בקוד', () => {
    for (const p of ['src/lib/supabase.ts', 'src/data/supabaseRepo.ts', 'src/ui/Root.tsx', 'supabase/functions/google-calendar/index.ts', 'supabase/functions/ai-assistant/index.ts']) {
      expect(read(p)).not.toMatch(/['"`]public['"`]|public\./);
    }
  });
});
