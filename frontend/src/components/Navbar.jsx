import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between no-print">
      <div className="flex items-center gap-6">
        <span className="font-bold text-lg">OBE Management System</span>
        <Link to="/" className="text-sm text-slate-300 hover:text-white">Dashboard</Link>
        <Link to="/courses" className="text-sm text-slate-300 hover:text-white">Courses</Link>
        <Link to="/lab-courses" className="text-sm text-slate-300 hover:text-white">Lab Courses</Link>
        {user.role === 'ADMIN' && (
          <>
            <Link to="/catalog" className="text-sm text-slate-300 hover:text-white">Catalog</Link>
            <Link to="/users" className="text-sm text-slate-300 hover:text-white">Users</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-300">{user.name} · {user.role}</span>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
