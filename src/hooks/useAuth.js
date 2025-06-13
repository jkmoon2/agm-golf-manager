// src/hooks/useAuth.js

export function useAuth() {
  return { isAuthenticated: Boolean(localStorage.getItem('token')) };
}