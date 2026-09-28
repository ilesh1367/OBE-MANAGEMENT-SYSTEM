import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import CourseSubnav from '../components/CourseSubnav';
import { coordinatorName, coursesListLabel, coursesListPath, teachingFacultyName } from '../utils/offering';

const CO_LEVEL_LABELS = {
  REMEMBER: 'Remember Level (C1)',
  UNDERSTAND: 'Understand Level (C2)',
  APPLY: 'Apply Level (C3)',
  ANALYZE: 'Analyze Level (C4)',
  EVALUATE: 'Evaluate Level (C5)',
  CREATE: 'Design (C6)',
};

const QUESTION_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Design'];

const QUESTION_LEVEL_FROM_CO = {
  REMEMBER: 'Remember',
  UNDERSTAND: 'Understand',
  APPLY: 'Apply',
  ANALYZE: 'Analyze',
  EVALUATE: 'Evaluate',
  CREATE: 'Design',
};

function questionLevelFor(cognitiveLevel) {
  return QUESTION_LEVEL_FROM_CO[cognitiveLevel] || 'Understand';
}

function emptyQuestion(outcomes, index = 0) {
  const co = outcomes[index] || outcomes[0];
  return {
    qno: `Q${index + 1}`,
    co_code: co?.co_code || '',
    ques_level: questionLevelFor(co?.cognitive_level),
    remarks: '',
  };
}

function renumberQuestions(questions) {
  return questions.map((q, i) => ({ ...q, qno: `Q${i + 1}` }));
}

export default function CourseAssessmentTools() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const [syncedFromMarks, setSyncedFromMarks] = useState(false);

  async function load() {
    const res = await api.get(`/assessment-tools/${id}/`);
    setCourse(res.data.course);
    setDoc(res.data.document);
    setSyncedFromMarks(!!res.data.synced_from_marks);
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load assessment tools.'));
  }, [id]);

  const outcomes = useMemo(
    () => [...(course?.outcomes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [course],
  );
  const semesterWord = course?.semester === 'EVEN' ? 'Even' : 'Odd';
  const semesterType = course?.semester === 'EVEN' ? 'EVEN' : 'ODD';

  function patchDoc(partial) {
    setDoc((prev) => ({ ...prev, ...partial }));
  }

  function tools() {
    return doc?.tools?.length ? doc.tools : [];
  }

  function setTools(next) {
    patchDoc({ tools: next });
  }

  function addTool() {
    const n = tools().length + 1;
    setTools([...tools(), { name: `T-${n}`, questions: [emptyQuestion(outcomes, 0)] }]);
  }

  function removeTool(index) {
    setTools(tools().filter((_, i) => i !== index));
  }

  function updateToolName(index, name) {
    setTools(tools().map((t, i) => (i === index ? { ...t, name } : t)));
  }

  function addQuestion(toolIndex) {
    setTools(tools().map((t, i) => {
      if (i !== toolIndex) return t;
      const questions = renumberQuestions([...t.questions, emptyQuestion(outcomes, t.questions.length)]);
      return { ...t, questions };
    }));
  }

  function removeQuestion(toolIndex, qIndex) {
    setTools(tools().map((t, i) => {
      if (i !== toolIndex) return t;
      if (t.questions.length <= 1) return t;
      return { ...t, questions: renumberQuestions(t.questions.filter((_, qi) => qi !== qIndex)) };
    }));
  }

  function updateQuestion(toolIndex, qIndex, field, value) {
    setTools(tools().map((t, i) => {
      if (i !== toolIndex) return t;
      const questions = t.questions.map((q, qi) => {
        if (qi !== qIndex) return q;
        if (field === 'co_code') {
          const co = outcomes.find((o) => o.co_code === value);
          return { ...q, co_code: value, ques_level: questionLevelFor(co?.cognitive_level) };
        }
        return { ...q, [field]: value };
      });
      return { ...t, questions };
    }));
  }

  async function save() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const res = await api.patch(`/assessment-tools/${id}/`, {
        doc_title: doc.doc_title,
        sub_heading: doc.sub_heading,
        semester_label: doc.semester_label,
        module_coordinator: doc.module_coordinator,
        watermark_text: doc.watermark_text,
        tools: doc.tools,
      });
      setDoc(res.data.document);
      setCourse(res.data.course);
      setStatus('Assessment Tools saved.');
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'string' ? data : JSON.stringify(data || 'Could not save.'));
    } finally {
      setSaving(false);
    }
  }

  if (!course || !doc) return <div className="p-8">Loading…</div>;

  const coordinator = coordinatorName(course);
  const facultyPerson = teachingFacultyName(course);
  const ay = course.academic_year;
  const td = 'border border-slate-800 px-2 py-1';
  const th = 'border border-slate-800 px-2 py-1 bg-slate-50';

  function coLevelText(coCode) {
    const co = outcomes.find((o) => o.co_code === coCode);
    if (!co) return coCode || '—';
    return `${co.co_code}, ${CO_LEVEL_LABELS[co.cognitive_level] || co.cognitive_level}`;
  }

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
            Print
          </button>
          <button type="button" disabled={saving} onClick={save} className="bg-slate-900 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Assessment Tools'}
          </button>
        </div>

        <section className="bg-white shadow rounded-lg p-6 mb-6 space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900 mb-1">Synced from Course Description</h2>
            <p className="text-xs text-slate-500 mb-3">
              Programme, session, course, NBA code, coordinator and CO Bloom levels come from this offering only.
              Edit COs on the Course Description tab.
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 rounded p-3 border">
              <p><span className="text-slate-500">Academic year:</span> {ay}</p>
              <p><span className="text-slate-500">Semester:</span> {semesterType}</p>
              <p className="col-span-2"><span className="text-slate-500">Programme:</span> {course.program_name || '—'}</p>
              <p className="col-span-2"><span className="text-slate-500">Course:</span> {course.course_name} ({course.course_code})</p>
              <p><span className="text-slate-500">NBA code:</span> {course.nba_code || '—'}</p>
              <p><span className="text-slate-500">Faculty:</span> {facultyPerson}</p>
              <p><span className="text-slate-500">Coordinator:</span> {coordinator}</p>
            </div>
            {outcomes.length > 0 && (
              <div className="mt-3 overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-600">
                      <th className="p-2">CO</th>
                      <th className="p-2">Cognitive level (from CD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomes.map((co) => (
                      <tr key={co.id || co.co_code} className="border-t">
                        <td className="p-2 font-semibold">{co.co_code}</td>
                        <td className="p-2">{CO_LEVEL_LABELS[co.cognitive_level] || co.cognitive_level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Semester label (document)</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={doc.semester_label || ''}
                  onChange={(e) => patchDoc({ semester_label: e.target.value })} placeholder="e.g. 1st Semester" />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-medium text-slate-600 mb-1">Module coordinator</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={doc.module_coordinator || ''}
                  onChange={(e) => patchDoc({ module_coordinator: e.target.value })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="block text-xs font-medium text-slate-600 mb-1">Document title</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={doc.doc_title || ''}
                  onChange={(e) => patchDoc({ doc_title: e.target.value })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="block text-xs font-medium text-slate-600 mb-1">Sub-heading</span>
                <input className="w-full border rounded px-3 py-2 text-sm" value={doc.sub_heading || ''}
                  onChange={(e) => patchDoc({ sub_heading: e.target.value })} />
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-slate-900">Assessment tools</h2>
              <div className="flex gap-2">
                <button type="button" className="text-xs font-semibold bg-blue-100 text-blue-900 px-3 py-1.5 rounded" onClick={() => load().then(() => setStatus('Synced from Students & Marks.'))}>
                  Sync from Students & Marks
                </button>
                {!syncedFromMarks && (
                  <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded" onClick={addTool}>
                    + Add tool
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {syncedFromMarks
                ? 'Questions, exam term (T1 / T2 / T3 / TA / Feedback) and CO mapping are pulled automatically from Students & Marks. Remarks stay editable. Click Sync after you change questions on the marks sheets.'
                : 'Add T-1, T-2 / mid sem, T-3 / end sem, then as many questions as needed. Choosing a CO fills the question cognitive level from that CO.'}
            </p>
            {outcomes.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded p-3 mb-3">
                No COs on this offering yet. Add them on Course Description first.
              </p>
            )}
            <div className="space-y-4">
              {tools().map((tool, tIdx) => (
                <div key={tIdx} className="border rounded-lg p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input className="border rounded px-3 py-1.5 text-sm font-semibold w-40"
                      value={tool.name || ''}
                      readOnly={syncedFromMarks && !!tool.assessment_type}
                      onChange={(e) => updateToolName(tIdx, e.target.value)}
                      placeholder="T-1" />
                    {tool.term ? <span className="text-xs text-slate-500">{tool.term}</span> : null}
                    {!(syncedFromMarks && tool.assessment_type) && (
                      <button type="button" className="text-xs font-semibold bg-slate-200 px-3 py-1.5 rounded"
                        onClick={() => addQuestion(tIdx)}>+ Question</button>
                    )}
                    {!(syncedFromMarks && tool.assessment_type) && (
                      <button type="button" className="text-xs text-red-600 ml-auto" onClick={() => removeTool(tIdx)}>Remove tool</button>
                    )}
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 text-xs">
                          <th className="pb-1 w-14">Q. No.</th>
                          <th className="pb-1 w-24">Max</th>
                          <th className="pb-1">CO cognitive level</th>
                          <th className="pb-1">Cognitive level of the question</th>
                          <th className="pb-1">Remarks</th>
                          <th className="pb-1 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(tool.questions || []).map((q, qIdx) => (
                          <tr key={qIdx} className="align-top">
                            <td className="py-1 pr-2 font-semibold">{q.qno}</td>
                            <td className="py-1 pr-2 text-slate-600">{q.max_marks || '—'}</td>
                            <td className="py-1 pr-2">
                              {syncedFromMarks && tool.assessment_type ? (
                                <span className="text-sm">{coLevelText(q.co_code)}</span>
                              ) : (
                                <select className="w-full border rounded px-2 py-1.5"
                                  value={q.co_code || ''}
                                  onChange={(e) => updateQuestion(tIdx, qIdx, 'co_code', e.target.value)}>
                                  <option value="">Select CO</option>
                                  {outcomes.map((co) => (
                                    <option key={co.id || co.co_code} value={co.co_code}>
                                      {co.co_code} — {CO_LEVEL_LABELS[co.cognitive_level] || co.cognitive_level}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-1 pr-2">
                              <select className="w-full border rounded px-2 py-1.5"
                                value={q.ques_level || ''}
                                onChange={(e) => updateQuestion(tIdx, qIdx, 'ques_level', e.target.value)}>
                                {QUESTION_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                              </select>
                            </td>
                            <td className="py-1 pr-2">
                              <input className="w-full border rounded px-2 py-1.5"
                                value={q.remarks || ''}
                                onChange={(e) => updateQuestion(tIdx, qIdx, 'remarks', e.target.value)}
                                placeholder="Optional" />
                            </td>
                            <td className="py-1">
                              {!(syncedFromMarks && tool.assessment_type) && (
                                <button type="button" className="text-red-600" onClick={() => removeQuestion(tIdx, qIdx)}>✕</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="cd-preview bg-white shadow rounded-lg p-8 relative text-[11px] leading-relaxed text-black">
        <div className="relative">
          <div className="border-b border-slate-800 pb-3 mb-4 text-center">
            <p className="text-xl font-bold text-slate-900 uppercase tracking-wide">{doc.doc_title || 'Assessment Tools'}</p>
            <p className="font-bold text-slate-900 uppercase text-[11px] mt-1 break-words">{course.institute || 'Institute'}</p>
          </div>
          {doc.sub_heading ? (
            <p className="text-center font-bold text-[13px] mb-3">{doc.sub_heading}</p>
          ) : null}

          <table className="w-full border-collapse mb-4">
            <tbody>
              <tr>
                <td className={`${td} text-center font-bold bg-slate-50`}>
                  {ay}, {semesterType} Semester Assessment Tools for CO Attainment
                </td>
              </tr>
              <tr>
                <td className={`${td} leading-relaxed`}>
                  <div><b>Programme Name:</b> {course.program_name || '—'}</div>
                  <div><b>Semester:</b> {doc.semester_label || `${semesterWord} Semester`}</div>
                  <div><b>Course Name &amp; Code:</b> {course.course_name} ({course.course_code})</div>
                  <div><b>NBA Code:</b> {course.nba_code || '—'}</div>
                  <div><b>Faculty:</b> {facultyPerson}</div>
                  <div><b>Name of Course Coordinator:</b> {coordinator}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse mb-4">
            <thead>
              <tr>
                <th className={`${th} w-[12%]`}>Assessment Tool</th>
                <th className={`${th} w-[16%]`}>Term</th>
                <th className={`${th} w-[10%]`}>Question No.</th>
                <th className={`${th} w-[8%]`}>Max</th>
                <th className={th}>CO Cognitive Level</th>
                <th className={th}>Cognitive Level of the Question</th>
                <th className={th}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {tools().map((tool) => (
                (tool.questions || []).map((q, qIdx) => (
                  <tr key={`${tool.name}-${qIdx}`}>
                    {qIdx === 0 ? (
                      <td className={`${td} font-bold text-center align-middle bg-slate-50`} rowSpan={(tool.questions || []).length}>
                        {tool.name}
                      </td>
                    ) : null}
                    {qIdx === 0 ? (
                      <td className={`${td} text-center align-middle`} rowSpan={(tool.questions || []).length}>
                        {tool.term || tool.name}
                      </td>
                    ) : null}
                    <td className={`${td} text-center font-semibold`}>{q.qno}</td>
                    <td className={`${td} text-center`}>{q.max_marks || '—'}</td>
                    <td className={`${td} text-center`}>{coLevelText(q.co_code)}</td>
                    <td className={`${td} text-center font-semibold`}>{q.ques_level || '—'}</td>
                    <td className={td}>{q.remarks || ''}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>

          <div className="mt-8 flex justify-between text-[11px] font-semibold">
            <span>Faculty: {facultyPerson}</span>
            <span>Course Coordinator: {coordinator}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
