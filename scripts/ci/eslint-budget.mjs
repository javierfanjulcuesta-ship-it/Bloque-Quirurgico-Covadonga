/**
 * Compara el informe JSON de eslint con un tope de errores ya conocidos.
 * Un aviso no cuenta. Un error nuevo, o más errores de la misma regla en el
 * mismo archivo, hace fallar el job. Corregir deuda antigua no lo rompe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "eslint-error-baseline.json");

export function countEslintErrors(report, cwd = process.cwd()) {
  const root = String(cwd).replace(/\\/g, "/").replace(/\/$/, "");
  const counts = {};
  for (const file of report ?? []) {
    let rel = String(file.filePath ?? "").replace(/\\/g, "/");
    if (rel.startsWith(`${root}/`)) rel = rel.slice(root.length + 1);
    for (const message of file.messages ?? []) {
      if (message.severity !== 2) continue;
      const key = `${rel}:${message.ruleId ?? "parse"}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

export function eslintBudgetDiff(actual, allowed) {
  const problems = [];
  for (const [key, count] of Object.entries(actual)) {
    const cap = allowed[key] ?? 0;
    if (count > cap) problems.push(`${key} tiene ${count} errores y el tope es ${cap}`);
  }
  problems.sort();
  return problems;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isCli() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : "";
  return entry === fileURLToPath(import.meta.url);
}

if (isCli()) {
  const write = process.argv.includes("--write");
  const reportPath = process.argv.find((arg) => arg.endsWith(".json") && !arg.includes("eslint-error-baseline"));
  if (!reportPath) {
    console.error("Uso: node scripts/ci/eslint-budget.mjs [--write] eslint-report.json");
    process.exit(2);
  }
  const actual = countEslintErrors(readJson(reportPath));
  if (write) {
    const sorted = Object.fromEntries(Object.entries(actual).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(baselinePath, `${JSON.stringify({ counts: sorted }, null, 2)}\n`);
    console.log(`Tope escrito con ${Object.keys(sorted).length} claves y ${Object.values(sorted).reduce((sum, n) => sum + n, 0)} errores.`);
    process.exit(0);
  }
  const baseline = readJson(baselinePath);
  const problems = eslintBudgetDiff(actual, baseline.counts ?? {});
  const total = Object.values(actual).reduce((sum, n) => sum + n, 0);
  console.log(`eslint: ${total} errores. El tope admite la deuda ya registrada y falla si aparece un error nuevo.`);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}
