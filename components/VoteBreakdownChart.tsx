import { formatDateIT } from '@/lib/labels';

export interface VoteBreakdownData {
  favorevoli: number;
  contrari: number;
  astenuti: number;
  pctFav: number;
  pctCont: number;
  pctAst: number;
  totalVoters?: number;
  chamber?: 'Camera' | 'Senato' | 'Bicamerale' | string;
  voteDate?: string;
  quorumNotice?: string;
}

type Props = {
  data: VoteBreakdownData;
};

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('it-IT', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatCount(value: number): string {
  return value.toLocaleString('it-IT');
}

function segmentWidths(data: VoteBreakdownData): { fav: number; cont: number; ast: number } {
  const fromPct = data.pctFav + data.pctCont + data.pctAst;
  if (fromPct > 0) {
    return {
      fav: (data.pctFav / fromPct) * 100,
      cont: (data.pctCont / fromPct) * 100,
      ast: (data.pctAst / fromPct) * 100,
    };
  }

  const total = data.favorevoli + data.contrari + data.astenuti;
  if (total > 0) {
    return {
      fav: (data.favorevoli / total) * 100,
      cont: (data.contrari / total) * 100,
      ast: (data.astenuti / total) * 100,
    };
  }

  return { fav: 0, cont: 0, ast: 0 };
}

function quorumStatus(data: VoteBreakdownData): string {
  if (data.quorumNotice) return data.quorumNotice;
  const total = data.totalVoters ?? data.favorevoli + data.contrari + data.astenuti;
  const passed = data.favorevoli > data.contrari;
  return passed
    ? `Quorum dei votanti: ${formatCount(total)} · provvedimento approvato`
    : `Quorum dei votanti: ${formatCount(total)} · maggioranza non raggiunta`;
}

function chamberBadge(data: VoteBreakdownData): string | null {
  const parts: string[] = [];
  if (data.chamber) parts.push(data.chamber);
  if (data.voteDate) parts.push(formatDateIT(data.voteDate));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function VoteBreakdownChart({ data }: Props) {
  const widths = segmentWidths(data);
  const totalVoters = data.totalVoters ?? data.favorevoli + data.contrari + data.astenuti;
  const badge = chamberBadge(data);
  const hoverSummary = `Favorevoli ${formatPct(data.pctFav)}% · Contrari ${formatPct(data.pctCont)}% · Astenuti ${formatPct(data.pctAst)}%`;

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-xl leading-none" aria-hidden="true">
            🗳️
          </span>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Esito della Votazione Parlamentare</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatCount(totalVoters)} votanti complessivi
            </p>
          </div>
        </div>
        {badge && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {badge}
          </span>
        )}
      </header>

      <div className="group/bar relative pt-9">
        <div
          className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white opacity-0 shadow-sm transition-opacity duration-200 group-hover/bar:opacity-100"
          role="tooltip"
        >
          {hoverSummary}
        </div>

        <div
          className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`Votazione: favorevoli ${formatPct(data.pctFav)} per cento, contrari ${formatPct(data.pctCont)} per cento, astenuti ${formatPct(data.pctAst)} per cento`}
        >
          <div
            className="h-full bg-emerald-500 transition-opacity hover:opacity-90"
            style={{ width: `${widths.fav}%` }}
            title={`Favorevoli: ${formatCount(data.favorevoli)} voti (${formatPct(data.pctFav)}%)`}
          />
          <div
            className="h-full bg-rose-500 transition-opacity hover:opacity-90"
            style={{ width: `${widths.cont}%` }}
            title={`Contrari: ${formatCount(data.contrari)} voti (${formatPct(data.pctCont)}%)`}
          />
          <div
            className="h-full bg-slate-400 transition-opacity hover:opacity-90"
            style={{ width: `${widths.ast}%` }}
            title={`Astenuti: ${formatCount(data.astenuti)} voti (${formatPct(data.pctAst)}%)`}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricCard
          emoji="🟢"
          label="Favorevoli"
          count={data.favorevoli}
          pct={data.pctFav}
          badgeClass="bg-emerald-50 text-emerald-800"
          sublabel="Maggioranza di Governo + Aderenti"
        />
        <MetricCard
          emoji="🔴"
          label="Contrari"
          count={data.contrari}
          pct={data.pctCont}
          badgeClass="bg-rose-50 text-rose-800"
          sublabel="Opposizioni parlamentari"
        />
        <MetricCard
          emoji="⚪"
          label="Astenuti / Non partecipanti"
          count={data.astenuti}
          pct={data.pctAst}
          badgeClass="bg-slate-100 text-slate-700"
          sublabel={quorumStatus(data)}
        />
      </div>

      <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-400">
        Dati ufficiali estratti dai verbali di seduta d&apos;Aula (Camera dei Deputati / Senato della
        Repubblica).
      </p>
    </section>
  );
}

function MetricCard({
  emoji,
  label,
  count,
  pct,
  badgeClass,
  sublabel,
}: {
  emoji: string;
  label: string;
  count: number;
  pct: number;
  badgeClass: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        <span className="mr-1" aria-hidden="true">
          {emoji}
        </span>
        {label}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{formatCount(count)}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${badgeClass}`}>
          {formatPct(pct)}%
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{sublabel}</p>
    </div>
  );
}

/** Compact stand-in when an act has no recorded Aula vote yet, so the
 * surrounding detail layout does not collapse. */
export function VoteBreakdownPending({ iterStatus }: { iterStatus?: string }) {
  const inCommission = iterStatus === 'in_commissione';

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-start gap-2.5">
        <span className="text-xl leading-none" aria-hidden="true">
          🗳️
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Esito della Votazione Parlamentare</h2>
          <p className="mt-0.5 text-xs text-slate-500">Scrutinio d&apos;Aula non ancora disponibile</p>
        </div>
      </header>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-relaxed text-slate-600">
        {inCommission
          ? 'L’atto è ancora in commissione: non risulta una votazione finale d’Aula nei verbali consultati.'
          : 'Nessuno scrutinio finale è stato registrato per questo atto. Il grafico comparirà non appena i verbali di seduta saranno disponibili.'}
      </div>

      <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-400">
        Dati ufficiali estratti dai verbali di seduta d&apos;Aula (Camera dei Deputati / Senato della
        Repubblica).
      </p>
    </section>
  );
}
