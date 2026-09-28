import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const LEVEL_COLORS = {
  0: 'bg-slate-300',
  1: 'bg-amber-400',
  2: 'bg-sky-500',
  3: 'bg-emerald-500',
};

function Bar({ value, total, className }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2 bg-slate-100 rounded overflow-hidden">
      <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/')
      .then((res) => setData(res.data))
      .catch(() => setError('Could not load dashboard.'));
  }, []);

  const levels = data?.level_distribution ?? { 0: 0, 1: 0, 2: 0, 3: 0 };
  const levelTotal = Object.values(levels).reduce((sum, n) => sum + n, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome, {user?.name}</h1>
      <p className="text-slate-500 mb-8">{user?.role === 'ADMIN' ? 'Administrator' : 'Faculty'} dashboard</p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link to="/courses" className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
          <p className="text-3xl font-bold text-slate-900">{data?.course_count ?? '—'}</p>
          <p className="text-sm text-slate-500 mt-1">Your Courses</p>
        </Link>
        <Link to="/courses" className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
          <p className="text-3xl font-bold text-slate-900">{data?.pending_attainment ?? '—'}</p>
          <p className="text-sm text-slate-500 mt-1">Pending Attainment Calculations</p>
        </Link>
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-3xl font-bold text-slate-900">
            {data?.average_final_attainment != null ? `${data.average_final_attainment}%` : '—'}
          </p>
          <p className="text-sm text-slate-500 mt-1">Average CO Attainment</p>
        </div>
      </div>

      <section className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="font-semibold text-slate-900 mb-4">Attainment levels (0–3)</h2>
        {levelTotal === 0 && <p className="text-sm text-slate-400">No attainment results yet. Enter marks and recalculate.</p>}
        {['0', '1', '2', '3'].map((level) => (
          <div key={level} className="mb-3 last:mb-0">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Level {level}</span>
              <span>{levels[level] || 0} COs</span>
            </div>
            <Bar value={levels[level] || 0} total={levelTotal} className={LEVEL_COLORS[level]} />
          </div>
        ))}
      </section>

      <section className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Course snapshot</h2>
          <Link to="/courses" className="text-xs font-semibold text-slate-600 hover:text-slate-900">Manage courses</Link>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="px-6 py-3">Course</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3 text-center">COs</th>
                <th className="px-4 py-3 text-center">Avg attainment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.courses ?? []).length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-6 text-slate-400">No courses yet.</td>
                </tr>
              )}
              {(data?.courses ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Link to={`/courses/${c.id}/description`} className="font-semibold text-slate-900 hover:underline">
                      {c.course_code}
                    </Link>
                    <p className="text-xs text-slate-500">{c.course_name}</p>
                    {c.faculty_name && <p className="text-xs text-slate-400">{c.faculty_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{c.session_label || c.academic_year}</td>
                  <td className="px-4 py-3 text-center">{c.outcome_count}</td>
                  <td className="px-4 py-3 text-center font-medium">
                    {c.avg_final != null ? `${c.avg_final}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {c.outcome_count === 0 && <span className="text-xs text-slate-400">No COs</span>}
                    {c.pending && (
                      <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Pending</span>
                    )}
                    {c.outcome_count > 0 && !c.pending && (
                      <span className="text-xs font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Calculated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
