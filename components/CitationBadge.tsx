'use client';

import { useState } from 'react';
import type { Citation } from '@/src/data/mockActs';

type Props = {
  n: number;
  citations: Citation[];
};

export function CitationBadge({ n, citations }: Props) {
  const [open, setOpen] = useState(false);
  const citation = citations.find((c) => c.id === n);

  return (
    <span className="relative inline-flex align-super">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border border-blue-200 bg-blue-50 px-1 font-mono text-[10px] font-bold text-blue-800 hover:bg-blue-100"
        aria-expanded={open}
        aria-label={`Apri citazione ${n}`}
      >
        [{n}]
      </button>
      {open && citation && (
        <span className="absolute left-0 top-7 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <span className="mb-2 flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold leading-snug text-slate-800">{citation.source}</span>
            <button
              type="button"
              className="shrink-0 text-slate-400 hover:text-slate-700"
              onClick={() => setOpen(false)}
              aria-label="Chiudi citazione"
            >
              ✕
            </button>
          </span>
          <span className="block rounded-lg bg-slate-50 p-2 font-mono text-[11px] italic leading-relaxed text-slate-600">
            {citation.excerpt}
          </span>
        </span>
      )}
    </span>
  );
}

type DrawerProps = {
  citation: Citation | null;
  onClose: () => void;
};

export function CitationDrawer({ citation, onClose }: DrawerProps) {
  if (!citation) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold leading-snug text-slate-800">
          Fonte: {citation.source}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-900"
          aria-label="Chiudi cassetto citazione"
        >
          ✕
        </button>
      </div>
      <p className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs italic leading-relaxed text-slate-600">
        {citation.excerpt}
      </p>
    </div>
  );
}
