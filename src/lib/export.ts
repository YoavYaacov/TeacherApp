import type { DB, StudyGroup } from '../data/types';
import { activeStudents, label } from './domain';
import { storedFinal, studentGrades, termConfig } from './gradebook';
import { computeAnnual, computeTerm, finalStatus, roundHalfUp } from '../engine/grades';
import type { Sheet } from './xlsx';
import { downloadBytes, hebSort } from './util';
import { buildXlsx } from './xlsx';

/** חוברת Excel לקבוצה: גיליון לכל מחצית וגיליון שנתי. אותם חישובים כמו במסך. */
export function groupSheets(db: DB, group: StudyGroup): Sheet[] {
  const students = activeStudents(db, group.id).sort((a, b) => hebSort(label(a), label(b)));
  const sheets: Sheet[] = [];
  for (const term of [1, 2] as const) {
    const cfg = termConfig(db, group.id, term);
    const evRows = db.assessment_events.filter((e) => e.group_id === group.id && e.term === term && !e.cancelled_at);
    const cols = cfg.categories.flatMap((c) => c.events.filter((e) => !e.cancelled).map((e) => ({ e, cat: c.name, title: evRows.find((x) => x.id === e.id)?.title ?? '' })));
    const period = term === 1 ? 'h1' : 'h2';
    const all = db.assessment_events.filter((e) => e.group_id === group.id && e.term === term);
    const rows: (string | number | null)[][] = [['תלמיד', 'כיתת אם', ...cols.map((c) => `${c.title} (${c.cat})`), 'ממוצע ביניים', 'חישוב חלקי', 'סופי', 'מקור הסופי']];
    for (const s of students) {
      const g = studentGrades(db, s.id, all);
      const r = computeTerm(cfg, g);
      const fin = finalStatus(storedFinal(db, group.id, s.id, period), r.calculated);
      const eff = Object.assign({}, ...r.categories.map((c) => c.effective)) as Record<string, number>;
      rows.push([label(s), s.home_class, ...cols.map((c) => (c.e.id in eff ? roundHalfUp(eff[c.e.id], 2) : g[c.e.id]?.a.kind === 'exempt' ? 'פטור' : g[c.e.id]?.a.kind === 'absent' ? 'לא נבחן' : null)),
        r.calculatedRounded, r.partial ? 'כן' : '', fin.value, fin.source === 'approved' ? 'מאושר' : fin.source === 'override' ? 'ידני' : '']);
    }
    sheets.push({ name: `מחצית ${term === 1 ? 'א׳' : 'ב׳'}`, rows, widths: [22, 10, ...cols.map(() => 14), 13, 11, 9, 11] });
  }
  const w1 = Number(group.annual_weight_h1), w2 = Number(group.annual_weight_h2);
  const rows: (string | number | null)[][] = [['תלמיד', 'כיתת אם', 'סופי מחצית א׳', 'סופי מחצית ב׳', 'שנתי מחושב', 'שנתי סופי']];
  for (const s of students) {
    const f1 = storedFinal(db, group.id, s.id, 'h1')?.value ?? null, f2 = storedFinal(db, group.id, s.id, 'h2')?.value ?? null;
    const a = computeAnnual(f1, f2, w1, w2);
    rows.push([label(s), s.home_class, f1, f2, a.calculatedRounded, finalStatus(storedFinal(db, group.id, s.id, 'annual'), a.calculated).value]);
  }
  sheets.push({ name: 'שנתי', rows, widths: [22, 10, 14, 14, 13, 12] });
  return sheets;
}

export function exportXlsx(db: DB, group: StudyGroup) {
  downloadBytes(`ציונים-${group.name}-${new Date().toISOString().slice(0, 10)}.xlsx`, buildXlsx(groupSheets(db, group)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
