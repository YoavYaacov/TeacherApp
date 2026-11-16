import { createClient, type SupabaseClient } from '@supabase/supabase-js';
/** TeacherApp חיה בסכמה נפרדת בפרויקט edtech. אסור לפנות ל-public (שם נמצאות הטבלאות של "הבנתי"). */
export const TA_SCHEMA = 'teacherapp' as const;
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** null => מצב מקומי (ללא ענן) */
/** הלקוח פונה לסכמה teacherapp בלבד (ה-generic השני). הטבלאות אינן מוקלדות (Database = any), אבל הסכמה כן. */
export type TaClient = SupabaseClient<any, typeof TA_SCHEMA>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const supabase: TaClient | null = url && key ? createClient<any, typeof TA_SCHEMA>(url, key, { db: { schema: TA_SCHEMA }, auth: { persistSession: true, autoRefreshToken: true } }) : null;
