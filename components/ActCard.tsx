import Link from 'next/link';
import type { Act } from '@/src/data/mockActs';
import { daysLate } from '@/src/data/mockActs';
import {
  COPERTURA_LABELS,
  ITER_LABELS,
  coperturaDotClass,
  formatDateIT,
  iterBadgeClass,
} from '@/lib/labels';

type Props = {
  act: Act;
};

export function ActCard({ act }: Props) {
  const late = daysLate(act.decreeDeadline);

  return (
    <Link
      href={`/atti/${act.id}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-700">{act.code}</span>
        <span className={`rounded-full border px-2 py-0.5 font-medium ${iterBadgeClass(act.iterStatus)}`}>
          {ITER_LABELS[act.iterStatus]}
        </span>
      </div>
      <h3 className="font-serif text-lg font-semibold leading-snug text-slate-900 group-hover:text-blue-800">
        {act.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{act.summary}</p>
      <p className="mt-3 font-mono text-[11px] text-slate-400">{formatDateIT(act.date)}</p>
      <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              act.decreesMissing === 0 ? 'bg-emerald-500' : late > 0 ? 'bg-rose-500' : 'bg-amber-400'
            }`}
          />
          {act.decreesMissing === 0
            ? 'Nessun decreto mancante'
            : `${act.decreesMissing} ${act.decreesMissing === 1 ? 'decreto mancante' : 'decreti mancanti'}`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${coperturaDotClass(act.copertura)}`} />
          {COPERTURA_LABELS[act.copertura]}
        </span>
      </div>
    </Link>
  );
}
