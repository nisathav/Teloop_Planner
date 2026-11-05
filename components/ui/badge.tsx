import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  gray: "bg-gray-100 text-gray-500 border-gray-200",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "default", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none", tones[tone], className)} {...p} />;
}

export const STATUS_TONE: Record<string, Tone> = {
  planned: "blue",
  confirmed: "violet",
  "in-progress": "amber",
  completed: "green",
  cancelled: "gray",
  "no-show": "red",
  available: "green",
  booked: "blue",
  "in-field": "amber",
  offloading: "violet",
  charging: "violet",
  maintenance: "red",
  retired: "gray",
  active: "green",
  prospect: "blue",
  inactive: "gray",
  charged: "green",
  "in-use": "amber",
  archived: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "default"}>{status}</Badge>;
}
