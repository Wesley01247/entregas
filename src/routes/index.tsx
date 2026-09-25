import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entregador — Meu financeiro" },
      {
        name: "description",
        content:
          "Registre entregas, ganhos e despesas do dia e acompanhe seu resultado em tempo real.",
      },
      { property: "og:title", content: "Entregador — Meu financeiro" },
      {
        property: "og:description",
        content: "Registre entregas, ganhos e despesas e acompanhe seu resultado.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth", replace: true });
    else void navigate({ to: isAdmin ? "/adm" : "/painel", replace: true });
  }, [loading, session, isAdmin, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-card rise-in px-8 py-10 text-center">
        <h1 className="text-gradient text-3xl font-extrabold uppercase">Entregador</h1>
        <p className="mt-1 text-sm text-muted-foreground">Meu financeiro</p>
        <p className="mt-6 text-xs text-muted-foreground">Carregando...</p>
      </div>
    </main>
  );
}
