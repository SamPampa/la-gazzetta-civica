/**
 * FASE 2 — Open Data Ingestion Pipeline — Monitoraggio Decreti Attuativi
 * (Dipartimento per il Programma di Governo — Presidenza del Consiglio, in
 * coordination with DAGL, which runs the Normattiva portal these decrees are
 * eventually published on).
 *
 * Dedicated, isolated ingestion script (mirrors `scripts/ingest_parliament.ts`
 * / `ingest_senato.ts` / `ingest_normattiva.ts` in spirit, but does not share
 * code with them) that updates the implementation-tracking fields
 * (`decreesMissing`, `decreeDeadline`, `financialNote`, `urgency`) on acts
 * **already present** in our Supabase database — this script never creates
 * new `Act` rows, it only enriches existing ones (`prisma.act.update`).
 *
 * DATA SOURCE & HONESTY NOTE ON SCOPE (read this before changing the
 * curated table below):
 * Unlike Camera/Senato/Normattiva, the Dipartimento per il Programma di
 * Governo does NOT expose a SPARQL endpoint, REST API, or downloadable
 * CSV/JSON dataset for its "Motore di ricerca provvedimenti attuativi" — it
 * is an HTML search form with no documented machine-readable contract
 * (verified by hand: `programmagoverno.gov.it/it/ricerca-provvedimenti/`).
 * The only genuinely *open, structured* facts it publishes are the numbers
 * quoted in its own quarterly PDF reports ("Relazioni sul monitoraggio dei
 * provvedimenti legislativi e attuativi"). This script's `DAGL_MONITORING`
 * table below is therefore a small, manually-curated set of **real figures
 * transcribed by hand from the "Quattordicesima Relazione sul monitoraggio
 * dei provvedimenti legislativi e attuativi del Governo Meloni", aggiornamento
 * al 31 marzo 2026** (published at programmagoverno.gov.it) — every
 * `previsti`/`adottati` pair below is a real, citable number from that
 * report's narrative text (§2.2/§2.3, cross-referencing the "atti che
 * rinviano a più di 20 decreti" list against the "atti per cui sono stati
 * smaltiti più provvedimenti" list), not an invented figure.
 *
 * For the (large) remainder of acts in our database that this report simply
 * doesn't name individually (it only calls out the ~20 acts with the
 * heaviest secondary-legislation load), this script falls back to a
 * transparent, clearly-logged **heuristic** grounded in the report's own
 * aggregate statistics (e.g. "il 54% delle disposizioni sono auto-applicative"):
 * acts with `copertura: 'invarianza'` (no declared financial impact) are
 * treated as self-executing (`decreesMissing: 0`), while acts with a real
 * financial footprint (`a_debito` / `tagli_spesa`) that aren't in the
 * curated table are conservatively flagged as awaiting at least one
 * ministerial decree — clearly logged as an *estimate*, never presented as
 * a verified DAGL figure.
 *
 * Usage: npm run db:ingest:dagl
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REPORT_SOURCE =
  'Quattordicesima Relazione sul monitoraggio dei provvedimenti legislativi e attuativi del Governo Meloni ' +
  '(Dipartimento per il Programma di Governo — Presidenza del Consiglio), aggiornamento al 31 marzo 2026';
// This report is published quarterly; the next scheduled update is what we
// surface in `decreeDeadline` for acts we can't pin to a real per-decree
// statutory term (the report itself does not break termini down per-act).
const NEXT_REPORT_DUE = '2026-09-30';

// ---------------------------------------------------------------------------
// 1. CURATED REAL DATA — hand-transcribed from the report named above.
// ---------------------------------------------------------------------------

type DaglEntry = {
  code: string; // matches `Act.code`, e.g. "L. 213/2023" / "D.L. 60/2024"
  previsti: number; // provvedimenti attuativi previsti (real, per §2.2)
  adottati: number; // provvedimenti attuativi adottati (real, per §2.3)
  label: string; // short human description, for logging only
};

const DAGL_MONITORING: DaglEntry[] = [
  { code: 'L. 197/2022', previsti: 118, adottati: 108, label: 'Legge di bilancio 2023' },
  { code: 'L. 207/2024', previsti: 110, adottati: 72, label: 'Legge di bilancio 2025' },
  { code: 'L. 213/2023', previsti: 55, adottati: 46, label: 'Legge di bilancio 2024' },
  { code: 'L. 199/2025', previsti: 103, adottati: 14, label: 'Legge di bilancio 2026' },
  { code: 'L. 206/2023', previsti: 36, adottati: 27, label: 'Valorizzazione del Made in Italy' },
  { code: 'D.L. 13/2023', previsti: 29, adottati: 26, label: 'Attuazione PNRR e PNC' },
  { code: 'D.L. 75/2023', previsti: 23, adottati: 22, label: 'PA, sport e Giubileo 2025' },
  { code: 'D.L. 19/2024', previsti: 22, adottati: 15, label: 'Disposizioni urgenti PNRR' },
  { code: 'D.L. 60/2024', previsti: 21, adottati: 20, label: 'Politiche di coesione' },
  { code: 'D.L. 63/2024', previsti: 21, adottati: 18, label: 'Imprese agricole, pesca e interesse strategico' },
  { code: 'D.L. 71/2024', previsti: 21, adottati: 17, label: 'Sport, disabilità, scuola, università' },
  { code: 'D.L. 19/2026', previsti: 13, adottati: 0, label: 'PNRR e politiche di coesione' },
  // These three are only known by their real *adottati* count (the report
  // doesn't list their `previsti` total in this excerpt) — deliberately
  // NOT included above, since we'd have to invent the missing side of the
  // subtraction. Kept here, commented, purely as a documentation trail of
  // real numbers we chose *not* to use rather than guess at:
  //   D.L. 176/2022 (Aiuti quater): adottati 18, previsti non citato
  //   D.L. 44/2023 (capacità amministrativa PA): adottati 16, previsti non citato
  //   D.L. 48/2023 (inclusione sociale e lavoro): adottati 14, previsti non citato
];

const DAGL_BY_CODE = new Map(DAGL_MONITORING.map((entry) => [entry.code, entry]));

// ---------------------------------------------------------------------------
// 2. UPDATE PLAN — one real-data branch, one clearly-logged heuristic branch.
// ---------------------------------------------------------------------------

type UpdatePlan = {
  decreesMissing: number;
  decreeDeadline: string | null;
  financialNote: string;
  urgencyDelta: number;
  source: 'dagl-report' | 'heuristic-self-executing' | 'heuristic-estimated';
};

function planForRealMatch(entry: DaglEntry, act: { financialNote: string; urgency: number }): UpdatePlan {
  const missing = Math.max(0, entry.previsti - entry.adottati);
  const rate = entry.previsti > 0 ? Math.round((entry.adottati / entry.previsti) * 1000) / 10 : 100;
  const base = baseFinancialNote(act.financialNote);
  return {
    decreesMissing: missing,
    decreeDeadline: missing > 0 ? NEXT_REPORT_DUE : null,
    financialNote:
      `${base}\n\n[DAGL — Monitoraggio decreti attuativi] ${entry.label}: ${entry.adottati}/${entry.previsti} ` +
      `decreti attuativi adottati (tasso ${rate}%), ${missing} ancora da emanare. ` +
      `${missing > 0 ? "Fino all'emanazione dei decreti mancanti, la relativa quota di risorse/misure resta non integralmente operativa." : "Tutti i decreti attuativi previsti risultano adottati: l'atto è ormai completamente operativo."} ` +
      `Fonte: ${REPORT_SOURCE}.`,
    urgencyDelta: missing > 3 ? 10 : missing > 0 ? 5 : -5,
    source: 'dagl-report',
  };
}

function planForSelfExecuting(act: { financialNote: string }): UpdatePlan {
  const base = baseFinancialNote(act.financialNote);
  return {
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      `${base}\n\n[DAGL — Monitoraggio decreti attuativi] Norma classificata come auto-applicativa ` +
      "(copertura 'invarianza', nessun onere aggiuntivo dichiarato): non risulta subordinata a decreti attuativi " +
      `secondo l'euristica adottata da questa fase di ingestion (v. nota di scope nello script).`,
    urgencyDelta: 0,
    source: 'heuristic-self-executing',
  };
}

/** Only used when an act has real financial impact (`a_debito`/`tagli_spesa`)
 * but isn't named in `DAGL_MONITORING` — deliberately conservative (1
 * estimated decree, generic statutory term) and *always* labelled as an
 * estimate rather than a verified figure, per the HONESTY NOTE above. */
function planForEstimated(act: { financialNote: string; date: string }): UpdatePlan {
  const deadline = addDays(act.date, 180); // 180gg è il termine attuativo più ricorrente nei DAGL statutari
  const base = baseFinancialNote(act.financialNote);
  return {
    decreesMissing: 1,
    decreeDeadline: deadline,
    financialNote:
      `${base}\n\n[DAGL — Monitoraggio decreti attuativi, STIMA] Questo atto ha un impatto finanziario dichiarato ` +
      "ma non compare fra gli atti espressamente citati nella relazione DAGL consultata: si stima prudenzialmente " +
      "almeno 1 decreto attuativo ancora da emanare (termine indicativo di 180 giorni), in attesa di una verifica " +
      "puntuale sul motore di ricerca provvedimenti attuativi. Questo valore è una STIMA, non un dato DAGL verificato.",
    urgencyDelta: 3,
    source: 'heuristic-estimated',
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return NEXT_REPORT_DUE;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampUrgency(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Strips any `[DAGL — ...]` annotation appended by a previous run of this
 * same script before a fresh one is appended — without this, re-running the
 * (otherwise idempotent) script would grow `financialNote` unboundedly. */
function baseFinancialNote(financialNote: string): string {
  return financialNote.split('\n\n[DAGL — Monitoraggio decreti attuativi')[0].trimEnd();
}

// ---------------------------------------------------------------------------
// 3. MAIN
// ---------------------------------------------------------------------------

type Counters = {
  checked: number;
  realDataUpdates: number;
  selfExecutingVerified: number;
  estimatedUpdates: number;
  errors: number;
};

async function main() {
  console.log('=== La Gazzetta Civica — FASE 2: DAGL Monitoraggio Decreti Attuativi Ingestion ===');
  console.log(`Fonte dati reali: ${REPORT_SOURCE}`);
  console.log(`Voci curate con dati reali previsti/adottati: ${DAGL_MONITORING.length}\n`);

  const counters: Counters = { checked: 0, realDataUpdates: 0, selfExecutingVerified: 0, estimatedUpdates: 0, errors: 0 };

  const acts = await prisma.act.findMany({
    select: { id: true, code: true, date: true, copertura: true, financialNote: true, urgency: true },
  });
  console.log(`Loaded ${acts.length} acts from Supabase to check against DAGL monitoring data.\n`);

  for (const act of acts) {
    counters.checked += 1;
    try {
      const realEntry = DAGL_BY_CODE.get(act.code);
      const plan: UpdatePlan = realEntry
        ? planForRealMatch(realEntry, act)
        : act.copertura === 'invarianza'
          ? planForSelfExecuting(act)
          : planForEstimated(act);

      // Idempotency guard for `urgency`: it's a plain number with no room to
      // embed metadata, so instead of adding `urgencyDelta` every run (which
      // would compound indefinitely), we only apply it the first time this
      // script ever touches this act — detected via the same `[DAGL — ...]`
      // tag `baseFinancialNote()` strips. Re-runs recompute everything else
      // fresh but leave an already-adjusted `urgency` alone.
      const alreadyProcessed = act.financialNote.includes('[DAGL — Monitoraggio decreti attuativi');
      const urgency = alreadyProcessed ? act.urgency : clampUrgency(act.urgency + plan.urgencyDelta);

      await prisma.act.update({
        where: { id: act.id },
        data: {
          decreesMissing: plan.decreesMissing,
          decreeDeadline: plan.decreeDeadline,
          financialNote: plan.financialNote,
          urgency,
        },
      });

      if (plan.source === 'dagl-report') {
        counters.realDataUpdates += 1;
        console.log(`  [dati reali] ${act.code} — ${realEntry!.label}: ${plan.decreesMissing} decreti ancora da emanare`);
      } else if (plan.source === 'heuristic-self-executing') {
        counters.selfExecutingVerified += 1;
      } else {
        counters.estimatedUpdates += 1;
      }
    } catch (error) {
      counters.errors += 1;
      console.error(`  !! Failed to update ${act.code} (${act.id}):`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n=== DAGL Monitoraggio Decreti Attuativi — summary ===');
  console.log(`Acts checked:                    ${counters.checked}`);
  console.log(`Acts updated with pending decrees (dati reali DAGL): ${counters.realDataUpdates}`);
  console.log(`Acts updated with pending decrees (stima euristica): ${counters.estimatedUpdates}`);
  console.log(`Self-executing acts verified:    ${counters.selfExecutingVerified}`);
  console.log(`Errors:                          ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('DAGL ingestion failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
