import { supabase } from './supabase';

export interface GStatus { connected: boolean; canSend?: boolean; connectedAt: string | null; calendar: { id: string; name: string | null } | null; lastSyncedAt: string | null; lastError: string | null; lastCounts: { created: number; updated: number; cancelled: number; skipped: number; full: boolean } | null }
export interface GCalendar { id: string; name: string; primary: boolean; accessRole: string; timeZone?: string }
export interface SyncResult { ok?: boolean; error?: string; created?: number; updated?: number; cancelled?: number; replaced?: number; skipped?: number; full?: boolean }

export async function gcal<T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}): Promise<T & { error?: string }> {
  if (!supabase) return { error: 'local_mode' } as T & { error: string };
  const { data, error } = await supabase.functions.invoke('google-calendar', { body: { action, ...extra } });
  if (error) {
    // 404 = הפונקציה טרם נפרסה; אחרת שגיאת רשת/שרת
    const status = (error as { context?: { status?: number } }).context?.status;
    return { error: status === 404 ? 'not_deployed' : status === 403 ? 'forbidden' : error.message } as T & { error: string };
  }
  return data as T & { error?: string };
}

export const ERR_TEXT: Record<string, string> = {
  not_deployed: 'פונקציית השרת עדיין לא הותקנה ב-Supabase.',
  reauth_required: 'החיבור ל-Google פג או בוטל. יש לחבר מחדש.',
  forbidden: 'אין הרשאה.',
  no_calendar: 'לא נבחר יומן.',
  local_mode: 'זמין רק בגרסת הענן.',
  no_send_scope: 'חסרה הרשאת שליחת מייל מ-Gmail. יש לאשר אותה (כפתור למטה).',
  gmail_forbidden: 'Gmail סירב לשליחה. ייתכן ש-Gmail API לא הופעל בפרויקט Google (ראה הוראות ההתקנה).',
  bad_input: 'בקשת השליחה אינה תקינה.',
  bad_month: 'אפשר לדווח רק מאוקטובר 2026.',
  too_early: 'עדיין לא הגיע מועד השליחה של החודש הזה (מה-1 בחודש שאחריו).',
  no_hours: 'אין חריגות לדיווח החודש הזה (פרונטליות 0, פרטני 0, שהייה 6).',
  hours_changed: 'המונים השמורים השתנו. סגור את החלון ופתח אותו מחדש.',
};
export const errText = (e: string) => ERR_TEXT[e] ?? e;
