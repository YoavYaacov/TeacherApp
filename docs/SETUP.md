# הקמה והפעלה

## א. שימוש מיידי (מצב מקומי, בלי הקמה)
1. פתח את הקובץ `index.html` (מתוך `dist/` או הקובץ הבודד ששלחתי) ב-Chrome/Edge בלחיצה כפולה.
2. כל הנתונים נשמרים בדפדפן **של המכשיר הזה** (localStorage). אין שרת ואין חשיפה למשתמשים אחרים, אבל גם אין סנכרון בין מכשירים.
3. **גבה שבועית:** הגדרות > גיבויים ונתונים > גיבוי מלא (JSON). מחיקת נתוני אתר בדפדפן מוחקת את הנתונים. שחזור מקובץ: אותו מסך.
4. חשוב: פתח תמיד את אותו קובץ באותה כתובת/דפדפן. קובץ במיקום אחר או דפדפן אחר = נתונים נפרדים.

## ב. מעבר לענן (התחברות Google, סנכרון בין מכשירים)
נדרש: חשבון Supabase עם מקום לפרויקט (מגבלת 2 פרויקטים חינמיים), וחשבון Google שלך.

### 1. פרויקט Supabase
1. supabase.com > New project (אזור Frankfurt). שמור את סיסמת ה-DB.
2. SQL Editor > New query: הדבק את כל `supabase/migrations/0001_init.sql` > Run.
3. הרץ (שנה למייל ה-Google שלך אם שונה):
```sql
insert into owner_config(email) values ('yoavyaacov395@gmail.com');
```
4. Project Settings > API Keys: העתק `Project URL` ו-publishable (anon) key.

### 2. התחברות
**מהיר (בלי Google Cloud):** Authentication > Providers: Email מופעל כברירת מחדל. במסך הכניסה יש ״שלח קישור כניסה למייל״. הקישור מגיע למייל; רק המייל המורשה ב-owner_config יראה נתונים (RLS).
**Google:** console.cloud.google.com > פרויקט חדש > APIs & Services > OAuth consent screen (External, מייל שלך כ-Test user) > Credentials > Create OAuth client ID (Web). Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. העתק Client ID/Secret ל-Supabase: Authentication > Providers > Google. Authentication > URL Configuration: Site URL = כתובת האתר שלך.
אחרי הכניסה הראשונה: Authentication > Sign In / Providers > כבה "Allow new users to sign up".

### 3. בנייה ופריסה
```
cp .env.example .env.local   # מלא URL ו-key
npm install && npm run build
```
העלה את `dist/index.html` לאירוח סטטי: Netlify Drop (app.netlify.com/drop, גרור את התיקייה `dist`), או Cloudflare Pages / Vercel. הוסף את הכתובת שקיבלת ל-Supabase > Authentication > URL Configuration > Redirect URLs.

### 4. בדיקת אבטחה (חובה לפני נתוני אמת)
- היכנס עם חשבון Google אחר: צריך לראות "החשבון אינו מורשה".
- ב-Supabase: Advisors > Security: אין אזהרות על טבלאות ללא RLS.

### 5. העברת נתונים ממצב מקומי לענן
כרגע אין ייבוא אוטומטי מקובץ הגיבוי לענן (ייבנה אם תצטרך). מומלץ: אם עוברים לענן, עושים זאת לפני שמזינים הרבה נתונים, או שאגדיר לך סקריפט העברה.

## ג. הפעלת גיבוי ושחזור בענן (חד-פעמי)
1. Supabase > SQL Editor > New query.
2. הדבק את כל התוכן של `supabase/migrations/0002_backup_restore.sql` ולחץ Run. אמור להופיע Success. הפעולה לא משנה נתונים קיימים.
3. באפליקציה: הגדרות > גיבויים ונתונים. תופיע רשימת ״גיבויים במסד הנתונים״.

## ד. חיבור Google Calendar (ייבוא חד-כיווני; Google הוא מקור האמת, האפליקציה לא כותבת ל-Google)
1. Google Cloud Console: להפעיל Google Calendar API לפרויקט.
2. OAuth client הקיים: להוסיף Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/functions/v1/google-calendar`.
3. OAuth consent screen > Data access: להוסיף scopes `calendar.events.readonly` ו-`calendar.calendarlist.readonly`; Publishing status: In production. אם נשארים ב-Testing, ההרשאה פגה כל 7 ימים והאפליקציה תציג ״חבר מחדש״ (לחיצה אחת). Test users חייב לכלול את המייל שלך.
4. Supabase > SQL Editor: להריץ `supabase/migrations/0003_google_calendar.sql`.
5. Supabase > Edge Functions > Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` (כתובת האתר ב-Vercel).
6. Supabase > Edge Functions > Deploy a new function > Via Editor, שם `google-calendar`, להדביק את `supabase/functions/google-calendar/index.ts`, ולהשבית Verify JWT (הקוד מאמת בעלים בעצמו).
7. באפליקציה: הגדרות > יומן וסנכרון > חבר, ובחירת יומן. אחרי הייבוא הראשון, אם יש שיעורים פנימיים שקיימים גם ב-Google, יוצע איחוד (התיעוד עובר ל-Google, הכפילות נמחקת).
8. בהתקנה מחדש של הפונקציה: להדביק שוב את `supabase/functions/google-calendar/index.ts` ב-Editor ול-Deploy (Verify JWT כבוי).

## פיתוח
```
npm install
npm run dev
npm test           # בדיקות מנוע הציונים וקובץ הגיבוי
npx tsx scripts/test-backup-sql.ts   # SQL גיבוי/שחזור (PGlite)
node scripts/gcal-test/run.mjs       # לוגיקת ייבוא Google (עם Google ו-DB מדומים)
npm run contrast   # ניגודיות ערכות הנושא
```

## ה. מחיקת קבוצה והסתרת אירועים (מיגרציה 0004)
1. Supabase ← SQL Editor ← הדבק את `supabase/migrations/0004_group_cleanup.sql` ← Run (חייב לפני העדכון הבא של הפונקציה).
2. Edge Functions ← google-calendar ← הדבק את `google-calendar-function.ts` המעודכן ← Deploy (Verify JWT נשאר כבוי).
3. באפליקציה: קבוצה בארכיון ← עריכה ← "ניהול קבוצה בארכיון". לפני כל מחיקה נוצר גיבוי ידני אוטומטי.
