import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { addDeviceEvent, deleteDeviceEvent, updateDeviceEvent } from "@/app/actions/setup";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Submit } from "@/components/forms/submit";
import { ActionButton } from "@/components/forms/confirm-button";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { dayKey } from "@/lib/rules/time";

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await prisma.device.findUnique({
    where: { id },
    include: {
      events: { orderBy: { start: "desc" }, take: 200 },
      bookings: { orderBy: { start: "desc" }, take: 100, include: { operator: true, segments: true } },
    },
  });
  if (!d) notFound();
  const lifetime = d.bookings.filter((b) => b.status === "completed").reduce((s, b) => s + b.segments.reduce((x, y) => x + (y.actualMinutes ?? 0), 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader title={d.code} description={d.notes || "Device detail, booking history and event log."}>
        <StatusBadge status={d.status} />
        <span className="text-sm text-muted-foreground">Lifetime recorded (last 100 bookings): {(lifetime / 60).toFixed(1)} h</span>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Event log</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addDeviceEvent} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input type="hidden" name="deviceId" value={d.id} />
              <Field label="Type">
                <Select name="type">
                  <option>maintenance</option>
                  <option>charge</option>
                  <option>offload</option>
                  <option>handoff</option>
                </Select>
              </Field>
              <Field label="Day">
                <Input name="day" type="date" defaultValue={dayKey(Date.now())} />
              </Field>
              <Field label="From">
                <Input name="start" type="time" defaultValue="06:00" />
              </Field>
              <Field label="To">
                <Input name="end" type="time" defaultValue="07:00" />
              </Field>
              <Field label="Note">
                <Input name="note" />
              </Field>
              <div className="flex items-end">
                <Submit className="w-full">Add</Submit>
              </div>
            </form>
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Day</Th>
                  <Th>Time</Th>
                  <Th>Note</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      <span className="flex items-center gap-1">
                        {e.type} {e.auto ? <Badge tone="gray">auto</Badge> : <Badge tone="blue">manual</Badge>} {e.done ? <Badge tone="green">done</Badge> : null}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(e.start, { day: "2-digit", month: "short" })}</Td>
                    <Td colSpan={2}>
                      <form action={updateDeviceEvent} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={e.id} />
                        <Input name="start" type="time" defaultValue={fmtTime(e.start)} className="h-7 w-24 text-xs" />
                        <Input name="end" type="time" defaultValue={fmtTime(e.end)} className="h-7 w-24 text-xs" />
                        <Input name="note" defaultValue={e.note} className="h-7 text-xs" />
                        <Submit size="xs" variant="outline" title={e.auto ? "Saving turns this into a manual event" : undefined}>
                          Save
                        </Submit>
                      </form>
                    </Td>
                    <Td>
                      {!e.auto ? (
                        <ActionButton size="xs" variant="ghost" action={deleteDeviceEvent.bind(null, e.id)}>
                          ✕
                        </ActionButton>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Auto events are rebuilt from bookings whenever bookings or settings change. Editing one turns it into a manual event.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Operator</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Recorded</Th>
                </tr>
              </thead>
              <tbody>
                {d.bookings.map((b) => (
                  <tr key={b.id}>
                    <Td className="whitespace-nowrap">
                      {fmtDateTime(b.start)}–{fmtTime(b.end)}
                    </Td>
                    <Td>
                      <Link className="text-primary hover:underline" href={`/operators/${b.operatorId}`}>
                        {b.operator.name}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                    <Td className="text-right">{b.status === "completed" ? `${(b.segments.reduce((s, x) => s + (x.actualMinutes ?? 0), 0) / 60).toFixed(1)} h` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
