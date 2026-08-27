import { BYPASS_INDEX, MINISTRY_DELAYS, MOCK_ACTS, OMNIBUS_RADAR } from '@/src/data/mockActs';

export function OsservatorioDashboard() {
  const omnibusCount = MOCK_ACTS.filter((a) => a.omnibusRisk).length;
  const lobbyCount = MOCK_ACTS.filter((a) => a.lobbyCheck && a.lobbyCheck.similarity >= 0.85).length;
  const maxPending = Math.max(...MINISTRY_DELAYS.map((m) => m.pendingDecrees), 1);
  const maxRadar = 100;

  const points = OMNIBUS_RADAR.map((item, i) => {
    const angle = (Math.PI * 2 * i) / OMNIBUS_RADAR.length - Math.PI / 2;
    const r = (item.score / maxRadar) * 80;
    return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`;
  }).join(' ');

  const axes = OMNIBUS_RADAR.map((item, i) => {
    const angle = (Math.PI * 2 * i) / OMNIBUS_RADAR.length - Math.PI / 2;
    return {
      label: item.label,
      score: item.score,
      x: 100 + Math.cos(angle) * 88,
      y: 100 + Math.sin(angle) * 88,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Norme omnibus rilevate"
          value={String(omnibusCount)}
          hint="Atti con topic-drift sopra soglia"
        />
        <Kpi
          label="Lobby check >85%"
          value={String(lobbyCount)}
          hint="Sovrapposizione con memorie in audizione"
        />
        <Kpi
          label="Indice di bypass"
          value={`${BYPASS_INDEX.fiduciaShare}%`}
          hint="Ricorso alla questione di fiducia (simulato)"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Ministeri in ritardo sui decreti attuativi</h2>
        <p className="mt-1 text-sm text-slate-500">Classifica per decreti pendenti e ritardo medio in giorni.</p>
        <ul className="mt-5 space-y-3">
          {MINISTRY_DELAYS.map((row) => (
            <li key={row.ministry}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold text-slate-800">{row.ministry}</span>
                <span className="font-mono text-xs text-slate-500">
                  {row.pendingDecrees} decreti · {row.avgDaysLate} gg
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${row.avgDaysLate > 90 ? 'bg-rose-500' : row.avgDaysLate > 30 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${(row.pendingDecrees / maxPending) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Indice di bypass democratico</h2>
          <p className="mt-1 text-sm text-slate-500">
            Confronto tra la legislatura in corso e la media storica 2013–2022 (dataset simulato, scala 0–100).
          </p>
          <dl className="mt-6 space-y-4">
            <Meter
              label="Questione di fiducia"
              current={`${BYPASS_INDEX.fiduciaShare}% dei DL in conversione`}
              historic={`Media storica ${BYPASS_INDEX.historicalFiducia}%`}
              pct={BYPASS_INDEX.fiduciaShare}
              historicPct={BYPASS_INDEX.historicalFiducia}
            />
            <Meter
              label="Ore di dibattito d'aula"
              current={`${BYPASS_INDEX.aulaHoursCurrent} h / provvedimento`}
              historic={`Media storica ${BYPASS_INDEX.aulaHoursHistorical} h`}
              pct={(BYPASS_INDEX.aulaHoursCurrent / 20) * 100}
              historicPct={(BYPASS_INDEX.aulaHoursHistorical / 20) * 100}
              invert
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-slate-900">Radar norme omnibus</h2>
          <p className="mt-1 text-sm text-slate-500">Punteggio di estraneità di materia per cluster tematico.</p>
          <div className="mt-4 flex justify-center">
            <svg viewBox="0 0 200 200" className="h-56 w-56 text-slate-300">
              <circle cx="100" cy="100" r="80" fill="#f8fafc" stroke="#e2e8f0" />
              <circle cx="100" cy="100" r="53" fill="none" stroke="#e2e8f0" />
              <circle cx="100" cy="100" r="26" fill="none" stroke="#e2e8f0" />
              {axes.map((a) => (
                <line key={a.label} x1="100" y1="100" x2={a.x} y2={a.y} stroke="#e2e8f0" />
              ))}
              <polygon points={points} fill="rgba(29,78,216,0.18)" stroke="#1d4ed8" strokeWidth="1.5" />
            </svg>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {OMNIBUS_RADAR.map((item) => (
              <li key={item.label} className="flex justify-between">
                <span>{item.label}</span>
                <span className="font-mono">{item.score}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-serif text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Meter({
  label,
  current,
  historic,
  pct,
  historicPct,
  invert = false,
}: {
  label: string;
  current: string;
  historic: string;
  pct: number;
  historicPct: number;
  invert?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm font-semibold text-slate-800">{label}</dt>
      <dd className="mt-1 text-xs text-slate-500">
        {current} · {historic}
      </dd>
      <div className="relative mt-2 h-2 rounded-full bg-slate-100">
        <div
          className={`absolute h-2 rounded-full ${invert ? 'bg-amber-400' : 'bg-blue-700'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-slate-400"
          style={{ left: `${Math.min(historicPct, 100)}%` }}
          title="Media storica"
        />
      </div>
    </div>
  );
}
