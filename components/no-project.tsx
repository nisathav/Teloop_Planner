import Link from "next/link";
import { Empty } from "@/components/ui/page-header";

export function NoProject() {
  return (
    <Empty>
      No project yet. <Link className="text-primary underline" href="/projects">Create a project</Link> to get started.
    </Empty>
  );
}
