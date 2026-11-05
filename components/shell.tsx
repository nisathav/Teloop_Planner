"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  BarChart3, CalendarRange, ClipboardCheck, ClipboardList, Cpu, Download, FolderKanban, Gauge, LogOut, Settings, Timer, Users, Wallet,
} from "lucide-react";
import { selectProject } from "@/app/actions/project";
import { logout } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3, share: true },
  { href: "/schedule", label: "Schedule", icon: CalendarRange, share: true },
  { href: "/today", label: "Today", icon: ClipboardCheck, share: true },
  { href: "/log", label: "Log sessions", icon: Timer },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, share: true },
  { href: "/capacity", label: "Capacity", icon: Gauge, share: true },
  { href: "/operators", label: "Operators", icon: Users },
  { href: "/devices", label: "Devices", icon: Cpu },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/export", label: "Export", icon: Download },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({
  role,
  projects,
  currentId,
  children,
}: {
  role: "admin" | "share";
  projects: { id: string; name: string; status: string }[];
  currentId: string | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const items = NAV.filter((n) => role === "admin" || n.share);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-52 shrink-0 border-r bg-white md:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
            <span className="inline-block h-6 w-6 rounded bg-blue-700" /> Fleet Planner
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active(n.href) ? "bg-blue-50 font-medium text-blue-800" : "text-slate-600 hover:bg-slate-100")}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </nav>
          {role === "admin" ? (
            <form action={logout} className="border-t p-2">
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          ) : (
            <div className="border-t p-3 text-xs text-muted-foreground">Read-only share view</div>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4">
            <span className="font-semibold md:hidden">Fleet Planner</span>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <span className="hidden text-xs text-muted-foreground sm:inline">Project</span>
              <select
                className="h-8 max-w-[220px] rounded-md border bg-white px-2 text-sm"
                value={currentId ?? ""}
                disabled={pending || projects.length === 0}
                onChange={(e) => start(() => selectProject(e.target.value))}
              >
                {projects.length === 0 ? <option value="">No projects</option> : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {role === "share" ? <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Read-only</span> : null}
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t px-2 py-1 md:hidden">
            {items.map((n) => (
              <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded px-2.5 py-1 text-xs", active(n.href) ? "bg-blue-50 font-medium text-blue-800" : "text-slate-600")}>
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-[1600px] p-4">{children}</main>
      </div>
    </div>
  );
}
