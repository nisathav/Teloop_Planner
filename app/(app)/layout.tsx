import { getRole } from "@/lib/auth";
import { getCurrentProject, listProjects } from "@/lib/data";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, projects, current] = await Promise.all([getRole(), listProjects(), getCurrentProject()]);
  return (
    <Shell role={role ?? "share"} projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status }))} currentId={current?.id ?? null}>
      {children}
    </Shell>
  );
}
