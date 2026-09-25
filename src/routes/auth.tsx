import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Entregador" },
      {
        name: "description",
        content: "Acesse sua conta de entregador para registrar entregas, ganhos e despesas.",
      },
      { property: "og:title", content: "Entrar — Entregador" },
      { property: "og:description", content: "Acesse sua conta de entregador." },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(80, "Nome muito longo"),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres").max(72),
});

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(1, "Informe a senha").max(72),
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) void navigate({ to: isAdmin ? "/adm" : "/painel", replace: true });
  }, [loading, session, isAdmin, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const parsed = signupSchema.safeParse({ name, email, password });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email.toLowerCase(),
          password: parsed.data.password,
          options: {
            data: { name: parsed.data.name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) {
          toast.error(
            error.message.toLowerCase().includes("already")
              ? "Este e-mail já está cadastrado."
              : error.message,
          );
          return;
        }
        toast.success("Conta criada! Entrando...");
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: parsed.data.email.toLowerCase(),
          password: parsed.data.password,
        });
        if (loginError) {
          toast.info("Conta criada. Faça login para continuar.");
          setMode("login");
        }
      } else {
        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email.toLowerCase(),
          password: parsed.data.password,
        });
        if (error) {
          toast.error("E-mail ou senha incorretos.");
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-gradient text-3xl font-extrabold uppercase">Entregador</h1>
          <p className="text-sm text-muted-foreground">Meu financeiro</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <h2 className="text-lg font-bold">{mode === "login" ? "Entrar" : "Criar conta"}</h2>

          {mode === "signup" ? (
            <input
              className="glass-input"
              type="text"
              placeholder="Seu nome"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          ) : null}

          <input
            className="glass-input"
            type="email"
            autoComplete="email"
            placeholder="Seu e-mail"
            value={email}
            maxLength={255}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="glass-input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="*********"
            value={password}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={busy}
            className="gradient-primary mt-1 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-1 text-xs font-semibold text-accent underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Não tem conta? Criar conta" : "Já tenho conta. Entrar"}
          </button>

          {mode === "login" ? (
            <button
              type="button"
              onClick={() =>
                toast.info("Esqueceu a senha? Somente o ADM pode trocar sua senha. Fale com ele.")
              }
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Esqueceu a senha?
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
