import type { VoteShare } from '@/src/data/mockActs';

type Props = {
  votes: VoteShare[];
};

export function VoteMap({ votes }: Props) {
  const totals = votes.reduce(
    (acc, v) => {
      acc.favorevoli += v.favorevoli;
      acc.contrari += v.contrari;
      acc.astenuti += v.astenuti;
      return acc;
    },
    { favorevoli: 0, contrari: 0, astenuti: 0 },
  );
  const all = totals.favorevoli + totals.contrari + totals.astenuti || 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-slate-900">Mappa voti d&apos;aula</h2>
          <p className="mt-1 text-sm text-slate-500">Aggregazione per gruppo parlamentare (simulazione su ultimo scrutinio disponibile).</p>
        </div>
        <div className="flex gap-4 font-mono text-xs text-slate-600">
          <span>
            Favorevoli <strong className="text-emerald-700">{Math.round((totals.favorevoli / all) * 100)}%</strong>
          </span>
          <span>
            Contrari <strong className="text-rose-700">{Math.round((totals.contrari / all) * 100)}%</strong>
          </span>
          <span>
            Astenuti <strong className="text-slate-500">{Math.round((totals.astenuti / all) * 100)}%</strong>
          </span>
        </div>
      </div>

      <div className="mb-6 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-full">
          <div className="bg-emerald-500" style={{ width: `${(totals.favorevoli / all) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(totals.contrari / all) * 100}%` }} />
          <div className="bg-slate-400" style={{ width: `${(totals.astenuti / all) * 100}%` }} />
        </div>
      </div>

      <ul className="space-y-3">
        {votes.map((vote) => {
          const total = vote.favorevoli + vote.contrari + vote.astenuti || 1;
          return (
            <li key={vote.party}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: vote.color }} />
                  {vote.party}
                </span>
                <span className="font-mono text-slate-500">
                  {vote.favorevoli} / {vote.contrari} / {vote.astenuti}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-emerald-500/90" style={{ width: `${(vote.favorevoli / total) * 100}%` }} />
                <div className="bg-rose-500/90" style={{ width: `${(vote.contrari / total) * 100}%` }} />
                <div className="bg-slate-400/80" style={{ width: `${(vote.astenuti / total) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
