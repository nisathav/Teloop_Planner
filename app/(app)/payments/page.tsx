import { getCurrentProject } from "@/lib/data";
import { payroll } from "@/lib/payroll";
import { recordPayment, deletePayment } from "@/app/actions/payments";
import { PageHeader, Empty } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Submit } from "@/components/forms/submit";
import { ActionButton } from "@/components/forms/confirm-button";
import { NoProject } from "@/components/no-project";
import { dayKey } from "@/lib/rules/time";
import { fmtDate, lkr } from "@/lib/format";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const sp = await searchParams;
  const from = sp.from ?? dayKey(p.startDate.getTime());
  const to = sp.to ?? dayKey(Date.now());
  const { rate, list, payments } = await payroll(p.id, from, to);
  const totals = list.reduce((a, r) => ({ hours: a.hours + r.hours, amount: a.amount + r.amount, paid: a.paid + r.paid, owed: a.owed + r.owed }), { hours: 0, amount: 0, paid: 0, owed: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description={`Owed = actual logged hours × ${lkr(rate)}/h, for completed bookings in the date range.`}>
        <form className="flex items-end gap-2">
          <Input type="date" name="from" defaultValue={from} className="w-40" />
          <span className="pb-2 text-sm">to</span>
          <Input type="date" name="to" defaultValue={to} className="w-40" />
          <button className="h-9 rounded-md border bg-white px-3 text-sm">Apply</button>
        </form>
        <a className="h-9 rounded-md border bg-white px-3 py-2 text-sm" href={`/api/export/payments?format=xlsx&from=${from}&to=${to}`}>
          Export
        </a>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Hours", `${totals.hours.toFixed(1)} h`],
          ["Earned", lkr(totals.amount)],
          ["Paid", lkr(totals.paid)],
          ["Owed", lkr(totals.owed)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          {list.length === 0 ? (
            <Empty>No completed, logged bookings in this range.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Operator</Th>
                  <Th className="text-right">Sessions</Th>
                  <Th className="text-right">Hours</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Paid</Th>
                  <Th className="text-right">Owed</Th>
                  <Th>Mark paid</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.operatorId}>
                    <Td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                      {r.unlogged ? <Badge tone="amber">{r.unlogged} unlogged</Badge> : null}
                    </Td>
                    <Td className="text-right">{r.sessions}</Td>
                    <Td className="text-right">{r.hours.toFixed(2)}</Td>
                    <Td className="text-right">{lkr(r.amount)}</Td>
                    <Td className="text-right">{lkr(r.paid)}</Td>
                    <Td className={`text-right font-medium ${r.owed > 0 ? "text-amber-700" : "text-emerald-700"}`}>{lkr(r.owed)}</Td>
                    <Td>
                      {r.owed > 0 ? (
                        <form action={recordPayment} className="flex items-center gap-1">
                          <input type="hidden" name="operatorId" value={r.operatorId} />
                          <input type="hidden" name="projectId" value={p.id} />
                          <input type="hidden" name="from" value={from} />
                          <input type="hidden" name="to" value={to} />
                          <input type="hidden" name="hours" value={((r.owed / Math.max(1, r.amount)) * r.hours).toFixed(2)} />
                          <Input name="amount" type="number" defaultValue={Math.round(r.owed)} className="h-8 w-28 text-xs" />
                          <Input name="reference" placeholder="Reference" className="h-8 w-32 text-xs" />
                          <Submit size="sm">Paid</Submit>
                        </form>
                      ) : (
                        <span className="text-xs text-emerald-700">Settled ✓</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments in this period</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Paid</Th>
                <Th>Operator</Th>
                <Th>Period</Th>
                <Th className="text-right">Hours</Th>
                <Th className="text-right">Amount</Th>
                <Th>Reference</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {payments.map((pm) => (
                <tr key={pm.id}>
                  <Td>{fmtDate(pm.paidAt)}</Td>
                  <Td>{pm.operator.name}</Td>
                  <Td className="text-xs">
                    {fmtDate(pm.periodStart)} – {fmtDate(pm.periodEnd.getTime() - 1)}
                  </Td>
                  <Td className="text-right">{pm.hours.toFixed(2)}</Td>
                  <Td className="text-right">{lkr(pm.amount)}</Td>
                  <Td>{pm.reference}</Td>
                  <Td>
                    <ActionButton size="xs" variant="ghost" confirm="Delete this payment record?" action={deletePayment.bind(null, pm.id)}>
                      ✕
                    </ActionButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {payments.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No payments recorded.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
