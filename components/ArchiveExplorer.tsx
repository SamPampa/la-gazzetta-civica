'use client';

import { useMemo, useState } from 'react';
import { ActCard } from '@/components/ActCard';
import {
  COPERTURA_LABELS,
  INIZIATIVA_LABELS,
  ITER_LABELS,
  MATERIA_LABELS,
} from '@/lib/labels';
import { MOCK_ACTS, type Copertura, type Iniziativa, type IterStatus, type Materia } from '@/src/data/mockActs';

type SortKey = 'date' | 'urgency';

const ALL = 'all';

export function ArchiveExplorer() {
  const [iter, setIter] = useState<IterStatus | typeof ALL>(ALL);
  const [iniziativa, setIniziativa] = useState<Iniziativa | typeof ALL>(ALL);
  const [materia, setMateria] = useState<Materia | typeof ALL>(ALL);
  const [copertura, setCopertura] = useState<Copertura | typeof ALL>(ALL);
  const [sort, setSort] = useState<SortKey>('urgency');

  const filtered = useMemo(() => {
    const list = MOCK_ACTS.filter((act) => {
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
  }, [iter, iniziativa, materia, copertura, sort]);

  const reset = () => {
    setIter(ALL);
    setIniziativa(ALL);
    setMateria(ALL);
    setCopertura(ALL);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Filtri interattivi</h2>
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
            label="Copertura"
            value={copertura}
            onChange={(v) => setCopertura(v as Copertura | typeof ALL)}
            options={[{ value: ALL, label: 'Tutte' }, ...typedOptions(COPERTURA_LABELS)]}
          />
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {filtered.length} {filtered.length === 1 ? 'atto' : 'atti'} in archivio
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nessun atto corrisponde ai filtri selezionati.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((act) => (
            <ActCard key={act.id} act={act} />
          ))}
        </div>
      )}
    </div>
  );
}

function typedOptions<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((key) => ({ value: key, label: labels[key] }));
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
