export type Entry = {
  id: string;
  user_id: string;
  day: string;
  deliveries: number;
  price: number;
  extra_income: number;
  fuel: number;
  maintenance: number;
  other_expenses: number;
  notes: string;
  created_at: string;
};

export type Totals = {
  deliveries: number;
  deliveriesValue: number;
  extraIncome: number;
  gross: number;
  fuel: number;
  maintenance: number;
  otherExpenses: number;
  expenses: number;
  result: number;
};

export const emptyTotals: Totals = {
  deliveries: 0,
  deliveriesValue: 0,
  extraIncome: 0,
  gross: 0,
  fuel: 0,
  maintenance: 0,
  otherExpenses: 0,
  expenses: 0,
  result: 0,
};

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Soma acumulativa: cada lançamento é somado, nunca substituído. */
export function sumEntries(entries: Array<Partial<Entry>>): Totals {
  const t = { ...emptyTotals };
  for (const e of entries) {
    const deliveries = n(e.deliveries);
    const price = n(e.price);
    t.deliveries += deliveries;
    t.deliveriesValue += deliveries * price;
    t.extraIncome += n(e.extra_income);
    t.fuel += n(e.fuel);
    t.maintenance += n(e.maintenance);
    t.otherExpenses += n(e.other_expenses);
  }
  t.gross = t.deliveriesValue + t.extraIncome;
  t.expenses = t.fuel + t.maintenance + t.otherExpenses;
  t.result = t.gross - t.expenses;
  return t;
}

export function groupByDay(entries: Entry[]): Array<{ day: string; totals: Totals; entries: Entry[] }> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = map.get(e.day) ?? [];
    list.push(e);
    map.set(e.day, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => ({ day, totals: sumEntries(list), entries: list }));
}

export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/** Mostra prejuízo como -R$ 2,50 */
export const brlSigned = (value: number) =>
  value < 0 ? `-${brl(Math.abs(value))}` : brl(value);

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const todayISO = () => toISODate(new Date());

export const formatDayBR = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Semana de segunda a domingo. offset 0 = semana atual, -1 = semana anterior. */
export function weekRange(offset = 0, base = new Date()) {
  const d = new Date(base);
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday + offset * 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

export function monthRange(offset = 0, base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const end = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export const periodLabel = (start: string, end: string) =>
  `${formatDayBR(start)} a ${formatDayBR(end)}`;
