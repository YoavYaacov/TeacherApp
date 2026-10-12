import { SortTh, sortRows, useSort } from '../sort';
import { useMemo, useState } from 'react';
import { Download, FileUp, Plus, Search, UserMinus, UserPlus, ClipboardPaste, Undo2, ArrowLeftRight, Sparkles } from 'lucide-react';
import { useStore, type Store } from '../../data/store';
import { Modal } from '../Modal';
import { useNav } from '../nav';
import { download, hebSort, normalizeClass, parseStudentLine, toCSV, today } from '../../lib/util';
import { activeStudents, label } from '../../lib/domain';
import { studentGrades, termConfig, storedFinal } from '../../lib/gradebook';
import { computeAnnual, computeTerm } from '../../engine/grades';
import type { Student, StudyGroup } from '../../data/types';

const same = (s: Student, last: string, first: string, cls: string | null) =>
  s.last_name === last && s.first_name === first && (s.home_class ?? null) === cls;

/** מוסיף תלמיד לקבוצה (find-or-create) — מחזיר מצב. */
async function addToGroup(store: Store, groupId: string, last: string, first: string, cls: string | null): Promise<'created' | 'existing' | 'duplicate'> {
  const { db } = store;
  let st = db.students.find((s) => same(s, last, first, cls));
  const result: 'created' | 'existing' = st ? 'existing' : 'created';
  if (st && db.enrollments.some((e) => e.student_id === st!.id && e.group_id === groupId && !e.left_at)) return 'duplicate';
  if (!st) [st] = await store.save('students', [{ last_name: last, first_name: first, home_class: cls, archived_at: null }]);
  await store.save('enrollments', [{ student_id: st.id, group_id: groupId, joined_at: today(), left_at: null }]);
  return result;
}

export function StudentsTab({ group }: { group: StudyGroup }) {
  const store = useStore();
  const { db } = store;
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const sort = useSort<'name' | 'class' | 'date'>('name', { date: 'desc' });
  const [archive, setArchive] = useState(false);
  const [modal, setModal] = useState<null | 'add' | 'paste' | { card: Student } | { move: Student }>(null);

  const rows = useMemo(() => {
    const enr = db.enrollments.filter((e) => e.group_id === group.id);
    const list = archive
      ? enr.filter((e) => e.left_at && !enr.some((o) => o.student_id === e.student_id && !o.left_at)).map((e) => ({ e, s: db.students.find((s) => s.id === e.student_id)! }))
      : enr.filter((e) => !e.left_at).map((e) => ({ e, s: db.students.find((s) => s.id === e.student_id)! }));
    // בארכיון: רשומת הגריעה האחרונה לכל תלמיד
    const uniq = new Map<string, (typeof list)[number]>();
    list.forEach((r) => { const p = uniq.get(r.s?.id); if (r.s && (!p || (r.e.left_at ?? '') > (p.e.left_at ?? ''))) uniq.set(r.s.id, r); });
    return [...uniq.values()]
      .filter(({ s }) => (!cls || s.home_class === cls) && label(s).includes(q.trim()))
  }, [db, group.id, archive, q, cls]);
  const sorted = useMemo(() => sortRows(rows, ({ s, e }, k) => k === 'name' ? label(s) : k === 'class' ? s.home_class : (archive ? e.left_at : e.joined_at), sort.key, sort.dir, (a, b) => hebSort(label(a.s), label(b.s))), [rows, sort.key, sort.dir, archive]);
  const classes = [...new Set(db.students.map((s) => s.home_class).filter((c): c is string => !!c))].sort(hebSort);

  const remove = async (studentId: string) => {
    const s = db.students.find((x) => x.id === studentId)!;
    if (!confirm(`לגרוע את ${label(s)} מהקבוצה? הציונים נשמרים והתלמיד עובר לארכיון.`)) return;
    const e = db.enrollments.find((x) => x.student_id === studentId && x.group_id === group.id && !x.left_at)!;
    await store.patch('enrollments', e.id, { left_at: today() });
  };
  const restoreStudent = async (s: Student) => {
    await store.save('enrollments', [{ student_id: s.id, group_id: group.id, joined_at: today(), left_at: null }]);
  };

  const exportCsv = () => download(`תלמידים-${group.name}.csv`, toCSV([['שם משפחה', 'שם פרטי', 'כיתת אם'], ...activeStudents(db, group.id).sort((a, b) => hebSort(label(a), label(b))).map((s) => [s.last_name, s.first_name, s.home_class])]));

  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="תצוגה"><button aria-pressed={!archive} onClick={() => setArchive(false)}>פעילים</button><button aria-pressed={archive} onClick={() => setArchive(true)}>ארכיון</button></div>
        <label className="search"><Search size={16} aria-hidden /><input aria-label="חיפוש תלמיד" placeholder="חיפוש לפי שם" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="input" aria-label="סינון לפי כיתת אם" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">כל הכיתות</option>{classes.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="toolbar actions-row">
        {archive ? <span className="muted">תלמידים שנגרעו מהקבוצה. הציונים שלהם נשמרים; אפשר לשחזר או להעביר.</span> : <>
          <button className="btn primary" onClick={() => setModal('add')}><UserPlus size={16} aria-hidden />הוסף תלמיד</button>
          <button className="btn" onClick={() => setModal('paste')}><ClipboardPaste size={16} aria-hidden />ייבוא רשימה</button>
          <span className="spacer" />
          <button className="icon-btn" aria-label="ייצוא" title="ייצוא CSV" onClick={exportCsv}><Download size={18} /></button></>}
      </div>
      <div className="card flush">
        {rows.length === 0 ? <p className="muted pad">{archive ? 'אין תלמידים בארכיון' : 'אין תלמידים. הוסף תלמיד או הדבק רשימה.'}</p> :
          <table className="dt students"><thead><tr><SortTh k="name" sort={sort}>שם</SortTh><SortTh k="class" sort={sort}>כיתת אם</SortTh><SortTh k="date" sort={sort}>{archive ? 'נגרע בתאריך' : 'הצטרף'}</SortTh><th /></tr></thead>
            <tbody>{sorted.map(({ e, s }) => (
              <tr key={e.id}>
                <td><button className="linklike plain" onClick={() => setModal({ card: s })}>{label(s)}</button></td>
                <td>{s.home_class ? <span className="badge">{s.home_class}</span> : '—'}</td>
                <td className="muted">{new Date((archive ? e.left_at : e.joined_at)!).toLocaleDateString('he-IL')}</td>
                <td className="actions">
                  <button className="btn primary sm" onClick={() => setModal({ card: s })}>כרטיס</button>
                  <button className="icon-btn" aria-label="העבר" title="העבר לקבוצה אחרת" onClick={() => setModal({ move: s })}><ArrowLeftRight size={16} /></button>
                  {archive
                    ? <button className="icon-btn" aria-label="שחזר" title="שחזר לקבוצה" onClick={() => restoreStudent(s)}><Undo2 size={16} /></button>
                    : <button className="icon-btn" aria-label="גרע" title="גרע מהקבוצה" onClick={() => remove(s.id)}><UserMinus size={16} /></button>}
                </td></tr>))}</tbody></table>}
      </div>
      {modal === 'add' && <AddStudent group={group} onClose={() => setModal(null)} />}
      {modal === 'paste' && <PasteImport group={group} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'card' in modal && <StudentCard student={modal.card} groupId={group.id} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'move' in modal && <MoveStudent student={modal.move} from={group} onClose={() => setModal(null)} />}
    </>
  );
}

function AddStudent({ group, onClose }: { group: StudyGroup; onClose: () => void }) {
  const store = useStore();
  const [last, setLast] = useState(''); const [first, setFirst] = useState(''); const [cls, setCls] = useState('');
  const [msg, setMsg] = useState('');
  const go = async (again: boolean) => {
    const r = await addToGroup(store, group.id, last.trim(), first.trim(), normalizeClass(cls));
    if (r === 'duplicate') { setMsg('התלמיד כבר פעיל בקבוצה הזו.'); return; }
    if (again) { setMsg(r === 'existing' ? 'תלמיד קיים צורף לקבוצה.' : 'נוסף.'); setLast(''); setFirst(''); } else onClose();
  };
  return (
    <Modal title="הוספת תלמיד" onClose={onClose}><div className="form">
      <label className="field">שם משפחה<input className="input" autoFocus value={last} onChange={(e) => setLast(e.target.value)} /></label>
      <label className="field">שם פרטי<input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
      <label className="field">כיתת אם<input className="input" value={cls} onChange={(e) => setCls(e.target.value)} placeholder="ז׳1" /></label>
      <p className="muted">תלמיד בעל אותו שם וכיתה שכבר קיים במערכת (בקבוצה אחרת) יצורף ולא ייווצר שוב.</p>
      {msg && <p role="status">{msg}</p>}
      <div className="row"><button className="btn primary" disabled={!last.trim() || !first.trim()} onClick={() => go(false)}>הוסף</button>
        <button className="btn" disabled={!last.trim() || !first.trim()} onClick={() => go(true)}><Plus size={14} aria-hidden />הוסף והמשך</button></div>
    </div></Modal>
  );
}

function PasteImport({ group, onClose }: { group: StudyGroup; onClose: () => void }) {
  const store = useStore();
  const [text, setText] = useState('');
  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/);
    const body = lines.length && /משפחה|שם|כיתה/.test(lines[0]) && !/\d/.test(lines[0]) ? lines.slice(1) : lines;
    return body.map((l) => ({ l, p: parseStudentLine(l) })).filter((x) => x.l.trim()).map(({ l, p }) => {
      if (!p) return { l, p, status: 'invalid' as const };
      const st = store.db.students.find((s) => same(s, p.last, p.first, p.cls));
      if (st && store.db.enrollments.some((e) => e.student_id === st.id && e.group_id === group.id && !e.left_at)) return { l, p, status: 'dup' as const };
      return { l, p, status: st ? ('existing' as const) : ('new' as const) };
    });
  }, [text, store.db, group.id]);
  // כפילויות בתוך הרשימה עצמה
  const seen = new Set<string>();
  const rows = parsed.map((r) => { if (!r.p) return r; const k = `${r.p.last}|${r.p.first}|${r.p.cls}`; if (seen.has(k)) return { ...r, status: 'dup' as const }; seen.add(k); return r; });
  const ok = rows.filter((r) => r.status === 'new' || r.status === 'existing');
  const [busy, setBusy] = useState(false);
  const doImport = async () => {
    setBusy(true);
    const newOnes = ok.filter((r) => r.status === 'new');
    const saved = newOnes.length ? await store.save('students', newOnes.map((r) => ({ last_name: r.p!.last, first_name: r.p!.first, home_class: r.p!.cls, archived_at: null }))) : [];
    const ids = [...saved.map((s) => s.id), ...ok.filter((r) => r.status === 'existing').map((r) => store.db.students.find((s) => same(s, r.p!.last, r.p!.first, r.p!.cls))!.id)];
    await store.save('enrollments', ids.map((sid) => ({ student_id: sid, group_id: group.id, joined_at: today(), left_at: null })));
    onClose();
  };
  const onFile = async (f: File | undefined) => { if (f) setText(await f.text()); };
  const statusTxt = { new: 'חדש', existing: 'קיים במערכת, יצורף', dup: 'כפילות, ידולג', invalid: 'שורה לא תקינה' } as const;
  return (
    <Modal title="הדבקת רשימה / ייבוא" onClose={onClose} wide><div className="form">
      <p className="muted">הדבק שמות (גם מ-Excel): בכל שורה שם משפחה, שם פרטי ואופציונלית כיתת אם. אפשר גם לטעון קובץ CSV.</p>
      <textarea className="input" rows={6} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={'כהן\tדני\tז׳1\nלוי\tמיכל\tז׳2'} dir="rtl" />
      <label className="btn" style={{ width: 'fit-content' }}><FileUp size={16} aria-hidden />טען קובץ CSV<input type="file" accept=".csv,.txt,.tsv" hidden onChange={(e) => void onFile(e.target.files?.[0])} /></label>
      {rows.length > 0 && <div className="gridwrap" style={{ maxHeight: 240 }}><table className="gb"><thead><tr><th>משפחה</th><th>פרטי</th><th>כיתה</th><th>מצב</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td>{r.p?.last ?? r.l}</td><td>{r.p?.first}</td><td>{r.p?.cls}</td><td className={r.status === 'invalid' ? 'bad' : ''}>{statusTxt[r.status]}</td></tr>)}</tbody></table></div>}
      <button className="btn primary" disabled={ok.length === 0 || busy} onClick={doImport}>ייבא {ok.length} תלמידים</button>
    </div></Modal>
  );
}

function MoveStudent({ student, from, onClose }: { student: Student; from: StudyGroup; onClose: () => void }) {
  const store = useStore();
  const targets = store.db.study_groups.filter((g) => !g.archived_at && g.id !== from.id);
  const [to, setTo] = useState(targets[0]?.id ?? '');
  const go = async () => {
    const cur = store.db.enrollments.find((e) => e.student_id === student.id && e.group_id === from.id && !e.left_at);
    if (cur) await store.patch('enrollments', cur.id, { left_at: today() });
    if (!store.db.enrollments.some((e) => e.student_id === student.id && e.group_id === to && !e.left_at))
      await store.save('enrollments', [{ student_id: student.id, group_id: to, joined_at: today(), left_at: null }]);
    onClose();
  };
  return <Modal title={`העברת ${label(student)}`} onClose={onClose}><div className="form">
    {targets.length === 0 ? <p>אין קבוצה אחרת להעברה אליה.</p> : <>
      <label className="field">קבוצת יעד<select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{targets.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <p className="muted">הציונים בקבוצה הנוכחית נשמרים בהיסטוריה.</p>
      <button className="btn primary" onClick={go}>העבר</button></>}
  </div></Modal>;
}

export function StudentCard({ student, onClose, groupId }: { student: Student; onClose: () => void; groupId?: string }) {
  const store = useStore(); const { openAssistant } = useNav();
  const { db } = store;
  const [last, setLast] = useState(student.last_name); const [first, setFirst] = useState(student.first_name); const [cls, setCls] = useState(student.home_class ?? ''); const [gender, setGender] = useState<'m' | 'f' | ''>(student.gender ?? '');
  const groupIds = [...new Set(db.enrollments.filter((e) => e.student_id === student.id).map((e) => e.group_id))];
  const evals = db.ai_evaluations.filter((e) => e.student_id === student.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const val = (gid: string, term: 1 | 2) => {
    const cfg = termConfig(db, gid, term);
    const events = db.assessment_events.filter((e) => e.group_id === gid && e.term === term);
    const calc = computeTerm(cfg, studentGrades(db, student.id, events)).calculatedRounded;
    const fin = storedFinal(db, gid, student.id, term === 1 ? 'h1' : 'h2');
    return { calc, fin: fin?.value ?? null };
  };
  return (
    <Modal title="כרטיס תלמיד" onClose={onClose}><div className="form">
      <div className="row"><label className="field">משפחה<input className="input" value={last} onChange={(e) => setLast(e.target.value)} /></label>
        <label className="field">פרטי<input className="input" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        <label className="field">כיתת אם<input className="input" value={cls} onChange={(e) => setCls(e.target.value)} /></label>
        <label className="field">מגדר (לניסוח הערכות)<select className="input" value={gender} onChange={(e) => setGender(e.target.value as 'm' | 'f' | '')}><option value="">לא צוין</option><option value="m">זכר</option><option value="f">נקבה</option></select></label></div>
      <button className="btn primary" style={{ width: 'fit-content' }} onClick={async () => { await store.patch('students', student.id, { last_name: last.trim(), first_name: first.trim(), home_class: normalizeClass(cls), gender: gender || null }); onClose(); }}>שמור פרטים</button>
      <h2>ציונים</h2>
      {groupIds.length === 0 ? <p className="muted">אין שיוך לקבוצות</p> :
        <table className="gb"><thead><tr><th>קבוצה</th><th>מחצית א׳</th><th>מחצית ב׳</th><th>שנתי</th></tr></thead><tbody>{groupIds.map((gid) => {
          const g = db.study_groups.find((x) => x.id === gid)!;
          const a = val(gid, 1), b = val(gid, 2);
          const f1 = a.fin, f2 = b.fin;
          const annual = computeAnnual(f1, f2, Number(g.annual_weight_h1), Number(g.annual_weight_h2)).calculatedRounded;
          const show = (v: { calc: number | null; fin: number | null }) => v.fin !== null ? <span className="ok-text">{v.fin}</span> : v.calc !== null ? <span className="bad-text">{v.calc}</span> : '—';
          return <tr key={gid}><td>{g.name}</td><td>{show(a)}</td><td>{show(b)}</td><td>{annual ?? '—'}</td></tr>;
        })}</tbody></table>}
      <p className="muted">ירוק = ציון סופי מאושר; אדום = ציון מחושב שטרם אושר.</p>
      {groupIds.length > 0 && <button className="btn" style={{ width: 'fit-content' }} onClick={() => { onClose(); openAssistant({ kind: 'student', group_id: groupId && groupIds.includes(groupId) ? groupId : groupIds[0], student_id: student.id }); }}><Sparkles size={16} aria-hidden />ניתוח AI</button>}
      {evals.length > 0 && <><h2>הערכות תעודה שמורות</h2>{evals.map((e) => <div key={e.id} className="ai-card"><strong>{db.study_groups.find((g) => g.id === e.group_id)?.name} · {e.period === 'h1' ? 'מחצית א׳' : e.period === 'h2' ? 'מחצית ב׳' : 'שנתי'}</strong><p dir="auto" style={{ margin: '6px 0' }}>{e.text}</p><button className="btn sm" onClick={() => void navigator.clipboard?.writeText(e.text)}>העתק</button></div>)}</>}
    </div></Modal>
  );
}
