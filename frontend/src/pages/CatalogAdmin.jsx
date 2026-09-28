import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const emptySubject = {
  session: '', program_name: '', course_code: '', course_name: '',
  year_of_study: 1, semester_number: 1, nba_code: '',
};
const emptyFaculty = { full_name: '', campus: 'UNKNOWN', email: '', department: '' };

export default function CatalogAdmin() {
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [newYear, setNewYear] = useState(2026);
  const [newSem, setNewSem] = useState('ODD');
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [facultyForm, setFacultyForm] = useState(emptyFaculty);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function loadSessions() {
    const res = await api.get('/courses/sessions/');
    const rows = res.data.results ?? res.data;
    setSessions(rows);
    if (!sessionId && rows[0]) setSessionId(String(rows[0].id));
  }

  async function loadSubjects(sid) {
    if (!sid) { setSubjects([]); return; }
    const res = await api.get(`/courses/catalog/?session=${sid}`);
    setSubjects(res.data.results ?? res.data);
  }

  async function loadFaculty() {
    const res = await api.get('/courses/faculty-directory/');
    setFaculty(res.data.results ?? res.data);
  }

  useEffect(() => {
    loadSessions().catch(() => setError('Could not load sessions.'));
    loadFaculty().catch(() => setError('Could not load faculty directory.'));
  }, []);

  useEffect(() => {
    loadSubjects(sessionId).catch(() => setError('Could not load catalog.'));
    setSubjectForm((prev) => ({ ...prev, session: sessionId }));
  }, [sessionId]);

  const groupedFaculty = useMemo(() => {
    const groups = { SECTOR_62: [], SECTOR_128: [], UNKNOWN: [] };
    faculty.forEach((f) => {
      const key = groups[f.campus] ? f.campus : 'UNKNOWN';
      groups[key].push(f);
    });
    return groups;
  }, [faculty]);

  async function addSession(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/courses/sessions/', { calendar_year: Number(newYear), semester_type: newSem });
      await loadSessions();
      setSessionId(String(res.data.id));
      setStatus(`Session ${res.data.label} saved. NBA subjects carried forward from the previous session when available.`);
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not create session.'));
    }
  }

  async function addSubject(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/courses/catalog/', {
        ...subjectForm,
        session: Number(subjectForm.session || sessionId),
        year_of_study: Number(subjectForm.year_of_study),
        semester_number: Number(subjectForm.semester_number),
      });
      setSubjectForm({ ...emptySubject, session: sessionId });
      await loadSubjects(sessionId);
      setStatus('Subject added to catalog.');
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not save subject.'));
    }
  }

  async function deleteSubject(id) {
    if (!window.confirm('Remove this catalog row?')) return;
    await api.delete(`/courses/catalog/${id}/`);
    loadSubjects(sessionId);
  }

  async function addFaculty(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/courses/faculty-directory/', facultyForm);
      setFacultyForm(emptyFaculty);
      await loadFaculty();
      setStatus('Faculty added.');
    } catch (err) {
      setError(JSON.stringify(err.response?.data || 'Could not save faculty.'));
    }
  }

  async function setCampus(id, campus) {
    await api.patch(`/courses/faculty-directory/${id}/`, { campus });
    loadFaculty();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Academic catalog</h1>
      <p className="text-sm text-slate-500 mb-6">
        Sessions (2026 Odd / 2026 Even), NBA subjects, and faculty lists for Sector-62 / Sector-128.
        Seed Excel files with <code className="text-xs">python manage.py seed_catalog</code>.
      </p>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
      {status && <div className="bg-emerald-50 text-emerald-800 text-sm rounded p-3 mb-4">{status}</div>}

      <section className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-3">Sessions</h2>
        <form onSubmit={addSession} className="flex flex-wrap gap-2 mb-4">
          <input type="number" className="border rounded px-3 py-2 text-sm w-28" value={newYear}
            onChange={(e) => setNewYear(e.target.value)} />
          <select className="border rounded px-3 py-2 text-sm" value={newSem} onChange={(e) => setNewSem(e.target.value)}>
            <option value="ODD">Odd</option>
            <option value="EVEN">Even</option>
          </select>
          <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-semibold">Add session</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {sessions.map((s) => (
            <button key={s.id} type="button"
              className={`px-3 py-1.5 rounded text-sm ${String(s.id) === String(sessionId) ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
              onClick={() => setSessionId(String(s.id))}>
              {s.label}
            </button>
          ))}
          {sessions.length === 0 && <p className="text-sm text-slate-400">No sessions yet.</p>}
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-3">NBA subjects {sessionId ? `· ${sessions.find((s) => String(s.id) === String(sessionId))?.label || ''}` : ''}</h2>
        <form onSubmit={addSubject} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Program e.g. BTech(IT)" required
            value={subjectForm.program_name} onChange={(e) => setSubjectForm({ ...subjectForm, program_name: e.target.value })} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Course code" required
            value={subjectForm.course_code} onChange={(e) => setSubjectForm({ ...subjectForm, course_code: e.target.value })} />
          <input className="border rounded px-3 py-2 text-sm col-span-2" placeholder="Course name" required
            value={subjectForm.course_name} onChange={(e) => setSubjectForm({ ...subjectForm, course_name: e.target.value })} />
          <input type="number" min="1" max="4" className="border rounded px-3 py-2 text-sm" placeholder="Year 1-4"
            value={subjectForm.year_of_study} onChange={(e) => setSubjectForm({ ...subjectForm, year_of_study: e.target.value })} />
          <input type="number" className="border rounded px-3 py-2 text-sm" placeholder="Semester 1,3,5,7"
            value={subjectForm.semester_number} onChange={(e) => setSubjectForm({ ...subjectForm, semester_number: e.target.value })} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="NBA code" required
            value={subjectForm.nba_code} onChange={(e) => setSubjectForm({ ...subjectForm, nba_code: e.target.value })} />
          <button type="submit" className="bg-slate-900 text-white rounded text-sm font-semibold">Add subject</button>
        </form>
        <div className="overflow-auto max-h-[420px] border rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-600">
                <th className="p-2">NBA</th>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Program</th>
                <th className="p-2">Yr / Sem</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 font-semibold">{row.nba_code}</td>
                  <td className="p-2">{row.course_code}</td>
                  <td className="p-2">{row.course_name}</td>
                  <td className="p-2">{row.program_name}</td>
                  <td className="p-2">{row.year_of_study} / {row.semester_number}</td>
                  <td className="p-2"><button type="button" className="text-red-600 text-xs" onClick={() => deleteSubject(row.id)}>Remove</button></td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr><td className="p-4 text-slate-400" colSpan="6">No subjects for this session. Run seed_catalog or add a row.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-6">
        <h2 className="font-semibold mb-3">Faculty directory</h2>
        <form onSubmit={addFaculty} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <input className="border rounded px-3 py-2 text-sm col-span-2" placeholder="Full name" required
            value={facultyForm.full_name} onChange={(e) => setFacultyForm({ ...facultyForm, full_name: e.target.value })} />
          <select className="border rounded px-3 py-2 text-sm" value={facultyForm.campus}
            onChange={(e) => setFacultyForm({ ...facultyForm, campus: e.target.value })}>
            <option value="UNKNOWN">Campus not set</option>
            <option value="SECTOR_62">Sector-62</option>
            <option value="SECTOR_128">Sector-128</option>
          </select>
          <input className="border rounded px-3 py-2 text-sm" placeholder="Department"
            value={facultyForm.department} onChange={(e) => setFacultyForm({ ...facultyForm, department: e.target.value })} />
          <button type="submit" className="bg-slate-900 text-white rounded text-sm font-semibold">Add faculty</button>
        </form>
        {['SECTOR_62', 'SECTOR_128', 'UNKNOWN'].map((campus) => (
          <div key={campus} className="mb-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              {campus === 'SECTOR_62' ? 'Sector-62' : campus === 'SECTOR_128' ? 'Sector-128' : 'Campus not set'} ({groupedFaculty[campus].length})
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {groupedFaculty[campus].map((f) => (
                <div key={f.id} className="border rounded px-3 py-2 text-sm flex items-center justify-between gap-2">
                  <span className="truncate">{f.full_name}</span>
                  <select className="border rounded text-xs py-1" value={f.campus} onChange={(e) => setCampus(f.id, e.target.value)}>
                    <option value="UNKNOWN">Not set</option>
                    <option value="SECTOR_62">62</option>
                    <option value="SECTOR_128">128</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
