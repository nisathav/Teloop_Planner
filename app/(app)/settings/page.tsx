import { getCurrentProject } from "@/lib/data";
import { updateSettings } from "@/app/actions/project";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Submit } from "@/components/forms/submit";
import { NoProject } from "@/components/no-project";
import { dayKey, hm } from "@/lib/rules/time";
import { DEFAULT_SETTINGS as D } from "@/lib/rules/types";

function Rule({ kind }: { kind: "block" | "warn" | "gap" | "goal" | "battery" | "pay" }) {
  const map = {
    block: ["red", "Hard block"],
    warn: ["amber", "Warning"],
    gap: ["violet", "Scheduling gap"],
    goal: ["blue", "Goal"],
    battery: ["green", "Battery"],
    pay: ["default", "Payments"],
  } as const;
  return <Badge tone={map[kind][0]}>{map[kind][1]}</Badge>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const p = await getCurrentProject();
  const { saved } = await searchParams;
  if (!p) return <NoProject />;

  const L = ({ label, kind, def }: { label: string; kind: Parameters<typeof Rule>[0]["kind"]; def: string }) => (
    <span className="flex items-center gap-2">
      {label} <Rule kind={kind} /> <span className="text-[11px] font-normal text-muted-foreground">default {def}</span>
    </span>
  );

  return (
    <form action={updateSettings} className="space-y-4">
      <input type="hidden" name="id" value={p.id} />
      <PageHeader title="Settings" description={`Rules for “${p.name}”. Changes apply to every new validation and rebuild automatic device buffers.`}>
        {saved ? <span className="text-sm text-emerald-700">Saved ✓</span> : null}
        <Submit>Save settings</Submit>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project goal</CardTitle>
            <CardDescription>What the client ordered.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Target hours" help="Total recorded hours ordered.">
              <Input name="targetHours" type="number" step="1" defaultValue={p.targetHours} />
            </Field>
            <Field label="Start" help="Colombo date.">
              <Input name="startDate" type="date" defaultValue={dayKey(p.startDate.getTime())} />
            </Field>
            <Field label="Deadline" help="Bookings ending after this are flagged.">
              <Input name="deadline" type="date" defaultValue={dayKey(p.deadline.getTime())} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
            <CardDescription>Protect operators and spread tasks across people.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={"Max hours per operator per task"} help={<><L label="" kind="block" def={`${D.maxHoursPerOperatorPerTask} h`} /> Completed + planned. Tasks can override it. Override needs a reason.</>}>
              <Input name="maxHoursPerOperatorPerTask" type="number" step="0.25" min="0" defaultValue={p.maxHoursPerOperatorPerTask} />
            </Field>
            <Field label="Daily hours per operator (soft)" help={<><L label="" kind="warn" def={`${D.dailySoftHoursPerOperator} h`} /> Operators may exceed it if they choose.</>}>
              <Input name="dailySoftHoursPerOperator" type="number" step="0.25" min="0" defaultValue={p.dailySoftHoursPerOperator} />
            </Field>
            <Field label="Daily hours per operator (hard)" help={<><L label="" kind="block" def={`${D.dailyHardHoursPerOperator} h`} /> Override needs a reason.</>}>
              <Input name="dailyHardHoursPerOperator" type="number" step="0.25" min="0" defaultValue={p.dailyHardHoursPerOperator} />
            </Field>
            <Field label="Max continuous recording per segment (h)" help={<><L label="" kind="warn" def="2 h" /> Longer segments get a split suggestion.</>}>
              <Input name="maxContinuousHours" type="number" step="0.25" min="0.25" defaultValue={p.maxContinuousMinutes / 60} />
            </Field>
            <Field label="Minimum break between segments (min)" help={<L label="" kind="warn" def={`${D.minBreakMinutes} min`} />}>
              <Input name="minBreakMinutes" type="number" step="5" min="0" defaultValue={p.minBreakMinutes} />
            </Field>
            <Field label="Pay rate (LKR per recorded hour)" help={<><L label="" kind="pay" def="LKR 1,000" /> Applies to actual (logged) hours.</>}>
              <Input name="payRatePerHour" type="number" step="50" min="0" defaultValue={p.payRatePerHour} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Devices and battery</CardTitle>
            <CardDescription>Keep devices recording without running them 24/7.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Operating window start" help={<><L label="" kind="block" def={hm(D.windowStartMinutes)} /> No bookings before this.</>}>
              <Input name="windowStart" type="time" step="900" defaultValue={hm(p.windowStartMinutes)} />
            </Field>
            <Field label="Operating window end" help={<><L label="" kind="block" def={hm(D.windowEndMinutes)} /> No bookings after this.</>}>
              <Input name="windowEnd" type="time" step="900" defaultValue={hm(p.windowEndMinutes)} />
            </Field>
            <Field label="Device max active hours per day" help={<><L label="" kind="block" def={`${D.deviceMaxActiveHours} h`} /> Bookings + handoff/offload/charge buffers.</>}>
              <Input name="deviceMaxActiveHours" type="number" step="0.5" min="1" max="24" defaultValue={p.deviceMaxActiveHours} />
            </Field>
            <Field label="Device runtime per charge (h)" help={<><L label="" kind="battery" def={`${D.deviceRuntimeHours} h`} /> Beyond this a power bank or charge gap is needed.</>}>
              <Input name="deviceRuntimeHours" type="number" step="0.5" min="0.5" defaultValue={p.deviceRuntimeHours} />
            </Field>
            <Field label="Power banks available" help={<><L label="" kind="battery" def={`${D.powerBanksAvailable}`} /> Warn when all are assigned at once. Each adds one runtime.</>}>
              <Input name="powerBanksAvailable" type="number" step="1" min="0" defaultValue={p.powerBanksAvailable} />
            </Field>
            <Field label="Device recharge time (min)" help={<><L label="" kind="gap" def={`${D.rechargeMinutes} min`} /> Inserted when the battery needs it and the gap allows.</>}>
              <Input name="rechargeMinutes" type="number" step="5" min="0" defaultValue={p.rechargeMinutes} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buffers between bookings</CardTitle>
            <CardDescription>Gaps inserted automatically on the schedule.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Handoff buffer between operators (min)" help={<><L label="" kind="gap" def={`${D.handoffMinutes} min`} /> Travel time when the next booking is a different operator on the same day.</>}>
              <Input name="handoffMinutes" type="number" step="5" min="0" defaultValue={p.handoffMinutes} />
            </Field>
            <Field label="Data offload duration (min)" help={<L label="" kind="gap" def={`${D.offloadMinutes} min`} />}>
              <Input name="offloadMinutes" type="number" step="5" min="0" defaultValue={p.offloadMinutes} />
            </Field>
            <Field label="Offload trigger" help="When an offload is inserted after a booking.">
              <Select name="offloadTrigger" defaultValue={p.offloadTrigger}>
                <option value="end_of_day">End of each day</option>
                <option value="after_hours">After N recorded hours</option>
                <option value="both">Both (whichever comes first)</option>
              </Select>
            </Field>
            <Field label="N recorded hours before offload" help={`Used by “after N hours” and “both”. Default ${D.offloadAfterHours} h.`}>
              <Input name="offloadAfterHours" type="number" step="0.5" min="0.5" defaultValue={p.offloadAfterHours} />
            </Field>
            <Field label="Default slot recording length (h)" help="Used by Fill gaps and the capacity planner. Default 4 h = two 2 h segments + break.">
              <Input name="defaultSlotRecordingHours" type="number" step="0.5" min="0.5" defaultValue={p.defaultSlotRecordingHours} />
            </Field>
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Submit>Save settings</Submit>
      </div>
    </form>
  );
}
