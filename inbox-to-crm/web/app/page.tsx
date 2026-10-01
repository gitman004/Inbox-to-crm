import Demo from "@/components/Demo";
import { SITE } from "@/lib/config";
import evalReport from "@/lib/shared/eval.json";
import samples from "@/lib/shared/samples.json";

const FIELD_LABELS: Record<string, string> = {
  contact_name: "Contact",
  email: "Email",
  company: "Entreprise",
  phone: "Téléphone",
  intent: "Type de demande",
  urgency: "Urgence",
  budget_eur: "Budget",
  language: "Langue",
};

const STEPS = [
  {
    title: "Lecture",
    text: "Les en-têtes (expéditeur, objet) et le corps sont séparés, que l'email arrive en .eml ou soit collé en texte.",
  },
  {
    title: "Extraction",
    text: "Le LLM répond dans un JSON Schema strict, avec un prompt versionné dans le dépôt. Sans clé API, un extracteur à règles prend le relais.",
  },
  {
    title: "Validation",
    text: "Chaque réponse est vérifiée champ par champ. Si elle est invalide, l'erreur est renvoyée au modèle pour une seconde tentative.",
  },
  {
    title: "Garde-fous",
    text: "Email, téléphone, budget et nom doivent figurer dans l'email d'origine. Sinon, ils sont retirés plutôt qu'inventés.",
  },
  {
    title: "CRM",
    text: "La fiche est enregistrée en base SQLite. Un même expéditeur ne crée qu'une fiche, et le spam est écarté.",
  },
];

type EvalReport = {
  emails: number;
  field_accuracy: number;
  fully_correct_emails: number;
  per_field: Record<string, number>;
} | null;

const pct = (x: number) => `${Math.round(x * 100)} %`;

export default function Home() {
  const report = evalReport as EvalReport;

  return (
    <main className="wrap">
      <header className="top">
        <a className="brand" href="#">inbox-to-crm</a>
        <nav aria-label="Liens">
          <a href={SITE.repoUrl}>Code source</a>
          {SITE.linkedinUrl && <a href={SITE.linkedinUrl}>LinkedIn</a>}
        </nav>
      </header>

      <section className="hero">
        <h1>
          <span>Un email arrive.</span> <span>Une fiche CRM en sort.</span>
        </h1>
        <p>
          inbox-to-crm lit les emails de prospects et de clients, en extrait le contact, la demande, l&apos;urgence
          et le budget, puis les range dans un CRM. Choisissez un exemple ou collez votre propre email.
        </p>
      </section>

      <Demo samples={samples} />

      <section className="section" aria-labelledby="pipeline">
        <h2 id="pipeline">Ce qui se passe entre les deux</h2>
        <p className="lede">
          Le même pipeline tourne en ligne de commande sur un dossier d&apos;emails (Python) et derrière cette démo
          (TypeScript). Les deux partagent le schéma, le prompt et le jeu de test.
        </p>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="n">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {report && (
        <section className="section" aria-labelledby="mesure">
          <h2 id="mesure">Mesuré sur {report.emails} emails annotés</h2>
          <p className="lede">
            Chaque email du jeu de test a sa fiche attendue, écrite à la main. Le script d&apos;évaluation compare
            la sortie champ par champ. Ces chiffres sont ceux de l&apos;extracteur à règles, qui sert de référence.
          </p>
          <div className="eval">
            <div>
              <p className="score">{pct(report.field_accuracy)}</p>
              <p>
                des champs corrects, et {report.fully_correct_emails} emails sur {report.emails} sans aucune erreur.
              </p>
              <p>Les erreurs restantes sont celles qu&apos;un LLM doit corriger :</p>
              <ul>
                <li>une facture de 120 € prise pour un budget ;</li>
                <li>une consigne cachée dans l&apos;email qui impose une urgence et un budget (injection de prompt) ;</li>
                <li>un nom et une entreprise qui n&apos;apparaissent que dans le corps du message.</li>
              </ul>
              <p>
                Pour mesurer le LLM sur le même jeu : <code>python evals/evaluate.py --mode llm</code>
              </p>
            </div>
            <table>
              <thead>
                <tr>
                  <th scope="col">Champ</th>
                  <th scope="col" className="num">Exactitude</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.per_field).map(([field, acc]) => (
                  <tr key={field}>
                    <td>{FIELD_LABELS[field] ?? field}</td>
                    <td className="num">{pct(acc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="foot">
        <span>{SITE.authorLine}</span>
        <nav aria-label="Liens de bas de page">
          <a href={SITE.githubUrl}>GitHub</a>
          {SITE.linkedinUrl && <a href={SITE.linkedinUrl}>LinkedIn</a>}
          <a href={SITE.repoUrl}>Code source</a>
        </nav>
      </footer>
    </main>
  );
}
