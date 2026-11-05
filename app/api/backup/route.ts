import { NextResponse } from "next/server";
import { readFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { getRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** One-click backup: a consistent copy of the SQLite database (VACUUM INTO). */
export async function GET() {
  if ((await getRole()) !== "admin") return new NextResponse("Unauthorised", { status: 401 });
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    return new NextResponse("Backups from the app work for SQLite only. For Postgres use pg_dump (see README).", { status: 400 });
  }
  const dir = path.join(process.cwd(), "prisma", "backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `fleet-${stamp}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const buf = await readFile(file);
  await unlink(file).catch(() => {});
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/x-sqlite3", "Content-Disposition": `attachment; filename="fleet-planner-backup-${stamp}.db"` },
  });
}
