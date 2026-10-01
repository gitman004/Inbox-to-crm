import type { Metadata } from "next";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "inbox-to-crm — des emails entrants aux fiches CRM",
  description:
    "Démo d'un pipeline qui transforme des emails de prospects en fiches CRM structurées : LLM en sortie JSON stricte, validation, garde-fous anti-hallucination, évaluation chiffrée.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
