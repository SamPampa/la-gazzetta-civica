'use client';

import { FormEvent, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ActCard } from '@/components/ActCard';
import {
  COPERTURA_LABELS,
  INIZIATIVA_LABELS,
  ITER_LABELS,
  MATERIA_LABELS,
} from '@/lib/labels';
import type { ActSortKey, GetActsParams, GetActsResult, TimeRange } from '@/lib/archive';

const ALL = 'all';

type Props = {
  result: GetActsResult;
  filters: GetActsParams;
};

export function ArchiveExplorer({ result, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const query = filters.query ?? '';
  const timeRange: TimeRange = filters.timeRange ?? 'recent';
  const iter = filters.iter ?? ALL;
  const iniziativa = filters.iniziativa ?? ALL;
  const materia = filters.materia ?? ALL;
  const copertura = filters.copertura ?? ALL;
  const sort: ActSortKey = filters.sort ?? 'urgency';
  const page = result.page;
  const year = new Date().getFullYear();
  const recentWindowLabel = `Ultimi 5 anni (${year - 5} - ${year})`;

  function navigate(patch: Record<string, string | undefined>, resetPage = true) {
    const params = new URLSearchParams();
    const next: Record<string, string | undefined> = {
      q: query || undefined,
      range: timeRange === 'recent' ? undefined : timeRange,
      iter: iter === ALL ? undefined : iter,
      iniziativa: iniziativa === ALL ? undefined : iniziativa,
      materia: materia === ALL ? undefined : materia,
      copertura: copertura === ALL ? undefined : copertura,
      sort: sort === 'urgency' ? undefined : sort,
      page: resetPage ? undefined : page > 1 ? String(page) : undefined,
      ...patch,
    };
    if (resetPage) next.page = undefined;
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const href = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const q = String(form.get('q') ?? '').trim();
    navigate({ q: q || undefined });
  };

  const reset = () => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  };

  return (
    <div className={`space-y-6 ${pending ? 'opacity-70' : ''}`}>
      <form onSubmit={onSearch} className="relative">
        <input
          type="search"
          name="q"
          key={query}
          defaultValue={query}
          placeholder="Cerca per titolo, numero legge o materia (es. 285/1992, monopattini, IVA)"
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
        <TimeChip label="Tutti gli atti" active={timeRange === 'all'} onClick={() => navigate({ range: 'all' })} />
        <TimeChip
          label={recentWindowLabel}
          active={timeRange === 'recent'}
          onClick={() => navigate({ range: undefined })}
        />
        <TimeChip
          label="Storico (> 5 anni)"
          active={timeRange === 'historic'}
          onClick={() => navigate({ range: 'historic' })}
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
                onChange={(e) => navigate({ sort: e.target.value === 'date' ? 'date' : undefined })}
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
            onChange={(v) => navigate({ iter: v === ALL ? undefined : v })}
            options={[{ value: ALL, label: 'Tutti' }, ...typedOptions(ITER_LABELS)]}
          />
          <FilterSelect
            label="Iniziativa"
            value={iniziativa}
            onChange={(v) => navigate({ iniziativa: v === ALL ? undefined : v })}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(INIZIATIVA_LABELS)]}
          />
          <FilterSelect
            label="Materia"
            value={materia}
            onChange={(v) => navigate({ materia: v === ALL ? undefined : v })}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(MATERIA_LABELS)]}
          />
          <FilterSelect
            label="Copertura finanziaria"
            value={copertura}
            onChange={(v) => navigate({ copertura: v === ALL ? undefined : v })}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(COPERTURA_LABELS)]}
          />
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {result.total} {result.total === 1 ? 'norma' : 'norme'} trovate
        {query ? ` per «${query}»` : ''}
      </p>

      {result.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nessun atto corrisponde a ricerca e filtri. Modifica i criteri o azzera.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {result.items.map((act) => (
              <ActCard key={act.id} act={act} />
            ))}
          </div>

          {result.totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 pt-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => navigate({ page: page <= 2 ? undefined : String(page - 1) }, false)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                ← Precedente
              </button>
              <span className="text-xs text-slate-500">
                Pagina {result.page} di {result.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= result.totalPages}
                onClick={() => navigate({ page: String(page + 1) }, false)}
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
