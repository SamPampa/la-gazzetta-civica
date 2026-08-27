import { OsservatorioDashboard } from '@/components/OsservatorioDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Osservatorio Ritardi & Potere',
  description:
    'Analisi trasversale del potere: ritardi sui decreti attuativi, bypass democratico e norme omnibus.',
};

export default function OsservatorioPage() {
  return (
    <main className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Cruscotto</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">Osservatorio ritardi e potere</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Indicatori aggregati su ritardi attuativi, ricorso alla questione di fiducia e deriva omnibus.
          I valori sono calcolati sul dataset mockato della piattaforma, con metodologia in Trasparenza.
        </p>
      </header>
      <OsservatorioDashboard />
    </main>
  );
}
