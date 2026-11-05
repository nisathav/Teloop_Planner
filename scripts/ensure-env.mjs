import { existsSync, copyFileSync } from "node:fs";
if (!existsSync(".env") && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example (default admin password: admin)");
}
