import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { BookOpen } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bokken-surface-soft flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-bokken-navy flex items-center justify-center text-white mb-4 shadow-md animate-pulse">
          <BookOpen className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-slate-500">Iniciando Bokken Estudos...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};
