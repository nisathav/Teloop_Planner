import Link from "next/link";
import { getCurrentProject } from "@/lib/data";
import { prisma } from "@/lib/db";
import { loadOperatorStats } from "@/lib/operatorStats";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { OperatorForm } from "@/components/operator-form";
import { lkr } from "@/lib/format";
import { parseList } from "@/lib/utils";

export default async function OperatorsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const p = await getCurrentProject();
  const [ops, stats, tasks] = await Promise.all([
    prisma.operator.findMany({ orderBy: { name: "asc" } }),
    loadOperatorStats(p),
    p ? prisma.task.findMany({ where: { projectId: p.id, active: true }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  const filtered = ops.filter(
    (o) => (!status || o.status === status) && (!q || `${o.name} ${o.area} ${o.phone}`.toLowerCase().includes(q.toLowerCase())),
  );
  const counts = { active: ops.filter((o) => o.status === "active").length, prospect: ops.filter((o) => o.status === "prospect").length };

  return (
    <div className="space-y-4">
      <PageHeader title="Operators" description={`${counts.active} active · ${counts.prospect} prospects · ${ops.length} total`}>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name / area / phone" className="h-9 rounded-md border px-2 text-sm" />
          <select name="status" defaultValue={status} className="h-9 rounded-md border px-2 text-sm">
            <option value="">All</option>
            <option>active</option>
            <option>prospect</option>
            <option>inactive</option>
          </select>
          <button className="h-9 rounded-md border bg-white px-3 text-sm">Filter</button>
        </form>
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardContent className="pt-4">
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Area</Th>
                  <Th>Phone</Th>
                  <Th>Supports</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Recorded (project)</Th>
                  <Th className="text-right">Planned</Th>
                  <Th className="text-right">Owed</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const s = stats.find((x) => x.operatorId === o.id);
                  return (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/operators/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.name}
                        </Link>
                      </Td>
                      <Td>{o.area}</Td>
                      <Td className="whitespace-nowrap">{o.phone}</Td>
                      <Td className="text-xs">{parseList(o.supportedTasks).join(", ")}</Td>
                      <Td>
                        <StatusBadge status={o.status} />
                      </Td>
                      <Td className="text-right">{((s?.projectRecorded ?? 0) / 60).toFixed(1)} h</Td>
                      <Td className="text-right">{((s?.projectPlanned ?? 0) / 60).toFixed(1)} h</Td>
                      <Td className="text-right">{lkr(s?.owed ?? 0)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {filtered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No operators match.</p> : null}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add operator</CardTitle>
          </CardHeader>
          <CardContent>
            <OperatorForm taskNames={tasks.map((t) => t.name)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
