export function ProgressBar({ target, recorded, planned }: { target: number; recorded: number; planned: number }) {
  const max = Math.max(target, recorded + planned, 0.0001);
  const r = (100 * recorded) / max;
  const pl = (100 * planned) / max;
  const t = (100 * target) / max;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded bg-slate-100" title={`Recorded ${recorded.toFixed(1)} h · Planned ${planned.toFixed(1)} h · Target ${target} h`}>
      <div className="absolute inset-y-0 left-0 bg-emerald-600" style={{ width: `${r}%` }} />
      <div className="absolute inset-y-0 bg-emerald-300/70" style={{ left: `${r}%`, width: `${pl}%`, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 3px, transparent 3px 6px)" }} />
      {t < 100 ? <div className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${t}%` }} /> : null}
    </div>
  );
}
