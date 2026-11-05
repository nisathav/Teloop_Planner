import { getCurrentProject, settingsOf } from "@/lib/data";
import { prisma } from "@/lib/db";
import { projectDays } from "@/lib/projectData";
import { PageHeader } from "@/components/ui/page-header";
import { NoProject } from "@/components/no-project";
import { CapacityPlanner } from "./planner";

export default async function CapacityPage() {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const [devices, tasks] = await Promise.all([
    prisma.device.count({ where: { status: { notIn: ["maintenance", "retired"] } } }),
    prisma.task.findMany({ where: { projectId: p.id, active: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Capacity planner"
        description="What-if calculator. Uses the same scheduling rules as the schedule board to simulate a device-day, then scales to the fleet."
      />
      <CapacityPlanner
        settings={settingsOf(p)}
        targetHours={p.targetHours}
        days={projectDays(p)}
        devices={devices}
        tasks={tasks.map((t) => ({ name: t.name, targetHours: t.targetHours, perPersonCapHours: t.perPersonCapHours }))}
      />
    </div>
  );
}
