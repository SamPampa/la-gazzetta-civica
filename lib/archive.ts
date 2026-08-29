import type { Act, Copertura, Iniziativa, IterStatus, Materia } from '@/src/data/mockActs';

export type TimeRange = 'all' | 'recent' | 'historic';
export type ActSortKey = 'urgency' | 'date';

export const ARCHIVE_PAGE_SIZE = 6;

export type GetActsParams = {
  page?: number;
  pageSize?: number;
  timeRange?: TimeRange;
  query?: string;
  iter?: IterStatus;
  iniziativa?: Iniziativa;
  materia?: Materia;
  copertura?: Copertura;
  sort?: ActSortKey;
};

export type ActListItem = Pick<
  Act,
  | 'id'
  | 'code'
  | 'formalTitle'
  | 'officialTitle'
  | 'popularTitle'
  | 'date'
  | 'iniziativa'
  | 'materia'
  | 'copertura'
  | 'iterStatus'
  | 'decreesMissing'
  | 'decreeDeadline'
  | 'urgency'
  | 'ministry'
>;

export type GetActsResult = {
  items: ActListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const ALLOWED_ITER: IterStatus[] = ['in_commissione', 'in_aula', 'navetta_senato', 'promulgata'];
const ALLOWED_INIZIATIVA: Iniziativa[] = ['governo', 'parlamentare', 'popolare'];
const ALLOWED_MATERIA: Materia[] = ['codice_strada', 'fisco', 'sanita', 'lavoro', 'giustizia'];
const ALLOWED_COPERTURA: Copertura[] = ['invarianza', 'a_debito', 'tagli_spesa'];

export function parseArchiveSearchParams(
  raw: Record<string, string | string[] | undefined>,
): GetActsParams {
  const first = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Math.max(1, Number.parseInt(first('page') ?? '1', 10) || 1);
  const timeRangeRaw = first('range');
  const timeRange: TimeRange =
    timeRangeRaw === 'all' || timeRangeRaw === 'historic' || timeRangeRaw === 'recent'
      ? timeRangeRaw
      : 'recent';
  const sortRaw = first('sort');
  const sort: ActSortKey = sortRaw === 'date' ? 'date' : 'urgency';

  const iter = first('iter') as IterStatus | undefined;
  const iniziativa = first('iniziativa') as Iniziativa | undefined;
  const materia = first('materia') as Materia | undefined;
  const copertura = first('copertura') as Copertura | undefined;

  return {
    page,
    pageSize: ARCHIVE_PAGE_SIZE,
    timeRange,
    sort,
    query: first('q')?.trim() || undefined,
    iter: iter && ALLOWED_ITER.includes(iter) ? iter : undefined,
    iniziativa: iniziativa && ALLOWED_INIZIATIVA.includes(iniziativa) ? iniziativa : undefined,
    materia: materia && ALLOWED_MATERIA.includes(materia) ? materia : undefined,
    copertura: copertura && ALLOWED_COPERTURA.includes(copertura) ? copertura : undefined,
  };
}
