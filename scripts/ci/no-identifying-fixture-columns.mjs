import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Cabecera o clave de columna. No busca la palabra en una frase suelta. */
const COLUMN_RE = /(^|[,;|\t])\s*["']?(dni|nie|nif|tel[eé]fono|phone|patientphone|patient_phone|m[oó]vil)["']?\s*($|[,;|\t])/i;
const KEY_RE = /(^|[^A-Za-z0-9_])["']?(dni|nie|nif|tel[eé]fono|patientPhone|patient_phone|phone)["']?\s*:/i;

export const FIXTURE_FILES = [
  "scripts/lib/seedShowcaseImplementation.ts",
  "src/lib/demoSeed.ts",
  "src/lib/email/mockInbox.ts",
];

export function lineHasIdentifyingColumn(line) {
  return COLUMN_RE.test(line) || KEY_RE.test(line);
}

function walkDataFiles(dir, found = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walkDataFiles(path, found);
    else if (/\.(csv|tsv)$/i.test(entry)) found.push(path);
  }
  return found;
}

export function collectFixtureFiles(root = process.cwd()) {
  const files = FIXTURE_FILES.map((file) => join(root, file));
  return files.concat(walkDataFiles(root));
}

export function findIdentifyingColumns(files) {
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (lineHasIdentifyingColumn(line)) {
        hits.push(`${relative(process.cwd(), file)}:${index + 1}`);
      }
    });
  }
  return hits;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hits = findIdentifyingColumns(collectFixtureFiles());
  if (hits.length > 0) {
    console.error("Fixtures con columna DNI, NIE, NIF o teléfono:");
    for (const hit of hits) console.error(`- ${hit}`);
    process.exit(1);
  }
}
