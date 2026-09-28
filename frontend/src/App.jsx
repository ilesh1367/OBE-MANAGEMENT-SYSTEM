import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute, { GuestRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CourseDescription from './pages/CourseDescription';
import CourseOpeningReport from './pages/CourseOpeningReport';
import CourseAssessments from './pages/CourseAssessments';
import CourseAssessmentTools from './pages/CourseAssessmentTools';
import CourseClosingReport from './pages/CourseClosingReport';
import Users from './pages/Users';
import CatalogAdmin from './pages/CatalogAdmin';

function CourseHomeRedirect() {
  const { id } = useParams();
  return <Navigate to={`/courses/${id}/description`} replace />;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Routes>
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
        <Route path="/catalog" element={<ProtectedRoute adminOnly><CatalogAdmin /></ProtectedRoute>} />
        <Route path="/courses" element={<ProtectedRoute><Courses courseKind="THEORY" /></ProtectedRoute>} />
        <Route path="/lab-courses" element={<ProtectedRoute><Courses courseKind="LAB" /></ProtectedRoute>} />
        <Route path="/courses/:id" element={<ProtectedRoute><CourseHomeRedirect /></ProtectedRoute>} />
        <Route path="/courses/:id/description" element={<ProtectedRoute><CourseDescription /></ProtectedRoute>} />
        <Route path="/courses/:id/opening-report" element={<ProtectedRoute><CourseOpeningReport /></ProtectedRoute>} />
        <Route path="/courses/:id/assessments" element={<ProtectedRoute><CourseAssessments /></ProtectedRoute>} />
        <Route path="/courses/:id/assessment-tools" element={<ProtectedRoute><CourseAssessmentTools /></ProtectedRoute>} />
        <Route path="/courses/:id/closing-report" element={<ProtectedRoute><CourseClosingReport /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}
