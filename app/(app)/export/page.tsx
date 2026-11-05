import { Download, Database } from "lucide-react";
import { getCurrentProject } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProject } from "@/components/no-project";

const EXPORTS = [
  { kind: "bookings", title: "Bookings", desc: "One row per segment: device, operator, times, task, planned vs actual minutes, power banks." },
  { kind: "operator-hours", title: "Operator hours", desc: "Recorded and planned hours per operator, by task, with remaining cap and paid vs owed." },
  { kind: "task-progress", title: "Task progress", desc: "Target, recorded, planned, remaining and operators still needed per task." },
  { kind: "payments", title: "Payments", desc: "Owed per operator for the project period and all payment records." },
  { kind: "all", title: "Everything (Excel)", desc: "All of the above as sheets in one workbook." },
];

export default async function ExportPage() {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const btn = "inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-slate-50";
  return (
    <div className="space-y-4">
      <PageHeader title="Export and backup" description={`Exports are for “${p.name}”.`} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {EXPORTS.map((e) => (
          <Card key={e.kind}>
            <CardHeader>
              <CardTitle>{e.title}</CardTitle>
              <CardDescription>{e.desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              {e.kind !== "all" ? (
                <a className={btn} href={`/api/export/${e.kind}?format=csv`}>
                  <Download className="h-4 w-4" /> CSV
                </a>
              ) : null}
              <a className={btn} href={`/api/export/${e.kind}?format=xlsx`}>
                <Download className="h-4 w-4" /> Excel
              </a>
            </CardContent>
          </Card>
        ))}
        <Card className="border-blue-300">
          <CardHeader>
            <CardTitle>Database backup</CardTitle>
            <CardDescription>Downloads a complete copy of the SQLite database (all projects). Restore by replacing prisma/dev.db with it while the app is stopped.</CardDescription>
          </CardHeader>
          <CardContent>
            <a className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" href="/api/backup">
              <Database className="h-4 w-4" /> Download backup
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
