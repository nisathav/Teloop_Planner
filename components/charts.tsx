"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Reference palette (validated categorical order) + muted neutrals.
export const C = {
  recording: "#2a78d6",
  planned: "#8fb6ea",
  handoff: "#eda100",
  offload: "#6250d6",
  charge: "#1baf7a",
  idle: "#e34948",
  ideal: "#9a9993",
  remaining: "#e4e3df",
  grid: "#ecebe7",
  axis: "#52514e",
};

const axisProps = { tick: { fontSize: 11, fill: C.axis }, tickLine: false, axisLine: { stroke: C.grid } };
const tooltipStyle = { fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" };

export function BurnUpChart({ data, target }: { data: { day: string; label: string; recorded: number | null; planned: number; ideal: number }[]; target: number }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} domain={[0, Math.max(target, ...data.map((d) => d.planned))]} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} h`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} type="linear" dataKey="ideal" name="Ideal to target" stroke={C.ideal} strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} type="linear" dataKey="planned" name="Recorded + planned" stroke={C.recording} strokeWidth={2} strokeDasharray="6 4" dot={false} />
        <Line isAnimationActive={false} type="linear" dataKey="recorded" name="Recorded" stroke={C.recording} strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TaskBars({ data }: { data: { name: string; recorded: number; planned: number; remaining: number; behind: boolean }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={10}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} unit=" h" />
        <YAxis type="category" dataKey="name" {...axisProps} width={120} tick={(p: { x: number; y: number; payload: { value: string } }) => {
          const row = data.find((d) => d.name === p.payload.value);
          return (
            <text x={p.x} y={p.y} dy={4} textAnchor="end" fontSize={11} fill={row?.behind ? "#b42318" : C.axis} fontWeight={row?.behind ? 600 : 400}>
              {row?.behind ? "⚠ " : ""}
              {p.payload.value}
            </text>
          );
        }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(1)} h`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="recorded" name="Recorded" stackId="a" fill={C.recording} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="planned" name="Planned" stackId="a" fill={C.planned} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="remaining" name="Remaining" stackId="a" fill={C.remaining} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UtilBars({ data }: { data: { name: string; recording: number; handoff: number; offload: number; charge: number; idle: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26 + 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap={4}>
        <XAxis type="number" domain={[0, 100]} {...axisProps} unit="%" />
        <YAxis type="category" dataKey="name" {...axisProps} width={64} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(0)}%`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="recording" name="Recording" stackId="u" fill={C.recording} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="handoff" name="Handoff" stackId="u" fill={C.handoff} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="offload" name="Offload" stackId="u" fill={C.offload} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="charge" name="Charge" stackId="u" fill={C.charge} stroke="#fff" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="idle" name="Idle" stackId="u" fill={C.idle} fillOpacity={0.55} stroke="#fff" strokeWidth={1} />
      </BarChart>
    </ResponsiveContainer>
  );
}
