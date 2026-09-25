import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import {
  brl,
  brlSigned,
  formatDayBR,
  greeting,
  groupByDay,
  monthRange,
  periodLabel,
  sumEntries,
  todayISO,
  weekRange,
  type Entry,
} from "@/lib/finance";
import { downloadReportPdf } from "@/lib/pdf";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Meu financeiro — Entregador" },
      {
        name: "description",
        content:
          "Painel do entregador: entregas do dia, ganhos, despesas, histórico e relatórios em PDF.",
      },
      { property: "og:title", content: "Meu financeiro — Entregador" },
      {
        property: "og:description",
        content: "Entregas do dia, ganhos, despesas, histórico e relatórios.",
      },
    ],
  }),
  component: PainelPage,
});

type FormState = {
  day: string;
  deliveries: string;
  price: string;
  extra_income: string;
  fuel: string;
  maintenance: string;
  other_expenses: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  day: todayISO(),
  deliveries: "",
  price: "",
  extra_income: "",
  fuel: "",
  maintenance: "",
  other_expenses: "",
  notes: "",
});

const num = (v: string) => {
  const parsed = Number(String(v).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

function Card({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="glass-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

function PainelPage() {
  const { loading, session, profile, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [rangeStart, setRangeStart] = useState(monthRange(0).start);
  const [rangeEnd, setRangeEnd] = useState(monthRange(0).end);

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth", replace: true });
    else if (isAdmin) void navigate({ to: "/adm", replace: true });
  }, [loading, session, isAdmin, navigate]);

  const entriesQuery = useQuery({
    queryKey: ["entries", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .order("day", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Entry[];
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["reports", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const entries = entriesQuery.data ?? [];

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão expirada");
      const payload = {
        day: form.day || todayISO(),
        deliveries: Math.max(0, Math.trunc(num(form.deliveries))),
        price: num(form.price),
        extra_income: num(form.extra_income),
        fuel: num(form.fuel),
        maintenance: num(form.maintenance),
        other_expenses: num(form.other_expenses),
        notes: form.notes.slice(0, 500),
      };
      if (
        payload.deliveries === 0 &&
        payload.extra_income === 0 &&
        payload.fuel === 0 &&
        payload.maintenance === 0 &&
        payload.other_expenses === 0
      ) {
        throw new Error("Preencha pelo menos uma entrega, entrada ou despesa.");
      }
      if (editing) {
        const { error } = await supabase.from("entries").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        // Novo lançamento: nunca substitui os anteriores, o sistema soma tudo.
        const { error } = await supabase.from("entries").insert({ ...payload, user_id: user.id });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Lançamento atualizado." : "Lançamento salvo e somado ao dia.");
      setForm(emptyForm());
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entries").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Lançamento excluído.");
      void queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = todayISO();
  const todayTotals = useMemo(
    () => sumEntries(entries.filter((e) => e.day === today)),
    [entries, today],
  );
  const periodEntries = useMemo(
    () => entries.filter((e) => e.day >= rangeStart && e.day <= rangeEnd),
    [entries, rangeStart, rangeEnd],
  );
  const periodTotals = useMemo(() => sumEntries(periodEntries), [periodEntries]);

  // Fechamento automático: registra o relatório da semana e do mês anteriores uma única vez.
  useEffect(() => {
    if (!user || entries.length === 0 || !reportsQuery.data) return;
    const pending = [
      { type: "semanal", ...weekRange(-1) },
      { type: "mensal", ...monthRange(-1) },
    ].filter(
      (p) =>
        entries.some((e) => e.day >= p.start && e.day <= p.end) &&
        !reportsQuery.data.some(
          (r: any) =>
            r.report_type === p.type && r.period_start === p.start && r.period_end === p.end,
        ),
    );
    if (pending.length === 0) return;
    void (async () => {
      await supabase.from("reports").insert(
        pending.map((p) => ({
          user_id: user.id,
          report_type: p.type,
          period_start: p.start,
          period_end: p.end,
        })),
      );
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    })();
  }, [user, entries, reportsQuery.data, queryClient]);

  const generateReport = async (type: "semanal" | "mensal") => {
    const range = type === "semanal" ? weekRange(0) : monthRange(0);
    const list = entries.filter((e) => e.day >= range.start && e.day <= range.end);
    if (list.length === 0) {
      toast.error("Nenhum lançamento neste período.");
      return;
    }
    await supabase.from("reports").upsert(
      {
        user_id: user!.id,
        report_type: type,
        period_start: range.start,
        period_end: range.end,
      },
      { onConflict: "user_id,report_type,period_start,period_end", ignoreDuplicates: true },
    );
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    downloadReportPdf(
      {
        title: `Relatório ${type}`,
        personName: profile?.name ?? "Entregador",
        start: range.start,
        end: range.end,
        entries: list,
      },
      `relatorio-${type}-${range.start}.pdf`,
    );
    toast.success("Relatório PDF gerado.");
  };

  const downloadSaved = (report: any) => {
    const list = entries.filter((e) => e.day >= report.period_start && e.day <= report.period_end);
    downloadReportPdf(
      {
        title: `Relatório ${report.report_type}`,
        personName: profile?.name ?? "Entregador",
        start: report.period_start,
        end: report.period_end,
        entries: list,
      },
      `relatorio-${report.report_type}-${report.period_start}.pdf`,
    );
  };

  const field = (
    key: keyof FormState,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        className="glass-input"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        {...props}
      />
    </label>
  );

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-16">
      <AppHeader />

      <section className="glass-card rise-in mb-5 p-4">
        <p className="font-display text-lg font-bold">
          {greeting()}, {profile?.name ?? "entregador"}
        </p>
        <p className="text-xs text-muted-foreground">{formatDayBR(today)}</p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3">
        <Card label="Entregas hoje" value={String(todayTotals.deliveries)} />
        <Card label="Valor das entregas hoje" value={brl(todayTotals.deliveriesValue)} />
        <Card label="Gastos hoje" value={brl(todayTotals.expenses)} />
        <Card
          label={todayTotals.result < 0 ? "Prejuízo hoje" : "Resultado hoje"}
          value={brlSigned(todayTotals.result)}
          tone={todayTotals.result < 0 ? "bad" : "good"}
        />
      </section>

      <section className="glass-card mb-6 p-4">
        <h2 className="font-display text-base font-bold uppercase">Registrar entregas</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Você pode enviar mais de um lançamento no mesmo dia. O sistema soma tudo.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {field("day", "Data", { type: "date" })}
          {field("deliveries", "Quantidade de entregas", {
            type: "number",
            min: 0,
            placeholder: "0",
          })}
          {field("price", "Valor por entrega (R$)", {
            type: "number",
            step: "0.01",
            min: 0,
            placeholder: "0,00",
          })}
          {field("extra_income", "Outras entradas (R$)", {
            type: "number",
            step: "0.01",
            min: 0,
            placeholder: "0,00",
          })}
          {field("fuel", "Combustível (R$)", {
            type: "number",
            step: "0.01",
            min: 0,
            placeholder: "0,00",
          })}
          {field("maintenance", "Manutenção (R$)", {
            type: "number",
            step: "0.01",
            min: 0,
            placeholder: "0,00",
          })}
          {field("other_expenses", "Outras despesas (R$)", {
            type: "number",
            step: "0.01",
            min: 0,
            placeholder: "0,00",
          })}
          {field("notes", "Observações", { type: "text", maxLength: 500, placeholder: "Opcional" })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="gradient-primary rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {editing ? "Salvar alterações" : "Salvar lançamento"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm());
              }}
              className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground"
            >
              Cancelar edição
            </button>
          ) : null}
        </div>
      </section>

      <section className="glass-card mb-6 p-4">
        <h2 className="font-display text-base font-bold uppercase">Histórico</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-muted-foreground">
              De
            </span>
            <input
              type="date"
              className="glass-input"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-muted-foreground">
              Até
            </span>
            <input
              type="date"
              className="glass-input"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="rounded-full border border-border bg-secondary px-3 py-1.5 font-semibold"
            onClick={() => {
              const r = weekRange(0);
              setRangeStart(r.start);
              setRangeEnd(r.end);
            }}
          >
            Esta semana
          </button>
          <button
            type="button"
            className="rounded-full border border-border bg-secondary px-3 py-1.5 font-semibold"
            onClick={() => {
              const r = monthRange(0);
              setRangeStart(r.start);
              setRangeEnd(r.end);
            }}
          >
            Este mês
          </button>
          <button
            type="button"
            className="rounded-full border border-border bg-secondary px-3 py-1.5 font-semibold"
            onClick={() => {
              setRangeStart(today);
              setRangeEnd(today);
            }}
          >
            Hoje
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-black/25 p-3 text-sm">
          <p className="text-xs text-muted-foreground">{periodLabel(rangeStart, rangeEnd)}</p>
          <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs sm:grid-cols-3">
            <span>Entregas: <b>{periodTotals.deliveries}</b></span>
            <span>Valor: <b>{brl(periodTotals.deliveriesValue)}</b></span>
            <span>Outras entradas: <b>{brl(periodTotals.extraIncome)}</b></span>
            <span>Combustível: <b>{brl(periodTotals.fuel)}</b></span>
            <span>Manutenção: <b>{brl(periodTotals.maintenance)}</b></span>
            <span>Outras despesas: <b>{brl(periodTotals.otherExpenses)}</b></span>
            <span>Despesas: <b>{brl(periodTotals.expenses)}</b></span>
            <span className={periodTotals.result < 0 ? "text-destructive" : "text-success"}>
              Resultado: <b>{brlSigned(periodTotals.result)}</b>
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {groupByDay(periodEntries).map((group) => (
            <div key={group.day} className="rounded-2xl border border-border bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold">{formatDayBR(group.day)}</p>
                <p
                  className={`text-sm font-bold ${group.totals.result < 0 ? "text-destructive" : "text-success"}`}
                >
                  {brlSigned(group.totals.result)}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {group.totals.deliveries} entregas · {brl(group.totals.deliveriesValue)} · entradas{" "}
                {brl(group.totals.extraIncome)} · despesas {brl(group.totals.expenses)}
              </p>
              <div className="mt-2 space-y-2">
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs"
                  >
                    <div>
                      <p>
                        {entry.deliveries} entregas × {brl(Number(entry.price))} ={" "}
                        <b>{brl(Number(entry.deliveries) * Number(entry.price))}</b>
                      </p>
                      <p className="text-muted-foreground">
                        comb. {brl(Number(entry.fuel))} · manut. {brl(Number(entry.maintenance))} ·
                        outras {brl(Number(entry.other_expenses))} · entradas{" "}
                        {brl(Number(entry.extra_income))}
                      </p>
                      {entry.notes ? <p className="mt-0.5 italic">{entry.notes}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label="Editar lançamento"
                        className="rounded-lg border border-border bg-secondary p-2"
                        onClick={() => {
                          setEditing(entry);
                          setForm({
                            day: entry.day,
                            deliveries: String(entry.deliveries),
                            price: String(entry.price),
                            extra_income: String(entry.extra_income),
                            fuel: String(entry.fuel),
                            maintenance: String(entry.maintenance),
                            other_expenses: String(entry.other_expenses),
                            notes: entry.notes ?? "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Excluir lançamento"
                        className="rounded-lg border border-border bg-secondary p-2 text-destructive"
                        onClick={() => {
                          if (confirm("Excluir este lançamento?")) remove.mutate(entry.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {periodEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum lançamento no período.</p>
          ) : null}
        </div>
      </section>

      <section className="glass-card p-4">
        <h2 className="font-display text-base font-bold uppercase">Relatórios</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generateReport("semanal")}
            className="gradient-primary inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold uppercase text-primary-foreground"
          >
            <FileText className="size-4" /> Gerar relatório PDF semanal
          </button>
          <button
            type="button"
            onClick={() => void generateReport("mensal")}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-xs font-bold uppercase text-secondary-foreground"
          >
            <FileText className="size-4" /> Gerar relatório PDF mensal
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {(reportsQuery.data ?? []).map((report: any) => (
            <div
              key={report.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs"
            >
              <div>
                <p className="font-semibold capitalize">{report.report_type}</p>
                <p className="text-muted-foreground">
                  {periodLabel(report.period_start, report.period_end)} · gerado em{" "}
                  {formatDayBR(String(report.created_at).slice(0, 10))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadSaved(report)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 font-semibold"
              >
                <Download className="size-3.5" /> Baixar PDF
              </button>
            </div>
          ))}
          {(reportsQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum relatório ainda. Os fechamentos de semana e mês aparecem aqui
              automaticamente.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
