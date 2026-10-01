// Vérifie que l'extracteur à règles TypeScript (site) donne exactement les mêmes
// fiches que la version Python (pipeline) sur le jeu d'évaluation.
// Usage : npx tsx scripts/parity.ts   (nécessite python3 + pydantic)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractRules } from "../lib/extract/rules";
import { parseText } from "../lib/extract/text";

const root = join(__dirname, "..", "..");
const dir = join(root, "evals", "emails");
const py = execFileSync("python3", ["-c", `
import json, sys, pathlib
sys.path.insert(0, ${JSON.stringify(join(root, "pipeline"))})
from inbox_to_crm.email_io import read_email
from inbox_to_crm.rules import extract_rules
d = pathlib.Path(${JSON.stringify(dir)})
print(json.dumps({p.name: extract_rules(read_email(p)).model_dump() for p in sorted(d.glob("*.txt"))}))
`]).toString();
const expected = JSON.parse(py) as Record<string, Record<string, unknown>>;

let diffs = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
  const ts = extractRules(parseText(readFileSync(join(dir, file), "utf8"))) as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected[file])) {
    if (JSON.stringify(ts[k]) !== JSON.stringify(v)) {
      diffs++;
      console.log(`${file} ${k}: python=${JSON.stringify(v)} ts=${JSON.stringify(ts[k])}`);
    }
  }
}
console.log(diffs ? `${diffs} différence(s)` : "Parité Python/TypeScript : OK");
process.exit(diffs ? 1 : 0);
