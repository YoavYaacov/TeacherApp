import { THEMES } from '../src/ui/themes';
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
let fail = 0;
for (const t of THEMES) {
  const checks: [string, string, string, number][] = [
    ['ink/bg', t.ink, t.bg, 4.5], ['ink/surface', t.ink, t.surface, 4.5],
    ['muted/surface', t.muted, t.surface, 4.5], ['muted/bg', t.muted, t.bg, 4.5],
    ['sidebarInk/sidebar', t.sidebarInk, t.sidebar, 4.5],
    ['onAccent/accent', t.onAccent, t.accent, 4.5],
    ['accentText/surface', t.accentText, t.surface, 4.5], ['accentText/bg', t.accentText, t.bg, 4.5],
    ['accent/surface (focus ring, non-text)', t.accent, t.surface, 3],
    ['border-ish: accent/bg (non-text)', t.accent, t.bg, 3],
  ];
  for (const [n, f, b, min] of checks) {
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) fail++;
    if (!ok) console.log(`FAIL ${t.name} ${n}: ${r.toFixed(2)} < ${min}`);
  }
}
console.log(fail ? `${fail} failures` : 'all contrast checks pass');
process.exit(fail ? 1 : 0);
