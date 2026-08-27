const SOURCES = [
  { href: 'https://dati.camera.it/sparql', label: 'Camera dei Deputati LOD SPARQL' },
  { href: 'https://www.senato.it/istituzione/open-data', label: 'Senato della Repubblica' },
  { href: 'https://www.normattiva.it/', label: 'Normattiva' },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5 text-sm text-slate-700">
          <span
            className="pipeline-dot inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]"
            aria-hidden
          />
          <span className="font-medium">Dati Ufficiali Connessi</span>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
          {SOURCES.map((source) => (
            <a
              key={source.href}
              href={source.href}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-300 underline-offset-4 hover:text-slate-900 hover:decoration-slate-500"
            >
              {source.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
