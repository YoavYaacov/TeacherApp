import { SortTh, sortRows, useSort } from '../sort';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ClipboardList, Pencil, Plus, Trash2, Users, type LucideIcon } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { Modal } from '../Modal';
import { activeStudents, defaultYear } from '../../lib/domain';
import { validateAnnualWeights } from '../../engine/grades';
import type { StudyGroup } from '../../data/types';
import { LessonsTab } from './LessonsTab';
import { StudentsTab } from './StudentsTab';
import { GradesTab } from './GradesTab';
import { boot, saveView } from '../viewState';

export function GroupsPage() {
  const { groupId } = useNav();
  return groupId ? <GroupPage id={groupId} key={groupId} /> : <GroupsList />;
}

function GroupsList() {
  const store = useStore();
  const { go } = useNav();
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = store.db.study_groups.filter((g) => !!g.archived_at === showArchived)
  const sort = useSort<'name' | 'level' | 'count' | 'status'>('name', { count: 'desc' });
  const sortedList = sortRows(list, (g, k) => k === 'name' ? g.name : k === 'level' ? g.grade_level : k === 'count' ? activeStudents(store.db, g.id).length : (g.archived_at ? 1 : 0), sort.key, sort.dir, (a, b) => a.name.localeCompare(b.name, 'he'));
  return (
    <>
      <div className="pagehead"><h1>קבוצות לימוד</h1>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />קבוצה חדשה</button></div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="סינון">
          <button aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>פעילות</button>
          <button aria-pressed={showArchived} onClick={() => setShowArchived(true)}>ארכיון</button>
        </div>
      </div>
      <div className="card flush">
        {list.length === 0 ? <p className="muted pad">{showArchived ? 'אין קבוצות בארכיון' : 'עדיין אין קבוצות. לחץ על ״קבוצה חדשה״.'}</p> :
          <table className="dt"><thead><tr><SortTh k="name" sort={sort}>שם הקבוצה</SortTh><SortTh k="level" sort={sort}>שכבה</SortTh><SortTh k="count" sort={sort}>תלמידים</SortTh><SortTh k="status" sort={sort}>סטטוס</SortTh><th /></tr></thead>
            <tbody>{sortedList.map((g) => (
              <tr key={g.id}><td><strong>{g.name}</strong></td><td>{g.grade_level ?? '—'}</td><td>{activeStudents(store.db, g.id).length}</td>
                <td><span className={`badge ${g.archived_at ? '' : 'ok'}`}>{g.archived_at ? 'בארכיון' : 'פעילה'}</span></td>
                <td className="actions"><button className="btn primary sm" onClick={() => go('groups', g.id)}>פתח</button></td></tr>))}</tbody></table>}
      </div>
      {adding && <GroupForm onClose={() => setAdding(false)} onSaved={(g) => go('groups', g.id)} />}
    </>
  );
}

function GroupForm({ group, onClose, onSaved }: { group?: StudyGroup; onClose: () => void; onSaved?: (g: StudyGroup) => void }) {
  const store = useStore();
  const { db } = store;
  const years = db.academic_years.filter((y) => !y.archived_at);
  const [name, setName] = useState(group?.name ?? '');
  const [level, setLevel] = useState(group?.grade_level ?? '');
  const [yearId, setYearId] = useState(group?.academic_year_id ?? years[0]?.id ?? '');
  const [w1, setW1] = useState(String(group?.annual_weight_h1 ?? 50));
  const [w2, setW2] = useState(String(group?.annual_weight_h2 ?? 50));
  const issues = validateAnnualWeights(Number(w1), Number(w2));
  const submit = async () => {
    let year = yearId;
    if (!year) { const [y] = await store.save('academic_years', [{ ...defaultYear(), archived_at: null }]); year = y.id; }
    const fields = { academic_year_id: year, name: name.trim(), grade_level: level.trim() || null, annual_weight_h1: Number(w1), annual_weight_h2: Number(w2) };
    if (group) { await store.patch('study_groups', group.id, fields); onClose(); return; }
    const [g] = await store.save('study_groups', [{ ...fields, subject: 'מתמטיקה', archived_at: null }]);
    onSaved?.(g); onClose();
  };
  return (
    <Modal title={group ? 'עריכת קבוצה' : 'קבוצת לימוד חדשה'} onClose={onClose}>
      <div className="form">
        <label className="field fl"><span>שם הקבוצה</span><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מתמטיקה ז׳ 1" /></label>
        <label className="field fl"><span>שכבה</span><input className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="ז׳" /></label>
        {years.length > 1 && <label className="field fl"><span>שנת לימודים</span><select className="input" value={yearId} onChange={(e) => setYearId(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>}
        {group && <div className="row"><label className="field fl"><span>משקל מחצית א׳ בשנתי (%)</span><input className="input" inputMode="decimal" value={w1} onChange={(e) => setW1(e.target.value)} /></label>
          <label className="field fl"><span>משקל מחצית ב׳ (%)</span><input className="input" inputMode="decimal" value={w2} onChange={(e) => setW2(e.target.value)} /></label></div>}
        {issues.map((i) => <p key={i.code} className="issue" role="alert">{i.message}</p>)}
        <div className="row"><button className="btn primary" disabled={!name.trim() || issues.length > 0} onClick={submit}>שמור</button>
          {group && (group.archived_at
            ? <button className="btn" onClick={async () => { await store.patch('study_groups', group.id, { archived_at: null }); onClose(); }}>שחזר מהארכיון</button>
            : <button className="btn" onClick={async () => { if (confirm('להעביר את הקבוצה לארכיון?\nהנתונים נשמרים, ושיעורי הקבוצה יוסתרו מהיומן עד לשחזור. ניתן לשחזר בכל עת.')) { await store.patch('study_groups', group.id, { archived_at: new Date().toISOString() }); onClose(); } }}>העבר לארכיון</button>)}
        </div>
        {group?.archived_at && <DangerZone group={group} onClose={onClose} />}
      </div>
    </Modal>
  );
}

/** פעולות הרסניות; מוצגות רק לקבוצה בארכיון. אין מחיקה אחת-לחיצה: צריך להקליד את שם הקבוצה. */
function DangerZone({ group, onClose }: { group: StudyGroup; onClose: () => void }) {
  const store = useStore();
  const { go } = useNav();
  const [mode, setMode] = useState<null | 'lessons' | 'group'>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const confirmRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode) { confirmRef.current?.focus({ preventScroll: true }); confirmRef.current?.scrollIntoView({ block: 'center' }); } }, [mode]);
  const evs = store.db.calendar_events.filter((e) => e.group_id === group.id);
  const nInternal = evs.filter((e) => e.source === 'internal').length;
  const nStud = store.db.enrollments.filter((e) => e.group_id === group.id).length;
  const nGrades = store.db.grades.filter((x) => store.db.assessment_events.some((a) => a.id === x.event_id && a.group_id === group.id)).length;
  const run = async () => {
    setBusy(true); setErr('');
    try {
      if (mode === 'lessons') { await store.repo.deleteGroupLessons(group.id); await store.reload(); onClose(); return; }
      await store.repo.deleteGroup(group.id);
      // ניקוי כללי שיוך (כותרת → קבוצה) שהצביעו על הקבוצה שנמחקה
      const cur = store.db.user_settings[0];
      const rules = (cur?.prefs?.titleRules ?? {}) as Record<string, string>;
      if (Object.values(rules).includes(group.id)) {
        const next = Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== group.id));
        await store.repo.upsert('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), titleRules: next } }]);
      }
      await store.reload(); onClose(); go('groups');
    } catch (e) { setErr(`הפעולה נכשלה ושום דבר לא נמחק: ${(e as Error).message}`); setBusy(false); }
  };
  const ok = typed.trim() === group.name;
  return (
    <div className="danger-zone">
      <h3>ניהול קבוצה בארכיון</h3>
      {!mode && <div className="row">
        <button className="btn" onClick={() => { setMode('lessons'); setTyped(''); }}><Trash2 size={16} aria-hidden />מחק את שיעורי הקבוצה</button>
        <button className="btn danger" onClick={() => { setMode('group'); setTyped(''); }}><Trash2 size={16} aria-hidden />מחק קבוצה לצמיתות</button>
      </div>}
      {!mode && <p className="muted">שיעורי הקבוצה בארכיון מוסתרים אוטומטית מהיומן ומהדף הראשי, וחוזרים כשמשחזרים את הקבוצה. מחיקה היא פעולה נפרדת.</p>}
      {mode && <>
        <p>{mode === 'lessons'
          ? `יימחקו ${nInternal} שיעורים פנימיים עם התיעוד שלהם. ${evs.length - nInternal} אירועים מ-Google יוסרו מהקבוצה ויוסתרו (לא משתנה דבר ב-Google, ואפשר להחזיר אותם בהגדרות היומן). הקבוצה, התלמידים והציונים נשארים.`
          : `יימחקו לצמיתות: הקבוצה, ${nStud} רישומי תלמידים (תלמיד שאינו בקבוצה אחרת יימחק לגמרי), ${nGrades} ציונים, הגדרות הציונים וה${nInternal} שיעורים הפנימיים עם התיעוד. אירועי Google של הקבוצה יוסתרו ולא יימחקו מ-Google.`}</p>
        <p className="muted">לפני המחיקה נוצר אוטומטית גיבוי בתוך המערכת, ואפשר לשחזר ממנו דרך הגדרות ← גיבוי ושחזור.</p>
        <label className="field dz-confirm">להמשך, הקלד את שם הקבוצה: <strong>{group.name}</strong><input className="input" ref={confirmRef} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
        {err && <p className="issue" role="alert">{err}</p>}
        <div className="dz-actions"><button className="btn danger" disabled={!ok || busy} onClick={run}>{busy ? 'מוחק…' : mode === 'lessons' ? 'מחק שיעורים' : 'מחק קבוצה לצמיתות'}</button>
          <button className="btn" disabled={busy} onClick={() => setMode(null)}>ביטול</button></div>
      </>}
    </div>
  );
}

type GroupTab = 'lessons' | 'students' | 'grades';
let restoreTab: { tab: GroupTab; group: string } | null = boot.tab && boot.tabGroup ? { tab: boot.tab as GroupTab, group: boot.tabGroup } : null; // שחזור אחרי רענון, פעם אחת
let keepTab: GroupTab | null = null; // מעבר בין קבוצות שומר את הלשונית הנוכחית; כניסה מהרשימה תמיד לשיעורים
function GroupPage({ id }: { id: string }) {
  const store = useStore();
  const { go } = useNav();
  const group = store.db.study_groups.find((g) => g.id === id);
  const [tab, setTabRaw] = useState<GroupTab>(() => { const r = restoreTab && restoreTab.group === id ? restoreTab.tab : null; restoreTab = null; const t = keepTab ?? r ?? 'lessons'; keepTab = null; saveView({ tab: t, tabGroup: id }); return t; });
  const setTab = (t: GroupTab) => { setTabRaw(t); saveView({ tab: t, tabGroup: id }); }; // ברירת מחדל בכניסה: שיעורים
  const [editing, setEditing] = useState(false);
  if (!group) return <p>הקבוצה לא נמצאה. <button className="btn sm" onClick={() => go('groups')}>חזרה</button></p>;
  const others = store.db.study_groups.filter((g) => !g.archived_at && g.id !== id).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  // סדר DOM: שיעורים, תלמידים, ציונים => ב-RTL שיעורים בימין, ציונים בשמאל
  const tabs: { id: GroupTab; label: string; Icon: LucideIcon }[] = [
    { id: 'lessons', label: 'שיעורים', Icon: BookOpen },
    { id: 'students', label: 'תלמידים', Icon: Users },
    { id: 'grades', label: 'ציונים', Icon: ClipboardList },
  ];
  return (
    <>
      <div className="pagehead">
        <div><button className="linklike back" onClick={() => go('groups')}>← קבוצות לימוד</button>
          <h1>{group.name} {group.archived_at && <span className="badge">בארכיון</span>}</h1></div>
        {others.length > 0 && <select className="input" aria-label="מעבר לקבוצה אחרת" value="" onChange={(e) => { if (e.target.value) { keepTab = tab; go('groups', e.target.value); } }}>
          <option value="">מעבר לקבוצה…</option>{others.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
        <button className="btn" onClick={() => setEditing(true)}><Pencil size={16} aria-hidden />עריכה</button>
      </div>
      <div className="tabs" role="tablist" aria-label="לשוניות קבוצה">
        {tabs.map(({ id: t, label, Icon }) => (
          <button key={t} role="tab" className="tab" aria-selected={tab === t} data-testid={`tab-${t}`} onClick={() => setTab(t)}><Icon size={18} aria-hidden /> {label}</button>
        ))}
      </div>
      {tab === 'lessons' && <LessonsTab group={group} />}
      {tab === 'students' && <StudentsTab group={group} />}
      {tab === 'grades' && <GradesTab group={group} />}
      {editing && <GroupForm group={group} onClose={() => setEditing(false)} />}
    </>
  );
}
