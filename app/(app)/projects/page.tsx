import { listProjects, getCurrentProject } from "@/lib/data";
import { prisma } from "@/lib/db";
import { createProject, deleteProject, selectProject, setProjectStatus, updateProject } from "@/app/actions/project";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Submit } from "@/components/forms/submit";
import { ActionButton } from "@/components/forms/confirm-button";
import { addDays, dayKey } from "@/lib/rules/time";
import { fmtDate } from "@/lib/format";

export default async function ProjectsPage() {
  const [projects, current] = await Promise.all([listProjects(), getCurrentProject()]);
  const counts = await prisma.booking.groupBy({ by: ["projectId"], _count: true });
  const today = dayKey(Date.now());

  return (
    <div className="space-y-4">
      <PageHeader title="Projects" description="Create, select and archive projects. The selected project filters every screen." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {projects.map((p) => {
            const n = counts.find((c) => c.projectId === p.id)?._count ?? 0;
            return (
              <Card key={p.id} className={p.id === current?.id ? "ring-2 ring-blue-500" : ""}>
                <CardContent className="pt-4">
                  <form action={updateProject} className="grid gap-3 sm:grid-cols-6">
                    <input type="hidden" name="id" value={p.id} />
                    <Field label="Name" className="sm:col-span-2">
                      <Input name="name" defaultValue={p.name} />
                    </Field>
                    <Field label="Client">
                      <Input name="client" defaultValue={p.client} />
                    </Field>
                    <Field label="Target hours">
                      <Input name="targetHours" type="number" step="1" defaultValue={p.targetHours} />
                    </Field>
                    <Field label="Start">
                      <Input name="startDate" type="date" defaultValue={dayKey(p.startDate.getTime())} />
                    </Field>
                    <Field label="Deadline">
                      <Input name="deadline" type="date" defaultValue={dayKey(p.deadline.getTime())} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
                      <StatusBadge status={p.status} />
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(p.startDate)} → {fmtDate(p.deadline)} · {n} bookings
                      </span>
                      <div className="ml-auto flex gap-2">
                        {p.id !== current?.id ? (
                          <ActionButton size="sm" variant="secondary" action={selectProject.bind(null, p.id)}>
                            Select
                          </ActionButton>
                        ) : (
                          <span className="self-center text-xs font-medium text-blue-700">Current</span>
                        )}
                        <ActionButton size="sm" variant="outline" action={setProjectStatus.bind(null, p.id, p.status === "archived" ? "active" : "archived")}>
                          {p.status === "archived" ? "Unarchive" : "Archive"}
                        </ActionButton>
                        {n === 0 ? (
                          <ActionButton size="sm" variant="ghost" className="text-destructive" confirm="Delete this project and its tasks?" action={deleteProject.bind(null, p.id)}>
                            Delete
                          </ActionButton>
                        ) : null}
                        <Submit size="sm">Save</Submit>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createProject} className="space-y-3">
              <Field label="Name">
                <Input name="name" required placeholder="e.g. Kitchen tasks – 500 h" />
              </Field>
              <Field label="Client">
                <Input name="client" />
              </Field>
              <Field label="Target hours">
                <Input name="targetHours" type="number" defaultValue={1000} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start">
                  <Input name="startDate" type="date" defaultValue={today} />
                </Field>
                <Field label="Deadline">
                  <Input name="deadline" type="date" defaultValue={addDays(today, 7)} />
                </Field>
              </div>
              <Field label="Copy settings and tasks from" help="Optional. Otherwise default settings are used and you add tasks yourself.">
                <Select name="copyFrom" defaultValue="">
                  <option value="">— none (defaults) —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Submit className="w-full">Create project</Submit>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
