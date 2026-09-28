import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import CourseSubnav from '../components/CourseSubnav';
import { useAuth } from '../context/AuthContext';
import { coordinatorName, coursesListLabel, coursesListPath, teachingFacultyName } from '../utils/offering';

const LEVELS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'];
const LEVEL_LABELS = {
  REMEMBER: 'Remember Level (Level 1)',
  UNDERSTAND: 'Understand Level (Level 2)',
  APPLY: 'Apply Level (Level 3)',
  ANALYZE: 'Analyze Level (Level 4)',
  EVALUATE: 'Evaluate Level (Level 5)',
  CREATE: 'Create Level (Level 6)',
};

function poPsoKeys(poCount, psoCount) {
  const keys = [];
  for (let i = 1; i <= (Number(poCount) || 0); i += 1) keys.push(`PO${i}`);
  for (let i = 1; i <= (Number(psoCount) || 0); i += 1) keys.push(`PSO${i}`);
  return keys;
}

const emptyForm = {
  course_name: '',
  program_name: '',
  department: '',
  course_code: '',
  semester: 'ODD',
  academic_year: '',
  doc_title: 'Detailed Syllabus',
  institute: '',
  institute_sub: '',
  logo_fallback: 'LOGO',
  watermark_text: '',
  coordinator_names: '',
  t1_marks: 20,
  t2_marks: 20,
  end_sem_marks: 35,
  ta_marks: 25,
  pbl: '',
  nba_code: '',
  po_count: 3,
  pso_count: 2,
};

function mappingFor(co, poKey) {
  return co.mappings?.find((m) => m.po_key === poKey) || { level: '', justification: '' };
}

export default function CourseDescription() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [course, setCourse] = useState(null);
  const [facultyList, setFacultyList] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [modules, setModules] = useState([]);
  const [textBooks, setTextBooks] = useState(['']);
  const [refBooks, setRefBooks] = useState(['']);
  const [outcomes, setOutcomes] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api.get(`/courses/${id}/`);
    const c = res.data;
    setCourse(c);
    setForm({
      course_name: c.course_name || '',
      program_name: c.program_name || '',
      department: c.department || '',
      course_code: c.course_code || '',
      semester: c.semester || 'ODD',
      academic_year: c.academic_year || '',
      doc_title: c.doc_title || 'Detailed Syllabus',
      institute: c.institute || '',
      institute_sub: c.institute_sub || '',
      logo_fallback: c.logo_fallback || 'LOGO',
      watermark_text: c.watermark_text || '',
      coordinator_names: c.coordinator_names || c.faculty_name || '',
      t1_marks: c.t1_marks ?? 20,
      t2_marks: c.t2_marks ?? 20,
      end_sem_marks: c.end_sem_marks ?? 35,
      ta_marks: c.ta_marks ?? 25,
      pbl: c.pbl || '',
      nba_code: c.nba_code || '',
      po_count: c.po_count ?? 3,
      pso_count: c.pso_count ?? 2,
    });
    setModules(c.modules?.length ? c.modules : [{ serial_no: '1.', subtitle: '', topics: '', lectures: 0, remarks: '' }]);
    setTextBooks(c.text_books?.length ? c.text_books : ['']);
    setRefBooks(c.reference_books?.length ? c.reference_books : ['']);
    setOutcomes((c.outcomes || []).map((o) => ({
      ...o,
      mappings: o.mappings || [],
    })));
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load course description.'));
  }, [id]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/auth/users/?role=FACULTY').then((res) => setFacultyList(res.data.results ?? res.data));
    }
  }, [isAdmin]);

  async function assignFaculty(facultyId) {
    await api.patch(`/courses/${id}/`, { faculty: facultyId === '' ? null : Number(facultyId) });
    await load();
  }

  async function deleteCourse() {
    if (!window.confirm(`Delete ${course.course_code}? All students, marks, and mapping will be removed.`)) return;
    await api.delete(`/courses/${id}/`);
    window.location.href = coursesListPath(course);
  }

  const evalTotal = Number(form.t1_marks || 0) + Number(form.t2_marks || 0)
    + Number(form.end_sem_marks || 0) + Number(form.ta_marks || 0);
  const lectureTotal = useMemo(
    () => modules.reduce((sum, m) => sum + (Number(m.lectures) || 0), 0),
    [modules],
  );
  const poKeys = poPsoKeys(form.po_count, form.pso_count);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function nextCoCode() {
    const prefix = form.nba_code || course?.nba_code || 'CO';
    return `${prefix}.${outcomes.length + 1}`;
  }

  async function saveAll() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await api.patch(`/courses/${id}/`, {
        ...form,
        course_name: form.course_name,
        program_name: form.program_name,
        po_count: Number(form.po_count) || 3,
        pso_count: Number(form.pso_count) || 0,
        t1_marks: Number(form.t1_marks) || 0,
        t2_marks: Number(form.t2_marks) || 0,
        end_sem_marks: Number(form.end_sem_marks) || 0,
        ta_marks: Number(form.ta_marks) || 0,
        modules: modules.map((m, i) => ({
          serial_no: m.serial_no || `${i + 1}.`,
          subtitle: m.subtitle || '',
          topics: m.topics || '',
          lectures: Number(m.lectures) || 0,
          remarks: m.remarks || '',
        })),
        text_books: textBooks,
        reference_books: refBooks,
      });

      for (let i = 0; i < outcomes.length; i += 1) {
        const co = outcomes[i];
        const payload = {
          course: Number(id),
          co_code: co.co_code,
          description: co.description,
          cognitive_level: co.cognitive_level,
          order: i,
        };
        let coId = co.id;
        if (coId) {
          await api.patch(`/courses/outcomes/${coId}/`, payload);
        } else {
          const created = await api.post('/courses/outcomes/', payload);
          coId = created.data.id;
        }
        for (const po of poKeys) {
          const cell = mappingFor(co, po);
          const existing = (co.mappings || []).find((m) => m.po_key === po && m.id);
          const level = cell.level === '' || cell.level === null || cell.level === undefined
            ? null : Number(cell.level);
          const justification = cell.justification || '';
          if (existing) {
            await api.patch(`/courses/mappings/${existing.id}/`, { level, justification });
          } else if (level !== null || justification) {
            await api.post('/courses/mappings/', {
              course_outcome: coId, po_key: po, level, justification,
            });
          }
        }
      }
      const keptIds = new Set(outcomes.filter((o) => o.id).map((o) => o.id));
      for (const old of (course.outcomes || [])) {
        if (old.id && !keptIds.has(old.id)) {
          await api.delete(`/courses/outcomes/${old.id}/`);
        }
      }
      setStatus('Course Description saved.');
      await load();
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'string' ? data : JSON.stringify(data || 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  function updateOutcome(index, patch) {
    setOutcomes((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function updateMapping(index, poKey, patch) {
    setOutcomes((prev) => prev.map((o, i) => {
      if (i !== index) return o;
      const mappings = [...(o.mappings || [])];
      const found = mappings.findIndex((m) => m.po_key === poKey);
      if (found >= 0) mappings[found] = { ...mappings[found], ...patch };
      else mappings.push({ po_key: poKey, level: '', justification: '', ...patch });
      return { ...o, mappings };
    }));
  }

  async function removeOutcome(index) {
    const co = outcomes[index];
    if (co.id && !window.confirm('Remove this course outcome? Marks linked to it will also be removed.')) return;
    if (co.id) await api.delete(`/courses/outcomes/${co.id}/`);
    setOutcomes((prev) => prev.filter((_, i) => i !== index));
  }

  if (!course) return <div className="p-8">Loading…</div>;

  const semesterLabel = (form.semester || course.semester) === 'EVEN' ? 'Even' : 'Odd';

  return (
    <div className="p-8 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <div className="no-print">
        <Link to={coursesListPath(course)} className="text-sm text-slate-500 hover:text-slate-700">← Back to {coursesListLabel(course)}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-1">
          <h1 className="text-2xl font-bold text-slate-900">{course.course_code} — {course.course_name}</h1>
          <button type="button" onClick={deleteCourse} className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded">
            Delete course
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Session {course.session_label || course.academic_year}
          {` · Faculty: ${teachingFacultyName(course)} · Coordinator: ${coordinatorName(course)}`}
        </p>
        <CourseSubnav courseId={id} />

        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
        {status && <div className="bg-emerald-50 text-emerald-800 text-sm rounded p-3 mb-4">{status}</div>}

        <div className="bg-white shadow rounded-lg p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">Assigned faculty login:</span>
          {isAdmin ? (
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={course.faculty ?? ''}
              onChange={(e) => assignFaculty(e.target.value)}
            >
              <option value="">Unassigned</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>{f.first_name} {f.last_name} (@{f.username})</option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium text-slate-900">{course.faculty_name || 'Unassigned'}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end mb-4">
          <button type="button" onClick={() => window.print()} className="bg-slate-200 px-4 py-2 rounded text-sm font-semibold">
            Print / Save as PDF
          </button>
          <button type="button" disabled={saving} onClick={saveAll} className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Course Description'}
          </button>
        </div>

        <section className="bg-white shadow rounded-lg p-6 mb-6 space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900 mb-3">Header</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Document title" value={form.doc_title} onChange={(v) => setField('doc_title', v)} />
              <Field label="Institute name" value={form.institute} onChange={(v) => setField('institute', v)} />
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-3">Basic info</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Subject code" value={form.course_code} onChange={(v) => setField('course_code', v)} />
              <Field label="Course / subject name" value={form.course_name} onChange={(v) => setField('course_name', v)} />
              <Field label="Program" value={form.program_name} onChange={(v) => setField('program_name', v)} className="sm:col-span-2" />
              <Field label="Department" value={form.department} onChange={(v) => setField('department', v)} className="sm:col-span-2" />
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Semester</span>
                <select className="w-full border rounded px-3 py-2 text-sm" value={form.semester}
                  onChange={(e) => setField('semester', e.target.value)}>
                  <option value="ODD">Odd</option>
                  <option value="EVEN">Even</option>
                </select>
              </label>
              <Field label="Session" value={course.session_label || form.academic_year} onChange={(v) => setField('academic_year', v)} />
              <Field label="NBA code (CO prefix)" value={form.nba_code} onChange={(v) => setField('nba_code', v)} />
              <Field label="Faculty name" value={teachingFacultyName(course)} onChange={() => {}} />
              <Field label="Course coordinator" value={form.coordinator_names} onChange={(v) => setField('coordinator_names', v)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Course outcomes</h2>
              <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded" onClick={() => setOutcomes((prev) => [...prev, {
                co_code: nextCoCode(), description: '', cognitive_level: 'UNDERSTAND', mappings: [],
              }])}>+ Add CO</button>
            </div>
            <div className="space-y-3">
              {outcomes.map((co, idx) => (
                <div key={co.id || `new-${idx}`} className="border rounded p-3 space-y-2">
                  <div className="flex gap-2">
                    <input className="border rounded px-2 py-1.5 text-sm w-28" value={co.co_code}
                      onChange={(e) => updateOutcome(idx, { co_code: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm flex-1" placeholder="Description"
                      value={co.description} onChange={(e) => updateOutcome(idx, { description: e.target.value })} />
                    <select className="border rounded px-2 py-1.5 text-sm" value={co.cognitive_level}
                      onChange={(e) => updateOutcome(idx, { cognitive_level: e.target.value })}>
                      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                    </select>
                    <button type="button" className="text-red-600 text-sm" onClick={() => removeOutcome(idx)}>✕</button>
                  </div>
                </div>
              ))}
              {outcomes.length === 0 && <p className="text-sm text-slate-400">No outcomes yet.</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900">Lecture-wise breakup</h2>
              <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded" onClick={() => setModules((prev) => [...prev, {
                serial_no: `${prev.length + 1}.`, subtitle: '', topics: '', lectures: 0, remarks: '',
              }])}>+ Add module</button>
            </div>
            <div className="space-y-2">
              {modules.map((m, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <input className="col-span-1 border rounded px-2 py-1.5 text-xs" value={m.serial_no}
                    onChange={(e) => setModules((prev) => prev.map((row, i) => i === idx ? { ...row, serial_no: e.target.value } : row))} />
                  <input className="col-span-3 border rounded px-2 py-1.5 text-xs" placeholder="Module" value={m.subtitle}
                    onChange={(e) => setModules((prev) => prev.map((row, i) => i === idx ? { ...row, subtitle: e.target.value } : row))} />
                  <input className="col-span-5 border rounded px-2 py-1.5 text-xs" placeholder="Topics" value={m.topics}
                    onChange={(e) => setModules((prev) => prev.map((row, i) => i === idx ? { ...row, topics: e.target.value } : row))} />
                  <input type="number" min="0" className="col-span-1 border rounded px-2 py-1.5 text-xs" placeholder="Hrs" value={m.lectures}
                    onChange={(e) => setModules((prev) => prev.map((row, i) => i === idx ? { ...row, lectures: e.target.value } : row))} />
                  <input className="col-span-1 border rounded px-2 py-1.5 text-xs" placeholder="Remarks" value={m.remarks}
                    onChange={(e) => setModules((prev) => prev.map((row, i) => i === idx ? { ...row, remarks: e.target.value } : row))} />
                  <button type="button" className="col-span-1 text-red-600 text-sm" onClick={() => setModules((prev) => prev.filter((_, i) => i !== idx))}>✕</button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Total lectures: {lectureTotal}</p>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-3">Evaluation criteria</h2>
            <div className="grid grid-cols-4 gap-3">
              <Field label="T1" type="number" value={form.t1_marks} onChange={(v) => setField('t1_marks', v)} />
              <Field label="T2" type="number" value={form.t2_marks} onChange={(v) => setField('t2_marks', v)} />
              <Field label="End semester" type="number" value={form.end_sem_marks} onChange={(v) => setField('end_sem_marks', v)} />
              <Field label="TA (total)" type="number" value={form.ta_marks} onChange={(v) => setField('ta_marks', v)} />
            </div>
            <p className="text-xs text-slate-500 mt-2">Total: {evalTotal}</p>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-3">Project based learning</h2>
            <textarea className="w-full border rounded px-3 py-2 text-sm h-24" value={form.pbl} onChange={(e) => setField('pbl', e.target.value)} />
          </div>

          <BookList title="Text books" items={textBooks} setItems={setTextBooks} />
          <BookList title="Reference books" items={refBooks} setItems={setRefBooks} />

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="font-semibold text-slate-900">CO–PO–PSO mapping</h2>
                <p className="text-xs text-slate-500 mt-1">This is the only place to edit mapping. B.Tech usually needs more POs than M.Tech.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">POs</span>
                  <button type="button" className="border rounded px-2 py-0.5" onClick={() => setField('po_count', Math.max(1, Number(form.po_count) - 1))}>−</button>
                  <span className="font-semibold w-6 text-center">{form.po_count}</span>
                  <button type="button" className="border rounded px-2 py-0.5" onClick={() => setField('po_count', Math.min(15, Number(form.po_count) + 1))}>+</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">PSOs</span>
                  <button type="button" className="border rounded px-2 py-0.5" onClick={() => setField('pso_count', Math.max(0, Number(form.pso_count) - 1))}>−</button>
                  <span className="font-semibold w-6 text-center">{form.pso_count}</span>
                  <button type="button" className="border rounded px-2 py-0.5" onClick={() => setField('pso_count', Math.min(8, Number(form.pso_count) + 1))}>+</button>
                </div>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-slate-500 border-b">
                    <th className="py-2 text-left">CO</th>
                    {poKeys.map((p) => <th key={p} className="px-1">{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((co, idx) => (
                    <tr key={co.id || idx} className="border-b align-top">
                      <td className="py-2 font-semibold whitespace-nowrap pr-2">{co.co_code}</td>
                      {poKeys.map((p) => {
                        const cell = mappingFor(co, p);
                        return (
                          <td key={p} className="p-1">
                            <select className="border rounded w-full text-center py-1 mb-1"
                              value={cell.level ?? ''}
                              onChange={(e) => updateMapping(idx, p, { level: e.target.value === '' ? '' : Number(e.target.value) })}>
                              <option value=""></option>
                              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input className="border rounded w-full px-1 py-1" placeholder="Justification"
                              value={cell.justification || ''}
                              onChange={(e) => updateMapping(idx, p, { justification: e.target.value })} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <section className="cd-preview bg-white shadow rounded-lg p-8 relative text-[11px] leading-relaxed text-black">
        <div className="relative">
          <div className="border-b border-slate-800 pb-3 mb-4 text-center">
            <p className="text-xl font-bold text-slate-900 uppercase tracking-wide">{form.doc_title || 'Detailed Syllabus'}</p>
            <p className="font-bold text-slate-900 uppercase text-[11px] mt-1 break-words">{form.institute || 'Institute'}</p>
          </div>

          <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold w-[18%]">Subject Code</td>
                <td className="border border-slate-800 px-2 py-1 w-[32%]">{form.course_code || course.course_code}</td>
                <td className="border border-slate-800 px-2 py-1 font-semibold w-[18%]">Semester</td>
                <td className="border border-slate-800 px-2 py-1">{semesterLabel}</td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold">Program</td>
                <td className="border border-slate-800 px-2 py-1" colSpan="3">{form.program_name || '—'}</td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold">Department</td>
                <td className="border border-slate-800 px-2 py-1" colSpan="3">{form.department || '—'}</td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold">Course Name</td>
                <td className="border border-slate-800 px-2 py-1" colSpan="3">{form.course_name || '—'}</td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold">Session</td>
                <td className="border border-slate-800 px-2 py-1" colSpan="3">{course.session_label || form.academic_year || course.academic_year}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Faculty (Names)</h3>
          <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold w-[18%]">Faculty</td>
                <td className="border border-slate-800 px-2 py-1">{teachingFacultyName(course)}</td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold w-[18%]">Course Coordinator</td>
                <td className="border border-slate-800 px-2 py-1">{form.coordinator_names || coordinatorName(course)}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Course Outcomes</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className="border border-slate-800 px-2 py-1 w-[12%] bg-slate-50">CO</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50">Description</th>
                <th className="border border-slate-800 px-2 py-1 w-[30%] bg-slate-50">Cognitive Level</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => (
                <tr key={co.id || co.co_code}>
                  <td className="border border-slate-800 px-2 py-1 font-semibold">{co.co_code}</td>
                  <td className="border border-slate-800 px-2 py-1">{co.description || '—'}</td>
                  <td className="border border-slate-800 px-2 py-1">{LEVEL_LABELS[co.cognitive_level] || co.cognitive_level}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Lecture-wise Breakup</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50 w-[8%]">S.N.</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50 w-[18%]">Module</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50">Topics</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50 w-[12%]">Lectures</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50 w-[16%]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m, i) => (
                <tr key={i}>
                  <td className="border border-slate-800 px-2 py-1">{m.serial_no}</td>
                  <td className="border border-slate-800 px-2 py-1">{m.subtitle || '—'}</td>
                  <td className="border border-slate-800 px-2 py-1">{m.topics || '—'}</td>
                  <td className="border border-slate-800 px-2 py-1 text-center">{m.lectures || '—'}</td>
                  <td className="border border-slate-800 px-2 py-1">{m.remarks || ''}</td>
                </tr>
              ))}
              <tr>
                <td className="border border-slate-800 px-2 py-1 font-semibold text-right" colSpan="3">Total number of Lectures</td>
                <td className="border border-slate-800 px-2 py-1 text-center font-bold">{lectureTotal}</td>
                <td className="border border-slate-800 px-2 py-1"></td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Evaluation Criteria</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50">Component</th>
                <th className="border border-slate-800 px-2 py-1 bg-slate-50">Marks</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-slate-800 px-2 py-1">T1</td><td className="border border-slate-800 px-2 py-1 text-center">{form.t1_marks}</td></tr>
              <tr><td className="border border-slate-800 px-2 py-1">T2</td><td className="border border-slate-800 px-2 py-1 text-center">{form.t2_marks}</td></tr>
              <tr><td className="border border-slate-800 px-2 py-1">End Semester</td><td className="border border-slate-800 px-2 py-1 text-center">{form.end_sem_marks}</td></tr>
              <tr><td className="border border-slate-800 px-2 py-1">TA (Total)</td><td className="border border-slate-800 px-2 py-1 text-center">{form.ta_marks}</td></tr>
              <tr><td className="border border-slate-800 px-2 py-1 font-bold text-right">Total</td><td className="border border-slate-800 px-2 py-1 text-center font-bold">{evalTotal}</td></tr>
            </tbody>
          </table>

          {form.pbl?.trim() && (
            <>
              <h3 className="font-semibold underline mb-1">Project Based Learning</h3>
              <div className="border border-slate-800 px-3 py-2 mb-4 whitespace-pre-wrap break-words">{form.pbl}</div>
            </>
          )}

          {textBooks.filter(Boolean).length > 0 && (
            <>
              <h3 className="font-semibold underline mb-1">Text Books</h3>
              <table className="w-full border-collapse mb-4">
                <tbody>
                  {textBooks.filter(Boolean).map((tb, i) => (
                    <tr key={i}>
                      <td className="border border-slate-800 px-2 py-1 w-[8%] font-semibold">{i + 1}.</td>
                      <td className="border border-slate-800 px-2 py-1 break-words">{tb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {refBooks.filter(Boolean).length > 0 && (
            <>
              <h3 className="font-semibold underline mb-1">Reference Books</h3>
              <table className="w-full border-collapse mb-4">
                <tbody>
                  {refBooks.filter(Boolean).map((rb, i) => (
                    <tr key={i}>
                      <td className="border border-slate-800 px-2 py-1 w-[8%] font-semibold">{i + 1}.</td>
                      <td className="border border-slate-800 px-2 py-1 break-words">{rb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 className="font-semibold underline mb-1">CO-PO Mapping</h3>
          <table className="w-full border-collapse mb-2">
            <thead>
              <tr>
                <th className="border border-slate-800 px-1 py-1 bg-slate-50">COs</th>
                {poKeys.map((p) => <th key={p} className="border border-slate-800 px-1 py-1 bg-slate-50">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => (
                <tr key={co.id || co.co_code}>
                  <td className="border border-slate-800 px-1 py-1 font-semibold text-center">{co.co_code}</td>
                  {poKeys.map((p) => {
                    const cell = mappingFor(co, p);
                    const has = cell.level !== '' && cell.level !== null && cell.level !== undefined;
                    return (
                      <td key={p} className="border border-slate-800 px-1 py-1 text-center align-top">
                        <div className="font-semibold">{has ? cell.level : ''}</div>
                        {cell.justification && <div className="text-[9px] text-left mt-1">{cell.justification}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="border border-slate-800 px-1 py-1 font-semibold text-center">Avg.</td>
                {poKeys.map((p) => {
                  let sum = 0;
                  let count = 0;
                  outcomes.forEach((co) => {
                    const lvl = mappingFor(co, p).level;
                    if (lvl !== '' && lvl !== null && lvl !== undefined) {
                      sum += Number(lvl);
                      count += 1;
                    }
                  });
                  return (
                    <td key={p} className="border border-slate-800 px-1 py-1 text-center font-semibold">
                      {count ? (sum / count).toFixed(1) : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      <input type={type} className="w-full border rounded px-3 py-2 text-sm" value={value}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div className="text-sm">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      <div className="border rounded px-3 py-2 bg-slate-50 text-slate-800">{value}</div>
    </div>
  );
}

function BookList({ title, items, setItems }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded" onClick={() => setItems((prev) => [...prev, ''])}>+ Add</button>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <input className="flex-1 border rounded px-3 py-1.5 text-sm" value={item}
              onChange={(e) => setItems((prev) => prev.map((row, i) => i === idx ? e.target.value : row))} />
            <button type="button" className="text-red-600" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
