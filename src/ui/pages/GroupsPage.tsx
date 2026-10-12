import { useState } from 'react';
import { BookOpen, ClipboardList, Pencil, Plus, Users, type LucideIcon } from 'lucide-react';
import { useStore } from '../../data/store';
import { useNav } from '../nav';
import { Modal } from '../Modal';
import { activeStudents, defaultYear } from '../../lib/domain';
import { validateAnnualWeights } from '../../engine/grades';
import type { StudyGroup } from '../../data/types';
import { LessonsTab } from './LessonsTab';
import { StudentsTab } from './StudentsTab';
import { GradesTab } from './GradesTab';

export function GroupsPage() {
  const { groupId } = useNav();
  return groupId ? <GroupPage id={groupId} key={groupId} /> : <GroupsList />;
}

function GroupsList() {
  const store = useStore();
  const { go } = useNav();
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const list = store.db.study_groups.filter((g) => !!g.archived_at === showArchived).sort((a, b) => a.name.localeCompare(b.name, 'he'));
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
          <table className="dt"><thead><tr><th>שם הקבוצה</th><th>שכבה</th><th>תלמידים</th><th>סטטוס</th><th /></tr></thead>
            <tbody>{list.map((g) => (
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
        <label className="field">שם הקבוצה<input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מתמטיקה ז׳ 1" /></label>
        <label className="field">שכבה<input className="input" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="ז׳" /></label>
        {years.length > 1 && <label className="field">שנת לימודים<select className="input" value={yearId} onChange={(e) => setYearId(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>}
        {group && <div className="row"><label className="field">משקל מחצית א׳ בשנתי (%)<input className="input" inputMode="decimal" value={w1} onChange={(e) => setW1(e.target.value)} /></label>
          <label className="field">משקל מחצית ב׳ (%)<input className="input" inputMode="decimal" value={w2} onChange={(e) => setW2(e.target.value)} /></label></div>}
        {issues.map((i) => <p key={i.code} className="issue" role="alert">{i.message}</p>)}
        <div className="row"><button className="btn primary" disabled={!name.trim() || issues.length > 0} onClick={submit}>שמור</button>
          {group && (group.archived_at
            ? <button className="btn" onClick={async () => { await store.patch('study_groups', group.id, { archived_at: null }); onClose(); }}>שחזר מהארכיון</button>
            : <button className="btn" onClick={async () => { if (confirm('להעביר את הקבוצה לארכיון? הנתונים נשמרים וניתן לשחזר.')) { await store.patch('study_groups', group.id, { archived_at: new Date().toISOString() }); onClose(); } }}>העבר לארכיון</button>)}
        </div>
      </div>
    </Modal>
  );
}

type GroupTab = 'lessons' | 'students' | 'grades';
function GroupPage({ id }: { id: string }) {
  const store = useStore();
  const { go } = useNav();
  const group = store.db.study_groups.find((g) => g.id === id);
  const [tab, setTab] = useState<GroupTab>('lessons'); // ברירת מחדל בכל כניסה: שיעורים
  const [editing, setEditing] = useState(false);
  if (!group) return <p>הקבוצה לא נמצאה. <button className="btn sm" onClick={() => go('groups')}>חזרה</button></p>;
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
