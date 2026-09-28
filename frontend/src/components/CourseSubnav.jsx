import React from 'react';
import { NavLink } from 'react-router-dom';

export default function CourseSubnav({ courseId }) {
  const link = 'px-3 py-1.5 rounded text-sm font-medium';
  const active = 'bg-slate-900 text-white';
  const idle = 'text-slate-600 hover:bg-slate-100';

  return (
    <div className="flex flex-wrap gap-2 mb-6 no-print">
      <NavLink
        to={`/courses/${courseId}/description`}
        className={({ isActive }) => `${link} ${isActive ? active : idle}`}
      >
        Course Description
      </NavLink>
      <NavLink
        to={`/courses/${courseId}/opening-report`}
        className={({ isActive }) => `${link} ${isActive ? active : idle}`}
      >
        Opening Report
      </NavLink>
      <NavLink
        to={`/courses/${courseId}/assessments`}
        className={({ isActive }) => `${link} ${isActive ? active : idle}`}
      >
        Students & Marks
      </NavLink>
      <NavLink
        to={`/courses/${courseId}/assessment-tools`}
        className={({ isActive }) => `${link} ${isActive ? active : idle}`}
      >
        Assessment Tools
      </NavLink>
      <NavLink
        to={`/courses/${courseId}/closing-report`}
        className={({ isActive }) => `${link} ${isActive ? active : idle}`}
      >
        Closing Report
      </NavLink>
    </div>
  );
}
