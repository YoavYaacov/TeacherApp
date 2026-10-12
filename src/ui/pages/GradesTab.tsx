import { useMemo, useState } from 'react';
import { CheckCheck, Download, Settings2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { activeStudents, activeTerm, groupYear, label } from '../../lib/domain';
import { storedFinal, studentGrades, termConfig } from '../../lib/gradebook';
import { approveCalculated, computeAnnual, computeTerm, finalStatus, roundHalfUp, validateTermConfig } from '../../engine/grades';
import { download, hebSort, toCSV } from '../../lib/util';
import type { StudyGroup, Student } from '../../data/types';
import { FinalCell, GradeInput, useGradeActions } from './GradeParts';
import { ConfigModal } from './GradeConfig';
import { EventFocus } from './EventFocus';
import { parseCell } from '../../lib/gradebook';
import { Modal } from '../Modal';
import type { MakeupPolicy } from '../../engine/types';

type View = 'h1' | 'h2' | 'annual';
const POLICY: { id: MakeupPolicy; label: string }[] = [{ id: 'best', label: 'הגבוה' }, { id: 'latest', label: 'האחרון' }, { id: 'average', label: 'ממוצע' }];

export function GradesTab({ group }: { group: StudyGroup }) {
  const store = useStore();
  const year = groupYear(store.db, group);
  const [view, setView] = useState<View>(activeTerm(year) === 2 ? 'h2' : 'h1');
  // סדר DOM: מחצית א׳, מחצית ב׳, שנתי => מחצית א׳ בימין
  return (
    <>
      <div className="seg" role="group" aria-label="תצוגת ציונים" style={{ marginBottom: 16 }}>
        <button data-testid="view-h1" aria-pressed={view === 'h1'} onClick={() => setView('h1')}>מחצית א׳</button>
        <button data-testid="view-h2" aria-pressed={view === 'h2'} onClick={() => setView('h2')}>מחצית ב׳</button>
        <button data-testid="view-annual" aria-pressed={view === 'annual'} onClick={() => setView('annual')}>שנתי</button>
      </div>
      {view === 'annual' ? <AnnualGrid group={group} /> : <TermGrid group={group} term={view === 'h1' ? 1 : 2} />}
    </>
  );
}

function TermGrid({ group, term }: { group: StudyGroup; term: 1 | 2 }) {
  const store = useStore();
  const { db } = store;
  const commit = useGradeActions();
  const period = term === 1 ? 'h1' : 'h2';
  const [config, setConfig] = useState(false);
  const [focusEvent, setFocusEvent] = useState<string | null>(null);
  const [ovr, setOvr] = useState<{ sid: string; eid: string } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'class'>('name');
  const cfg = useMemo(() => termConfig(db, group.id, term), [db, group.id, term]);
  const issues = validateTermConfig(cfg);
  const eventRows = cfg.categories.flatMap((c) => c.events.filter((e) => !e.cancelled).map((e) => ({ e, cat: c.name, row: db.assessment_events.find((x) => x.id === e.id)! })));
  const allEventRows = db.assessment_events.filter((e) => e.group_id === group.id && e.term === term);
  const students = activeStudents(db, group.id).sort((a, b) => sortBy === 'class' ? hebSort(a.home_class ?? '', b.home_class ?? '') || hebSort(label(a), label(b)) : hebSort(label(a), label(b)));

  const results = students.map((s) => {
    const g = studentGrades(db, s.id, allEventRows);
    const r = computeTerm(cfg, g);
    const fin = finalStatus(storedFinal(db, group.id, s.id, period), r.calculated);
    return { s, g, r, fin };
  });
  const setFinal = (sid: string, v: number | null, calc: number | null) => {
    if (v === null) store.delFast('final_grades', { group_id: group.id, student_id: sid, period });
    else store.saveFast('final_grades', [{ group_id: group.id, student_id: sid, period, value: v, source: 'override', basis_calculated: calc }]);
  };
  const approve = (sid: string, calc: number) => { const f = approveCalculated(calc); store.saveFast('final_grades', [{ group_id: group.id, student_id: sid, period, value: f.value, source: 'approved', basis_calculated: calc }]); };
  const approvable = results.filter((x) => x.r.calculated !== null && !x.r.partial && x.fin.value === null);
  const approveAll = () => { if (confirm(`לאשר כסופי ${approvable.length} ציונים מחושבים מלאים (ללא חישוב חלקי)?`)) approvable.forEach((x) => approve(x.s.id, x.r.calculated as number)); };

  const onPaste = (ev: React.ClipboardEvent) => {
    const t = ev.target as HTMLInputElement;
    if (!t.dataset || t.dataset.att !== '1' || t.dataset.r === undefined) return;
    const text = ev.clipboardData.getData('text');
    const matrix = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    if (matrix.length === 1 && matrix[0].length === 1) return; // הדבקה רגילה
    ev.preventDefault();
    const r0 = Number(t.dataset.r), c0 = Number(t.dataset.c);
    let bad = 0;
    matrix.forEach((row, i) => row.forEach((val, j) => {
      const s = students[r0 + i], e = eventRows[c0 + j];
      if (!s || !e) return;
      if (parseCell(val) === null || !commit(s.id, e.e.id, 1, val)) bad++;
    }));
    if (bad) alert(`${bad} תאים לא הודבקו (ערך לא חוקי).`);
  };

  const exportCsv = () => download(`ציונים-${group.name}-מחצית-${term === 1 ? 'א' : 'ב'}.csv`, toCSV([
    ['שם', 'כיתת אם', ...eventRows.map((x) => `${x.row.title} (${x.cat})`), 'ממוצע ביניים', 'חלקי', 'סופי'],
    ...results.map(({ s, g, r, fin }) => [label(s), s.home_class, ...eventRows.map((x) => { const v = r.categories.flatMap((c) => Object.entries(c.effective)).find(([id]) => id === x.e.id); return v ? roundHalfUp(v[1], 2) : (g[x.e.id].a.kind === 'exempt' ? 'פטור' : g[x.e.id].a.kind === 'absent' ? 'לא נבחן' : ''); }), r.calculatedRounded, r.partial ? 'כן' : '', fin.value]),
  ]));

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => setConfig(true)}><Settings2 size={16} aria-hidden />הגדרות הערכה</button>
        <button className="btn" disabled={approvable.length === 0} onClick={approveAll}><CheckCheck size={16} aria-hidden />אשר את כל המלאים ({approvable.length})</button>
        <button className="icon-btn" aria-label="ייצוא CSV" title="ייצוא CSV" onClick={exportCsv}><Download size={18} /></button>
        <select className="input" aria-label="מיון" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'class')}><option value="name">מיון: שם</option><option value="class">מיון: כיתת אם</option></select>
      </div>
      {issues.map((i, k) => <p key={k} className="issue" role="alert">{i.message}</p>)}
      {cfg.categories.length === 0 && <div className="card"><p>עדיין לא הוגדרו קטגוריות הערכה למחצית הזו. פתח ״הגדרות הערכה״ כדי להגדיר קטגוריות (מבחנים, בוחנים…) ואירועי הערכה.</p></div>}
      {cfg.categories.length > 0 && <>
        <p className="muted">הזנה: מספר 0–100, ״פ״ = פטור, ״ל״ = לא נבחן, ריק = לא הוזן. אפשר להדביק טווח מ-Excel. לחיצה על שם אירוע: הזנה מרוכזת, מועד ב׳ ומדיניות. אדום = חישוב חלקי, ירוק = ציון סופי מאושר.</p>
        <div className="gridwrap card flush"><table className="gb" onPaste={onPaste}>
          <thead><tr><th className="name">תלמיד</th>
            {eventRows.map((x) => (
              <th key={x.e.id}><button className="linklike plain" onClick={() => setFocusEvent(x.e.id)} title="הזנה מרוכזת, מועד ב׳ ומדיניות">{x.row.title}</button><div className="muted">{x.cat}</div>
              </th>))}
            <th>ממוצע</th><th>סופי</th></tr></thead>
          <tbody>{results.map(({ s, g, r, fin }, ri) => {
            const dropped = new Set(r.categories.map((c) => c.droppedEventId));
            return (
              <tr key={s.id}><td className="name">{label(s)}</td>
                {eventRows.map((x, ci) => {
                  const gb = g[x.e.id];
                  const bothScores = gb.a.kind === 'score' && gb.b?.kind === 'score';
                  const effPolicy = gb.policyOverride ?? x.row.makeup_policy;
                  const a = db.grades.find((q) => q.event_id === x.e.id && q.student_id === s.id && q.attempt === 1);
                  const b = db.grades.find((q) => q.event_id === x.e.id && q.student_id === s.id && q.attempt === 2);
                  return (
                    <td key={x.e.id} className={dropped.has(x.e.id) ? 'dropped' : ''}>
                      <GradeInput cur={a} r={ri} c={ci} att={1} label={`${label(s)} ${x.row.title}`} onCommit={(t) => commit(s.id, x.e.id, 1, t)} />
                      {b && <GradeInput cur={b} r={ri} c={ci} att={2} small label={`${label(s)} ${x.row.title} מועד ב׳`} onCommit={(t) => commit(s.id, x.e.id, 2, t)} />}
                      {bothScores && (
                        <button className={`ovr-btn${gb.policyOverride ? ' on' : ''}`} aria-label={`מדיניות מועד ב׳ ל${label(s)}`} title="מדיניות מועד ב׳ לתלמיד זה"
                          onClick={() => setOvr({ sid: s.id, eid: x.e.id })}>{POLICY.find((q) => q.id === effPolicy)?.label}{gb.policyOverride ? ' •' : ''}</button>)}
                    </td>);
                })}
                <td className={`calc${r.partial && r.calculated !== null ? ' bad' : ''}`} title={r.partial && r.calculated !== null ? 'חישוב חלקי: חסרים ציונים' : undefined}>{r.calculatedRounded ?? '—'}</td>
                <td><FinalCell label={`סופי ${label(s)}`} value={fin.value} source={fin.source} stale={fin.stale}
                  onSet={(v) => setFinal(s.id, v, r.calculated)} onApprove={() => approve(s.id, r.calculated as number)}
                  canApprove={r.calculated !== null && (fin.value === null || fin.stale)} /></td></tr>);
          })}</tbody>
        </table></div></>}
      {ovr && (() => {
        const st = students.find((q) => q.id === ovr.sid)!; const er = eventRows.find((q) => q.e.id === ovr.eid)!;
        const o = db.grade_policy_overrides.find((q) => q.event_id === ovr.eid && q.student_id === ovr.sid);
        const eff = o?.policy ?? er.row.makeup_policy;
        return <Modal title={`${label(st)} · ${er.row.title}`} onClose={() => setOvr(null)}>
          <p className="muted">איזה ציון קובע כשיש מועד א׳ ומועד ב׳. ברירת המחדל היא מדיניות המבחן ({POLICY.find((q) => q.id === er.row.makeup_policy)?.label}).</p>
          <span className="mini-seg big" role="group" aria-label="מדיניות לתלמיד">
            {POLICY.map((q) => <button key={q.id} aria-pressed={eff === q.id} onClick={() => store.saveFast('grade_policy_overrides', [{ event_id: ovr.eid, student_id: ovr.sid, policy: q.id }])}>{q.label}</button>)}
          </span>
          {o && <div style={{ marginTop: 12 }}><button className="btn" onClick={() => store.delFast('grade_policy_overrides', { event_id: ovr.eid, student_id: ovr.sid })}>חזור למדיניות המבחן</button></div>}
        </Modal>;
      })()}
      {config && <ConfigModal group={group} term={term} onClose={() => setConfig(false)} />}
      {focusEvent && <EventFocus group={group} eventId={focusEvent} students={students} onClose={() => setFocusEvent(null)} />}
    </>
  );
}

function AnnualGrid({ group }: { group: StudyGroup }) {
  const store = useStore();
  const { db } = store;
  const w1 = Number(group.annual_weight_h1), w2 = Number(group.annual_weight_h2);
  const students = activeStudents(db, group.id).sort((a: Student, b: Student) => hebSort(label(a), label(b)));
  const rows = students.map((s) => {
    const f1 = storedFinal(db, group.id, s.id, 'h1')?.value ?? null, f2 = storedFinal(db, group.id, s.id, 'h2')?.value ?? null;
    const a = computeAnnual(f1, f2, w1, w2);
    const fin = finalStatus(storedFinal(db, group.id, s.id, 'annual'), a.calculated);
    return { s, f1, f2, a, fin };
  });
  const approve = (sid: string, calc: number) => { const f = approveCalculated(calc); store.saveFast('final_grades', [{ group_id: group.id, student_id: sid, period: 'annual', value: f.value, source: 'approved', basis_calculated: calc }]); };
  const exportCsv = () => download(`ציונים-${group.name}-שנתי.csv`, toCSV([['שם', 'כיתת אם', 'סופי מחצית א׳', 'סופי מחצית ב׳', 'שנתי מחושב', 'שנתי סופי'], ...rows.map((r) => [label(r.s), r.s.home_class, r.f1, r.f2, r.a.calculatedRounded, r.fin.value])]));
  return (
    <>
      <div className="toolbar"><span className="spacer" /><button className="icon-btn" aria-label="ייצוא CSV" title="ייצוא CSV" onClick={exportCsv}><Download size={18} /></button></div>
      <p className="muted">ציון שנתי מחושב מהציונים הסופיים של שתי המחציות בלבד (משקלים {w1}/{w2}, ניתן לשינוי בעריכת הקבוצה). אם מחצית לא אושרה — אין ציון שנתי מחושב.</p>
      <div className="gridwrap card flush"><table className="gb"><thead><tr><th className="name">תלמיד</th><th>סופי מחצית א׳</th><th>סופי מחצית ב׳</th><th>שנתי מחושב</th><th>שנתי סופי</th></tr></thead>
        <tbody>{rows.map(({ s, f1, f2, a, fin }) => (
          <tr key={s.id}><td className="name">{label(s)}</td><td>{f1 ?? '—'}</td><td>{f2 ?? '—'}</td>
            <td className="calc">{a.calculatedRounded ?? <span className="muted">חסר: מחצית {a.missingTerms.map((t) => (t === 1 ? 'א׳' : 'ב׳')).join(' + ')}</span>}</td>
            <td><FinalCell label={`שנתי ${label(s)}`} value={fin.value} source={fin.source} stale={fin.stale}
              onSet={(v) => (v === null ? store.delFast('final_grades', { group_id: group.id, student_id: s.id, period: 'annual' }) : store.saveFast('final_grades', [{ group_id: group.id, student_id: s.id, period: 'annual', value: v, source: 'override', basis_calculated: a.calculated }]))}
              onApprove={() => approve(s.id, a.calculated as number)} canApprove={a.calculated !== null && (fin.value === null || fin.stale)} /></td></tr>))}</tbody></table></div>
    </>
  );
}
