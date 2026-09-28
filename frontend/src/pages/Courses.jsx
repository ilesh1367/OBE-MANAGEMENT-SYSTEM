import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { coordinatorName, teachingFacultyName } from '../utils/offering';

const emptyForm = {
  academic_session: '',
  catalog_entry: '',
  teaching_faculty: '',
  course_coordinator: '',
  faculty: '',
  credits: 3,
  po_count: 3,
  pso_count: 2,
};

export default function Courses({ courseKind = 'THEORY' }) {
  const isLab = courseKind === 'LAB';
  const pageTitle = isLab ? 'Lab Courses' : 'Courses';
  const newLabel = isLab ? '+ New Lab Course' : '+ New Course';
  const formTitleNew = isLab ? 'New Lab Course' : 'New course';
  const formTitleEdit = isLab ? 'Edit lab course' : 'Edit course';
  const createLabel = isLab ? 'Create Lab Course' : 'Create Course';
  const updateLabel = isLab ? 'Update Lab Course' : 'Update Course';

  const { isAdmin } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loginFaculty, setLoginFaculty] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [sessionFilter, setSessionFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  function load() {
    api.get(`/courses/?course_kind=${courseKind}`).then((res) => setCourses(res.data.results ?? res.data));
    api.get('/courses/sessions/').then((res) => setSessions(res.data.results ?? res.data)).catch(() => {});
    api.get('/courses/faculty-directory/?active=1').then((res) => setDirectory(res.data.results ?? res.data)).catch(() => {});
    if (isAdmin) {
      api.get('/auth/users/?role=FACULTY').then((res) => setLoginFaculty(res.data.results ?? res.data));
    }
  }

  useEffect(load, [isAdmin, courseKind]);

  useEffect(() => {
    if (!form.academic_session) {
      setCatalog([]);
      return;
    }
    api.get(`/courses/catalog/?session=${form.academic_session}&kind=${courseKind}`)
      .then((res) => setCatalog(res.data.results ?? res.data))
      .catch(() => setCatalog([]));
  }, [form.academic_session, courseKind]);

  const selected = catalog.find((c) => String(c.id) === String(form.catalog_entry));
  const filterSessions = [...new Set(courses.map((c) => c.session_label || c.academic_year).filter(Boolean))];
  const visible = sessionFilter
    ? courses.filter((c) => (c.session_label || c.academic_year) === sessionFilter)
    : courses;

  const directoryByCampus = useMemo(() => {
    const order = ['SECTOR_62', 'SECTOR_128', 'UNKNOWN'];
    const labels = { SECTOR_62: 'Sector-62', SECTOR_128: 'Sector-128', UNKNOWN: 'Other' };
    return order
      .map((campus) => ({ campus, label: labels[campus], rows: directory.filter((f) => f.campus === campus) }))
      .filter((g) => g.rows.length);
  }, [directory]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  function startEdit(c, e) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(c.id);
    setShowForm(true);
    setError('');
    setForm({
      academic_session: c.academic_session || '',
      catalog_entry: c.catalog_entry || '',
      teaching_faculty: c.teaching_faculty || '',
      course_coordinator: c.course_coordinator || '',
      faculty: c.faculty ?? '',
      credits: c.credits ?? 3,
      po_count: c.po_count ?? 3,
      pso_count: c.pso_count ?? 2,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payload = {
      course_kind: courseKind,
      catalog_entry: form.catalog_entry ? Number(form.catalog_entry) : null,
      academic_session: form.academic_session ? Number(form.academic_session) : null,
      teaching_faculty: form.teaching_faculty ? Number(form.teaching_faculty) : null,
      course_coordinator: form.course_coordinator ? Number(form.course_coordinator) : null,
      credits: Number(form.credits) || 3,
      po_count: Number(form.po_count) || 3,
      pso_count: Number(form.pso_count) || 0,
    };
    if (isAdmin) {
      payload.faculty = form.faculty ? Number(form.faculty) : null;
    }
    try {
      if (editingId) {
        await api.patch(`/courses/${editingId}/`, payload);
      } else {
        await api.post('/courses/', { ...payload, outcomes: [] });
      }
      resetForm();
      load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Failed to save course'));
    }
  }

  async function deleteCourse(c, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete ${c.course_code} — ${c.course_name}? Students, marks, and mapping will also be removed.`)) return;
    setError('');
    try {
      await api.delete(`/courses/${c.id}/`);
      if (editingId === c.id) resetForm();
      load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Failed to delete course'));
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
          {filterSessions.length > 0 && (
            <select className="border rounded px-2 py-1.5 text-sm" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
              <option value="">All sessions</option>
              {filterSessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        <button
          onClick={() => { if (showForm) resetForm(); else { setShowForm(true); setEditingId(null); setForm(emptyForm); } }}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm font-semibold"
        >
          {showForm ? 'Cancel' : newLabel}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 mb-6 grid grid-cols-2 gap-4">
          {error && <div className="col-span-2 bg-red-50 text-red-700 text-xs rounded p-2">{error}</div>}
          <p className="col-span-2 text-sm font-semibold text-slate-700">
            {editingId ? formTitleEdit : formTitleNew}
          </p>
          <label className="block text-sm col-span-2">
            <span className="block text-xs font-medium text-slate-600 mb-1">Session</span>
            <select className="w-full border rounded px-3 py-2 text-sm" required value={form.academic_session}
              onChange={(e) => setForm({ ...form, academic_session: e.target.value, catalog_entry: '' })}>
              <option value="">Select 2026 Odd / 2026 Even …</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="block text-sm col-span-2">
            <span className="block text-xs font-medium text-slate-600 mb-1">NBA code / subject</span>
            <select className="w-full border rounded px-3 py-2 text-sm" required value={form.catalog_entry}
              onChange={(e) => setForm({ ...form, catalog_entry: e.target.value })}>
              <option value="">{isLab ? 'Select lab NBA subject' : 'Select NBA subject'}</option>
              {catalog.map((row) => (
                <option key={row.id} value={row.id}>{row.label}</option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="col-span-2 grid grid-cols-2 gap-2 text-sm bg-slate-50 border rounded p-3">
              <p><span className="text-slate-500">Program:</span> {selected.program_name}</p>
              <p><span className="text-slate-500">NBA:</span> {selected.nba_code}</p>
              <p className="col-span-2"><span className="text-slate-500">Course:</span> {selected.course_name} ({selected.course_code})</p>
              <p><span className="text-slate-500">Year of study:</span> {selected.year_of_study}</p>
              <p><span className="text-slate-500">Semester no.:</span> {selected.semester_number}</p>
            </div>
          )}
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600 mb-1">Faculty name</span>
            <select className="w-full border rounded px-3 py-2 text-sm" required value={form.teaching_faculty}
              onChange={(e) => setForm({ ...form, teaching_faculty: e.target.value })}>
              <option value="">Select faculty</option>
              {directoryByCampus.map((g) => (
                <optgroup key={g.campus} label={g.label}>
                  {g.rows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600 mb-1">Course coordinator</span>
            <select className="w-full border rounded px-3 py-2 text-sm" required value={form.course_coordinator}
              onChange={(e) => setForm({ ...form, course_coordinator: e.target.value })}>
              <option value="">Select coordinator</option>
              {directoryByCampus.map((g) => (
                <optgroup key={g.campus} label={g.label}>
                  {g.rows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600 mb-1">Credits</span>
            <input type="number" className="w-full border rounded px-3 py-2 text-sm"
              value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600 mb-1">Number of POs</span>
            <input type="number" min="1" max="15" className="w-full border rounded px-3 py-2 text-sm"
              value={form.po_count} onChange={(e) => setForm({ ...form, po_count: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-600 mb-1">Number of PSOs</span>
            <input type="number" min="0" max="8" className="w-full border rounded px-3 py-2 text-sm"
              value={form.pso_count} onChange={(e) => setForm({ ...form, pso_count: Number(e.target.value) })} />
          </label>
          {isAdmin && (
            <label className="block text-sm">
              <span className="block text-xs font-medium text-slate-600 mb-1">Login account (owner)</span>
              <select className="w-full border rounded px-3 py-2 text-sm" value={form.faculty}
                onChange={(e) => setForm({ ...form, faculty: e.target.value })}>
                <option value="">Assign faculty login later</option>
                {loginFaculty.map((f) => (
                  <option key={f.id} value={f.id}>{f.first_name} {f.last_name} (@{f.username})</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="col-span-2 bg-slate-900 text-white py-2 rounded text-sm font-semibold">
            {editingId ? updateLabel : createLabel}
          </button>
        </form>
      )}

      {!showForm && error && <div className="bg-red-50 text-red-700 text-xs rounded p-2 mb-4">{error}</div>}

      <div className="bg-white shadow rounded-lg divide-y">
        {visible.length === 0 && (
          <p className="p-6 text-sm text-slate-400">
            {isLab ? 'No lab courses yet — create one above.' : 'No courses yet — create one above.'}
          </p>
        )}
        {visible.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4 hover:bg-slate-50 gap-3">
            <Link to={`/courses/${c.id}/description`} className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{c.course_code} — {c.course_name}</p>
              <p className="text-xs text-slate-500">
                {c.program_name ? `${c.program_name} · ` : ''}{c.session_label || c.academic_year}
                {c.nba_code ? ` · ${c.nba_code}` : ''}
                {` · Faculty: ${teachingFacultyName(c)} · Coordinator: ${coordinatorName(c)}`}
              </p>
            </Link>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-slate-400">{c.outcomes?.length ?? 0} COs</span>
              <button type="button" onClick={(e) => startEdit(c, e)} className="text-xs text-slate-600 hover:underline">Edit</button>
              <button type="button" onClick={(e) => deleteCourse(c, e)} className="text-xs text-red-600 hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
