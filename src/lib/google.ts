import { supabase } from './supabase';

export interface GStatus { connected: boolean; connectedAt: string | null; calendar: { id: string; name: string | null } | null; lastSyncedAt: string | null; lastError: string | null; lastCounts: { created: number; updated: number; cancelled: number; skipped: number; full: boolean } | null }
export interface GCalendar { id: string; name: string; primary: boolean; accessRole: string; timeZone?: string }
export interface SyncResult { ok?: boolean; error?: string; created?: number; updated?: number; cancelled?: number; skipped?: number; full?: boolean }

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
};
export const errText = (e: string) => ERR_TEXT[e] ?? e;
