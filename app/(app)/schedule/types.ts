import type { BookingLite, ManualEventLite, Settings, TaskLite } from "@/lib/rules/types";

export type BoardBooking = BookingLite & { notes: string; projectId: string };

export interface BoardData {
  settings: Settings;
  project: { id: string; start: number; deadline: number };
  bookings: BoardBooking[];
  devices: { id: string; code: string; status: string }[];
  operators: { id: string; name: string; status: string; supportedTasks: string[]; area: string }[];
  tasks: TaskLite[];
  powerBanks: { id: string; code: string }[];
  manualEvents: ManualEventLite[];
  readOnly: boolean;
  now: number;
}

export interface Draft {
  id?: string;
  deviceId: string;
  operatorId: string;
  start: number;
  end: number;
  status: string;
  notes: string;
  segments: { taskId: string; plannedMinutes: number; actualMinutes?: number | null }[];
  powerBankIds: string[];
}
