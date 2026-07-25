import { useState, useEffect, useCallback } from "react";
import { auth, setToken, clearToken, isAuthenticated } from "../api/client";

interface AuthState {
  isAuth: boolean;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuth: isAuthenticated(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    const token = localStorage.getItem("klove_token");
    if (!token) {
      setState({ isAuth: false, loading: false, error: null });
      return;
    }

    auth
      .verify()
      .then((res) => {
        setState({ isAuth: res.valid, loading: false, error: null });
        if (!res.valid) {
          clearToken();
        }
      })
      .catch(() => {
        setState({ isAuth: false, loading: false, error: null });
        clearToken();
      });
  }, []);

  const login = useCallback(async (password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await auth.login(password);
      setToken(res.token);
      setState({ isAuth: true, loading: false, error: null });
      return true;
    } catch (err: any) {
      setState({ isAuth: false, loading: false, error: err.message });
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ isAuth: false, loading: false, error: null });
  }, []);

  return { ...state, login, logout };
}
