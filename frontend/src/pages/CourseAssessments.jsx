import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import CourseSubnav from '../components/CourseSubnav';
import SheetPreview from '../components/SheetPreview';
import { parseExamMetaFromRows, parseMarksFromRows, parseRosterFromRows, readSpreadsheetRows } from '../utils/excelImport';
import { coursesListLabel, coursesListPath, isLabCourse } from '../utils/offering';

const THEORY_BLOCKS = [
  { key: 'T1', label: 'T1' },
  { key: 'T2', label: 'T2' },
  { key: 'T3', label: 'T3' },
  { key: 'TA', label: 'TA / Project' },
  { key: 'FEEDBACK', label: 'CO Feedback' },
];

/** Lab Students & Marks sub-tabs (structure only for non-roster tabs). */
const LAB_PLACEHOLDER_TABS = [
  { id: 'mid_sem', label: 'Mid Sem' },
  { id: 'end_sem', label: 'End Sem' },
  { id: 'd2d', label: 'D2D' },
  { id: 'exit_survey', label: 'Exit Survey' },
  { id: 'co_attainment', label: 'CO Attainment' },
];

function list(data) {
  return data?.results ?? data ?? [];
}

function fmt(n, digits = 2) {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return num.toFixed(digits);
}

function LevelBadge({ level }) {
  if (level === null || level === undefined) return <span className="text-slate-300">—</span>;
  const colors = ['bg-slate-100 text-slate-500', 'bg-blue-100 text-blue-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800'];
  return (
    <span className={`inline-block min-w-[18px] px-1 rounded text-[10px] font-semibold ${colors[level] || colors[0]}`}>
      {level}
    </span>
  );
}

function BarChart({ title, items, unit = '' }) {
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 0.01);
  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.label}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span>{i.label}</span>
              <span className="font-semibold">{i.display ?? `${i.value}${unit}`}</span>
            </div>
            <div className="h-4 bg-slate-100 rounded overflow-hidden">
              <div className="h-4 rounded bg-blue-800" style={{ width: `${Math.min(100, ((Number(i.value) || 0) / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExcelUploadButton({ label = 'Upload Excel', disabled, onFile }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) await onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="bg-slate-200 px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50"
      >
        {label}
      </button>
    </>
  );
}

function ExamCoSummary({ summary, loading }) {
  const title = summary?.label ? `${summary.label} — CO summary` : 'CO summary';
  return (
    <section className="bg-white shadow rounded-lg p-6 overflow-auto">
      <h3 className="font-semibold mb-1">{title}</h3>
      {summary && (
        <p className="text-[11px] text-slate-500 mb-2">
          Target ≥ {summary.target_percent}% · Total {summary.total_students} · Appeared {summary.appeared}
          {summary.use_ceiling ? ' · ceiling on' : ''}
        </p>
      )}
      {loading && !summary && <p className="text-sm text-slate-500">Computing CO summary…</p>}
      {!loading && !summary && (
        <p className="text-sm text-slate-500">Save marks &amp; calculate to see this exam’s CO attainment.</p>
      )}
      {summary && (summary.cos || []).length > 0 && (
        <table className="w-full text-xs border-collapse max-w-3xl">
          <thead>
            <tr className="bg-slate-50">
              <th className="border p-1"> </th>
              {summary.cos.map((c) => (
                <th key={c.co_code} className="border p-1">{c.co_code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-1">No. scored ≥ target</td>
              {summary.cos.map((c) => (
                <td key={c.co_code} className="border p-1 text-center">{c.count_at_target}</td>
              ))}
            </tr>
            <tr>
              <td className="border p-1">% scored ≥ target</td>
              {summary.cos.map((c) => (
                <td key={c.co_code} className="border p-1 text-center">{fmt(c.pct_at_target, 1)}%</td>
              ))}
            </tr>
            <tr>
              <td className="border p-1">CO attainment level</td>
              {summary.cos.map((c) => (
                <td key={c.co_code} className="border p-1 text-center"><LevelBadge level={c.level} /></td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      {summary && !(summary.cos || []).length && (
        <p className="text-sm text-slate-500">No CO rows yet. Map questions to COs, then save marks.</p>
      )}
    </section>
  );
}

export default function CourseAssessments() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [grades, setGrades] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [tab, setTab] = useState('roster');
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({ roll_number: '', name: '' });
  const [bulkText, setBulkText] = useState('');
  const [marksGrid, setMarksGrid] = useState({});
  const [uploading, setUploading] = useState(false);

  const outcomes = course?.outcomes ?? [];
  const block = assessments.find((a) => a.assessment_type === tab) || null;

  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [courseRes, studentRes, assessmentRes, gradeRes] = await Promise.all([
        api.get(`/courses/${id}/`),
        api.get(`/assessments/students/?course=${id}`),
        api.get(`/assessments/?course=${id}`),
        api.get(`/assessments/grades/?course=${id}`),
      ]);
      setCourse(courseRes.data);
      setStudents(list(studentRes.data));
      if (isLabCourse(courseRes.data)) {
        setAssessments([]);
        setGrades(list(gradeRes.data));
        return;
      }
      const nextA = list(assessmentRes.data).filter((a) => THEORY_BLOCKS.some((b) => b.key === a.assessment_type));
      const unique = [];
      const seen = new Set();
      for (const a of nextA) {
        if (seen.has(a.assessment_type)) continue;
        seen.add(a.assessment_type);
        unique.push(a);
      }
      if (unique.length < THEORY_BLOCKS.length) {
        await api.post('/assessments/ensure/', { course: Number(id) });
        const refreshed = list((await api.get(`/assessments/?course=${id}`)).data)
          .filter((a) => THEORY_BLOCKS.some((b) => b.key === a.assessment_type));
        const uniq2 = [];
        const seen2 = new Set();
        for (const a of refreshed) {
          if (seen2.has(a.assessment_type)) continue;
          seen2.add(a.assessment_type);
          uniq2.push(a);
        }
        setAssessments(uniq2);
      } else {
        setAssessments(unique);
      }
      setGrades(list(gradeRes.data));
    } catch (err) {
      setError(formatError(err, 'Failed to load course data.'));
    } finally {
      setLoading(false);
    }
  }

  async function loadMarks(assessment) {
    if (!assessment) {
      setMarksGrid({});
      return;
    }
    const res = await api.get(`/assessments/marks/?assessment=${assessment.id}`);
    const next = {};
    list(res.data).forEach((row) => {
      if (row.question) next[`${row.student}-${row.question}`] = row.marks_obtained ?? '';
    });
    setMarksGrid(next);
  }

  useEffect(() => {
    setTab('roster');
    loadAll();
  }, [id]);

  useEffect(() => {
    if (block) loadMarks(block).catch(() => setError('Failed to load marks.'));
  }, [block?.id]);

  async function loadSheet() {
    setSheetLoading(true);
    setError('');
    try {
      const res = await api.get(`/attainments/sheet/?course=${id}`);
      setSheet(res.data);
    } catch (err) {
      setError(formatError(err, 'Could not compute attainment sheet.'));
    } finally {
      setSheetLoading(false);
    }
  }

  useEffect(() => {
    const examTab = THEORY_BLOCKS.some((b) => b.key === tab);
    if (tab === 'attainment' || tab === 'result' || examTab) loadSheet();
  }, [tab, id]);

  function patchBlock(fields) {
    setAssessments((prev) => prev.map((a) => (a.id === block.id ? { ...a, ...fields } : a)));
  }

  function patchQuestions(questions) {
    patchBlock({ questions });
  }

  async function addStudent(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/assessments/students/', { ...studentForm, course: Number(id) });
      setStudentForm({ roll_number: '', name: '' });
      await loadAll();
    } catch (err) {
      setError(formatError(err, 'Could not add student.'));
    }
  }

  async function addBulk(e) {
    e.preventDefault();
    setError('');
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const studentsRows = [];
    try {
      for (const line of lines) {
        if (/^roll/i.test(line) || /^enrol/i.test(line)) continue;
        const [roll_number, ...rest] = line.split(/[,\t]/).map((p) => p.trim());
        const name = rest.join(' ').trim();
        if (!roll_number || !name) continue;
        studentsRows.push({ roll_number, name });
      }
      if (!studentsRows.length) {
        setError('No valid enrol, name rows to import.');
        return;
      }
      const res = await api.post('/assessments/students/bulk/', {
        course: Number(id),
        mode: 'append',
        students: studentsRows,
      });
      setBulkText('');
      setStudents(res.data.students || []);
      setStatus(`Imported ${res.data.count} students (${res.data.created} new, ${res.data.updated} updated).`);
    } catch (err) {
      setError(formatError(err, 'Could not import students.'));
    }
  }

  async function importRosterExcel(file) {
    setError('');
    setStatus('');
    setUploading(true);
    try {
      const rows = await readSpreadsheetRows(file, { tab: 'roster' });
      const studentsRows = parseRosterFromRows(rows);
      if (!studentsRows.length) {
        setError('Could not find Enrol No and Name columns in that Excel file.');
        return;
      }
      const res = await api.post('/assessments/students/bulk/', {
        course: Number(id),
        mode: 'replace_order',
        students: studentsRows,
      });
      setStudents(res.data.students || []);
      setStatus(`Uploaded ${res.data.count} students from Excel (${res.data.created} new, ${res.data.updated} updated). Remove is still available on every row.`);
    } catch (err) {
      setError(formatError(err, 'Could not import roster from Excel.'));
    } finally {
      setUploading(false);
    }
  }

  async function deleteStudent(studentId) {
    if (!window.confirm('Remove this student and all their marks from this course offering?')) return;
    await api.delete(`/assessments/students/${studentId}/`);
    await loadAll();
    if (block) await loadMarks(block);
  }

  async function saveBlockSettings() {
    if (!block) return;
    setSaving(true);
    setError('');
    try {
      await api.patch(`/assessments/${block.id}/`, {
        exam_label: block.exam_label,
        target_percent: Number(block.target_percent) || 50,
        total_students: Number(block.total_students) || students.length,
        appeared: Number(block.appeared) || 0,
        use_ceiling: !!block.use_ceiling,
        questions: (block.questions || []).map((q, i) => ({
          id: q.id,
          key: q.key || `Q${i + 1}`,
          label: q.label,
          max_marks: q.max_marks,
          course_outcome: q.course_outcome || null,
          order: i,
        })),
      });
      setStatus('Settings saved.');
      await loadAll();
      await loadSheet();
    } catch (err) {
      setError(formatError(err, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  }

  async function persistMarks(grid, roster) {
    if (!block) return;
    const list = roster || students;
    const marks = [];
    for (const student of list) {
      for (const q of block.questions || []) {
        if (!q.id) continue;
        const raw = grid[`${student.id}-${q.id}`];
        if (raw === undefined || raw === '') continue;
        const num = Number(raw);
        if (Number.isNaN(num)) {
          setError(`Invalid mark for ${student.roll_number} / ${q.label}`);
          return false;
        }
        marks.push({ student: student.id, question: q.id, marks_obtained: num });
      }
    }
    const res = await api.post('/assessments/marks/replace/', { assessment: block.id, marks });
    if (res.data) {
      patchBlock({
        total_students: res.data.total_students,
        appeared: res.data.appeared,
      });
    }
    setSheet(null);
    await loadSheet();
    return marks.length;
  }

  async function saveMarks() {
    if (!block) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const n = await persistMarks(marksGrid, students);
      if (n === false) return;
      setStatus(`Saved ${n} marks.`);
    } catch (err) {
      setError(formatError(err, 'Could not save marks.'));
    } finally {
      setSaving(false);
    }
  }

  async function importMarksExcel(file) {
    if (!block) return;
    setError('');
    setStatus('');
    setUploading(true);
    try {
      const rows = await readSpreadsheetRows(file, { tab });
      const parsed = parseMarksFromRows(rows, block.questions || []);
      const meta = parseExamMetaFromRows(rows);
      if (!parsed.students.length && !Object.keys(parsed.marksByEnrol).length) {
        setError('Could not read marks. Use columns Enrol No, Name, then Q1, Q2, Q3, … matching this tab.');
        return;
      }
      let roster = students;
      if (parsed.students.length) {
        const res = await api.post('/assessments/students/bulk/', {
          course: Number(id),
          mode: 'replace_order',
          students: parsed.students,
        });
        roster = res.data.students || [];
        setStudents(roster);
      }
      const next = { ...marksGrid };
      let filled = 0;
      roster.forEach((s) => {
        const marks = parsed.marksByEnrol[(s.roll_number || '').toLowerCase()];
        if (!marks) return;
        (block.questions || []).forEach((q) => {
          if (!q.id || marks[q.id] == null || marks[q.id] === '') return;
          next[`${s.id}-${q.id}`] = marks[q.id];
          filled += 1;
        });
      });
      setMarksGrid(next);
      const n = await persistMarks(next, roster);
      if (n === false) return;
      const settings = {};
      if (meta.target_percent != null) settings.target_percent = meta.target_percent;
      if (meta.total_students != null) settings.total_students = meta.total_students;
      if (meta.appeared != null) settings.appeared = meta.appeared;
      if (Object.keys(settings).length) {
        patchBlock(settings);
        await api.patch(`/assessments/${block.id}/`, {
          exam_label: block.exam_label,
          target_percent: settings.target_percent ?? block.target_percent,
          total_students: settings.total_students ?? block.total_students,
          appeared: settings.appeared ?? block.appeared,
          use_ceiling: !!block.use_ceiling,
        });
        await loadSheet();
      }
      setStatus(`Uploaded ${filled} marks from Excel. Cells are still editable — change any value and click Save marks & calculate.`);
    } catch (err) {
      setError(formatError(err, 'Could not import marks from Excel.'));
    } finally {
      setUploading(false);
    }
  }

  const lab = isLabCourse(course);
  const tabs = useMemo(() => {
    if (lab) {
      return [
        { id: 'roster', label: 'Roster' },
        ...LAB_PLACEHOLDER_TABS,
      ];
    }
    return [
      { id: 'roster', label: 'Roster' },
      ...THEORY_BLOCKS,
      { id: 'attainment', label: 'Attainment' },
      { id: 'result', label: 'Result' },
    ];
  }, [lab]);

  if (loading && !course) return <div className="p-8">Loading…</div>;
  if (!course) {
    return (
      <div className="p-8">
        <p className="text-red-700 text-sm">{error || 'Could not load this course.'}</p>
      </div>
    );
  }

  const listPath = coursesListPath(course);
  const listLabel = coursesListLabel(course);

  return (
    <div className="p-8 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <Link to={listPath} className="text-sm text-slate-500 hover:text-slate-700 no-print">← Back to {listLabel}</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1 no-print">{course.course_code} — {course.course_name}</h1>
      <p className="text-sm text-slate-500 mb-4 no-print">
        {course.session_label || course.academic_year}
        {lab
          ? ' · one shared student list for Mid Sem, End Sem, D2D, Exit Survey and CO Attainment'
          : ' · one shared student list for T1, T2, T3, TA and Feedback'}
      </p>
      <CourseSubnav courseId={id} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4 no-print">{error}</div>}
      {status && <div className="bg-emerald-50 text-emerald-800 text-sm rounded p-3 mb-4 no-print">{status}</div>}

      <div className="flex flex-wrap gap-1 mb-4 no-print">
        {tabs.map((t) => (
          <button
            key={t.id || t.key}
            type="button"
            onClick={() => { setTab(t.id || t.key); setStatus(''); setPreviewing(false); }}
            className={`px-3 py-1.5 rounded text-xs font-semibold ${(t.id || t.key) === tab ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {lab && LAB_PLACEHOLDER_TABS.some((t) => t.id === tab) && (
        <section className="bg-white shadow rounded-lg p-6">
          <h2 className="font-semibold mb-1">{LAB_PLACEHOLDER_TABS.find((t) => t.id === tab)?.label}</h2>
          <p className="text-sm text-slate-500">
            This lab assessment tab is ready. Detailed fields and mark entry will be added in a follow-up.
          </p>
        </section>
      )}

      {tab === 'roster' && (
        <section className="bg-white shadow rounded-lg p-6">
          <h2 className="font-semibold mb-1">Student roster</h2>
          <p className="text-xs text-slate-500 mb-4">Add once. The same students appear on every exam sheet for this course offering.</p>
          <form onSubmit={addStudent} className="flex gap-2 mb-3">
            <input required placeholder="Enrol no" className="border rounded px-2 py-1.5 text-sm w-40"
              value={studentForm.roll_number} onChange={(e) => setStudentForm({ ...studentForm, roll_number: e.target.value })} />
            <input required placeholder="Name" className="border rounded px-2 py-1.5 text-sm flex-1"
              value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} />
            <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-semibold">Add student</button>
          </form>
          <textarea className="w-full border rounded px-3 py-2 text-sm h-24 mb-2"
            placeholder={'Bulk: enrol, name — one per line\n2403030001, SHANTAM ATTRY'}
            value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" onClick={addBulk} className="bg-slate-200 px-3 py-1.5 rounded text-xs font-semibold">Import roster</button>
            <ExcelUploadButton disabled={uploading} onFile={importRosterExcel} label={uploading ? 'Uploading…' : 'Upload Excel'} />
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">S.No</th><th>Enrol No</th><th>Name</th><th></th></tr></thead>
            <tbody>
              {students.length === 0 && <tr><td colSpan={4} className="py-4 text-slate-400">No students yet.</td></tr>}
              {students.map((s, i) => (
                <tr key={s.id} className="border-b">
                  <td className="py-2">{i + 1}</td>
                  <td className="font-medium">{s.roll_number}</td>
                  <td>{s.name}</td>
                  <td><button type="button" className="text-xs text-red-600" onClick={() => deleteStudent(s.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!lab && THEORY_BLOCKS.some((b) => b.key === tab) && block && (
        <div className="space-y-4">
          <div className="no-print space-y-4">
          <section className="bg-white shadow rounded-lg p-6">
            <h2 className="font-semibold mb-3">{block.exam_label || tab} settings</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <label className="text-xs">Exam label
                <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={block.exam_label || ''}
                  onChange={(e) => patchBlock({ exam_label: e.target.value })} />
              </label>
              <label className="text-xs">Target %
                <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={block.target_percent}
                  onChange={(e) => patchBlock({ target_percent: e.target.value })} />
              </label>
              <label className="text-xs">Total students
                <input className="mt-1 w-full border rounded px-2 py-1 text-sm"
                  value={Number(block.total_students) > 0 ? block.total_students : students.length}
                  onChange={(e) => patchBlock({ total_students: e.target.value })} />
              </label>
              <label className="text-xs">No. appeared
                <input className="mt-1 w-full border rounded px-2 py-1 text-sm"
                  value={Number(block.appeared) > 0 ? block.appeared : ''}
                  placeholder="auto from marks"
                  onChange={(e) => patchBlock({ appeared: e.target.value })} />
              </label>
              <label className="text-xs flex items-center gap-2 mt-5">
                <input type="checkbox" checked={!!block.use_ceiling} onChange={(e) => patchBlock({ use_ceiling: e.target.checked })} />
                Use ceiling
              </label>
            </div>
            <h3 className="text-sm font-semibold mb-2">Questions / components (label · max · CO)</h3>
            {(block.questions || []).map((q, i) => (
              <div key={q.id || i} className="grid grid-cols-[1fr_80px_140px_28px] gap-2 mb-2">
                <input className="border rounded px-2 py-1 text-sm" value={q.label}
                  onChange={(e) => {
                    const questions = [...block.questions];
                    questions[i] = { ...q, label: e.target.value };
                    patchQuestions(questions);
                  }} />
                <input className="border rounded px-2 py-1 text-sm" value={q.max_marks}
                  onChange={(e) => {
                    const questions = [...block.questions];
                    questions[i] = { ...q, max_marks: e.target.value };
                    patchQuestions(questions);
                  }} />
                <select className="border rounded px-2 py-1 text-sm" value={q.course_outcome || ''}
                  onChange={(e) => {
                    const questions = [...block.questions];
                    questions[i] = { ...q, course_outcome: e.target.value ? Number(e.target.value) : null };
                    patchQuestions(questions);
                  }}>
                  <option value="">—</option>
                  {outcomes.map((co) => <option key={co.id} value={co.id}>{co.co_code}</option>)}
                </select>
                <button type="button" className="text-red-600" onClick={() => patchQuestions(block.questions.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold mr-3" onClick={() => patchQuestions([
              ...(block.questions || []),
              { key: `Q${Date.now()}`, label: 'New Q', max_marks: 5, course_outcome: null },
            ])}>+ Add question</button>
            <button type="button" onClick={saveBlockSettings} disabled={saving} className="bg-slate-200 px-3 py-1.5 rounded text-xs font-semibold">
              Save settings
            </button>
          </section>

          <ExamCoSummary
            loading={sheetLoading}
            summary={(sheet?.exam_summaries || []).find((ex) => ex.type === tab) || null}
          />

          <section className="bg-white shadow rounded-lg p-6 overflow-auto">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <h2 className="font-semibold">Marks — {students.length} students</h2>
              <div className="flex flex-wrap gap-2">
                <ExcelUploadButton disabled={uploading || saving} onFile={importMarksExcel} label={uploading ? 'Uploading…' : 'Upload Excel'} />
                <button type="button" onClick={saveMarks} disabled={saving || !students.length} className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save marks & calculate'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Upload Excel with Enrol No, Name, and question columns (Q1, Q2, …). Order follows the sheet. After upload, click any cell to correct a mark.
            </p>
            {students.length === 0 && <p className="text-sm text-slate-500">Add students on the Roster tab first.</p>}
            {students.length > 0 && (
              <table className="w-full text-xs min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border p-1">S.No</th>
                    <th className="border p-1">Enrol No</th>
                    <th className="border p-1">Name</th>
                    {(block.questions || []).map((q) => (
                      <th key={q.id || q.key} className="border p-1">{q.label} ({q.max_marks})</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id}>
                      <td className="border p-1 text-center">{i + 1}</td>
                      <td className="border p-1">{s.roll_number}</td>
                      <td className="border p-1">{s.name}</td>
                      {(block.questions || []).map((q) => (
                        <td key={q.id || q.key} className="border p-0">
                          <input
                            className="w-16 text-center py-1 bg-transparent"
                            value={marksGrid[`${s.id}-${q.id}`] ?? ''}
                            onChange={(e) => setMarksGrid((prev) => ({ ...prev, [`${s.id}-${q.id}`]: e.target.value }))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          </div>
          <SheetPreview
            kind={tab}
            course={course}
            students={students}
            block={block}
            marksGrid={marksGrid}
            outcomes={outcomes}
            previewing={previewing}
            onToggle={() => setPreviewing((v) => !v)}
          />
        </div>
      )}

      {!lab && tab === 'attainment' && (
        <section className="bg-white shadow rounded-lg p-6 overflow-auto">
          <div className="no-print">
          <div className="flex flex-wrap justify-between gap-2 mb-4">
            <h2 className="font-semibold">Average CO-Attainment</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={sheetLoading} className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-50"
                onClick={async () => {
                  api.post('/attainments/calculate/', { course: Number(id) }).catch(() => {});
                  await loadSheet();
                  setStatus('Sheet recalculated from saved marks.');
                }}>{sheetLoading ? 'Computing…' : 'Recalculate'}</button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Direct = 60% T-AVG + 20% Assgn/TA; Final = Direct + 20% Indirect (Feedback). Levels: ≥80 → 3, ≥70 → 2, ≥60 → 1.
            Appeared = students with marks (or the No. appeared you save). Ceiling rounds % up for T3/TA when checked.
          </p>
          {sheetLoading && !sheet && <p className="text-sm text-slate-500">Computing sheet…</p>}
          <table className="w-full text-xs border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-slate-50">
                {['COs', 'T1', 'T2', 'T3', 'T-AVG', 'Assgn/Project/CT (TA)', 'Direct (60% T-AVG + 20% Assgn)', 'Indirect (Feedback)', 'Final (Direct + 20% Indirect)', 'CIE', 'SIE'].map((h) => (
                  <th key={h} className="border p-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sheet?.cos || []).map((row) => (
                <tr key={row.id}>
                  <td className="border p-1 font-semibold">{row.co_code}</td>
                  <td className="border p-1 text-center"><LevelBadge level={row.t1_level} /></td>
                  <td className="border p-1 text-center"><LevelBadge level={row.t2_level} /></td>
                  <td className="border p-1 text-center"><LevelBadge level={row.t3_level} /></td>
                  <td className="border p-1 text-center">{fmt(row.t_avg)}</td>
                  <td className="border p-1 text-center"><LevelBadge level={row.ta_level} /></td>
                  <td className="border p-1 text-center">{fmt(row.direct)}</td>
                  <td className="border p-1 text-center"><LevelBadge level={row.indirect} /></td>
                  <td className="border p-1 text-center font-bold">{fmt(row.final)}</td>
                  <td className="border p-1 text-center">{fmt(row.cie)}</td>
                  <td className="border p-1 text-center">{fmt(row.sie)}</td>
                </tr>
              ))}
              {!sheetLoading && !(sheet?.cos || []).length && (
                <tr><td colSpan={11} className="border p-3 text-slate-500">No CO rows. Add course outcomes in Course Description, then save marks.</td></tr>
              )}
            </tbody>
          </table>

          <h3 className="font-semibold mt-8 mb-2">CO–PO–PSO Mapping</h3>
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border p-1">COs</th>
                <th className="border p-1">CO Attainment</th>
                {(sheet?.po_keys || []).map((po) => <th key={po} className="border p-1">{po}</th>)}
              </tr>
            </thead>
            <tbody>
              {(sheet?.cos || []).map((row) => (
                <tr key={row.id}>
                  <td className="border p-1 font-semibold">{row.co_code}</td>
                  <td className="border p-1 text-center">{fmt(row.final)}</td>
                  {(sheet?.po_keys || []).map((po) => (
                    <td key={po} className="border p-1 text-center">{row.mappings?.[po] ?? ''}</td>
                  ))}
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="border p-1">{sheet?.nba_code || course.nba_code || course.course_code}</td>
                <td className="border p-1 text-center">Average</td>
                {(sheet?.po_keys || []).map((po) => (
                  <td key={po} className="border p-1 text-center">{fmt(sheet?.mapping_avg?.[po])}</td>
                ))}
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold mt-8 mb-2">PO-PSO Attainment</h3>
          <table className="w-full text-xs border-collapse max-w-3xl mb-6">
            <thead>
              <tr className="bg-slate-50">
                <th className="border p-1">Course</th>
                {(sheet?.po_keys || []).map((po) => <th key={po} className="border p-1">{po}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-1 font-semibold">NBA Code: {sheet?.nba_code || course.nba_code || '—'}</td>
                {(sheet?.po_keys || []).map((po) => (
                  <td key={po} className="border p-1 text-center font-bold">{fmt(sheet?.po_attainment?.[po])}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="grid md:grid-cols-2 gap-4">
            <BarChart
              title="Final CO attainment"
              items={(sheet?.cos || []).map((r) => ({ label: r.co_code, value: Number(r.final) || 0, display: fmt(r.final) }))}
            />
            <BarChart
              title="PO / PSO attainment"
              items={(sheet?.po_keys || []).map((po) => ({ label: po, value: Number(sheet?.po_attainment?.[po]) || 0, display: fmt(sheet?.po_attainment?.[po]) }))}
            />
          </div>
          </div>
          <SheetPreview
            kind="attainment"
            course={course}
            sheet={sheet}
            previewing={previewing}
            onToggle={() => setPreviewing((v) => !v)}
          />
        </section>
      )}

      {!lab && tab === 'result' && (
        <section className="bg-white shadow rounded-lg p-6 overflow-auto">
          <div className="no-print">
          <div className="flex flex-wrap justify-between gap-2 mb-3">
            <h2 className="font-semibold">Grade distribution &amp; student-wise result</h2>
            <button type="button" disabled={sheetLoading} className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded font-semibold"
              onClick={loadSheet}>{sheetLoading ? 'Computing…' : 'Refresh'}</button>
          </div>
          <p className="text-xs text-slate-500 mb-3">Total (100) = T1 + T2 + T3 + TA from the shared roster. Grade bands are stored per course.</p>
          {sheetLoading && !sheet && <p className="text-sm text-slate-500">Computing results…</p>}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-slate-50"><th className="border p-1">Grade</th><th className="border p-1">No. of Students</th><th className="border p-1">% of Students</th></tr></thead>
              <tbody>
                {(sheet?.grade_distribution || []).map((g) => (
                  <tr key={g.grade}><td className="border p-1">{g.grade}</td><td className="border p-1 text-center">{g.count}</td><td className="border p-1 text-center">{g.percent}%</td></tr>
                ))}
              </tbody>
            </table>
            <BarChart
              title="Grade distribution (no. of students)"
              items={(sheet?.grade_distribution || []).map((g) => ({ label: g.grade, value: g.count, display: `${g.count} (${g.percent}%)` }))}
            />
          </div>
          <h3 className="font-semibold mb-2">Student-wise Result</h3>
          <table className="w-full text-xs border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-slate-50">
                {['S.No', 'Enrol No', 'Name', 'T1', 'T2', 'T3', 'TA', 'Total (100)', 'Grade'].map((h) => (
                  <th key={h} className="border p-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sheet?.results || []).map((r) => (
                <tr key={r.enrol}>
                  <td className="border p-1 text-center">{r.sno}</td>
                  <td className="border p-1">{r.enrol}</td>
                  <td className="border p-1">{r.name}</td>
                  <td className="border p-1 text-center">{fmt(r.t1, 1)}</td>
                  <td className="border p-1 text-center">{fmt(r.t2, 1)}</td>
                  <td className="border p-1 text-center">{fmt(r.t3, 1)}</td>
                  <td className="border p-1 text-center">{fmt(r.ta, 1)}</td>
                  <td className="border p-1 text-center font-bold">{fmt(r.total, 1)}</td>
                  <td className="border p-1 text-center font-bold">{r.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <SheetPreview
            kind="result"
            course={course}
            sheet={sheet}
            previewing={previewing}
            onToggle={() => setPreviewing((v) => !v)}
          />
        </section>
      )}
    </div>
  );
}

function formatError(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  try { return JSON.stringify(data); } catch { return fallback; }
}
