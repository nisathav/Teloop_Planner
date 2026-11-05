import Link from "next/link";
import { prisma } from "@/lib/db";
import { addDevices, addPowerBanks, deletePowerBank, updateDevice, updatePowerBank } from "@/app/actions/setup";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { Submit } from "@/components/forms/submit";
import { ActionButton } from "@/components/forms/confirm-button";
import { fmtDateTime } from "@/lib/format";
import { DEVICE_STATUSES } from "@/lib/constants";



export default async function DevicesPage() {
  const now = new Date();
  const [devices, banks, lifetime] = await Promise.all([
    prisma.device.findMany({
      orderBy: { code: "asc" },
      include: {
        bookings: { where: { status: { in: ["planned", "confirmed", "in-progress", "completed"] } }, orderBy: { start: "desc" }, take: 5, include: { operator: true } },
        powerBanks: true,
      },
    }),
    prisma.powerBank.findMany({ orderBy: { code: "asc" }, include: { device: true } }),
    prisma.segment.groupBy({ by: ["bookingId"], _sum: { actualMinutes: true }, where: { booking: { status: "completed" } } }),
  ]);
  const bookingDevice = new Map((await prisma.booking.findMany({ where: { status: "completed" }, select: { id: true, deviceId: true } })).map((b) => [b.id, b.deviceId]));
  const lifeByDevice = new Map<string, number>();
  for (const l of lifetime) {
    const d = bookingDevice.get(l.bookingId);
    if (d) lifeByDevice.set(d, (lifeByDevice.get(d) ?? 0) + (l._sum.actualMinutes ?? 0));
  }

  function location(d: (typeof devices)[number]) {
    const current = d.bookings.find((b) => b.start <= now && b.end >= now && b.status !== "completed");
    if (current) return { who: current.operator.name, opId: current.operatorId, note: `until ${fmtDateTime(current.end)}` };
    if (d.status === "in-field" && d.bookings[0]) return { who: d.bookings[0].operator.name, opId: d.bookings[0].operatorId, note: "last booking" };
    return null;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Devices and power banks" description="Fleet inventory. New devices appear on the schedule board and in the capacity planner immediately.">
        <form action={addDevices} className="flex items-center gap-2">
          <Input name="count" type="number" min={1} max={100} defaultValue={5} className="w-20" />
          <Submit variant="default">Add devices</Submit>
        </form>
      </PageHeader>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Status</Th>
                <Th>Current location</Th>
                <Th className="text-right">Lifetime recorded</Th>
                <Th>Power banks</Th>
                <Th>Notes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const loc = location(d);
                const formId = `dev-${d.id}`;
                return (
                  <tr key={d.id}>
                    <Td>
                      <Link className="font-medium text-primary hover:underline" href={`/devices/${d.id}`}>
                        {d.code}
                      </Link>
                    </Td>
                    <Td>
                      <form id={formId} action={updateDevice}>
                        <input type="hidden" name="id" value={d.id} />
                      </form>
                      <Select form={formId} name="status" defaultValue={d.status} className="h-8 w-36">
                        {DEVICE_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      {loc ? (
                        <span>
                          <Link className="text-primary hover:underline" href={`/operators/${loc.opId}`}>
                            {loc.who}
                          </Link>{" "}
                          <span className="text-xs text-muted-foreground">{loc.note}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Base</span>
                      )}
                    </Td>
                    <Td className="text-right">{((lifeByDevice.get(d.id) ?? 0) / 60).toFixed(1)} h</Td>
                    <Td className="text-xs">{d.powerBanks.map((p) => p.code).join(", ") || "—"}</Td>
                    <Td>
                      <Input form={formId} name="notes" defaultValue={d.notes} className="h-8 min-w-[140px]" />
                    </Td>
                    <Td>
                      <Submit form={formId} size="sm" variant="outline">
                        Save
                      </Submit>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Power banks</CardTitle>
            <CardDescription>Assign to a device while it&apos;s out. Bookings also carry their own power bank assignment.</CardDescription>
          </div>
          <form action={addPowerBanks} className="flex items-center gap-2">
            <Input name="count" type="number" min={1} max={100} defaultValue={1} className="w-20" />
            <Submit size="sm" variant="secondary">
              Add power banks
            </Submit>
          </form>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {banks.map((b) => (
              <form key={b.id} action={updatePowerBank} className="flex items-center gap-2 rounded-md border bg-white p-2">
                <input type="hidden" name="id" value={b.id} />
                <span className="w-14 text-sm font-medium">{b.code}</span>
                <Select name="status" defaultValue={b.status} className="h-8 w-24 text-xs">
                  {["charged", "in-use", "charging"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
                <Select name="deviceId" defaultValue={b.deviceId ?? ""} className="h-8 w-24 text-xs">
                  <option value="">—</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code}
                    </option>
                  ))}
                </Select>
                <Submit size="xs" variant="outline">
                  Save
                </Submit>
                <ActionButton type="button" size="xs" variant="ghost" confirm={`Delete ${b.code}?`} action={deletePowerBank.bind(null, b.id)}>
                  ✕
                </ActionButton>
              </form>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {["charged", "in-use", "charging"].map((s) => (
              <span key={s}>
                <StatusBadge status={s} /> {banks.filter((b) => b.status === s).length}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
