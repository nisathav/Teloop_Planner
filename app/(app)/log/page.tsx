import { getCurrentProject } from "@/lib/data";
import { prisma } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/page-header";
import { NoProject } from "@/components/no-project";
import { LogRow } from "./log-row";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ booking?: string; show?: string }> }) {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const { booking, show } = await searchParams;
  const now = new Date();
  const include = { operator: true, device: true, segments: { include: { task: true }, orderBy: { order: "asc" as const } } };

  const pending = await prisma.booking.findMany({
    where: {
      projectId: p.id,
      OR: [
        { status: "completed", segments: { some: { actualMinutes: null } } },
        { status: { in: ["planned", "confirmed", "in-progress"] }, end: { lte: now } },
        ...(booking ? [{ id: booking }] : []),
      ],
    },
    include,
    orderBy: { start: "asc" },
  });
  const recent =
    show === "logged"
      ? await prisma.booking.findMany({ where: { projectId: p.id, status: "completed", loggedAt: { not: null } }, include, orderBy: { loggedAt: "desc" }, take: 30 })
      : [];
  const first = booking ? pending.filter((b) => b.id === booking) : [];
  const rest = pending.filter((b) => b.id !== booking);

  const ser = (b: (typeof pending)[number]) => ({
    id: b.id,
    start: b.start.getTime(),
    end: b.end.getTime(),
    status: b.status,
    notes: b.notes,
    device: b.device.code,
    operator: b.operator.name,
    segments: b.segments.map((s) => ({ id: s.id, task: s.task.name, planned: s.plannedMinutes, actual: s.actualMinutes })),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Log sessions"
        description="Enter actual recorded minutes per segment. Pre-filled with the plan; change only what differs and press Save. Saving marks the booking completed."
      >
        <a className="text-sm text-primary underline" href={show === "logged" ? "/log" : "/log?show=logged"}>
          {show === "logged" ? "Hide logged" : "Show recently logged"}
        </a>
      </PageHeader>
      {pending.length === 0 && recent.length === 0 ? <Empty>All finished bookings are logged. 🎉</Empty> : null}
      <div className="space-y-2">
        {[...first, ...rest].map((b) => (
          <LogRow key={b.id} b={ser(b)} highlight={b.id === booking} />
        ))}
      </div>
      {recent.length ? (
        <>
          <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Recently logged (editable)</h2>
          <div className="space-y-2">
            {recent.map((b) => (
              <LogRow key={b.id} b={ser(b)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
