import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import CourseSubnav from '../components/CourseSubnav';
import A4Document from '../components/A4Document';
import { coordinatorName, coursesListLabel, coursesListPath, teachingFacultyName } from '../utils/offering';

const LEVEL_LABELS = {
  REMEMBER: 'Remember Level (Level 1)',
  UNDERSTAND: 'Understand Level (Level 2)',
  APPLY: 'Apply Level (Level 3)',
  ANALYZE: 'Analyze Level (Level 4)',
  EVALUATE: 'Evaluate Level (Level 5)',
  CREATE: 'Create Level (Level 6)',
};

function fmtAttainment(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : n.toFixed(2);
}

function computeTarget(historyByYear, coCode) {
  const vals = Object.values(historyByYear)
    .map((byCo) => byCo[coCode])
    .filter((v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
    .map(Number);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function resolvedTarget(report, historyByYear, coCode) {
  const manual = report?.co_targets?.[coCode];
  if (manual !== undefined && manual !== null && String(manual).trim() !== '') {
    return String(manual);
  }
  const calc = computeTarget(historyByYear, coCode);
  return calc == null ? '' : calc.toFixed(2);
}

function mappingLevel(co, poKey) {
  const row = (co.mappings || []).find((m) => m.po_key === poKey);
  return row?.level;
}

function strengthensPOs(co, poKeys) {
  const keys = poKeys.filter((key) => {
    const level = mappingLevel(co, key);
    return level !== null && level !== undefined && level !== '' && Number(level) > 0;
  });
  return keys.length ? keys.join(', ') : '—';
}

function mappingAvg(outcomes, poKey) {
  let sum = 0;
  let count = 0;
  outcomes.forEach((co) => {
    const level = mappingLevel(co, poKey);
    if (level !== null && level !== undefined && level !== '') {
      sum += Number(level);
      count += 1;
    }
  });
  return count ? Math.round((sum / count) * 100) / 100 : '—';
}

function emptyGap() {
  return { topic: '', co: '', popso: '', method: '' };
}

function emptyMod() {
  return { detail: '', justification: '', popso: '' };
}

export default function CourseOpeningReport() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [report, setReport] = useState(null);
  const [previousYear, setPreviousYear] = useState('');
  const [availableYears, setAvailableYears] = useState([]);
  const [loadYear, setLoadYear] = useState('');
  const [historyByYear, setHistoryByYear] = useState({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function load() {
    const res = await api.get(`/opening-reports/${id}/`);
    setCourse(res.data.course);
    setReport(res.data.report);
    const prev = res.data.previous_academic_year || '';
    const years = res.data.historical_years || [];
    setPreviousYear(prev);
    setAvailableYears(years);
    setLoadYear(years.includes(prev) ? prev : (years[0] || prev));
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load opening report.'));
  }, [id]);

  const outcomes = useMemo(
    () => [...(course?.outcomes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [course],
  );
  const poKeys = course?.po_pso_keys?.length ? course.po_pso_keys : ['PO1', 'PO2', 'PO3', 'PSO1', 'PSO2'];
  const semesterWord = course?.semester === 'EVEN' ? 'Even' : 'Odd';

  function patchReport(partial) {
    setReport((prev) => ({ ...prev, ...partial }));
  }

  async function save() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const res = await api.patch(`/opening-reports/${id}/`, {
        semester_label: report.semester_label,
        watermark_text: report.watermark_text,
        gaps_nil: report.gaps_nil,
        gaps_rows: report.gaps_rows,
        mods_nil: report.mods_nil,
        mods_rows: report.mods_rows,
        co_actions: report.co_actions,
        co_targets: report.co_targets,
        teaching_methods: report.teaching_methods,
        teaching_other: report.teaching_other,
        weak_strategies: report.weak_strategies,
        weak_other: report.weak_other,
        bright_strategies: report.bright_strategies,
        bright_other: report.bright_other,
        eval_strategies: report.eval_strategies,
        eval_other: report.eval_other,
        guidelines: report.guidelines,
        efforts_rows: report.efforts_rows,
        impact_points: report.impact_points,
      });
      setReport(res.data.report);
      setCourse(res.data.course);
      setStatus('Opening report saved.');
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'string' ? data : JSON.stringify(data || 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  async function loadPreviousAttainment() {
    setError('');
    setStatus('');
    setLoadingHistory(true);
    try {
      const year = loadYear || previousYear;
      const res = await api.get('/attainments/historical/', {
        params: { course: id, academic_year: year },
      });
      const records = res.data.records || [];
      setAvailableYears(res.data.available_years || availableYears);
      if (!records.length) {
        setStatus('');
        setError('No previous-year attainment data found.');
        return;
      }
      const byCo = {};
      records.forEach((row) => {
        byCo[row.co_code] = row.attainment;
      });
      setHistoryByYear((prev) => ({ ...prev, [res.data.requested_year]: byCo }));
      const nextHistory = { ...historyByYear, [res.data.requested_year]: byCo };
      const nextTargets = { ...(report.co_targets || {}) };
      Object.keys(byCo).forEach((coCode) => {
        if (nextTargets[coCode] === undefined || nextTargets[coCode] === '') {
          const suggested = computeTarget(nextHistory, coCode);
          if (suggested != null) nextTargets[coCode] = suggested.toFixed(2);
        }
      });
      patchReport({ co_targets: nextTargets });
      setStatus(`Loaded ${res.data.requested_year} attainment for ${records.length} CO(s).`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load previous-year attainment.');
    } finally {
      setLoadingHistory(false);
    }
  }

  function setAction(coCode, value) {
    patchReport({ co_actions: { ...(report.co_actions || {}), [coCode]: value } });
  }

  function setTarget(coCode, value) {
    patchReport({ co_targets: { ...(report.co_targets || {}), [coCode]: value } });
  }

  function toggleCheck(field, index, checked) {
    const next = [...(report[field] || [])];
    next[index] = { ...next[index], checked };
    patchReport({ [field]: next });
  }

  if (!course || !report) return <div className="p-8">Loading…</div>;

  const dept = course.department || '—';
  const coordinator = coordinatorName(course);
  const facultyPerson = teachingFacultyName(course);
  const courseLine = `${course.course_name} (${course.course_code})`;
  const ay = course.academic_year;
  const historyYears = Object.keys(historyByYear).sort().reverse();
  const attainmentYearLabel = historyYears.length ? historyYears.join(', ') : (previousYear || '—');
  const td = 'border border-slate-800 px-2 py-1';
  const th = 'border border-slate-800 px-2 py-1 bg-slate-50';

  return (
    <div className="p-8 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <div className="no-print">
        <Link to={coursesListPath(course)} className="text-sm text-slate-500 hover:text-slate-700">← Back to {coursesListLabel(course)}</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">{course.course_code} — {course.course_name}</h1>
        <p className="text-sm text-slate-500 mb-4">
          Session {course.session_label || course.academic_year}
          {` · Faculty: ${facultyPerson} · Coordinator: ${coordinator}`}
        </p>
        <CourseSubnav courseId={id} />

        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
        {status && <div className="bg-emerald-50 text-emerald-800 text-sm rounded p-3 mb-4">{status}</div>}

        <div className="flex flex-wrap gap-2 justify-end mb-4">
          <button type="button" onClick={() => window.print()} className="bg-slate-200 px-4 py-2 rounded text-sm font-semibold">
            Print / Save as PDF
          </button>
          <button type="button" disabled={saving} onClick={save} className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Opening Report'}
          </button>
        </div>

        <section className="bg-white shadow rounded-lg p-6 mb-6 space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900 mb-1">Synced from Course Description</h2>
            <p className="text-xs text-slate-500 mb-3">Header, COs and CO-PO-PSO mapping are read-only here. Edit them on the Course Description tab.</p>
            <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 rounded p-3 border">
              <p><span className="text-slate-500">Department:</span> {dept}</p>
              <p><span className="text-slate-500">Academic year:</span> {ay}</p>
              <p><span className="text-slate-500">Semester:</span> {semesterWord}</p>
              <p><span className="text-slate-500">Programme:</span> {course.program_name || '—'}</p>
              <p className="col-span-2"><span className="text-slate-500">Course:</span> {courseLine}</p>
              <p><span className="text-slate-500">NBA code:</span> {course.nba_code || '—'}</p>
              <p><span className="text-slate-500">Faculty:</span> {facultyPerson}</p>
              <p><span className="text-slate-500">Coordinator:</span> {coordinator}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Semester label (report)</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={report.semester_label || ''}
                  onChange={(e) => patchReport({ semester_label: e.target.value })} placeholder="e.g. 1st Semester" />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Watermark</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={report.watermark_text || ''}
                  onChange={(e) => patchReport({ watermark_text: e.target.value })} />
              </label>
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">3. Identified Gaps in Syllabus/CD</h2>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <input type="checkbox" checked={!!report.gaps_nil} onChange={(e) => patchReport({
                gaps_nil: e.target.checked,
                gaps_rows: e.target.checked ? report.gaps_rows : (report.gaps_rows?.length ? report.gaps_rows : [emptyGap()]),
              })} />
              No gaps identified (NIL)
            </label>
            {!report.gaps_nil && (
              <div className="space-y-2">
                {(report.gaps_rows || []).map((row, idx) => (
                  <div key={idx} className="border rounded p-3 grid grid-cols-2 gap-2">
                    {['topic', 'co', 'popso', 'method'].map((key) => {
                      const labels = {
                        topic: 'Topic to be introduced',
                        co: 'Strengthens CO',
                        popso: 'Strengthens PO, PSO',
                        method: 'Method of Identification',
                      };
                      return (
                      <input key={key} className="border rounded px-2 py-1 text-sm" placeholder={labels[key]}
                        value={row[key] || ''}
                        onChange={(e) => {
                          const next = [...(report.gaps_rows || [])];
                          next[idx] = { ...next[idx], [key]: e.target.value };
                          patchReport({ gaps_rows: next });
                        }} />
                      );
                    })}
                    <button type="button" className="text-xs text-red-600" onClick={() => {
                      const next = (report.gaps_rows || []).filter((_, i) => i !== idx);
                      patchReport({ gaps_rows: next.length ? next : [emptyGap()] });
                    }}>Remove</button>
                  </div>
                ))}
                <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
                  onClick={() => patchReport({ gaps_rows: [...(report.gaps_rows || []), emptyGap()] })}>+ Add Gap Row</button>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">4. Modifications in Syllabus/CD</h2>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <input type="checkbox" checked={!!report.mods_nil} onChange={(e) => patchReport({
                mods_nil: e.target.checked,
                mods_rows: e.target.checked ? report.mods_rows : (report.mods_rows?.length ? report.mods_rows : [emptyMod()]),
              })} />
              No modifications (NIL)
            </label>
            {!report.mods_nil && (
              <div className="space-y-2">
                {(report.mods_rows || []).map((row, idx) => (
                  <div key={idx} className="border rounded p-3 grid grid-cols-1 gap-2">
                    {['detail', 'justification', 'popso'].map((key) => {
                      const labels = {
                        detail: 'Details (Addition/Removal)',
                        justification: 'Justification',
                        popso: 'Strengthens POs/PSOs',
                      };
                      return (
                      <input key={key} className="border rounded px-2 py-1 text-sm" placeholder={labels[key]}
                        value={row[key] || ''}
                        onChange={(e) => {
                          const next = [...(report.mods_rows || [])];
                          next[idx] = { ...next[idx], [key]: e.target.value };
                          patchReport({ mods_rows: next });
                        }} />
                      );
                    })}
                    <button type="button" className="text-xs text-red-600" onClick={() => {
                      const next = (report.mods_rows || []).filter((_, i) => i !== idx);
                      patchReport({ mods_rows: next.length ? next : [emptyMod()] });
                    }}>Remove</button>
                  </div>
                ))}
                <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
                  onClick={() => patchReport({ mods_rows: [...(report.mods_rows || []), emptyMod()] })}>+ Add Modification Row</button>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">5. Actions for Improving CO Attainments</h2>
            <p className="text-xs text-slate-500 mb-3">
              Faculty set the <b>Target attainment</b> for each CO (typically 0–3). Previous-year values are optional.
              If years are loaded, you can copy the suggested average into the target. Click <b>Save Opening Report</b> to keep the values.
            </p>
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Academic year to load</span>
                <select className="border rounded px-3 py-2 text-sm min-w-[140px]" value={loadYear}
                  onChange={(e) => setLoadYear(e.target.value)}>
                  {previousYear && !availableYears.includes(previousYear) && (
                    <option value={previousYear}>{previousYear} (previous)</option>
                  )}
                  {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  {!previousYear && availableYears.length === 0 && <option value="">No years listed</option>}
                </select>
              </label>
              <button type="button" disabled={loadingHistory || !loadYear}
                onClick={loadPreviousAttainment}
                className="bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded disabled:opacity-50">
                {loadingHistory ? 'Loading…' : 'Load Previous Year Attainment'}
              </button>
            </div>
            {outcomes.length === 0 ? (
              <p className="text-sm text-slate-400">No course outcomes yet. Add them on the Course Description tab.</p>
            ) : (
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="p-2 w-[12%]">CO</th>
                      <th className="p-2 w-[18%]">Previous attainment</th>
                      <th className="p-2 w-[16%]">Target attainment</th>
                      <th className="p-2">Action to be taken in {ay}</th>
                      <th className="p-2 w-[18%]">Strengthens POs/PSOs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.map((co) => {
                      const suggested = computeTarget(historyByYear, co.co_code);
                      const prevText = historyYears.length === 1
                        ? (fmtAttainment(historyByYear[historyYears[0]]?.[co.co_code]) || '—')
                        : historyYears.length
                          ? historyYears.map((y) => `${y}: ${fmtAttainment(historyByYear[y]?.[co.co_code]) || '—'}`).join(' · ')
                          : 'Not loaded';
                      return (
                        <tr key={co.id || co.co_code} className="border-t align-top">
                          <td className="p-2 font-bold text-blue-800">{co.co_code}</td>
                          <td className="p-2 text-xs text-slate-600">{prevText}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="3"
                              className="w-full border rounded px-2 py-1.5 text-sm font-semibold"
                              value={report.co_targets?.[co.co_code] ?? ''}
                              onChange={(e) => setTarget(co.co_code, e.target.value)}
                              placeholder={suggested == null ? 'e.g. 1.80' : suggested.toFixed(2)}
                            />
                            {suggested != null && (
                              <button type="button"
                                className="mt-1 text-[11px] font-semibold text-violet-800 hover:underline"
                                onClick={() => setTarget(co.co_code, suggested.toFixed(2))}>
                                Use suggested {suggested.toFixed(2)}
                              </button>
                            )}
                          </td>
                          <td className="p-2">
                            <input className="w-full border rounded px-2 py-1.5 text-sm"
                              value={report.co_actions?.[co.co_code] || ''}
                              onChange={(e) => setAction(co.co_code, e.target.value)}
                              placeholder="Action to improve CO attainment" />
                          </td>
                          <td className="p-2 text-xs text-slate-600">{strengthensPOs(co, poKeys)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <ChecklistEditor title="6. Innovative Teaching & Learning Methods" items={report.teaching_methods || []}
            other={report.teaching_other || ''} onToggle={(i, c) => toggleCheck('teaching_methods', i, c)}
            onOther={(v) => patchReport({ teaching_other: v })} />
          <ChecklistEditor title="7a. Strategies for Weak Learners" items={report.weak_strategies || []}
            other={report.weak_other || ''} onToggle={(i, c) => toggleCheck('weak_strategies', i, c)}
            onOther={(v) => patchReport({ weak_other: v })} />
          <ChecklistEditor title="7b. Strategies for Bright Students" items={report.bright_strategies || []}
            other={report.bright_other || ''} onToggle={(i, c) => toggleCheck('bright_strategies', i, c)}
            onOther={(v) => patchReport({ bright_other: v })} />
          <ChecklistEditor title="8. Innovative Evaluation Strategy" items={report.eval_strategies || []}
            other={report.eval_other || ''} onToggle={(i, c) => toggleCheck('eval_strategies', i, c)}
            onOther={(v) => patchReport({ eval_other: v })} />

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">Appendix — Guidelines</h2>
            {(report.guidelines || []).map((g, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input className="flex-1 border rounded px-2 py-1 text-sm" value={g}
                  onChange={(e) => {
                    const next = [...(report.guidelines || [])];
                    next[idx] = e.target.value;
                    patchReport({ guidelines: next });
                  }} />
                <button type="button" className="text-red-600 text-sm" onClick={() => {
                  const next = (report.guidelines || []).filter((_, i) => i !== idx);
                  patchReport({ guidelines: next.length ? next : [''] });
                }}>✕</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
              onClick={() => patchReport({ guidelines: [...(report.guidelines || []), ''] })}>+ Add Guideline</button>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">Appendix — Efforts Table</h2>
            {(report.efforts_rows || []).map((row, idx) => (
              <div key={idx} className="border rounded p-3 mb-2 space-y-2">
                {['strategy', 'outcomes', 'documents'].map((key) => (
                  <textarea key={key} className="w-full border rounded px-2 py-1 text-sm" rows={2} placeholder={key}
                    value={row[key] || ''}
                    onChange={(e) => {
                      const next = [...(report.efforts_rows || [])];
                      next[idx] = { ...next[idx], [key]: e.target.value };
                      patchReport({ efforts_rows: next });
                    }} />
                ))}
                <button type="button" className="text-xs text-red-600" onClick={() => {
                  const next = (report.efforts_rows || []).filter((_, i) => i !== idx);
                  patchReport({ efforts_rows: next.length ? next : [{ strategy: '', outcomes: '', documents: '' }] });
                }}>Remove</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
              onClick={() => patchReport({ efforts_rows: [...(report.efforts_rows || []), { strategy: '', outcomes: '', documents: '' }] })}>
              + Add Strategy Row
            </button>
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">Appendix — Impact Analysis</h2>
            {(report.impact_points || []).map((p, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input className="flex-1 border rounded px-2 py-1 text-sm" value={p}
                  onChange={(e) => {
                    const next = [...(report.impact_points || [])];
                    next[idx] = e.target.value;
                    patchReport({ impact_points: next });
                  }} />
                <button type="button" className="text-red-600 text-sm" onClick={() => {
                  const next = (report.impact_points || []).filter((_, i) => i !== idx);
                  patchReport({ impact_points: next.length ? next : [''] });
                }}>✕</button>
              </div>
            ))}
            <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
              onClick={() => patchReport({ impact_points: [...(report.impact_points || []), ''] })}>+ Add Point</button>
          </div>
        </section>
      </div>

      <A4Document watermark={report.watermark_text} revision={`${JSON.stringify(report)}-${JSON.stringify(course)}`}>
        <div className="border-b border-slate-800 pb-3 mb-4 text-center">
          <p className="text-xl font-bold text-slate-900 uppercase tracking-wide">Course Opening Report</p>
          <p className="font-bold text-slate-900 uppercase text-[11px] mt-1 break-words">{course.institute || 'Institute'}</p>
        </div>

        <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className={`${td} font-semibold w-[18%]`}>Subject Code</td>
                <td className={`${td} w-[32%]`}>{course.course_code}</td>
                <td className={`${td} font-semibold w-[18%]`}>Semester</td>
                <td className={td}>{report.semester_label || semesterWord}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold`}>Program</td>
                <td className={td} colSpan="3">{course.program_name || '—'}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold`}>Department</td>
                <td className={td} colSpan="3">{dept}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold`}>Course Name</td>
                <td className={td} colSpan="3">{course.course_name || '—'}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold`}>Session</td>
                <td className={td} colSpan="3">{ay}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold`}>NBA Code</td>
                <td className={td}>{course.nba_code || '—'}</td>
                <td className={`${td} font-semibold`}>Session</td>
                <td className={td}>{course.session_label || ay}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Faculty (Names)</h3>
          <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className={`${td} font-semibold w-[22%]`}>Faculty</td>
                <td className={td}>{facultyPerson}</td>
              </tr>
              <tr>
                <td className={`${td} font-semibold w-[22%]`}>Course Coordinator</td>
                <td className={td}>{coordinator}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">1. Course Outcomes</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={`${th} w-[12%]`}>CO</th>
                <th className={th}>Description</th>
                <th className={`${th} w-[30%]`}>Cognitive Level</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => (
                <tr key={co.id || co.co_code}>
                  <td className={`${td} font-semibold`}>{co.co_code}</td>
                  <td className={td}>{co.description || '—'}</td>
                  <td className={td}>{LEVEL_LABELS[co.cognitive_level] || co.cognitive_level}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">2. CO-PO-PSO Mapping</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={th}>COs</th>
                {poKeys.map((key) => <th key={key} className={th}>{key}</th>)}
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => (
                <tr key={co.id || co.co_code}>
                  <td className={`${td} font-semibold text-center`}>{co.co_code}</td>
                  {poKeys.map((key) => {
                    const level = mappingLevel(co, key);
                    const has = level !== null && level !== undefined && level !== '';
                    const justification = (co.mappings || []).find((m) => m.po_key === key)?.justification;
                    return (
                      <td key={key} className={`${td} text-center align-top`}>
                        <div className="font-semibold">{has ? level : ''}</div>
                        {justification ? <div className="text-[9px] text-left mt-1">{justification}</div> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className={`${td} font-semibold text-center`}>Avg.</td>
                {poKeys.map((key) => (
                  <td key={key} className={`${td} text-center font-semibold`}>{mappingAvg(outcomes, key)}</td>
                ))}
              </tr>
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">
            3. Identified Gaps in Syllabus/ Course Description (If Any): {report.gaps_nil ? 'NIL' : ''}
          </h3>
          {!report.gaps_nil && (
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr>
                  <th className={th}>Topics to be introduced</th>
                  <th className={th}>Strengthens CO</th>
                  <th className={th}>Strengthens PO, PSO</th>
                  <th className={th}>Method of Identification</th>
                </tr>
              </thead>
              <tbody>
                {(report.gaps_rows || []).map((row, idx) => (
                  <tr key={idx}>
                    <td className={td}>{row.topic || '—'}</td>
                    <td className={td}>{row.co || '—'}</td>
                    <td className={td}>{row.popso || '—'}</td>
                    <td className={td}>{row.method || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="font-semibold underline mb-1">
            4. Modifications in Syllabus/ Course Description (If Any): {report.mods_nil ? 'NIL' : ''}
          </h3>
          {!report.mods_nil && (
            <table className="w-full border-collapse mb-4">
              <thead>
                <tr>
                  <th className={th}>Details of Modification (Addition/Removal)</th>
                  <th className={th}>Justification</th>
                  <th className={th}>Strengthens POs/PSOs</th>
                </tr>
              </thead>
              <tbody>
                {(report.mods_rows || []).map((row, idx) => (
                  <tr key={idx}>
                    <td className={td}>{row.detail || '—'}</td>
                    <td className={td}>{row.justification || '—'}</td>
                    <td className={td}>{row.popso || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="font-semibold underline mb-1">5. Actions for Improving CO Attainments</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={`${th} w-[10%]`}>COs</th>
                <th className={`${th} w-[16%]`}>Attainment ({attainmentYearLabel})</th>
                <th className={`${th} w-[10%]`}>Target</th>
                <th className={th}>Action to be taken in {ay} to improve CO attainment</th>
                <th className={`${th} w-[22%]`}>Strengthens POs/PSOs</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => {
                const prevText = historyYears.length === 1
                  ? (fmtAttainment(historyByYear[historyYears[0]]?.[co.co_code]) || '—')
                  : historyYears.length
                    ? historyYears.map((y) => `${y}: ${fmtAttainment(historyByYear[y]?.[co.co_code]) || '—'}`).join(', ')
                    : '—';
                const target = resolvedTarget(report, historyByYear, co.co_code);
                return (
                  <tr key={co.id || co.co_code}>
                    <td className={`${td} font-semibold`}>{co.co_code}</td>
                    <td className={td}>{prevText}</td>
                    <td className={`${td} font-semibold text-center`}>{target || '—'}</td>
                    <td className={td}>{report.co_actions?.[co.co_code] || '—'}</td>
                    <td className={td}>{strengthensPOs(co, poKeys)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">6. Innovative Teaching and Learning Method to be used</h3>
          <BulletList items={report.teaching_methods} other={report.teaching_other} />

          <h3 className="font-semibold underline mb-1">7. Strategies for</h3>
          <div className="mb-1"><b>Weak Learners:</b></div>
          <BulletList items={report.weak_strategies} other={report.weak_other} />
          <div className="mb-1"><b>Bright Students:</b></div>
          <BulletList items={report.bright_strategies} other={report.bright_other} />

          <h3 className="font-semibold underline mb-1">8. Innovative Evaluation Strategy to be used</h3>
          <BulletList items={report.eval_strategies} other={report.eval_other} />

          <h3 className="font-semibold underline mb-1 mt-6">Appendix</h3>

          <h3 className="font-semibold underline mb-1 mt-4">Guidelines to identify Weak Learners and Bright Students</h3>
          <ul className="list-disc ml-5 mb-4">
            {(report.guidelines || []).map((g, idx) => <li key={idx}>{g || '—'}</li>)}
          </ul>

          <h3 className="font-semibold underline mb-1">Efforts for Weak Learners and Bright Students</h3>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={`${th} w-[6%]`}>S.No.</th>
                <th className={`${th} w-[36%]`}>Strategy</th>
                <th className={`${th} w-[32%]`}>Expected Outcomes</th>
                <th className={th}>Documents to be produced</th>
              </tr>
            </thead>
            <tbody>
              {(report.efforts_rows || []).map((row, idx) => (
                <tr key={idx}>
                  <td className={td}>{idx + 1}</td>
                  <td className={td}>{row.strategy || '—'}</td>
                  <td className={td}>{row.outcomes || '—'}</td>
                  <td className={td}>{row.documents || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="font-semibold underline mb-1">Impact Analysis</h3>
          <ul className="list-disc ml-5 mb-3">
            {(report.impact_points || []).map((p, idx) => <li key={idx}>{p || '—'}</li>)}
          </ul>
      </A4Document>
    </div>
  );
}

function ChecklistEditor({ title, items, other, onToggle, onOther }) {
  return (
    <div>
      <h2 className="font-semibold text-slate-900 mb-2">{title}</h2>
      {items.map((item, idx) => (
        <label key={item.label} className="flex items-center gap-2 text-sm mb-1">
          <input type="checkbox" checked={!!item.checked} onChange={(e) => onToggle(idx, e.target.checked)} />
          <span>{item.label}</span>
        </label>
      ))}
      <label className="block text-sm mt-2">
        <span className="block text-xs font-medium text-slate-600 mb-1">Others</span>
        <input className="w-full border rounded px-3 py-2 text-sm" value={other} onChange={(e) => onOther(e.target.value)} />
      </label>
    </div>
  );
}

function BulletList({ items, other }) {
  const shown = (items || []).filter((t) => t.checked);
  return (
    <ul className="list-disc ml-5 mb-3">
      {shown.map((t) => <li key={t.label}>{t.label}</li>)}
      {other ? <li>{other}</li> : null}
    </ul>
  );
}
