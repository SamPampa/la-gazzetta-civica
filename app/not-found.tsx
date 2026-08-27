import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">404</p>
      <h1 className="mt-2 font-serif text-3xl font-bold text-slate-900">Atto o pagina non trovati</h1>
      <p className="mt-3 text-sm text-slate-600">
        L&apos;identificativo non è presente nel corpus. Torna all&apos;archivio o al motore di risposta.
      </p>
      <div className="mt-6 flex justify-center gap-3 text-sm">
        <Link href="/" className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
          Motore di risposta
        </Link>
        <Link href="/atti" className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700">
          Archivio
        </Link>
      </div>
    </main>
  );
}
