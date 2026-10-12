import { supabase } from '../lib/supabase';

export interface GenReq { system?: string; contents: unknown[]; tools?: unknown[]; schema?: unknown; temperature?: number; maxOutputTokens?: number }
export interface GenOk { ok: true; text: string; functionCalls: { name: string; args: Record<string, unknown> }[]; modelContent: unknown; redacted: number; used: number; limit: number; usage: { in: number; out: number } }
export interface GenFail { ok: false; error: string; message: string; retryAfterSec?: number; blockedUntil?: string }
export type GenResult = GenOk | GenFail;
export type GenFn = (r: GenReq) => Promise<GenResult>;
export interface AiStatus { configured: boolean; model: string; used: number; limit: number; blockedUntil: string | null }

const MSG: Record<string, string> = {
  local_mode: 'העוזר החכם זמין רק בגרסת הענן (מחובר ל-Supabase).',
  not_deployed: 'פונקציית ה-AI עדיין לא הותקנה ב-Supabase. ראה את הוראות ההתקנה.',
  forbidden: 'אין הרשאה להפעיל את העוזר.',
};
const fail = (error: string, message?: string): GenFail => ({ ok: false, error, message: message ?? MSG[error] ?? 'אירעה שגיאה בתקשורת עם העוזר. נסה שוב.' });
async function call<T>(body: Record<string, unknown>): Promise<T | GenFail> {
  if (!supabase) return fail('local_mode');
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
  if (error) { const st = (error as { context?: { status?: number } }).context?.status; return fail(st === 404 ? 'not_deployed' : st === 403 ? 'forbidden' : 'network'); }
  return data as T;
}
/** נקודת חיבור לבדיקות אוטומטיות בלבד (לא מוגדרת בייצור) */
export const generate: GenFn = async (r) => { const o = (globalThis as { __aiGen?: GenFn }).__aiGen; if (o) return o(r); return (await call<GenResult>({ action: 'generate', request_id: crypto.randomUUID(), ...r })) as GenResult; };
export async function aiStatus(): Promise<AiStatus | GenFail> { return call<AiStatus>({ action: 'status' }); }
export const isFail = (x: unknown): x is GenFail => !!x && typeof x === 'object' && (x as { ok?: unknown }).ok === false;
