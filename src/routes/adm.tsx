import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import {
  adminCreateAdmin,
  adminDeleteUser,
  adminOverview,
  adminResetPassword,
} from "@/lib/admin.functions";
import {
  brl,
  brlSigned,
  formatDayBR,
  groupByDay,
  monthRange,
  periodLabel,
  sumEntries,
  todayISO,
  weekRange,
  type Entry,
} from "@/lib/finance";

export const Route = createFileRoute("/adm")({
  head: () => ({
    meta: [
      { title: "ADM — lançamentos | Entregador" },
      {
        name: "description",
        content:
          "Painel administrativo: consulta dos lançamentos, entregas e valores de cada entregador.",
      },
      { property: "og:title", content: "ADM — lançamentos | Entregador" },
      {
        property: "og:description",
        content: "Consulta dos lançamentos, entregas e valores dos entregadores.",
      },
    ],
  }),
  component: AdmPage,
});

function AdmPage() {
  const { loading, session, isAdmin, isMainAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(adminOverview);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteUser);
  const createFn = useServerFn(adminCreateAdmin);

  const [start, setStart] = useState(monthRange(0).start);
  const [end, setEnd] = useState(monthRange(0).end);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [newAdm, setNewAdm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth", replace: true });
    else if (!isAdmin) void navigate({ to: "/painel", replace: true });
  }, [loading, session, isAdmin, navigate]);

  const overview = useQuery({
    queryKey: ["admin-overview", start, end, user?.id],
    enabled: !!session && isAdmin,
    // Atualiza os valores automaticamente conforme os entregadores lançam.
    refetchInterval: 15000,
    queryFn: () => overviewFn({ data: { start, end } }),
  });

  const rows = overview.data?.rows ?? [];
  const deliverers = useMemo(() => rows.filter((r) => r.role === "entregador"), [rows]);
  const admins = useMemo(() => rows.filter((r) => r.role !== "entregador"), [rows]);

  const reset = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => resetFn({ data: vars }),
    onSuccess: () => toast.success("Senha alterada."),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeUser = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído.");
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createAdm = useMutation({
    mutationFn: () => createFn({ data: newAdm }),
    onSuccess: () => {
      toast.success("Novo ADM criado.");
      setNewAdm({ name: "", email: "", password: "" });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </main>
    );
  }

  const quick = (label: string, range: { start: string; end: string }) => (
    <button
      type="button"
      key={label}
      onClick={() => {
        setStart(range.start);
        setEnd(range.end);
      }}
      className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold"
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-16">
      <AppHeader />

      <section className="glass-card rise-in mb-5 p-4">
        <h2 className="font-display text-lg font-bold uppercase">ADM — lançamentos</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O ADM somente consulta os lançamentos feitos pelos entregadores. O ADM não registra
          entregas.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {quick("Hoje", { start: todayISO(), end: todayISO() })}
          {quick("Esta semana", weekRange(0))}
          {quick("Este mês", monthRange(0))}
          <button
            type="button"
            onClick={() => void overview.refetch()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" /> Atualizar
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-muted-foreground">
              De
            </span>
            <input
              type="date"
              className="glass-input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-muted-foreground">
              Até
            </span>
            <input
              type="date"
              className="glass-input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{periodLabel(start, end)}</p>
      </section>

      <section className="glass-card mb-5 p-4">
        <h3 className="font-display text-base font-bold uppercase">Entregadores</h3>
        {overview.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">Carregando dados...</p>
        ) : null}
        {overview.isError ? (
          <p className="mt-3 text-xs text-destructive">{(overview.error as Error).message}</p>
        ) : null}

        <div className="mt-3 space-y-3">
          {deliverers.map((row) => {
            const totals = sumEntries(row.periodEntries as unknown as Entry[]);
            const open = openUser === row.id;
            return (
              <div key={row.id} className="rounded-2xl border border-border bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-sm font-bold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    <p className="mt-1 text-xs">
                      <b>{row.allTime.deliveries} entregas</b> · {brl(row.allTime.value)} valor
                      (total geral)
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Trocar senha"
                      className="rounded-lg border border-border bg-secondary p-2"
                      onClick={() => {
                        const senha = prompt(`Nova senha para ${row.name} (mínimo 6 caracteres):`);
                        if (senha && senha.length >= 6)
                          reset.mutate({ userId: row.id, password: senha });
                        else if (senha) toast.error("A senha precisa ter ao menos 6 caracteres.");
                      }}
                    >
                      <KeyRound className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir usuário"
                      className="rounded-lg border border-border bg-secondary p-2 text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir ${row.name} e todos os lançamentos dele?`))
                          removeUser.mutate(row.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-y-1 rounded-xl bg-black/25 p-2 text-[11px] sm:grid-cols-3">
                  <span>Entregas: <b>{totals.deliveries}</b></span>
                  <span>Valor: <b>{brl(totals.deliveriesValue)}</b></span>
                  <span>Outras entradas: <b>{brl(totals.extraIncome)}</b></span>
                  <span>Combustível: <b>{brl(totals.fuel)}</b></span>
                  <span>Manutenção: <b>{brl(totals.maintenance)}</b></span>
                  <span>Outras despesas: <b>{brl(totals.otherExpenses)}</b></span>
                  <span>Despesas: <b>{brl(totals.expenses)}</b></span>
                  <span className={totals.result < 0 ? "text-destructive" : "text-success"}>
                    Resultado: <b>{brlSigned(totals.result)}</b>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenUser(open ? null : row.id)}
                  className="mt-2 text-xs font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {open ? "Ocultar lançamentos" : "Ver lançamentos do período"}
                </button>

                {open ? (
                  <div className="mt-2 space-y-2">
                    {groupByDay(row.periodEntries as unknown as Entry[]).map((group) => (
                      <div key={group.day} className="rounded-xl bg-black/25 px-3 py-2 text-[11px]">
                        <div className="flex justify-between">
                          <b>{formatDayBR(group.day)}</b>
                          <span
                            className={
                              group.totals.result < 0 ? "text-destructive" : "text-success"
                            }
                          >
                            {brlSigned(group.totals.result)}
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          {group.totals.deliveries} entregas ·{" "}
                          {brl(group.totals.deliveriesValue)} · despesas{" "}
                          {brl(group.totals.expenses)}
                        </p>
                      </div>
                    ))}
                    {row.periodEntries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Nenhum lançamento no período.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!overview.isLoading && deliverers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado ainda.</p>
          ) : null}
        </div>
      </section>

      <section className="glass-card p-4">
        <h3 className="font-display text-base font-bold uppercase">Administradores</h3>
        <div className="mt-3 space-y-2">
          {admins.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs"
            >
              <div>
                <p className="font-semibold">{row.name}</p>
                <p className="text-muted-foreground">
                  {row.email} ·{" "}
                  {row.role === "adm_principal" ? "ADM principal / programador" : "ADM"}
                </p>
              </div>
              {isMainAdmin && row.role !== "adm_principal" ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Trocar senha do ADM"
                    className="rounded-lg border border-border bg-secondary p-2"
                    onClick={() => {
                      const senha = prompt(`Nova senha para ${row.name}:`);
                      if (senha && senha.length >= 6)
                        reset.mutate({ userId: row.id, password: senha });
                      else if (senha) toast.error("A senha precisa ter ao menos 6 caracteres.");
                    }}
                  >
                    <KeyRound className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir ADM"
                    className="rounded-lg border border-border bg-secondary p-2 text-destructive"
                    onClick={() => {
                      if (confirm(`Excluir o ADM ${row.name}?`)) removeUser.mutate(row.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {isMainAdmin ? (
          <div className="mt-4 rounded-2xl border border-border bg-black/20 p-3">
            <p className="font-display text-sm font-bold">Criar novo ADM</p>
            <div className="mt-2 grid gap-2">
              <input
                className="glass-input"
                placeholder="Nome"
                maxLength={80}
                value={newAdm.name}
                onChange={(e) => setNewAdm({ ...newAdm, name: e.target.value })}
              />
              <input
                className="glass-input"
                type="email"
                placeholder="E-mail"
                maxLength={255}
                value={newAdm.email}
                onChange={(e) => setNewAdm({ ...newAdm, email: e.target.value })}
              />
              <input
                className="glass-input"
                type="password"
                placeholder="Senha (mínimo 6)"
                maxLength={72}
                value={newAdm.password}
                onChange={(e) => setNewAdm({ ...newAdm, password: e.target.value })}
              />
              <button
                type="button"
                disabled={createAdm.isPending}
                onClick={() => createAdm.mutate()}
                className="gradient-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold uppercase text-primary-foreground disabled:opacity-60"
              >
                <UserPlus className="size-4" /> Criar ADM
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Somente o ADM principal pode criar ou excluir outros administradores.
          </p>
        )}
      </section>
    </main>
  );
}
