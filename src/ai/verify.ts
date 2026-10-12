// בדיקה חישובית של תרגילים: מנתח ביטויים בטוח (ללא eval) ובודק פתרונות שהמודל סיפק.
// מה שנבדק: משוואה במשתנה אחד (הפתרונות מקיימים אותה, ואין שורשים ממשיים נוספים בטווח), ערך של ביטוי מספרי.
// כל השאר מסומן "לא נבדק". לעולם לא מציגים "נבדק" בלי בדיקה בפועל.
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };
export function tokenize(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  const src = s.replace(/−/g, '-').replace(/×|·/g, '*').replace(/÷/g, '/').replace(/\\cdot|\\times/g, '*').replace(/\\left|\\right/g, '').replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))').replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)').replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/\\pi/g, 'pi').replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.]/.test(c)) { let n = ''; while (/[\d.]/.test(src[i] ?? '')) n += src[i++]; const v = Number(n); if (!Number.isFinite(v)) throw new Error('מספר לא תקין'); out.push({ t: 'num', v }); continue; }
    if (/[a-zA-Z]/.test(c)) { let n = ''; while (/[a-zA-Z]/.test(src[i] ?? '')) n += src[i++]; out.push({ t: 'id', v: n }); continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`תו לא נתמך: ${c}`);
  }
  return out;
}
export type Node = { k: 'n'; v: number } | { k: 'v'; name: string } | { k: 'b'; op: string; a: Node; b: Node } | { k: 'u'; a: Node } | { k: 'f'; name: string; a: Node };
const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp };
export function parse(src: string, vars: string[] = ['x']): Node {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], eat = (v?: string) => { const t = toks[p++]; if (v && !(t && t.t === 'op' && t.v === v)) throw new Error(`צפוי ${v}`); return t; };
  const atomStart = () => { const t = peek(); return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(')); };
  function expr(): Node { let a = term(); for (;;) { const t = peek(); if (t?.t === 'op' && (t.v === '+' || t.v === '-')) { p++; a = { k: 'b', op: t.v, a, b: term() }; } else return a; } }
  function term(): Node { let a = unary(); for (;;) { const t = peek(); if (t?.t === 'op' && (t.v === '*' || t.v === '/')) { p++; a = { k: 'b', op: t.v, a, b: unary() }; } else if (atomStart()) a = { k: 'b', op: '*', a, b: pow() }; /* כפל מרומז: 2x, 3(x+1) */ else return a; } }
  function unary(): Node { const t = peek(); if (t?.t === 'op' && t.v === '-') { p++; return { k: 'u', a: unary() }; } if (t?.t === 'op' && t.v === '+') { p++; return unary(); } return pow(); }
  function pow(): Node { const a = atom(); const t = peek(); if (t?.t === 'op' && t.v === '^') { p++; return { k: 'b', op: '^', a, b: unary() }; } return a; }
  function atom(): Node {
    const t = eat() as Tok | undefined;
    if (!t) throw new Error('ביטוי חסר');
    if (t.t === 'num') return { k: 'n', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'pi') return { k: 'n', v: Math.PI }; if (t.v === 'e' && !vars.includes('e')) return { k: 'n', v: Math.E };
      if (t.v in FN) { eat('('); const a = expr(); eat(')'); return { k: 'f', name: t.v, a }; }
      if (vars.includes(t.v)) return { k: 'v', name: t.v };
      throw new Error(`משתנה לא מוכר: ${t.v}`);
    }
    if (t.v === '(') { const a = expr(); eat(')'); return a; }
    throw new Error(`תו לא צפוי: ${t.v}`);
  }
  const r = expr(); if (p < toks.length) throw new Error('ביטוי לא תקין (תווים עודפים)'); return r;
}
export function evalNode(n: Node, env: Record<string, number>): number {
  switch (n.k) {
    case 'n': return n.v; case 'v': return env[n.name]; case 'u': return -evalNode(n.a, env); case 'f': return FN[n.name](evalNode(n.a, env));
    case 'b': { const a = evalNode(n.a, env), b = evalNode(n.b, env); return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b); }
  }
}
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** שורשים ממשיים בטווח [-R, R] בסריקת סימן + חצייה */
export function realRoots(f: (x: number) => number, R = 200, steps = 40000): number[] {
  const roots: number[] = []; const h = (2 * R) / steps;
  let px = -R, pv = f(px);
  for (let i = 1; i <= steps; i++) {
    const x = -R + i * h, v = f(x);
    if (Number.isFinite(pv) && Number.isFinite(v)) {
      if (pv === 0) roots.push(px);
      else if (pv * v < 0 && Math.abs(v - pv) < 1e6) { let lo = px, hi = x; for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? (hi = m) : (lo = m); } roots.push((lo + hi) / 2); }
    }
    px = x; pv = v;
  }
  // שורש כפול (נגיעה): מינימום מקומי של |f| קרוב ל-0
  for (let i = 1; i < steps - 1; i++) { const a = Math.abs(f(-R + (i - 1) * h)), b = Math.abs(f(-R + i * h)), c = Math.abs(f(-R + (i + 1) * h)); if (b < a && b <= c && b < 1e-6 && !roots.some((r) => Math.abs(r - (-R + i * h)) < 1e-3)) roots.push(-R + i * h); }
  return [...new Set(roots.map((r) => Math.round(r * 1e6) / 1e6))].sort((a, b) => a - b);
}

export interface Check { type: 'equation' | 'value'; equation?: string; variable?: string; solutions?: string[]; expression?: string; answer?: string }
export interface VerifyOut { status: 'verified' | 'failed' | 'unverified'; detail: string }
export function verifyCheck(c: Check | null | undefined): VerifyOut {
  try {
    if (!c) return { status: 'unverified', detail: 'לא סופק נתון לבדיקה חישובית' };
    if (c.type === 'value') {
      const got = evalNode(parse(c.expression ?? '', []), {}), want = evalNode(parse(c.answer ?? '', []), {});
      return close(got, want) ? { status: 'verified', detail: `הערך המחושב ${+got.toPrecision(10)} תואם לתשובה` } : { status: 'failed', detail: `הערך המחושב ${+got.toPrecision(10)} שונה מהתשובה ${+want.toPrecision(10)}` };
    }
    if (c.type === 'equation') {
      const v = c.variable || 'x'; const [l, r] = (c.equation ?? '').split('=');
      if (!l || r === undefined || (c.equation ?? '').split('=').length !== 2) return { status: 'unverified', detail: 'לא ניתן לפרש את המשוואה לבדיקה' };
      const L = parse(l, [v]), Rn = parse(r, [v]); const f = (x: number) => evalNode(L, { [v]: x }) - evalNode(Rn, { [v]: x });
      const given = (c.solutions ?? []).map((s) => evalNode(parse(s, []), {}));
      const bad = given.filter((s) => !close(f(s), 0, 1e-6));
      if (bad.length) return { status: 'failed', detail: `הערך ${+bad[0].toPrecision(8)} אינו מקיים את המשוואה` };
      const found = realRoots(f).filter((x) => Math.abs(x) <= 200);
      const missed = found.filter((x) => !given.some((g) => close(g, x, 1e-4)));
      if (missed.length) return { status: 'failed', detail: `חסר פתרון ממשי: ${+missed[0].toPrecision(8)}` };
      return { status: 'verified', detail: given.length ? `${given.length === 1 ? 'הפתרון שנמסר מקיים' : `${given.length} הפתרונות שנמסרו מקיימים`} את המשוואה, ואין פתרונות ממשיים נוספים בטווח ‎−200…200` : 'אין פתרונות ממשיים בטווח ‎−200…200, בהתאם לתשובה' };
    }
    return { status: 'unverified', detail: 'סוג בדיקה לא נתמך' };
  } catch (e) { return { status: 'unverified', detail: `לא ניתן לבדוק חישובית (${(e as Error).message})` }; }
}
