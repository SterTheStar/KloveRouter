import { useState, useEffect, useCallback } from "react";
import { auth, setup, setToken, clearToken, isAuthenticated } from "../api/client";

interface AuthState {
  isAuth: boolean;
  loading: boolean;
  error: string | null;
  needsSetup: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuth: isAuthenticated(), loading: true, error: null, needsSetup: false,
  });

  useEffect(() => {
    setup.status().then(({ needs_setup }) => {
      if (needs_setup) {
        setState({ isAuth: false, loading: false, error: null, needsSetup: true });
        return;
      }
      const token = localStorage.getItem("klove_token");
      if (!token) {
        setState({ isAuth: false, loading: false, error: null, needsSetup: false });
        return;
      }
      auth.verify().then((res) => {
        setState({ isAuth: res.valid, loading: false, error: null, needsSetup: false });
        if (!res.valid) clearToken();
      }).catch(() => {
        setState({ isAuth: false, loading: false, error: null, needsSetup: false });
        clearToken();
      });
    }).catch(() => setState({ isAuth: false, loading: false, error: "Unable to check setup status", needsSetup: false }));
  }, []);

  const completeSetup = useCallback(async (data: { name: string; password: string; confirm_password: string }) => {
    try {
      await setup.complete(data);
      setState({ isAuth: false, loading: false, error: null, needsSetup: false });
      return null;
    } catch (err: any) {
      return err.message || "Setup failed";
    }
  }, []);

  const login = useCallback(async (password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await auth.login(password);
      setToken(res.token);
      setState({ isAuth: true, loading: false, error: null, needsSetup: false });
      return true;
    } catch (err: any) {
      setState({ isAuth: false, loading: false, error: err.message, needsSetup: false });
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ isAuth: false, loading: false, error: null, needsSetup: false });
  }, []);

  return { ...state, completeSetup, login, logout };
}
