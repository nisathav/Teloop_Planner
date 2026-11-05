import type { Operator } from "@prisma/client";
import { saveOperator } from "@/app/actions/setup";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Submit } from "@/components/forms/submit";
import { parseList } from "@/lib/utils";
import { OPERATOR_STATUSES } from "@/lib/constants";

export function OperatorForm({ operator, taskNames }: { operator?: Operator; taskNames: string[] }) {
  const supported = parseList(operator?.supportedTasks ?? "");
  const lower = new Set(supported.map((s) => s.toLowerCase()));
  const other = supported.filter((s) => !taskNames.some((t) => t.toLowerCase() === s.toLowerCase()));
  return (
    <form action={saveOperator} className="grid gap-3 sm:grid-cols-2">
      {operator ? <input type="hidden" name="id" value={operator.id} /> : null}
      <Field label="Name">
        <Input name="name" required defaultValue={operator?.name} />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={operator?.phone} />
      </Field>
      <Field label="Area / neighbourhood">
        <Input name="area" defaultValue={operator?.area} />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={operator?.status ?? "active"}>
          {OPERATOR_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Input name="address" defaultValue={operator?.address} />
      </Field>
      <Field label="Tasks the household supports" className="sm:col-span-2" help="Matched by task name. Unlisted tasks give a warning when booked.">
        <div className="flex flex-wrap gap-3">
          {taskNames.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="supportedTasks" value={t} defaultChecked={lower.has(t.toLowerCase())} /> {t}
            </label>
          ))}
        </div>
        <Input name="supportedOther" className="mt-2" placeholder="Other task names, comma separated" defaultValue={other.join(", ")} />
      </Field>
      <Field label="Household notes" className="sm:col-span-2">
        <Textarea name="householdNotes" defaultValue={operator?.householdNotes} rows={2} />
      </Field>
      <div className="sm:col-span-2">
        <Submit>{operator ? "Save operator" : "Add operator"}</Submit>
      </div>
    </form>
  );
}
