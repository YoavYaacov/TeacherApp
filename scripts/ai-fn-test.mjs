// בדיקת פונקציית ai-assistant עם Gemini ו-Supabase מדומים. הרצה: node scripts/ai-fn-test.mjs
import { build } from 'esbuild';
import { tables } from './gcal-test/fake-sb.mjs';
const out = new URL('./.ai-fn.mjs', import.meta.url).pathname;
await build({ entryPoints: [new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url).pathname], bundle: true, format: 'esm', outfile: out, alias: { 'npm:@supabase/supabase-js@2': new URL('./gcal-test/fake-sb.mjs', import.meta.url).pathname }, logLevel: 'error' });
const envs = { SUPABASE_URL: 'https://x.supabase.co', GEMINI_API_KEY: 'SECRET-KEY-123', AI_DAILY_LIMIT: '3', AI_TEST: '1' };
globalThis.Deno = { env: { get: (k) => envs[k] } };
let gem = []; let mode = 'ok';
globalThis.fetch = async (url, init) => {
  gem.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
  if (mode === 'quota') return Response.json({ error: { code: 429, message: 'Quota exceeded for metric generate_content_free_tier_requests, limit: 1000', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }, { status: 429 });
  if (mode === 'rpm') return Response.json({ error: { code: 429, message: 'Please retry in 21.5s', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } }, { status: 429 });
  if (mode === 'cut') return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'חלק מהפתרון' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4096 } });
  if (mode === 'badkey') return Response.json({ error: { code: 400, message: 'API key not valid' } }, { status: 400 });
  if (mode === 'fc') return Response.json({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'undocumented_lessons', args: { days: 7 } }, thoughtSignature: 'sig' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } });
  return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'שלום' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
};
const mod = await import(out);
const post = (b, auth = 'Bearer u') => mod.handle(new Request('https://x/f', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(b) })).then(async (r) => ({ status: r.status, ...(await r.json()) }));
let fails = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
const uid = () => crypto.randomUUID();
const msg = (t) => [{ role: 'user', parts: [{ text: t }] }];
tables.students = [{ first_name: 'דנה', last_name: 'כהן' }, { first_name: 'רן', last_name: 'לוי' }, { first_name: 'שיר', last_name: 'אבו אל־חסן' }];

let r = await post({ action: 'generate', request_id: uid(), contents: msg('x') }, null);
ok(r.status === 403, 'ללא Authorization: נדחה');
r = await post({ action: 'status' });
ok(r.configured === true && r.used === 0 && r.limit === 3 && r.model === 'gemini-3.5-flash-lite', 'status: הוגדר, 0 מתוך 3');
ok(!JSON.stringify(r).includes('SECRET'), 'status לא מדליף מפתח');

// פרטיות: שמות, תחיליות, פרטים מזהים
r = await post({ action: 'generate', system: 'המורה מלמדת את דנה כהן', request_id: uid(), contents: msg('מה הציון של דנה? ולרן לוי, כהן דנה 0501234567 mail@x.com 123456789 ומה עם הציון 85') });
const sent = JSON.stringify(gem.at(-1).body);
ok(r.ok && r.text === 'שלום' && r.redacted >= 7, `הוסרו פרטים מזהים (${r.redacted})`);
ok(!/דנה|כהן|רן|לוי|0501234567|mail@x|123456789/.test(sent), 'שום שם/טלפון/דוא״ל/ת״ז לא נשלח ל-Gemini');
ok(sent.includes('ולרן') === false && sent.includes('ל[שם]'), 'תחילית עברית נשמרת: ל[שם]');
ok(sent.includes('85'), 'ציון (מספר) נשמר');
ok(gem.at(-1).headers['x-goog-api-key'] === 'SECRET-KEY-123' && !sent.includes('SECRET'), 'המפתח נשלח רק בכותרת, לא בגוף');
ok(gem.at(-1).url.includes('gemini-3.5-flash-lite:generateContent'), 'כתובת המודל');
// שדות נוספים מתוך functionResponse
r = await post({ action: 'generate', request_id: uid(), contents: [{ role: 'user', parts: [{ functionResponse: { name: 't', response: { rows: [{ name: 'רן לוי', n: 3 }] } } }] }] });
ok(!JSON.stringify(gem.at(-1).body).includes('לוי') && JSON.stringify(gem.at(-1).body).includes('"n":3'), 'ניקוי גם בתוך functionResponse');

// כפילות
const same = uid(); r = await post({ action: 'generate', request_id: same, contents: msg('a') });
const calls = gem.length; const r2 = await post({ action: 'generate', request_id: same, contents: msg('a') });
ok(r.ok && r2.error === 'duplicate' && gem.length === calls, 'בקשה כפולה לא מגיעה ל-Gemini');
// מגבלה יומית (3)
r = await post({ action: 'generate', request_id: uid(), contents: msg('b') });
ok(tables.ai_usage[0].requests === 3, `מונה יומי: ${tables.ai_usage[0].requests}`);
const before = gem.length; r = await post({ action: 'generate', request_id: uid(), contents: msg('c') });
ok(r.error === 'daily_limit' && r.blockedUntil && gem.length === before, 'מעבר למגבלה: חסום ולא נשלח ל-Gemini');

// איפוס
envs.AI_DAILY_LIMIT = '100'; tables.ai_usage = [];
mode = 'rpm'; r = await post({ action: 'generate', request_id: uid(), contents: msg('d') });
ok(r.error === 'rate_limited' && r.retryAfterSec > 20 && !tables.ai_usage[0].blocked_until, '429 לדקה: הודעת המתנה, בלי חסימה יומית');
mode = 'quota'; r = await post({ action: 'generate', request_id: uid(), contents: msg('e') });
ok(r.error === 'quota_exhausted' && r.blockedUntil && /נגמרה/.test(r.message), '429 יומי: מכסה נגמרה');
const n = gem.length; r = await post({ action: 'generate', request_id: uid(), contents: msg('f') });
ok(r.error === 'quota_exhausted' && gem.length === n, 'אחרי מכסה: חסום בשרת בלי קריאה נוספת');
ok((await post({ action: 'status' })).blockedUntil, 'status מציג חסימה');
tables.ai_usage = []; mode = 'badkey'; r = await post({ action: 'generate', request_id: uid(), contents: msg('g') });
ok(r.error === 'bad_key', 'מפתח לא תקין: הודעה ברורה');
mode = 'fc'; r = await post({ action: 'generate', request_id: uid(), contents: msg('h'), tools: [{ functionDeclarations: [{ name: 'undocumented_lessons' }] }] });
ok(r.ok && r.functionCalls[0].name === 'undocumented_lessons' && r.modelContent.parts[0].thoughtSignature === 'sig', 'קריאת פונקציה + חתימת חשיבה מוחזרים כמות שהם');
mode = 'ok'; r = await post({ action: 'generate', request_id: uid(), contents: msg('i'), schema: { type: 'object' } });
ok(gem.at(-1).body.generationConfig.responseMimeType === 'application/json' && gem.at(-1).body.generationConfig.responseSchema.type === 'OBJECT', 'פלט מובנה (schema) מועבר, עם טיפוסים באותיות גדולות');
r = await post({ action: 'generate', request_id: 'bad', contents: msg('i') }); ok(r.error === 'bad_request', 'request_id לא תקין נדחה');
r = await post({ action: 'generate', request_id: uid(), contents: msg('x'.repeat(70000)) }); ok(r.error === 'too_large', 'בקשה ענקית נדחית');
tables.ai_usage = []; mode = 'cut';
r = await post({ action: 'generate', request_id: uid(), contents: msg('פתור'), maxOutputTokens: 6144 });
ok(r.ok && r.finishReason === 'MAX_TOKENS' && gem.at(-1).body.generationConfig.maxOutputTokens === 6144, 'finishReason=MAX_TOKENS מועבר ללקוח, ומגבלת הפלט המבוקשת מועברת');
r = await post({ action: 'generate', request_id: uid(), contents: msg('פתור'), maxOutputTokens: 99999 });
ok(gem.at(-1).body.generationConfig.maxOutputTokens === 8192, 'מגבלת פלט נחתכת ל-8192 בשרת'); mode = 'ok';
envs.GEMINI_API_KEY = ''; r = await post({ action: 'generate', request_id: uid(), contents: msg('x') }); ok(r.error === 'not_configured', 'ללא מפתח: הודעת הגדרה');
console.log(fails ? `\n${fails} FAILED` : '\nכל הבדיקות עברו'); process.exit(fails ? 1 : 0);
