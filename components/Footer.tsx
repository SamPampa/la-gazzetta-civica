export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5 text-sm text-slate-700">
          <span
            className="pipeline-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]"
            aria-hidden
          />
          <span className="font-medium">Pipeline Open Data Ufficiale Attiva</span>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-slate-500">
          La Gazzetta Civica — monitoraggio neutrale su fonti aperte: Camera dei Deputati (SPARQL LOD),
          Senato della Repubblica, Normattiva. Nessuna affiliazione istituzionale.
        </p>
      </div>
    </footer>
  );
}
