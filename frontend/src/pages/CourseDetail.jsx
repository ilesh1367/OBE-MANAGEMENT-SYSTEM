import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import CourseSubnav from '../components/CourseSubnav';
import { useAuth } from '../context/AuthContext';
import { coordinatorName, coursesListLabel, coursesListPath, teachingFacultyName } from '../utils/offering';

export default function CourseDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [course, setCourse] = useState(null);
  const [facultyList, setFacultyList] = useState([]);
  const [attainments, setAttainments] = useState([]);
  const [program, setProgram] = useState([]);

  function load() {
    api.get(`/courses/${id}/`).then((res) => setCourse(res.data));
    api.get(`/attainments/?course=${id}`).then((res) => setAttainments(res.data.results ?? res.data));
    api.get(`/attainments/program/?course=${id}`).then((res) => setProgram(res.data.results ?? res.data));
  }

  useEffect(load, [id]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/auth/users/?role=FACULTY').then((res) => setFacultyList(res.data.results ?? res.data));
    }
  }, [isAdmin]);

  async function assignFaculty(facultyId) {
    await api.patch(`/courses/${id}/`, { faculty: facultyId === '' ? null : Number(facultyId) });
    load();
  }

  async function deleteCourse() {
    if (!window.confirm(`Delete ${course.course_code}? All students, marks, and mapping will be removed.`)) return;
    await api.delete(`/courses/${id}/`);
    window.location.href = coursesListPath(course);
  }

  async function recalculate() {
    await api.post('/attainments/calculate/', { course: id });
    load();
  }

  if (!course) return <div className="p-8">Loading…</div>;

  const poKeys = course.po_pso_keys?.length ? course.po_pso_keys : ['PO1', 'PO2', 'PO3', 'PSO1', 'PSO2'];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to={coursesListPath(course)} className="text-sm text-slate-500 hover:text-slate-700">← Back to {coursesListLabel(course)}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-bold text-slate-900">{course.course_code} — {course.course_name}</h1>
        <button type="button" onClick={deleteCourse} className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded">
          Delete course
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {course.program_name ? `${course.program_name} · ` : ''}
        {course.session_label || `${course.semester} · ${course.academic_year}`}
        {` · Faculty: ${teachingFacultyName(course)} · Coordinator: ${coordinatorName(course)}`}
      </p>
      <CourseSubnav courseId={id} />

      <div className="bg-white shadow rounded-lg p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">Assigned faculty:</span>
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

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">CO attainment</h2>
            <p className="text-xs text-slate-500 mt-1">
              Edit COs and mapping on the Course Description tab. This page only shows calculated results.
            </p>
          </div>
          <button onClick={recalculate} className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded">
            Recalculate Attainment
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">CO</th>
                <th>Description</th>
                <th>Level</th>
                {poKeys.map((p) => <th key={p} className="text-center">{p}</th>)}
                <th className="text-center">CO %</th>
              </tr>
            </thead>
            <tbody>
              {(course.outcomes || []).length === 0 && (
                <tr><td colSpan={poKeys.length + 4} className="py-4 text-slate-400">No outcomes yet. Add them in Course Description.</td></tr>
              )}
              {(course.outcomes || []).map((co) => {
                const att = attainments.find((a) => a.course_outcome === co.id);
                return (
                  <tr key={co.id} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{co.co_code}</td>
                    <td className="pr-2 text-slate-600">{co.description}</td>
                    <td className="text-xs text-slate-500">{co.cognitive_level}</td>
                    {poKeys.map((p) => {
                      const m = (co.mappings || []).find((mm) => mm.po_key === p);
                      return (
                        <td key={p} className="text-center">{m?.level ?? '—'}</td>
                      );
                    })}
                    <td className="text-center font-semibold">
                      {att?.final_attainment ?? '—'}
                      {att?.attainment_level != null && <span className="block text-xs text-slate-400">L{att.attainment_level}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">PO / PSO attainment</h2>
        <p className="text-xs text-slate-500 mb-4">
          Weighted average of CO attainment using mapping strength (1–3).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {poKeys.map((key) => {
            const row = (Array.isArray(program) ? program : []).find((p) => p.po_key === key);
            return (
              <div key={key} className="border rounded p-3 text-center">
                <p className="text-xs text-slate-500">{key}</p>
                <p className="text-lg font-bold text-slate-900">{row?.percentage ?? '—'}</p>
                <p className="text-xs text-slate-400">{row?.attainment_level != null ? `Level ${row.attainment_level}` : 'No data'}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
