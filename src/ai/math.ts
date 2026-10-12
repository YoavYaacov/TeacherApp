// מתרגם תת-קבוצה של LaTeX ל-MathML (נתמך ב-Chrome/Edge/Safari/Firefox בלי ספריות ובלי גופנים).
// כל טקסט עובר escape, כך שהפלט בטוח להזרקה.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SYM: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', leftrightarrow: '↔',
  pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', varphi: 'φ', phi: 'φ', epsilon: 'ε',
  degree: '°', circ: '°', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', emptyset: '∅', angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', ldots: '…', cdots: '⋯', sim: '∼', cong: '≅', neg: '¬', forall: '∀', exists: '∃',
};
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lg', 'lim', 'min', 'max', 'sup', 'inf', 'arcsin', 'arccos', 'arctan']);
const OPS = new Set(['+', '-', '=', '<', '>', '/', '*', ',', ';', ':', '!', '|', '(', ')', '[', ']', '%', '.', '\u2212']);

export type MNode =
  | { t: 'mn' | 'mi' | 'mtext'; v: string; normal?: boolean }
  | { t: 'mo'; v: string; stretch?: boolean; plain?: boolean }
  | { t: 'row'; c: MNode[] }
  | { t: 'sup' | 'sub'; b: MNode; e: MNode }
  | { t: 'frac'; n: MNode; d: MNode }
  | { t: 'sqrt'; a: MNode; deg?: MNode }
  | { t: 'over'; b: MNode; m: string; kind: 'bar' | 'acc' }
  | { t: 'space'; w: string }
  | { t: 'empty' };
const row = (c: MNode[]): MNode => ({ t: 'row', c });

class P {
  i = 0;
  constructor(private s: string) {}
  private peek() { return this.s[this.i]; }
  private ws() { while (/\s/.test(this.s[this.i] ?? '')) this.i++; }
  /** רצף ביטויים עד סוף או עד סוגר סוגר */
  seq(stop?: string): MNode[] {
    const out: MNode[] = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length || (stop && this.peek() === stop)) break;
      out.push(this.scripted());
    }
    return out;
  }
  private group(): MNode {
    this.ws();
    if (this.peek() === '{') { this.i++; const r = this.seq('}'); this.i++; return row(r); }
    return this.atom();
  }
  private scripted(): MNode {
    let base = this.atom();
    for (;;) {
      this.ws();
      const c = this.peek();
      if (c === '^') { this.i++; base = { t: 'sup', b: base, e: this.group() }; }
      else if (c === '_') { this.i++; base = { t: 'sub', b: base, e: this.group() }; }
      else break;
    }
    return base;
  }
  private atom(): MNode {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) return row([]);
    if (c === '{') return this.group();
    if (c === '\\') return this.command();
    if (/\d/.test(c)) { let n = ''; while (/[\d]/.test(this.s[this.i] ?? '') || (this.s[this.i] === '.' && /\d/.test(this.s[this.i + 1] ?? '') && n)) n += this.s[this.i++]; return { t: 'mn', v: n }; }
    this.i++;
    if (/\p{L}/u.test(c)) return /[a-zA-Z]/.test(c) ? { t: 'mi', v: c } : { t: 'mtext', v: c };
    if (OPS.has(c)) return c === '(' || c === ')' || c === '[' || c === ']' || c === '|' ? { t: 'mo', v: c, plain: true } : { t: 'mo', v: c === '*' ? '∗' : c === '-' ? '\u2212' : c };
    return { t: 'mo', v: c };
  }
  private command(): MNode {
    this.i++; // \
    let name = '';
    while (/[a-zA-Z]/.test(this.s[this.i] ?? '')) name += this.s[this.i++];
    if (!name) { const ch = this.s[this.i++] ?? ''; return ch === '%' ? { t: 'mo', v: '%' } : ch === ',' || ch === ';' || ch === ' ' || ch === '!' ? { t: 'space', w: '0.2em' } : { t: 'mo', v: ch }; }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const n = this.group(), d = this.group(); return { t: 'frac', n, d }; }
    if (name === 'sqrt') {
      this.ws();
      if (this.peek() === '[') { this.i++; const n = this.seq(']'); this.i++; const a = this.group(); return { t: 'sqrt', a, deg: row(n) }; }
      return { t: 'sqrt', a: this.group() };
    }
    if (name === 'text' || name === 'mathrm' || name === 'textbf') {
      this.ws();
      if (this.peek() === '{') { this.i++; let t = ''; let d = 1; while (this.i < this.s.length) { const ch = this.s[this.i++]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } t += ch; } return { t: 'mtext', v: t }; }
      return this.atom();
    }
    if (name === 'left' || name === 'right') { this.ws(); const d = this.s[this.i++] ?? ''; return d === '.' ? { t: 'empty' } : { t: 'mo', v: d === '\\' ? (this.s[this.i++] ?? '') : d, stretch: true }; }
    if (name === 'overline' || name === 'bar') return { t: 'over', b: this.group(), m: '‾', kind: 'bar' };
    if (name === 'vec') return { t: 'over', b: this.group(), m: '→', kind: 'acc' };
    if (name === 'hat') return { t: 'over', b: this.group(), m: '^', kind: 'acc' };
    if (name === 'quad' || name === 'qquad') return { t: 'space', w: '1em' };
    if (FUNCS.has(name)) return { t: 'mi', v: name, normal: true };
    if (name in SYM) return /[πα-ωΔΣΩφε]/.test(SYM[name]) ? { t: 'mi', v: SYM[name] } : { t: 'mo', v: SYM[name] };
    return { t: 'mtext', v: name };
  }
}
export const parseTex = (tex: string): MNode[] => new P(tex.trim()).seq();

function ml(n: MNode): string {
  switch (n.t) {
    case 'mn': return `<mn>${esc(n.v)}</mn>`;
    case 'mi': return n.normal ? `<mi mathvariant="normal">${n.v}</mi>` : `<mi>${esc(n.v)}</mi>`;
    case 'mtext': return `<mtext>${esc(n.v)}</mtext>`;
    case 'mo': return n.plain ? `<mo stretchy="false">${esc(n.v)}</mo>` : n.stretch ? `<mo stretchy="true">${esc(n.v)}</mo>` : `<mo>${esc(n.v)}</mo>`;
    case 'row': return `<mrow>${n.c.map(ml).join('')}</mrow>`;
    case 'sup': return `<msup>${ml(n.b)}${ml(n.e)}</msup>`;
    case 'sub': return `<msub>${ml(n.b)}${ml(n.e)}</msub>`;
    case 'frac': return `<mfrac>${ml(n.n)}${ml(n.d)}</mfrac>`;
    case 'sqrt': return n.deg ? `<mroot>${ml(n.a)}${ml(n.deg)}</mroot>` : `<msqrt>${ml(n.a)}</msqrt>`;
    case 'over': return `<mover>${ml(n.b)}<mo>${n.m}</mo></mover>`;
    case 'space': return `<mspace width="${n.w}"/>`;
    case 'empty': return '';
  }
}
export function texToMathML(tex: string, display = false): string {
  const body = parseTex(tex).map(ml).join('');
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''} dir="ltr"><mrow>${body}</mrow></math>`;
}
/** טקסט קריא של הביטוי (להעתקה כטקסט ולבדיקות), בלי LaTeX */
function plain(n: MNode): string {
  switch (n.t) {
    case 'mn': case 'mi': case 'mtext': return n.v;
    case 'mo': return n.v;
    case 'row': return n.c.map(plain).join('');
    case 'sup': { const e = plain(n.e); return `${plain(n.b)}^${n.e.t === 'row' && n.e.c.length > 1 ? `(${e})` : e}`; }
    case 'sub': { const e = plain(n.e); return `${plain(n.b)}_${n.e.t === 'row' && n.e.c.length > 1 ? `(${e})` : e}`; }
    case 'frac': return `(${plain(n.n)})/(${plain(n.d)})`;
    case 'sqrt': return n.deg ? `${plain(n.deg)}√(${plain(n.a)})` : `√(${plain(n.a)})`;
    case 'over': return n.kind === 'bar' ? `${plain(n.b)}̅` : `${plain(n.b)}${n.m}`;
    case 'space': return ' ';
    case 'empty': return '';
  }
}
export const texToPlain = (tex: string) => parseTex(tex).map(plain).join('').replace(/\u2212/g, '-');
