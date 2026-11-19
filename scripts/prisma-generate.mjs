/**
 * Ejecuta `prisma generate` sin exigir una base de datos real.
 * Si el entorno no trae URL, se usa un valor ficticio solo en este proceso:
 * generate no se conecta. El valor no se escribe en el entorno del servidor.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const placeholder = "postgresql://demo:demo@127.0.0.1:5432/qxflow_demo_unused";
const env = { ...process.env };
if (!env.DATABASE_URL) env.DATABASE_URL = placeholder;
if (!env.DIRECT_URL) env.DIRECT_URL = env.DATABASE_URL;

const bin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
const result = spawnSync(bin, ["generate"], { stdio: "inherit", env });
process.exit(result.status ?? 1);
