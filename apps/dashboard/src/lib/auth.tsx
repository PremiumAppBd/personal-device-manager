import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dataSource } from "./source";
import type { OwnerProfile } from "./types";

const TOKEN_KEY = "pdm.token";
const OWNER_KEY = "pdm.owner";

interface AuthState {
  token: string | null;
  owner: OwnerProfile | null;
  isAuthenticated: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    readStored<string>(TOKEN_KEY),
  );
  const [owner, setOwner] = useState<OwnerProfile | null>(() =>
    readStored<OwnerProfile>(OWNER_KEY),
  );

  const login = useCallback(async (email: string, password: string) => {
    const result = await dataSource.login(email, password);
    setToken(result.token);
    setOwner(result.owner);
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(result.token));
      localStorage.setItem(OWNER_KEY, JSON.stringify(result.owner));
    } catch {
      /* storage may be unavailable; session stays in memory */
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setOwner(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(OWNER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, owner, isAuthenticated: Boolean(token), login, logout }),
    [token, owner, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
