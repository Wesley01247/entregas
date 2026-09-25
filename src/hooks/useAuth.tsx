import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "entregador" | "adm" | "adm_principal";

type Profile = { id: string; name: string; email: string; active: boolean };

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  isAdmin: boolean;
  isMainAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeta = async (userId: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, name, email, active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((prof as Profile) ?? null);
    const list = (roles ?? []).map((r) => r.role as Role);
    setRole(
      list.includes("adm_principal")
        ? "adm_principal"
        : list.includes("adm")
          ? "adm"
          : list.includes("entregador")
            ? "entregador"
            : null,
    );
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadMeta(nextSession.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadMeta(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin: role === "adm" || role === "adm_principal",
    isMainAdmin: role === "adm_principal",
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRole(null);
    },
    refresh: async () => {
      if (session?.user) await loadMeta(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
