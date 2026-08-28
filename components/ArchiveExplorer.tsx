'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ActCard } from '@/components/ActCard';
import {
  COPERTURA_LABELS,
  INIZIATIVA_LABELS,
  ITER_LABELS,
  MATERIA_LABELS,
} from '@/lib/labels';
import {
  MOCK_ACTS,
  currentYear,
  isRecentAct,
  searchActs,
  type Act,
  type Copertura,
  type Iniziativa,
  type IterStatus,
  type Materia,
} from '@/src/data/mockActs';

type SortKey = 'date' | 'urgency';
type TimeRange = 'all' | 'recent' | 'historic';
const ALL = 'all';
const PAGE_SIZE = 6;

const RECENT_WINDOW_LABEL = `Ultimi 5 anni (${currentYear() - 5} - ${currentYear()})`;

type Props = {
  /** Acts fetched server-side via `getActs()` (Supabase, falling back to
   * the bundled mock catalog) - all search/filter/sort/pagination below
   * still runs client-side against this list, unchanged from before this
   * was wired to the DB. Defaults to the mock catalog directly so the
   * component still renders sensibly if ever used without the prop. */
  initialActs?: Act[];
};

export function ArchiveExplorer({ initialActs = MOCK_ACTS }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('recent');
  const [iter, setIter] = useState<IterStatus | typeof ALL>(ALL);
  const [iniziativa, setIniziativa] = useState<Iniziativa | typeof ALL>(ALL);
  const [materia, setMateria] = useState<Materia | typeof ALL>(ALL);
  const [copertura, setCopertura] = useState<Copertura | typeof ALL>(ALL);
  const [sort, setSort] = useState<SortKey>('urgency');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const base = submitted.trim() ? searchActs(submitted, initialActs) : [...initialActs];
    const list = base.filter((act) => {
      if (timeRange === 'recent' && !isRecentAct(act)) return false;
      if (timeRange === 'historic' && isRecentAct(act)) return false;
      if (iter !== ALL && act.iterStatus !== iter) return false;
      if (iniziativa !== ALL && act.iniziativa !== iniziativa) return false;
      if (materia !== ALL && act.materia !== materia) return false;
      if (copertura !== ALL && act.copertura !== copertura) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === 'urgency') return b.urgency - a.urgency;
      return b.date.localeCompare(a.date);
    });
  }, [submitted, timeRange, iter, iniziativa, materia, copertura, sort, initialActs]);

  useEffect(() => {
    setPage(1);
  }, [submitted, timeRange, iter, iniziativa, materia, copertura, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(query.trim());
  };

  const reset = () => {
    setQuery('');
    setSubmitted('');
    setTimeRange('recent');
    setIter(ALL);
    setIniziativa(ALL);
    setMateria(ALL);
    setCopertura(ALL);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSearch} className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per titolo, numero legge, articolo o materia (es. 285/1992, monopattini, IVA)"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-4 pr-28 text-sm text-slate-900 outline-none ring-blue-600/15 placeholder:text-slate-400 focus:border-blue-400 focus:ring-4"
        />
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Cerca
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <TimeChip label="Tutti gli atti" active={timeRange === 'all'} onClick={() => setTimeRange('all')} />
        <TimeChip
          label={RECENT_WINDOW_LABEL}
          active={timeRange === 'recent'}
          onClick={() => setTimeRange('recent')}
        />
        <TimeChip
          label="Storico (> 5 anni)"
          active={timeRange === 'historic'}
          onClick={() => setTimeRange('historic')}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Filtri</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">
              Ordina
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
              >
                <option value="urgency">Urgenza attuativa</option>
                <option value="date">Data (più recente)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Azzera
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Stato iter"
            value={iter}
            onChange={(v) => setIter(v as IterStatus | typeof ALL)}
            options={[{ value: ALL, label: 'Tutti' }, ...typedOptions(ITER_LABELS)]}
          />
          <FilterSelect
            label="Iniziativa"
            value={iniziativa}
            onChange={(v) => setIniziativa(v as Iniziativa | typeof ALL)}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(INIZIATIVA_LABELS)]}
          />
          <FilterSelect
            label="Materia"
            value={materia}
            onChange={(v) => setMateria(v as Materia | typeof ALL)}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(MATERIA_LABELS)]}
          />
          <FilterSelect
            label="Copertura finanziaria"
            value={copertura}
            onChange={(v) => setCopertura(v as Copertura | typeof ALL)}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(COPERTURA_LABELS)]}
          />
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {filtered.length} {filtered.length === 1 ? 'norma' : 'norme'} trovate
        {submitted ? ` per «${submitted}»` : ''}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nessun atto corrisponde a ricerca e filtri. Modifica i criteri o azzera.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {paged.map((act) => (
              <ActCard key={act.id} act={act} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2 text-sm">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                ← Precedente
              </button>
              <span className="text-xs text-slate-500">
                Pagina {currentPage} di {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                Successiva →
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function typedOptions<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((key) => ({ value: key, label: labels[key] }));
}

function TimeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
