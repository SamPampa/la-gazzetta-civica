import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'La Gazzetta Civica | Monitoraggio Atti e Trasparenza Legislativa',
  description: 'Atti parlamentari, commi di legge e trasparenza procedurale in chiaro.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
        {/* Header Istituzionale */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-2xl">🏛️</span>
              <div>
                <span className="font-bold text-lg tracking-tight text-white block leading-none">
                  LA GAZZETTA CIVICA
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                  Osservatorio Atti & Trasparenza
                </span>
              </div>
            </Link>

            {/* Menu di Navigazione */}
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-300">
              <Link href="/" className="hover:text-white transition-colors">
                Motore di Ricerca
              </Link>
              <Link href="/atti" className="hover:text-white transition-colors">
                Archivio Atti
              </Link>
              <Link href="/osservatorio" className="hover:text-white transition-colors">
                Osservatorio
              </Link>
              <Link href="/trasparenza" className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-700 transition-colors">
                Metodologia & Fonti
              </Link>
            </nav>
          </div>
        </header>

        {/* Contenuto Dinamico della Pagina */}
        <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <p>La Gazzetta Civica — Dati estratti da fonti aperte ufficiali: Camera dei Deputati, Senato della Repubblica, Normattiva.</p>
        </footer>
      </body>
    </html>
  );
}