// Copie les fichiers partagés (schéma, prompt, emails d'exemple, résultats d'évaluation)
// depuis la racine du dépôt vers web/lib/shared, pour que le site et le pipeline Python
// utilisent exactement les mêmes sources. Lancé automatiquement avant `dev` et `build`.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");
const out = join(web, "lib", "shared");
mkdirSync(out, { recursive: true });

const SAMPLES = [
  ["Devis", "01_devis_bons_livraison.txt"],
  ["Support urgent", "02_support_export_bloque.txt"],
  ["Email en anglais", "10_quote_invoices_en.txt"],
  ["Sans en-têtes", "09_sans_entetes.txt"],
  ["Montant piège", "07_facture_en_double.txt"],
  ["Injection de prompt", "12_injection_prompt.txt"],
];

const read = (p) => readFileSync(join(root, p), "utf8");

writeFileSync(join(out, "lead.schema.json"), read("shared/lead.schema.json"));
writeFileSync(join(out, "prompt.json"), JSON.stringify({ system: read("shared/extract_prompt.md") }));
writeFileSync(
  join(out, "samples.json"),
  JSON.stringify(SAMPLES.map(([label, file]) => ({ label, file, text: read(`evals/emails/${file}`).trim() })), null, 2),
);
const results = "evals/results_rules.json";
writeFileSync(join(out, "eval.json"), existsSync(join(root, results)) ? read(results) : "null");
console.log("sync-shared: OK");
