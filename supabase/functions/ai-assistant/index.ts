// Edge Function: ai-assistant — שער מאובטח אל Gemini עבור "העוזר האישי".
// Secrets: GEMINI_API_KEY (חובה). אופציונליים: AI_MODEL (ברירת מחדל gemini-3.5-flash-lite), AI_DAILY_LIMIT (ברירת מחדל 150).
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY מסופקים אוטומטית.) Verify JWT: להשאיר מופעל.
// עקרונות: המפתח נשאר כאן בלבד · רק הבעלים · מכסה יומית נאכפת בשרת · מניעת בקשות כפולות ·
// הגנת פרטיות: שמות תלמידים ופרטי זיהוי נמחקים מהטקסט לפני השליחה ל-Gemini, גם אם הלקוח טעה.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const SB_URL = env('SUPABASE_URL');
const admin = createClient(SB_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODEL = () => env('AI_MODEL') || 'gemini-3.5-flash-lite';
const DAILY_LIMIT = () => Math.max(1, Number(env('AI_DAILY_LIMIT')) || 150);
const MAX_INPUT_CHARS = 60000;

async function requireOwner(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth) return false;
  const user = createClient(SB_URL, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await user.rpc('is_owner');
  return !error && data === true;
}

// ───────── יום המכסה של Gemini מתאפס בחצות שעון הפסיפי ─────────
const ptParts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
export const quotaDay = (d = new Date()) => { const p = ptParts(d); return `${p.year}-${p.month}-${p.day}`; };
/** רגע החצות הבא בשעון הפסיפי (בקירוב של עד שעה סביב מעבר שעון קיץ, מספיק לחסימה) */
export const nextQuotaReset = (d = new Date()) => {
  const p = ptParts(d);
  const minutesLeft = (24 * 60) - (Number(p.hour) * 60 + Number(p.minute));
  return new Date(d.getTime() + minutesLeft * 60000);
};

// ───────── הגנת פרטיות ─────────
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export interface Names { full: string[]; tokens: string[] }
export function namesFrom(rows: { first_name: string; last_name: string }[]): Names {
  const full = new Set<string>(), tokens = new Set<string>();
  for (const r of rows) {
    const f = (r.first_name ?? '').trim(), l = (r.last_name ?? '').trim();
    if (f && l) { full.add(`${f} ${l}`); full.add(`${l} ${f}`); }
    for (const t of [f, l]) for (const w of t.split(/\s+/)) if (w.length >= 3) tokens.add(w);
  }
  return { full: [...full].sort((a, b) => b.length - a.length), tokens: [...tokens].sort((a, b) => b.length - a.length) };
}
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])', PRE = '([והבכלמש]{0,2})';
export function redactor(n: Names) {
  const res = [
    ...n.full.map((x) => new RegExp(`${B}${PRE}${esc(x)}${E}`, 'gu')),
    ...n.tokens.map((x) => new RegExp(`${B}${PRE}${esc(x)}${E}`, 'gu')),
  ];
  const generic: RegExp[] = [/[\w.+-]+@[\w-]+\.[\w.-]+/g, /(?<!\d)0\d{1,2}[-\s]?\d{7}(?!\d)/g, /(?<!\d)\d{9}(?!\d)/g];
  let count = 0;
  const text = (s: string) => {
    let out = s;
    for (const r of res) out = out.replace(r, (_m, pre: string) => { count++; return `${pre ?? ''}[שם]`; });
    for (const r of generic) out = out.replace(r, () => { count++; return '[פרט מזהה]'; });
    return out;
  };
  const deep = (v: unknown): unknown => typeof v === 'string' ? text(v) : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, deep(x)])) : v;
  return { deep, count: () => count };
}

// ───────── Gemini ─────────
/** Gemini מצפה לשמות טיפוס באותיות גדולות (STRING/OBJECT...) בסכמות. הלקוח כותב סכמה רגילה. */
export const upTypes = (v: unknown): unknown => Array.isArray(v) ? v.map(upTypes) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, k === 'type' && typeof x === 'string' ? x.toUpperCase() : upTypes(x)])) : v;
export type Fail = { ok: false; error: string; message: string; retryAfterSec?: number; blockedUntil?: string };
export function classify(status: number, body: any): Fail {
  const msg: string = body?.error?.message ?? '';
  const details = JSON.stringify(body?.error?.details ?? []);
  if (status === 429) {
    const perDay = /PerDay|per day|daily/i.test(details + msg);
    const retry = Number(/retry in ([\d.]+)s/i.exec(msg)?.[1] ?? /"retryDelay":\s*"(\d+)/.exec(details)?.[1] ?? 0) || undefined;
    return perDay || !retry && !/PerMinute|per minute/i.test(details + msg)
      ? { ok: false, error: 'quota_exhausted', message: 'המכסה החינמית היומית של Gemini נגמרה. העוזר יחזור לפעול כשהמכסה תתחדש.' }
      : { ok: false, error: 'rate_limited', message: 'יותר מדי בקשות בזמן קצר. נסה שוב בעוד רגע.', retryAfterSec: retry ?? 30 };
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg + details)) return { ok: false, error: 'bad_key', message: 'מפתח ה-API של Gemini לא תקין. בדוק את הסוד GEMINI_API_KEY ב-Supabase.' };
  if (status === 401 || status === 403) return { ok: false, error: 'key_forbidden', message: 'למפתח ה-API אין הרשאה לשימוש ב-Gemini (או שהשירות אינו זמין באזור).' };
  if (status === 404) return { ok: false, error: 'model_not_found', message: `המודל ${MODEL()} לא נמצא. אפשר להגדיר מודל אחר בסוד AI_MODEL.` };
  if (status >= 500) return { ok: false, error: 'overloaded', message: 'השירות של Gemini עמוס כרגע. נסה שוב בעוד רגע.' };
  return { ok: false, error: 'upstream', message: `שגיאה מ-Gemini (${status}).` };
}

export function normalize(j: any) {
  const cand = j?.candidates?.[0];
  const parts: any[] = cand?.content?.parts ?? [];
  const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  const functionCalls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name as string, args: (p.functionCall.args ?? {}) as Record<string, unknown> }));
  return { text, functionCalls, modelContent: cand?.content ?? null, finishReason: cand?.finishReason ?? null, blocked: j?.promptFeedback?.blockReason ?? null, usage: { in: j?.usageMetadata?.promptTokenCount ?? 0, out: j?.usageMetadata?.candidatesTokenCount ?? 0 } };
}

async function callGemini(payload: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`;
  let last: Fail | null = null;
  for (let i = 0; i < 2; i++) {
    let r: Response;
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') }, body: JSON.stringify(payload) }); }
    catch { return { ok: false, error: 'network', message: 'אין תקשורת עם Gemini כרגע. נסה שוב.' } as Fail; }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true as const, data: j };
    last = classify(r.status, j);
    if (last.error !== 'overloaded') return last;
    await new Promise((s) => setTimeout(s, 900));
  }
  return last!;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await requireOwner(req))) return json({ error: 'forbidden' }, 403);
  let body: any = {};
  try { body = await req.json(); } catch { /* ריק */ }
  const day = quotaDay();

  if (body.action === 'status') {
    const { data: u } = await admin.from('ai_usage').select('requests,blocked_until').eq('day', day).maybeSingle();
    return json({ configured: !!env('GEMINI_API_KEY'), model: MODEL(), used: u?.requests ?? 0, limit: DAILY_LIMIT(), blockedUntil: u?.blocked_until && new Date(u.blocked_until) > new Date() ? u.blocked_until : null });
  }
  if (body.action !== 'generate') return json({ error: 'unknown_action' }, 400);
  if (!env('GEMINI_API_KEY')) return json({ ok: false, error: 'not_configured', message: 'העוזר עדיין לא הוגדר: חסר הסוד GEMINI_API_KEY ב-Supabase.' });

  // ── ולידציית קלט ──
  const requestId = String(body.request_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ ok: false, error: 'bad_request', message: 'בקשה לא תקינה.' });
  if (!Array.isArray(body.contents) || body.contents.length === 0 || body.contents.length > 60) return json({ ok: false, error: 'bad_request', message: 'בקשה לא תקינה.' });
  if (JSON.stringify([body.system, body.contents, body.tools]).length > MAX_INPUT_CHARS) return json({ ok: false, error: 'too_large', message: 'הבקשה גדולה מדי. נסה לצמצם (פחות תלמידים או טווח קצר יותר).' });

  // ── מניעת כפילות ──
  const ins = await admin.from('ai_requests').insert({ request_id: requestId });
  if (ins.error) return json({ ok: false, error: 'duplicate', message: 'הבקשה כבר נשלחה.' });
  await admin.from('ai_requests').delete().lt('created_at', new Date(Date.now() - 86400000).toISOString());
  // ── מכסה יומית וחסימה ──
  const { data: u } = await admin.from('ai_usage').select('requests,blocked_until').eq('day', day).maybeSingle();
  if (u?.blocked_until && new Date(u.blocked_until) > new Date()) return json({ ok: false, error: 'quota_exhausted', message: 'המכסה החינמית היומית נגמרה. העוזר יחזור לפעול כשהמכסה תתחדש.', blockedUntil: u.blocked_until });
  if ((u?.requests ?? 0) >= DAILY_LIMIT()) return json({ ok: false, error: 'daily_limit', message: `הגעת למגבלה היומית שהוגדרה (${DAILY_LIMIT()} בקשות). היא מתאפסת מחר.`, blockedUntil: nextQuotaReset().toISOString() });
  await admin.from('ai_usage').upsert({ day, requests: (u?.requests ?? 0) + 1 }, { onConflict: 'day' });

  // ── הגנת פרטיות ──
  const { data: studs } = await admin.from('students').select('first_name,last_name');
  const red = redactor(namesFrom(studs ?? []));
  const payload: Record<string, unknown> = {
    contents: red.deep(body.contents),
    generationConfig: { temperature: Math.min(1, Math.max(0, Number(body.temperature ?? 0.4))), maxOutputTokens: Math.min(8192, Math.max(256, Number(body.maxOutputTokens ?? 2048))) },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(red.deep(String(body.system))) }] };
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = upTypes(body.tools);
  if (body.schema && !payload.tools) Object.assign(payload.generationConfig as object, { responseMimeType: 'application/json', responseSchema: upTypes(body.schema) });

  const res = await callGemini(payload);
  if (!res.ok) {
    const f = res as Fail;
    if (f.error === 'quota_exhausted') {
      const until = nextQuotaReset().toISOString();
      await admin.from('ai_usage').upsert({ day, requests: (u?.requests ?? 0) + 1, blocked_until: until, last_error: 'quota_exhausted' }, { onConflict: 'day' });
      f.blockedUntil = until;
    }
    return json(f);
  }
  const out = normalize(res.data);
  if (out.blocked) return json({ ok: false, error: 'blocked', message: 'Gemini סירב לטפל בבקשה הזו (מסנן בטיחות). נסה לנסח אחרת.' });
  const { data: cur } = await admin.from('ai_usage').select('tokens_in,tokens_out').eq('day', day).maybeSingle();
  await admin.from('ai_usage').update({ tokens_in: Number(cur?.tokens_in ?? 0) + out.usage.in, tokens_out: Number(cur?.tokens_out ?? 0) + out.usage.out }).eq('day', day);
  return json({ ok: true, ...out, redacted: red.count(), used: (u?.requests ?? 0) + 1, limit: DAILY_LIMIT() });
}

if (typeof Deno !== 'undefined' && (Deno as { serve?: unknown }).serve && !env('AI_TEST')) Deno.serve(handle);
