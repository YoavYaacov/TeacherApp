import { describe, expect, it } from 'vitest';
import { texToMathML, texToPlain } from './math';
describe('LaTeX → MathML', () => {
  it('שבר, חזקה, שורש', () => {
    expect(texToMathML('\\frac{x+1}{2}')).toContain('<mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac>');
    expect(texToMathML('x^{2}+y^2')).toContain('<msup><mi>x</mi><mrow><mn>2</mn></mrow></msup>');
    expect(texToMathML('y^2')).toContain('<msup><mi>y</mi><mn>2</mn></msup>');
    expect(texToMathML('\\sqrt{3}')).toContain('<msqrt><mrow><mn>3</mn></mrow></msqrt>');
    expect(texToMathML('\\sqrt[3]{8}')).toContain('<mroot>');
  });
  it('משוואה, סימנים, מספרים עשרוניים ועברית בתוך text', () => {
    const m = texToMathML('2x+3=7 \\Rightarrow x=2, \\ 3.5 \\cdot 2 \\le 7 \\text{ ס״מ}');
    expect(m).toContain('<mn>3.5</mn>'); expect(m).toContain('<mo>⇒</mo>'); expect(m).toContain('<mo>≤</mo>'); expect(m).toContain('<mtext> ס״מ</mtext>');
  });
  it('בטוח: אין הזרקת HTML', () => {
    const m = texToMathML('<script>alert(1)</script> \\text{<img src=x onerror=1>}');
    expect(m).not.toContain('<script'); expect(m).not.toContain('<img'); expect(m).toContain('&lt;');
  });
  it('לא קורס על קלט שבור', () => {
    for (const t of ['\\frac{1}', '{', '}', '^', '\\', '\\unknown{x}', 'x^', '\\left(', '\\sqrt']) expect(() => texToMathML(t)).not.toThrow();
  });
  it('טקסט פשוט', () => { expect(texToPlain('\\frac{1}{2}x^{2}')).toBe('(1)/(2)x^2'); });
});
