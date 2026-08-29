import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Metodologia, Algoritmi e Fonti Primarie',
  description:
    'Fonti aperte, formule degli algoritmi di audit e vincoli di neutralità della Gazzetta Civica: zero opinione politica, evidenza verbatim, riproducibilità.',
};

const REPOSITORY_URL = 'https://github.com/SamPampa/la-gazzetta-civica';
const PIPELINE_VERSION = 'v1.1';

const SOURCES = [
  {
    kicker: 'Camera dei Deputati',
    title: 'SPARQL Linked Open Data',
    endpoint: 'dati.camera.it/sparql',
    href: 'https://dati.camera.it/sparql',
    script: 'scripts/ingest_parliament.ts',
    body: 'Query SPARQL sull’ontologia ocd: (legislature XVIII e XIX, finestra 2021–2026). Materializza identità dell’atto, iniziativa, fase dell’iter e — solo se esiste uno scrutinio finale a verbale — i totali reali di favorevoli, contrari e astenuti. Il testo normativo articolo per articolo non vive su questo endpoint: resta in attesa di Normattiva.',
  },
  {
    kicker: 'Senato della Repubblica',
    title: 'Open Data SPARQL e votazioni d’Aula',
    endpoint: 'dati.senato.it/sparql',
    href: 'https://dati.senato.it/sparql',
    script: 'scripts/ingest_senato.ts',
    body: 'Endpoint SPARQL sull’ontologia osr: (Ontologia Senato Repubblica). Recupera i disegni di legge AS, lo stato dell’iter e, tramite osr:Votazione, gli esiti di scrutinio quando l’atto risulta approvato. Stesso vincolo di onestà della Camera: metadati e voti sì, testo integrale degli articoli no.',
  },
  {
    kicker: 'Normattiva / Gazzetta Ufficiale',
    title: 'API OpenData, URN NIR e Akoma Ntoso',
    endpoint: 'api.normattiva.it · uri-res/N2Ls',
    href: 'https://www.normattiva.it/',
    script: 'scripts/ingest_normattiva.ts',
    body: 'REST OpenData (ricerca/semplice, dettaglio-atto) per gli atti promulgati in Gazzetta. Permalink URN (urn:nir:stato:…) e XML Akoma Ntoso via caricaAKN per il testo vigente. Ogni novella (sostituzione, abrogazione, integrazione) è estratta da citazioni reali nel testo, mai inventata.',
  },
  {
    kicker: 'Dipartimento per il Programma di Governo',
    title: 'Monitoraggio decreti attuativi (DAGL)',
    endpoint: 'programmagoverno.gov.it',
    href: 'https://www.programmagoverno.gov.it/it/ricerca-provvedimenti/',
    script: 'scripts/ingest_dagl.ts',
    body: 'Il motore di ricerca dei provvedimenti attuativi non espone SPARQL né API. I numeri previsti/adottati sono trascritti dalle relazioni trimestrali ufficiali sul monitoraggio; per gli atti non nominati nel report si applica un’euristica dichiarata (invarianza = autoesecutiva; copertura finanziaria = almeno un decreto in attesa), mai presentata come cifra DAGL verificata.',
  },
] as const;

export default function TrasparenzaPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-10">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
          Accountability &amp; Trasparenza Metodologica
        </p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">
          Metodologia, Algoritmi e Fonti Primarie
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
          La Gazzetta Civica non produce opinioni politiche. Ogni indicatore deriva da testi
          verbatim, metadati parlamentari e formule deterministiche pubblicate in questa pagina.
          Zero giudizio di merito, evidenza citabile, algoritmi riproducibili a parità di input.
        </p>
      </header>

      <section aria-labelledby="fonti-heading" className="space-y-4">
        <div>
          <h2 id="fonti-heading" className="font-serif text-xl font-semibold text-slate-900">
            Fonti ufficiali e pipeline di ingestione
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Quattro connettori isolati scrivono su PostgreSQL (Supabase) via Prisma. Subito dopo
            il persist, <span className="font-mono text-xs">lib/services/audit_enrichment.ts</span>{' '}
            calcola lobby, omnibus e bypass e li salva sui campi JSON dell’atto. Se il database
            non è raggiungibile, archivio e osservatorio ricadono sul corpus locale di
            dimostrazione. Un identificativo assente dal catalogo produce un 404 reale, mai una
            legge inventata a runtime.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOURCES.map((source) => (
            <article
              key={source.href}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {source.kicker}
              </p>
              <h3 className="mt-1 font-serif text-lg font-semibold text-slate-900">{source.title}</h3>
              <p className="mt-1 font-mono text-[11px] text-slate-500">{source.endpoint}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{source.body}</p>
              <p className="mt-3 font-mono text-[11px] text-slate-400">{source.script}</p>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-fit items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
              >
                Apri il portale ufficiale ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="algoritmi-heading" className="space-y-4">
        <div>
          <h2 id="algoritmi-heading" className="font-serif text-xl font-semibold text-slate-900">
            Modelli matematici e criteri algoritmici
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Quattro audit locali, senza rete e senza modello linguistico, eseguiti in ingestione
            (Camera, Senato, Normattiva, seed e backfill{' '}
            <span className="font-mono text-xs">npm run db:enrich:audits</span>
            ), non a ogni richiesta HTTP. Un punteggio alto è un segnale strutturale, non un
            illecito e non un giudizio sul contenuto politico dell’atto.
          </p>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-slate-900">
            <span aria-hidden>🔍 </span>Lobby Check (similarità testuale)
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Confronta il testo approvato di ciascun articolo con le memorie depositate in audizione
            (<span className="font-mono text-xs">lib/services/lobby_matcher.ts</span>). Normalizzazione
            Unicode, minuscole, rimozione di punteggiatura. Combinazione 60 / 40 di due metriche
            complementari: l’indice di Jaccard sugli n-grammi (caratteri e parole, n = 3) resiste
            alla parafrasi leggera; l’LCS sui token, normalizzato Dice, cattura formulazioni
            legislative copiate anche se avvolte da prosa di inquadramento.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
            {`J(A,B)     = |n-gram(A) ∩ n-gram(B)| / |n-gram(A) ∪ n-gram(B)|
Dice_LCS   = 2 · LCS(tokens_A, tokens_B) / (|A| + |B|)
similarity = 0.60 · J(A,B) + 0.40 · Dice_LCS
allerta    ⇔ similarity ≥ 0.85`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Soglia civica esplicita: <strong className="text-slate-900">≥ 85%</strong> di
            sovrapposizione tra testo approvato e memoria in audizione. Il badge riporta fonte e
            percentuale; non implica nesso causale né influenza illecita.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-slate-900">
            <span aria-hidden>⚠️ </span>Alert decreti omnibus (topic drift)
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Classificatore lessicale deterministico (
            <span className="font-mono text-xs">lib/services/omnibus_detector.ts</span>
            ). Ogni articolo è confrontato con la materia dichiarata (
            <span className="font-mono text-xs">Act.materia</span>) e con i token informativi del
            preambolo (<span className="font-mono text-xs">Act.preamble</span>) contro la matrice{' '}
            <span className="font-mono text-xs">LEGAL_THEMATIC_DOMAINS</span>. Un punteggio alto
            significa lessico estraneo al soggetto dichiarato — rider strutturale, non giudizio di
            legittimità.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
            {`divergenceScore ∈ [0, 1]
  0.0 = allineato alla materia dichiarata
  1.0 = dominio concorrente del tutto estraneo
alert ⇔ divergenceScore ≥ 0.65   (65%)`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            L’allerta scatta solo se un dominio concorrente supera in modo netto la materia
            dichiarata (almeno 3 occorrenze e tre in più rispetto al dominio dichiarato). Unigrammi
            deboli da soli non bastano. Soglia: <strong className="text-slate-900">0,65</strong>.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-slate-900">
            <span aria-hidden>🏛️ </span>Indice di bypass democratico e questione di fiducia
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Indice procedurale 0–100 da fatti d’Aula verificabili (
            <span className="font-mono text-xs">lib/services/democratic_bypass.ts</span>
            ): questione di fiducia, contrazione del dibattito rispetto al benchmark orario,
            rapporto emendamenti ghigliottinati / presentati, urgenza dichiarata. Non misura il
            merito del provvedimento. Campi mancanti non inventano un bypass.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
            {`score = fiducia + contrazione + ghigliottina + urgenza     ∈ [0, 100]

fiducia      = +40 (una Camera)  |  +50 (Entrambe)
contrazione  = (1 − ore_reali / ore_benchmark) · 30
ghigliottina = (emend. ghigliottinati / presentati) · 20
urgenza      = (urgency / 100) · 10

benchmark:  DL 48 h  ·  DDL 72 h  ·  bilancio 120 h  ·  D.Lgs 24 h
stati:      ordinario < 35  ·  accelerato < 65  ·  bypass_elevato ≥ 65`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            La questione di fiducia è un campo esplicito: senza flag ingestito l’osservatorio non
            inferisce la fiducia dal solo fatto che l’atto sia un decreto-legge.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="font-serif text-lg font-semibold text-slate-900">
            <span aria-hidden>🚦 </span>Semaforo decreti attuativi e ritardi
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Calcolo fattuale a giorni di calendario UTC (
            <span className="font-mono text-xs">calculateDelayDays</span> in{' '}
            <span className="font-mono text-xs">lib/dates.ts</span>, usato identico da schede atto e
            osservatorio). Nessuna stima politica del «ritardo accettabile».
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
            {`se decreeDeadline è null oppure ≥ oggi  →  0
altrimenti  delayDays = round( (oggi_UTC − deadline_UTC) / 86_400_000 )

semaforo (scheda atto):
  decreesMissing = 0          →  adempiuto
  delayDays = 0 e decreti > 0 →  termine ancora aperto
  delayDays > 0               →  termine scaduto`}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            L’osservatorio elenca come critici solo gli atti con decreti ancora dovuti (
            <span className="font-mono text-xs">decreesMissing &gt; 0</span>) e termine già scaduto.
          </p>
        </article>
      </section>

      <section
        aria-labelledby="runtime-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 id="runtime-heading" className="font-serif text-xl font-semibold text-slate-900">
          Contratto runtime: catalogo, 404 e archivio
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
          <li>
            <strong className="text-slate-900">Nessuna legge sintetica.</strong>{' '}
            <span className="font-mono text-xs">getActById</span> restituisce{' '}
            <span className="font-mono text-xs">null</span> se l’identificativo non è in database
            (o, a database spento, nel corpus di dimostrazione).{' '}
            <span className="font-mono text-xs">/atti/[id]</span> chiama{' '}
            <span className="font-mono text-xs">notFound()</span>.
          </li>
          <li>
            <strong className="text-slate-900">Archivio paginato sul server.</strong>{' '}
            <span className="font-mono text-xs">/atti</span> applica ricerca, filtri e pagina in
            Prisma con selezione leggera (titoli e metadati, senza testi integrali degli articoli).
          </li>
          <li>
            <strong className="text-slate-900">Bypass senza fiducia inventata.</strong> In
            ingestione l’indice usa codice atto e urgenza dichiarata; questione di fiducia, ore
            d’Aula e ghigliottina restano a zero finché non esistono fatti d’Aula persistiti.
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="guardrail-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 id="guardrail-heading" className="font-serif text-xl font-semibold text-slate-900">
          Vincoli di decodifica IA e guardrail di neutralità
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          La sintesi in linguaggio naturale usa Google GenAI (
          <span className="font-mono text-xs">gemini-3.6-flash</span>
          ) sotto istruzione di sistema «Servizio Studi imparziale». Il modello non è una fonte:
          scrive solo prosa su evidenza già verificata.
        </p>
        <ul className="mt-4 space-y-4 text-sm leading-relaxed text-slate-600">
          <li>
            <strong className="text-slate-900">Strettezza verbatim.</strong> Stage 1 recupera
            esclusivamente frammenti già in database (
            <span className="font-mono text-xs">Article.original</span>,{' '}
            <span className="font-mono text-xs">simple</span>,{' '}
            <span className="font-mono text-xs">structured</span>,{' '}
            <span className="font-mono text-xs">NormImpact</span>
            ). Ogni affermazione fattuale in <span className="font-mono text-xs">answer</span> deve
            portare una citazione numerata <span className="font-mono text-xs">[n]</span> a un
            snippet. Stage 2 risolve gli statuti di fondazione citati o implicati via Normattiva;
            se gli estratti non bastano, il modello deve dichiararlo invece di colmare le lacune.
          </li>
          <li>
            <strong className="text-slate-900">Divieto di linguaggio valutativo.</strong> Tono
            tecnico, chiaro, politicamente neutrale. Vietati punteggi di «bontà» partitica,
            cornici morali, fatti, cifre o riferimenti normativi assenti dagli estratti. Tabella
            comparativa e dossier pro/contro sono costruiti da righe Prisma, non dall’LLM.
          </li>
          <li>
            <strong className="text-slate-900">Cache semantica deterministica.</strong> Ogni coppia
            (domanda, atto) è persistita in{' '}
            <span className="font-mono text-xs">prisma.ragQueryCache</span>, chiave{' '}
            <span className="font-mono text-xs">normalizedQuery</span> (
            <span className="font-mono text-xs">trim().toLowerCase()</span>, suffisso{' '}
            <span className="font-mono text-xs">::actId</span> se lo scope è un atto). Una domanda
            identica è servita da Postgres senza ulteriori token Gemini.
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="riproducibilita-heading"
        className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"
      >
        <h2 id="riproducibilita-heading" className="font-serif text-xl font-semibold text-slate-900">
          Versioning, open source e riproducibilità
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-900">Versione della pipeline</dt>
            <dd className="mt-1 font-mono text-slate-700">{PIPELINE_VERSION}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Stack</dt>
            <dd className="mt-1 text-slate-600">Next.js 16 · React 19 · Prisma · PostgreSQL</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-slate-900">Ingestione riproducibile</dt>
            <dd className="mt-1 font-mono text-[12px] leading-relaxed text-slate-700">
              npm run db:ingest:all && npm run db:enrich:audits
              <span className="mt-1 block font-sans text-sm text-slate-600">
                Camera, Senato, Normattiva e DAGL, poi ricalcolo degli audit JSON su ogni atto.
                Lobby, omnibus e bypass sono funzioni pure: stesso input, stesso output.
              </span>
            </dd>
          </div>
        </dl>
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-400"
        >
          Codice sorgente su GitHub ↗
        </a>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Repository pubblico:{' '}
          <span className="font-mono">{REPOSITORY_URL.replace('https://', '')}</span>
        </p>
      </section>
    </main>
  );
}
