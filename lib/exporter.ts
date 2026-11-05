import "server-only";
import ExcelJS from "exceljs";

export type Sheet = { name: string; columns: string[]; rows: (string | number | null)[][] };

export function toCsv(sheet: Sheet): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [sheet.columns, ...sheet.rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fleet Planner";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.columns).font = { bold: true };
    for (const r of s.rows) ws.addRow(r);
    ws.columns.forEach((c, i) => {
      const max = Math.max(s.columns[i]?.length ?? 8, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? "").length));
      c.width = Math.min(50, Math.max(8, max + 2));
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
