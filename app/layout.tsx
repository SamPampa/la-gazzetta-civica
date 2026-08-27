import type { Metadata } from 'next';
import { JetBrains_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import { Footer } from '@/components/Footer';
import { Navbar } from '@/components/Navbar';
import './globals.css';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'La Gazzetta Civica | Osservatorio Atti & Trasparenza',
    template: '%s | La Gazzetta Civica',
  },
  description:
    'Piattaforma neutrale per il monitoraggio civico, la decodifica delle leggi e l’analisi del potere politico in Italia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body
        className={`${sourceSans.variable} ${sourceSerif.variable} ${jetbrains.variable} flex min-h-screen flex-col bg-white text-slate-900 antialiased`}
      >
        <Navbar />
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
