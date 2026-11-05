"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBookingStatus } from "@/app/actions/bookings";
import { setEventDone } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { label: "Picked up", status: "confirmed" },
  { label: "In progress", status: "in-progress" },
  { label: "Completed", status: "completed" },
  { label: "No-show", status: "no-show" },
];

export function StatusButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-1">
      {ACTIONS.map((a) => (
        <Button
          key={a.status}
          size="sm"
          variant={status === a.status ? "default" : "outline"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setBookingStatus(id, a.status);
              if (a.status === "completed") router.push(`/log?booking=${id}`);
            })
          }
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function EventDone({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="ml-auto flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={done} disabled={pending} onChange={(e) => start(() => setEventDone(id, e.target.checked))} /> done
    </label>
  );
}
