"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Table, Td, Th } from "@/components/ui/table";
import { lkr } from "@/lib/format";

export type OpRow = {
  id: string;
  name: string;
  total: number;
  today: number;
  capLeft: number;
  earnings: number;
  paid: number;
  owed: number;
  byTask: Record<string, number>;
};

export function OperatorTable({ rows, tasks }: { rows: OpRow[]; tasks: { id: string; name: string }[] }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: "total", dir: -1 });
  const sorted = useMemo(() => {
    const get = (r: OpRow) => (sort.k.startsWith("task:") ? r.byTask[sort.k.slice(5)] ?? 0 : (r as unknown as Record<string, number | string>)[sort.k]);
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (typeof x === "string" ? String(x).localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
    });
  }, [rows, sort]);
  const H = ({ k, children, right = true }: { k: string; children: React.ReactNode; right?: boolean }) => (
    <Th className={right ? "text-right" : ""}>
      <button className="hover:text-foreground" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {children} {sort.k === k ? (sort.dir === 1 ? "▲" : "▼") : ""}
      </button>
    </Th>
  );
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <thead className="sticky top-0 bg-white">
          <tr>
            <H k="name" right={false}>Operator</H>
            <H k="total">Total h</H>
            {tasks.map((t) => (
              <H key={t.id} k={`task:${t.id}`}>{t.name}</H>
            ))}
            <H k="today">Today</H>
            <H k="capLeft">Cap left</H>
            <H k="earnings">Earnings</H>
            <H k="paid">Paid</H>
            <H k="owed">Owed</H>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">
                <Link className="text-primary hover:underline" href={`/operators/${r.id}`}>{r.name}</Link>
              </Td>
              <Td className="whitespace-nowrap text-right font-medium">{r.total.toFixed(1)}</Td>
              {tasks.map((t) => (
                <Td key={t.id} className="text-right">{(r.byTask[t.id] ?? 0).toFixed(1)}</Td>
              ))}
              <Td className="whitespace-nowrap text-right">{r.today.toFixed(1)}</Td>
              <Td className="whitespace-nowrap text-right">{r.capLeft.toFixed(1)}</Td>
              <Td className="whitespace-nowrap text-right">{lkr(r.earnings)}</Td>
              <Td className="whitespace-nowrap text-right">{lkr(r.paid)}</Td>
              <Td className={`text-right ${r.owed > 0 ? "font-medium text-amber-700" : ""}`}>{lkr(r.owed)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
