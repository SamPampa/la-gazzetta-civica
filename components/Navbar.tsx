'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const LINKS = [
  { href: '/', label: 'Motore di Risposta' },
  { href: '/atti', label: 'Archivio Atti' },
  { href: '/osservatorio', label: 'Osservatorio' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <span className="text-2xl" aria-hidden>
            🏛️
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-[15px] font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">
              LA GAZZETTA CIVICA
            </span>
            <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
              Osservatorio Atti & Trasparenza
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 transition-colors ${
                isActive(link.href)
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/trasparenza"
            className={`ml-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive('/trasparenza')
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
            }`}
          >
            Metodologia & Fonti
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-lg border border-slate-200 p-2 text-slate-700 md:hidden"
          aria-expanded={open}
          aria-label="Apri menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 ${
                  isActive(link.href) ? 'bg-slate-900 text-white' : 'text-slate-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/trasparenza"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Metodologia & Fonti
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
