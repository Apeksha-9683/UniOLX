import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AppLayout } from './AppLayout';

export const ProtectedRoute: React.FC = () => {
  const { user, isAuthenticated, isVerified, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8EC] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-[#FFC72C] border-t-[#FF7A1A] animate-spin" />
        <span className="text-xs font-bold text-[#8C6500]">Verifying student session...</span>
      </div>
    );
  }

  // Not logged in -> Redirect to /login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but email not verified -> Redirect to /verify
  if (!isVerified) {
    return <Navigate to="/verify" replace />;
  }

  // Fully authenticated and verified student -> Render AppLayout with nested marketplace pages
  return <AppLayout />;
};
