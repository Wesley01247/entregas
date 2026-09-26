import jsPDF from "jspdf";
import {
  brl,
  brlSigned,
  formatDayBR,
  groupByDay,
  periodLabel,
  sumEntries,
  type Entry,
} from "./finance";

export type ReportInput = {
  title: string;
  personName: string;
  start: string;
  end: string;
  entries: Entry[];
};

export function buildReportPdf({ title, personName, start, end, entries }: ReportInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const totals = sumEntries(entries);
  const marginX = 46;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ENTREGADOR", marginX, y);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  y += 18;
  doc.text("Meu financeiro", marginX, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Entregador: ${personName}`, marginX, y);
  y += 14;
  doc.text(`Periodo: ${periodLabel(start, end)}`, marginX, y);
  y += 14;
  doc.text(`Gerado em: ${formatDayBR(new Date().toISOString().slice(0, 10))}`, marginX, y);
  y += 22;

  const summary: Array<[string, string]> = [
    ["Total de entregas", String(totals.deliveries)],
    ["Valor bruto das entregas", brl(totals.deliveriesValue)],
    ["Outras entradas", brl(totals.extraIncome)],
    ["Faturamento bruto", brl(totals.gross)],
    ["Combustivel", brl(totals.fuel)],
    ["Manutencao", brl(totals.maintenance)],
    ["Outras despesas", brl(totals.otherExpenses)],
    ["Total de despesas", brl(totals.expenses)],
    [totals.result < 0 ? "Prejuizo" : "Resultado liquido", brlSigned(totals.result)],
  ];

  doc.setFont("helvetica", "bold");
  doc.text("Resumo do periodo", marginX, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  for (const [label, value] of summary) {
    doc.setDrawColor(220);
    doc.line(marginX, y + 3, 549, y + 3);
    y += 16;
    doc.text(label, marginX, y);
    doc.text(value, 549, y, { align: "right" });
  }

  y += 30;
  doc.setFont("helvetica", "bold");
  doc.text("Detalhamento diario", marginX, y);
  y += 18;

  const cols = [marginX, 118, 196, 268, 340, 412, 478, 549];
  const head = ["Data", "Entregas", "Valor", "Entradas", "Despesas", "Result.", "", ""];
  doc.setFontSize(9);
  doc.text(head[0]!, cols[0]!, y);
  doc.text(head[1]!, cols[1]!, y);
  doc.text(head[2]!, cols[2]!, y);
  doc.text(head[3]!, cols[3]!, y);
  doc.text("Combust.", cols[4]!, y);
  doc.text("Despesas", cols[5]!, y);
  doc.text("Resultado", cols[7]!, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.line(marginX, y, 549, y);
  y += 14;

  for (const row of groupByDay(entries).slice().reverse()) {
    if (y > 780) {
      doc.addPage();
      y = 56;
    }
    doc.text(formatDayBR(row.day), cols[0]!, y);
    doc.text(String(row.totals.deliveries), cols[1]!, y);
    doc.text(brl(row.totals.deliveriesValue), cols[2]!, y);
    doc.text(brl(row.totals.extraIncome), cols[3]!, y);
    doc.text(brl(row.totals.fuel), cols[4]!, y);
    doc.text(brl(row.totals.expenses), cols[5]!, y);
    doc.text(brlSigned(row.totals.result), cols[7]!, y, { align: "right" });
    y += 12;
    const carriers = [...new Set(row.entries.map((e) => e.carrier).filter(Boolean))];
    if (carriers.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Transportadoras: ${carriers.join(", ")}`, cols[0]!, y);
      doc.setFontSize(10);
      doc.setTextColor(0);
      y += 12;
    }
    y += 3;
  }

  if (entries.length === 0) {
    doc.text("Nenhum lancamento no periodo.", marginX, y);
  }

  return doc;
}

export function downloadReportPdf(input: ReportInput, filename: string) {
  buildReportPdf(input).save(filename);
}
