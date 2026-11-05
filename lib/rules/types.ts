/** Shared types for the pure scheduling rules. All instants are epoch milliseconds. */

export type Level = "block" | "warn";

export type RuleId =
  | "device-status"
  | "device-window"
  | "device-overlap"
  | "device-manual-event"
  | "device-daily-max"
  | "device-offload-window"
  | "battery"
  | "power-bank-conflict"
  | "power-banks-exhausted"
  | "operator-status"
  | "operator-overlap"
  | "operator-task-cap"
  | "operator-daily-soft"
  | "operator-daily-hard"
  | "segment-continuous"
  | "segment-break"
  | "segments-exceed-booking"
  | "segments-missing"
  | "household-support"
  | "task-target"
  | "task-inactive"
  | "project-deadline"
  | "project-start"
  | "invalid-time";

export interface RuleResult {
  level: Level;
  rule: RuleId;
  message: string;
  /** Optional machine-readable suggestion the UI may offer (e.g. split a long segment). */
  suggestion?: { type: "split-segment"; segmentIndex: number; parts: number[] };
}

export type OffloadTrigger = "end_of_day" | "after_hours" | "both";

export interface Settings {
  maxHoursPerOperatorPerTask: number;
  dailySoftHoursPerOperator: number;
  dailyHardHoursPerOperator: number;
  maxContinuousMinutes: number;
  minBreakMinutes: number;
  deviceRuntimeHours: number;
  powerBanksAvailable: number;
  rechargeMinutes: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  deviceMaxActiveHours: number;
  offloadMinutes: number;
  offloadTrigger: OffloadTrigger;
  offloadAfterHours: number;
  handoffMinutes: number;
  payRatePerHour: number;
  defaultSlotRecordingHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  maxHoursPerOperatorPerTask: 5,
  dailySoftHoursPerOperator: 4,
  dailyHardHoursPerOperator: 6,
  maxContinuousMinutes: 120,
  minBreakMinutes: 15,
  deviceRuntimeHours: 10,
  powerBanksAvailable: 10,
  rechargeMinutes: 60,
  windowStartMinutes: 6 * 60,
  windowEndMinutes: 22 * 60,
  deviceMaxActiveHours: 16,
  offloadMinutes: 60,
  offloadTrigger: "end_of_day",
  offloadAfterHours: 8,
  handoffMinutes: 45,
  payRatePerHour: 1000,
  defaultSlotRecordingHours: 4,
};

export type BookingStatus = "planned" | "confirmed" | "in-progress" | "completed" | "cancelled" | "no-show";

export interface SegmentLite {
  taskId: string;
  plannedMinutes: number;
  actualMinutes?: number | null;
}

export interface BookingLite {
  id: string;
  projectId?: string;
  deviceId: string;
  operatorId: string;
  start: number;
  end: number;
  status: BookingStatus | string;
  segments: SegmentLite[];
  powerBankIds: string[];
}

export interface DeviceLite {
  id: string;
  code: string;
  status: string;
}

export interface OperatorLite {
  id: string;
  name: string;
  status: string;
  /** Task names the household supports (case-insensitive match against task names). */
  supportedTasks: string[];
}

export interface TaskLite {
  id: string;
  name: string;
  targetHours: number;
  perPersonCapHours: number | null;
  active: boolean;
}

export interface ManualEventLite {
  id?: string;
  deviceId: string;
  type: string;
  start: number;
  end: number;
}

export interface ValidationContext {
  settings: Settings;
  project: { start: number; deadline: number };
  /** All bookings that may interact with the draft (any status, any project). */
  bookings: BookingLite[];
  devices: DeviceLite[];
  operators: OperatorLite[];
  tasks: TaskLite[];
  /** Manually created device events (maintenance etc.). Auto buffers are recomputed, not passed. */
  manualEvents?: ManualEventLite[];
}

export type DraftBooking = Omit<BookingLite, "id" | "status"> & { id?: string; status?: string };
