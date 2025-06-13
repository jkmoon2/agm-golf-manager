// src/components/RequireAuth.jsx

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';  // useAuth 훅 경로가 맞다면 그대로

export default function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated
    ? children
    : <Navigate to="/login" replace />;
}
