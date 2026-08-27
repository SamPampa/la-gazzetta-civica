import type { Copertura, Iniziativa, IterStatus, Materia } from '@/src/data/mockActs';

export const ITER_LABELS: Record<IterStatus, string> = {
  in_commissione: 'In Commissione',
  in_aula: 'In Aula',
  navetta_senato: 'Navetta Senato',
  promulgata: 'Promulgata',
};

export const INIZIATIVA_LABELS: Record<Iniziativa, string> = {
  governo: 'Governo',
  parlamentare: 'Parlamentare',
  popolare: 'Popolare',
};

export const MATERIA_LABELS: Record<Materia, string> = {
  trasporti: 'Trasporti',
  fisco: 'Fisco',
  sanita: 'Sanità',
  giustizia: 'Giustizia',
  lavoro: 'Lavoro',
};

export const COPERTURA_LABELS: Record<Copertura, string> = {
  invarianza: 'Invarianza a costo zero',
  a_debito: 'A debito',
  tagli_spesa: 'Tagli di spesa',
};

const MONTHS_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

export function formatDateIT(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS_IT[Number(month) - 1]} ${year}`;
}

export function iterBadgeClass(status: IterStatus): string {
  switch (status) {
    case 'in_commissione':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'in_aula':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'navetta_senato':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'promulgata':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
}

export function coperturaDotClass(copertura: Copertura): string {
  switch (copertura) {
    case 'invarianza':
      return 'bg-slate-400';
    case 'a_debito':
      return 'bg-rose-500';
    case 'tagli_spesa':
      return 'bg-amber-500';
  }
}
