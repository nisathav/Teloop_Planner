import { getCurrentProject } from "@/lib/data";
import { getRole } from "@/lib/auth";
import { loadTaskProgress } from "@/lib/projectData";
import { saveTask, deleteTask } from "@/app/actions/setup";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Submit } from "@/components/forms/submit";
import { ActionButton } from "@/components/forms/confirm-button";
import { NoProject } from "@/components/no-project";
import { Table, Td, Th } from "@/components/ui/table";
import { ProgressBar } from "@/components/progress-bar";

const f1 = (n: number) => n.toFixed(1);

export default async function TasksPage() {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const admin = (await getRole()) === "admin";
  const { tasks, progress } = await loadTaskProgress(p);
  const totalTarget = tasks.filter((t) => t.active).reduce((s, t) => s + t.targetHours, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        description={`Per-task targets for ${p.name}. Task targets sum to ${totalTarget} h of the ${p.targetHours} h project target. Recorded = logged actual minutes only.`}
      />
      {totalTarget !== p.targetHours ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Task targets ({totalTarget} h) don&apos;t add up to the project target ({p.targetHours} h).
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-4">
          <Table>
            <thead>
              <tr>
                <Th>Task</Th>
                <Th className="text-right">Target</Th>
                <Th className="text-right">Cap / person</Th>
                <Th className="text-right">Recorded</Th>
                <Th className="text-right">Planned</Th>
                <Th className="text-right">Remaining</Th>
                <Th className="text-right">Operators still needed</Th>
                <Th className="w-[30%]">Progress</Th>
              </tr>
            </thead>
            <tbody>
              {progress.map((t) => {
                const task = tasks.find((x) => x.id === t.taskId)!;
                return (
                  <tr key={t.taskId} className={task.active ? "" : "opacity-50"}>
                    <Td>
                      <div className="font-medium">{t.name}</div>
                      <div className="flex gap-1">
                        {!task.active ? <Badge tone="gray">inactive</Badge> : null}
                        {t.behind ? <Badge tone="red">behind</Badge> : null}
                        {task.requirements ? <Badge>{task.requirements}</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-right">{f1(t.target)} h</Td>
                    <Td className="text-right">
                      {f1(t.capHours)} h{task.perPersonCapHours != null ? <span className="text-xs text-blue-700"> (task)</span> : null}
                    </Td>
                    <Td className="text-right font-medium">{f1(t.recorded)} h</Td>
                    <Td className="text-right">{f1(t.planned)} h</Td>
                    <Td className="text-right">{f1(t.remaining)} h</Td>
                    <Td className="text-right">{t.operatorsNeeded}</Td>
                    <Td>
                      <ProgressBar target={t.target} recorded={t.recorded} planned={t.planned} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">Operators still needed = remaining (unplanned) hours ÷ per-person cap.</p>
        </CardContent>
      </Card>

      {admin ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-4">
                <form action={saveTask} className="grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={t.id} />
                  <Field label="Name" className="sm:col-span-2">
                    <Input name="name" defaultValue={t.name} />
                  </Field>
                  <Field label="Target h">
                    <Input name="targetHours" type="number" step="0.5" defaultValue={t.targetHours} />
                  </Field>
                  <Field label="Cap / person h" help={`Blank = project (${p.maxHoursPerOperatorPerTask} h)`}>
                    <Input name="perPersonCapHours" type="number" step="0.25" defaultValue={t.perPersonCapHours ?? ""} placeholder={String(p.maxHoursPerOperatorPerTask)} />
                  </Field>
                  <Field label="Requirements" className="sm:col-span-2">
                    <Input name="requirements" defaultValue={t.requirements} placeholder="e.g. needs kitchen" />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Textarea name="description" defaultValue={t.description} rows={1} />
                  </Field>
                  <div className="flex items-center gap-2 sm:col-span-4">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                    </label>
                    <div className="ml-auto flex gap-2">
                      <ActionButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        confirm="Remove this task? (Tasks with recordings are deactivated instead.)"
                        action={deleteTask.bind(null, t.id)}
                      >
                        Remove
                      </ActionButton>
                      <Submit size="sm">Save</Submit>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          ))}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Add task</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveTask} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="projectId" value={p.id} />
                <Field label="Name" className="sm:col-span-2">
                  <Input name="name" required placeholder="e.g. Laundry folding" />
                </Field>
                <Field label="Target h">
                  <Input name="targetHours" type="number" step="0.5" defaultValue={0} />
                </Field>
                <Field label="Cap / person h">
                  <Input name="perPersonCapHours" type="number" step="0.25" placeholder={String(p.maxHoursPerOperatorPerTask)} />
                </Field>
                <Field label="Requirements" className="sm:col-span-3">
                  <Input name="requirements" />
                </Field>
                <div className="flex items-end">
                  <Submit className="w-full">Add</Submit>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
