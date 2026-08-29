import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getObservatoryMetrics,
  type FinancialCoverageStat,
  type MinistryDelayStat,
} from '@/lib/db/observatory';
import { COPERTURA_LABELS } from '@/lib/labels';

export const metadata: Metadata = {
  title: 'Osservatorio & Analisi del Potere',
  description:
    'Indicatori aggregati in tempo reale su ritardi dei decreti attuativi, copertura finanziaria e norme omnibus.',
};

export const revalidate = 300;

const COVERAGE_BAR_CLASS: Record<FinancialCoverageStat['copertura'], string> = {
  a_debito: 'bg-rose-500',
  tagli_spesa: 'bg-amber-500',
  invarianza: 'bg-slate-400',
};

const COVERAGE_DOT_CLASS: Record<FinancialCoverageStat['copertura'], string> = {
  a_debito: 'bg-rose-500',
  tagli_spesa: 'bg-amber-500',
  invarianza: 'bg-slate-400',
};

function formatIt(value: number, fractionDigits = 0): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatDays(days: number): string {
  const fractionDigits = Number.isInteger(days) ? 0 : 1;
  const label = days === 1 ? 'giorno' : 'giorni';
  return `${formatIt(days, fractionDigits)} ${label}`;
}

export default async function OsservatorioPage() {
  const data = await getObservatoryMetrics();
  const { summary } = data;
  const ministries = data.ministryLeaderboard.filter((row) => row.totalMissingDecrees > 0);
  const maxMissingDecrees = Math.max(...ministries.map((row) => row.totalMissingDecrees), 1);

  return (
    <main className="space-y-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Cruscotto</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">
          Osservatorio &amp; Analisi del Potere
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          I totali sono estratti in tempo reale dal database degli atti e restano in cache al massimo
          cinque minuti. Nessun indicatore è stimato a mano: ritardi, copertura finanziaria e allerte
          omnibus derivano dai campi già registrati nel catalogo.
        </p>
      </header>

      <section aria-label="Sintesi indicatori" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Atti monitorati"
          value={formatIt(summary.totalActsTracked)}
          hint="Provvedimenti presenti nel catalogo"
        />
        <Kpi
          label="Decreti attuativi mancanti"
          value={formatIt(summary.totalMissingDecrees)}
          hint="Obblighi di attuazione ancora aperti"
        />
        <Kpi
          label="Ritardo medio"
          value={formatDays(summary.overallAverageDelayDays)}
          hint="Sui provvedimenti con decreti ancora dovuti"
        />
        <Kpi
          label="Allerte omnibus"
          value={formatIt(summary.omnibusAlertsCount)}
          hint="Atti con deriva tematica già segnalata"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-slate-900">
          Classifica ritardi ministeriali
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Ministeri ordinati per numero di decreti attuativi ancora dovuti. La barra misura i decreti
          mancanti; accanto, il ritardo massimo e medio in giorni.
        </p>
        {ministries.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">
            Nel catalogo attuale nessun ministero risulta con decreti attuativi ancora aperti.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {ministries.map((row) => (
              <MinistryRow key={row.ministry} row={row} maxMissingDecrees={maxMissingDecrees} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Copertura economica</h2>
        <p className="mt-1 text-sm text-slate-500">
          Distribuzione delle clausole di copertura finanziaria sul catalogo: invarianza a costo
          zero, copertura a debito, tagli di spesa.
        </p>
        <CoverageBar distribution={data.coverageDistribution} />
      </section>

      <section>
        <h2 className="font-serif text-xl font-semibold text-slate-900">I provvedimenti più critici</h2>
        <p className="mt-1 text-sm text-slate-500">
          Atti con decreti attuativi scaduti, ordinati per giorni di ritardo. Ogni scheda apre la
          scheda di lettura dell’atto.
        </p>
        {data.topDelayedActs.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Nessun provvedimento del catalogo ha oggi decreti attuativi con termine già scaduto.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {data.topDelayedActs.map((act) => (
              <li key={act.id}>
                <Link
                  href={`/atti/${act.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {act.code}
                    </span>
                    <span className="rounded-full bg-red-600 px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-white">
                      {formatDays(act.delayDays)} di ritardo
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug text-slate-900 group-hover:text-blue-800">
                    {act.popularTitle}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">{act.ministry}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-serif text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function MinistryRow({
  row,
  maxMissingDecrees,
}: {
  row: MinistryDelayStat;
  maxMissingDecrees: number;
}) {
  const width = Math.min(100, (row.totalMissingDecrees / maxMissingDecrees) * 100);
  const decreeLabel =
    row.totalMissingDecrees === 1 ? '1 decreto mancante' : `${formatIt(row.totalMissingDecrees)} decreti mancanti`;

  return (
    <li>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-slate-800">{row.ministry}</span>
        <span className="font-mono text-xs text-slate-500">
          {decreeLabel}
          {' · '}
          max {formatDays(row.maxDelayDays)}
          {' · '}
          media {formatDays(row.averageDelayDays)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={maxMissingDecrees}
        aria-valuenow={row.totalMissingDecrees}
        aria-label={`${row.ministry}: ${decreeLabel}`}
      >
        <div className="h-2 rounded-full bg-red-500" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

function CoverageBar({ distribution }: { distribution: FinancialCoverageStat[] }) {
  const hasAny = distribution.some((row) => row.count > 0);

  return (
    <div className="mt-5 space-y-4">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={distribution
          .map((row) => `${COPERTURA_LABELS[row.copertura]}: ${formatIt(row.percentage, 1)}%`)
          .join('; ')}
      >
        {hasAny
          ? distribution.map((row) =>
              row.percentage > 0 ? (
                <div
                  key={row.copertura}
                  className={`h-full ${COVERAGE_BAR_CLASS[row.copertura]}`}
                  style={{ width: `${row.percentage}%` }}
                  title={`${COPERTURA_LABELS[row.copertura]}: ${formatIt(row.percentage, 1)}%`}
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {distribution.map((row) => (
          <li key={row.copertura} className="flex items-start gap-2 text-sm text-slate-600">
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COVERAGE_DOT_CLASS[row.copertura]}`}
              aria-hidden
            />
            <span>
              <span className="block font-semibold text-slate-800">{COPERTURA_LABELS[row.copertura]}</span>
              <span className="font-mono text-xs text-slate-500">
                {formatIt(row.count)} atti · {formatIt(row.percentage, 1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
