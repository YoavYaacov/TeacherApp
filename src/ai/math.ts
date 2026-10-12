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

class P {
  i = 0;
  constructor(private s: string) {}
  private peek() { return this.s[this.i]; }
  private ws() { while (/\s/.test(this.s[this.i] ?? '')) this.i++; }
  /** רצף ביטויים עד סוף או עד סוגר סוגר */
  seq(stop?: string): string {
    const out: string[] = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length || (stop && this.peek() === stop)) break;
      out.push(this.scripted());
    }
    return out.join('');
  }
  private group(): string {
    this.ws();
    if (this.peek() === '{') { this.i++; const r = this.seq('}'); this.i++; return `<mrow>${r}</mrow>`; }
    return this.atom();
  }
  private scripted(): string {
    let base = this.atom();
    for (;;) {
      this.ws();
      const c = this.peek();
      if (c === '^') { this.i++; base = `<msup>${base}${this.group()}</msup>`; }
      else if (c === '_') { this.i++; base = `<msub>${base}${this.group()}</msub>`; }
      else break;
    }
    return base;
  }
  private atom(): string {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) return '<mrow/>';
    if (c === '{') return this.group();
    if (c === '\\') return this.command();
    if (/\d/.test(c)) { let n = ''; while (/[\d]/.test(this.s[this.i] ?? '') || (this.s[this.i] === '.' && /\d/.test(this.s[this.i + 1] ?? '') && n)) n += this.s[this.i++]; return `<mn>${n}</mn>`; }
    this.i++;
    if (/\p{L}/u.test(c)) return /[a-zA-Z]/.test(c) ? `<mi>${esc(c)}</mi>` : `<mtext>${esc(c)}</mtext>`;
    if (OPS.has(c)) return c === '(' || c === ')' || c === '[' || c === ']' || c === '|' ? `<mo stretchy="false">${esc(c)}</mo>` : `<mo>${esc(c === '*' ? '∗' : c === '-' ? '\u2212' : c)}</mo>`;
    return `<mo>${esc(c)}</mo>`;
  }
  private command(): string {
    this.i++; // \
    let name = '';
    while (/[a-zA-Z]/.test(this.s[this.i] ?? '')) name += this.s[this.i++];
    if (!name) { const ch = this.s[this.i++] ?? ''; return ch === '%' ? '<mo>%</mo>' : ch === ',' || ch === ';' || ch === ' ' || ch === '!' ? '<mspace width="0.2em"/>' : ch === '{' || ch === '}' ? `<mo>${ch}</mo>` : `<mo>${esc(ch)}</mo>`; }
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = this.group(), b = this.group(); return `<mfrac>${a}${b}</mfrac>`; }
    if (name === 'sqrt') {
      this.ws();
      if (this.peek() === '[') { this.i++; const n = this.seq(']'); this.i++; const a = this.group(); return `<mroot>${a}<mrow>${n}</mrow></mroot>`; }
      return `<msqrt>${this.group()}</msqrt>`;
    }
    if (name === 'text' || name === 'mathrm' || name === 'textbf') {
      this.ws();
      if (this.peek() === '{') { this.i++; let t = ''; let d = 1; while (this.i < this.s.length) { const ch = this.s[this.i++]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } t += ch; } return `<mtext>${esc(t)}</mtext>`; }
      return this.atom();
    }
    if (name === 'left' || name === 'right') { this.ws(); const d = this.s[this.i++] ?? ''; return d === '.' ? '' : `<mo stretchy="true">${esc(d === '\\' ? (this.s[this.i++] ?? '') : d)}</mo>`; }
    if (name === 'overline' || name === 'bar') return `<mover>${this.group()}<mo>‾</mo></mover>`;
    if (name === 'vec') return `<mover>${this.group()}<mo>→</mo></mover>`;
    if (name === 'hat') return `<mover>${this.group()}<mo>^</mo></mover>`;
    if (name === 'quad' || name === 'qquad') return '<mspace width="1em"/>';
    if (FUNCS.has(name)) return `<mi mathvariant="normal">${name}</mi>`;
    if (name in SYM) return /[πα-ωΔΣΩφε]/.test(SYM[name]) ? `<mi>${SYM[name]}</mi>` : `<mo>${SYM[name]}</mo>`;
    return `<mtext>${esc(name)}</mtext>`;
  }
}
export function texToMathML(tex: string, display = false): string {
  const body = new P(tex.trim()).seq();
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''} dir="ltr"><mrow>${body}</mrow></math>`;
}
/** טקסט פשוט של הביטוי (להעתקה/בדיקות) */
export const texToPlain = (tex: string) => tex.replace(/\\(?:d|t)?frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^}]*)\}/g, '√($1)').replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\(le|leq)\b/g, '≤').replace(/\\(ge|geq)\b/g, '≥').replace(/\^\{([^}]*)\}/g, '^$1').replace(/[{}]/g, '');
