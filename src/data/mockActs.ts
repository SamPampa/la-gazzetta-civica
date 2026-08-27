export type IterStatus =
  | 'in_commissione'
  | 'in_aula'
  | 'navetta_senato'
  | 'promulgata';

export type Iniziativa = 'governo' | 'parlamentare' | 'popolare';
export type Materia = 'trasporti' | 'fisco' | 'sanita' | 'giustizia' | 'lavoro';
export type Copertura = 'invarianza' | 'a_debito' | 'tagli_spesa';
export type StepStatus = 'done' | 'current' | 'pending';

export type IterStep = {
  id: string;
  label: string;
  status: StepStatus;
};

export type Citation = {
  id: number;
  source: string;
  excerpt: string;
};

export type VoteShare = {
  party: string;
  color: string;
  favorevoli: number;
  contrari: number;
  astenuti: number;
};

export type CitizenPoint = {
  text: string;
  citationIds: number[];
};

export type DeepChapter = {
  title: string;
  body: string;
};

export type LegalDiff = {
  article: string;
  oldText: string;
  newText: string;
};

export type Act = {
  id: string;
  code: string;
  title: string;
  summary: string;
  date: string;
  iniziativa: Iniziativa;
  materia: Materia;
  copertura: Copertura;
  iterStatus: IterStatus;
  iterSteps: IterStep[];
  decreesMissing: number;
  decreeDeadline: string | null;
  financialNote: string;
  amendmentsApproved: number;
  closedDoorNote: string;
  omnibusRisk: { article: string; description: string } | null;
  lobbyCheck: { similarity: number; source: string } | null;
  urgency: number;
  inDiscussionThisWeek: boolean;
  keywords: string[];
  cittadino: CitizenPoint[];
  approfondito: DeepChapter[];
  giurista: LegalDiff[];
  citations: Citation[];
  votes: VoteShare[];
  ministry: string;
  ragLead: string;
};

export const ITER_STEPS_TEMPLATE: Omit<IterStep, 'status'>[] = [
  { id: 'presentazione', label: 'Presentazione' },
  { id: 'commissione', label: 'Commissione' },
  { id: 'aula', label: 'Aula Camera' },
  { id: 'navetta', label: 'Navetta Senato' },
  { id: 'gu', label: 'Gazzetta Ufficiale' },
];

function steps(currentIndex: number, lastDone = false): IterStep[] {
  return ITER_STEPS_TEMPLATE.map((step, i) => {
    if (lastDone) return { ...step, status: 'done' as const };
    if (i < currentIndex) return { ...step, status: 'done' as const };
    if (i === currentIndex) return { ...step, status: 'current' as const };
    return { ...step, status: 'pending' as const };
  });
}

const VOTES_CAMERA: VoteShare[] = [
  { party: 'FdI', color: '#1d4ed8', favorevoli: 118, contrari: 2, astenuti: 0 },
  { party: 'PD', color: '#e11d48', favorevoli: 8, contrari: 62, astenuti: 4 },
  { party: 'M5S', color: '#f59e0b', favorevoli: 3, contrari: 48, astenuti: 1 },
  { party: 'Lega', color: '#16a34a', favorevoli: 61, contrari: 4, astenuti: 1 },
  { party: 'FI', color: '#0ea5e9', favorevoli: 43, contrari: 1, astenuti: 0 },
  { party: 'AVS', color: '#65a30d', favorevoli: 2, contrari: 19, astenuti: 2 },
  { party: 'Azione', color: '#7c3aed', favorevoli: 9, contrari: 2, astenuti: 1 },
];

export const MOCK_ACTS: Act[] = [
  {
    id: 'ddl-1435',
    code: 'DDL AC 1435',
    title: 'Revisione del Codice della Strada e sicurezza stradale',
    summary:
      'Nuove sanzioni per uso di smartphone alla guida, obbligo di contrassegno e RC per i monopattini, revisione dei limiti per i neopatentati.',
    date: '2026-07-14',
    iniziativa: 'governo',
    materia: 'trasporti',
    copertura: 'invarianza',
    iterStatus: 'in_aula',
    iterSteps: steps(2),
    decreesMissing: 2,
    decreeDeadline: '2026-06-30',
    financialNote:
      'Invarianza finanziaria: zero nuovi fondi stanziati. I controlli restano a carico delle risorse ordinarie della Polizia di Stato e delle polizie locali.',
    amendmentsApproved: 14,
    closedDoorNote:
      'Testo modificato in Commissione Trasporti (IX) a porte chiuse prima del trasferimento in Aula: 14 emendamenti approvati, 3 subemendamenti del relatore.',
    omnibusRisk: {
      article: 'Art. 24-bis',
      description:
        'Proroga delle concessioni autostradali: materia semanticamente estranea al Codice della Strada (topic-drift 0,71).',
    },
    lobbyCheck: {
      similarity: 0.88,
      source: 'Memoria ANIASA depositata in audizione, 12 marzo 2026',
    },
    urgency: 92,
    inDiscussionThisWeek: true,
    keywords: [
      'codice della strada',
      'monopattini',
      'patente',
      'smartphone',
      'sicurezza stradale',
      'neopatentati',
    ],
    ministry: 'MIT — Infrastrutture e Trasporti',
    ragLead:
      'Il disegno di legge interviene sul regime sanzionatorio e sulla disciplina dei veicoli di micromobilità, con effetti immediati su patente, assicurazione e controlli urbani.',
    cittadino: [
      {
        text: 'Chi usa lo smartphone alla guida può subire il ritiro breve della patente da 7 a 15 giorni, anche in assenza di incidente.',
        citationIds: [1],
      },
      {
        text: 'Tutti i monopattini elettrici dovranno avere contrassegno identificativo (targa) e copertura assicurativa RC.',
        citationIds: [2],
      },
      {
        text: 'Per alcol e stupefacenti vale un regime di tolleranza zero: basta l’esito positivo del test rapido per le sanzioni accessorie.',
        citationIds: [3],
      },
    ],
    approfondito: [
      {
        title: 'Sanzioni e patente a punti',
        body: 'L’intervento principale riguarda gli artt. 173 e 218 C.d.S. La sospensione breve è costruita come sanzione accessoria automatica quando il punteggio residuo è inferiore a 20. In Commissione è stato introdotto un meccanismo di recidiva a 24 mesi.',
      },
      {
        title: 'Micromobilità',
        body: 'L’art. 8 novella l’art. 75 C.d.S. e allinea i veicoli di mobilità personale al regime europeo di identificazione e RC. Restano da emanare i due decreti MIT su caratteristiche del contrassegno e anagrafe dei veicoli.',
      },
      {
        title: 'Dinamiche di Commissione',
        body: '14 emendamenti approvati, di cui 6 di origine governativa. L’art. 24-bis sulle concessioni autostradali è stato innestato in sede referente senza audizione specifica sul punto.',
      },
    ],
    giurista: [
      {
        article: 'Art. 8 — modifiche all’art. 75 C.d.S.',
        oldText:
          'I veicoli di mobilità personale a propulsione prevalentemente elettrica sono esentati dall’obbligo di immatricolazione e di copertura assicurativa obbligatoria, salva diversa disposizione comunale.',
        newText:
          'Tutti i veicoli di mobilità personale a propulsione prevalentemente elettrica devono essere dotati di contrassegno identificativo e di copertura per la responsabilità civile verso terzi, secondo i criteri fissati con decreto del Ministro delle infrastrutture.',
      },
      {
        article: 'Art. 4, comma 2 — sanzione accessoria',
        oldText:
          'L’uso di apparecchi radiotelefonici durante la marcia è punito con sanzione amministrativa pecuniaria, senza sospensione automatica della patente.',
        newText:
          'Dispone la sanzione accessoria del ritiro breve della patente da 7 a 15 giorni qualora il conducente risulti in possesso di punteggio inferiore a venti punti.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Dossier Servizio Studi Camera n. 142, pag. 12 (Art. 4, comma 2)',
        excerpt:
          '«…dispone la sanzione accessoria del ritiro breve della patente da 7 a 15 giorni qualora il conducente risulti in possesso di punteggio inferiore a venti punti.»',
      },
      {
        id: 2,
        source: 'Testo DDL AC 1435, Art. 8 (modifiche art. 75 C.d.S.)',
        excerpt:
          '«…tutti i veicoli di mobilità personale a propulsione prevalentemente elettrica devono essere dotati di contrassegno identificativo e copertura per la responsabilità civile verso terzi.»',
      },
      {
        id: 3,
        source: 'Relazione tecnica MEF, allegato 3, pag. 4',
        excerpt:
          '«Le disposizioni in materia di alcol e sostanze stupefacenti non comportano nuovi o maggiori oneri a carico della finanza pubblica.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
  {
    id: 'dl-113-2026',
    code: 'DL 113/2026',
    title: 'Misure urgenti in materia fiscale ed economica',
    summary:
      'Proroghe fiscali, rifinanziamento degli ammortizzatori sociali e sostegno alle imprese energivore in sede di conversione.',
    date: '2026-08-04',
    iniziativa: 'governo',
    materia: 'fisco',
    copertura: 'a_debito',
    iterStatus: 'in_commissione',
    iterSteps: steps(1),
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Copertura a debito per 1,2 miliardi di euro nel 2026, tramite maggiore emissione di titoli di Stato (art. 17, comma 1).',
    amendmentsApproved: 31,
    closedDoorNote:
      'In V Commissione (Bilancio) sono stati approvati 31 emendamenti; 9 riguardano materie non fiscali inserite in conversione.',
    omnibusRisk: {
      article: 'Art. 9',
      description:
        'Norma su commissari straordinari di enti locali, estranea alla materia fiscale dichiarata nel preambolo.',
    },
    lobbyCheck: null,
    urgency: 88,
    inDiscussionThisWeek: true,
    keywords: ['fisco', 'proroghe', 'ammortizzatori', 'energivore', 'decreto legge'],
    ministry: 'MEF — Economia e Finanze',
    ragLead:
      'Il decreto-legge in conversione combina proroghe tributarie e nuovi oneri di bilancio, con copertura prevalentemente in disavanzo.',
    cittadino: [
      {
        text: 'Slittano al 16 dicembre 2026 alcuni versamenti IVA e IRAP per le partite IVA sotto soglia.',
        citationIds: [1],
      },
      {
        text: 'Viene rifinanziato per 420 milioni lo strumento di integrazione salariale in deroga.',
        citationIds: [2],
      },
      {
        text: 'Le imprese energivore ottengono un credito d’imposta parametrato al costo dell’energia nel II trimestre 2026.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Architettura della copertura',
        body: 'L’art. 17 indica maggiore indebitamento netto. La Ragioneria ha certificato l’assenza di clausole di salvaguardia automatiche oltre il 2026.',
      },
      {
        title: 'Conversione e maxi-emendamento',
        body: 'Il Governo ha preannunciato questione di fiducia sul testo della Commissione. Il tempo di dibattito d’aula stimato è inferiore alla mediana dei DL di conversione 2018-2025.',
      },
    ],
    giurista: [
      {
        article: 'Art. 3, comma 1 — proroghe versamenti',
        oldText:
          'I versamenti IVA periodici scadono il 16 del mese successivo, senza differenziazione per classe di volume d’affari.',
        newText:
          'Per i soggetti con volume d’affari non superiore a 170.000 euro, i versamenti IVA e IRAP relativi al terzo trimestre 2026 sono differiti al 16 dicembre 2026, senza applicazione di interessi.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Testo DL 113/2026, Art. 3, comma 1',
        excerpt:
          '«Per i soggetti con volume d’affari non superiore a 170.000 euro i versamenti IVA e IRAP relativi al terzo trimestre 2026 sono differiti al 16 dicembre 2026.»',
      },
      {
        id: 2,
        source: 'Relazione tecnica MEF, tab. 2 — oneri 2026',
        excerpt:
          '«L’autorizzazione di spesa di cui all’articolo 5 è incrementata di 420 milioni di euro per l’anno 2026.»',
      },
    ],
    votes: VOTES_CAMERA.map((v) => ({
      ...v,
      favorevoli: Math.round(v.favorevoli * 0.9),
      contrari: Math.round(v.contrari * 1.1),
    })),
  },
  {
    id: 'ac-1988',
    code: 'DDL AC 1988',
    title: 'Rimodulazione degli incentivi Superbonus e riqualificazione edilizia',
    summary:
      'Chiusura progressiva delle aliquote residue, tetti di spesa e trasferimento delle detrazioni non utilizzate.',
    date: '2026-06-22',
    iniziativa: 'parlamentare',
    materia: 'fisco',
    copertura: 'tagli_spesa',
    iterStatus: 'navetta_senato',
    iterSteps: steps(3),
    decreesMissing: 1,
    decreeDeadline: '2026-08-01',
    financialNote:
      'Tagli di spesa stimati in 3,4 miliardi nel triennio, tramite riduzione delle aliquote residue e tetto massimo di detrazione.',
    amendmentsApproved: 22,
    closedDoorNote:
      'In sede referente la Commissione Finanze ha approvato 22 emendamenti, 4 dei quali in seduta notturna non trasmessa in streaming.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.91,
      source: 'Position paper ANCE, audizione 4 maggio 2026',
    },
    urgency: 76,
    inDiscussionThisWeek: true,
    keywords: ['superbonus', 'detrazioni', 'edilizia', '110', 'riqualificazione'],
    ministry: 'MEF — Economia e Finanze',
    ragLead:
      'Il testo chiude il ciclo Superbonus riducendo aliquote e imponendo tetti, con un decreto attuativo MEF ancora mancante sui criteri di trasferimento delle detrazioni.',
    cittadino: [
      {
        text: 'Le aliquote residue scendono e viene introdotto un tetto massimo di detrazione per unità immobiliare.',
        citationIds: [1],
      },
      {
        text: 'Le detrazioni non utilizzate possono essere cedute solo a intermediari vigilati, non più a privati.',
        citationIds: [2],
      },
      {
        text: 'I cantieri già iniziati con CILAS restano salvaguardati alle condizioni previgenti fino al 31 dicembre 2026.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Salvaguardia dei cantieri aperti',
        body: 'La disciplina transitoria copre i lavori con CILAS presentata entro il 31 marzo 2026. Restano escluse le varianti sostanziali successive a quella data.',
      },
      {
        title: 'Impatto di bilancio',
        body: 'Il taglio è contabilizzato come minore spesa fiscale. Bankitalia, in audizione, ha evidenziato il rischio di contenzioso sui cantieri ibridi.',
      },
    ],
    giurista: [
      {
        article: 'Art. 1, comma 2 — aliquote',
        oldText:
          'Per le spese sostenute dal 2024 l’aliquota della detrazione è pari al 70 per cento, ridotta al 65 per cento per l’anno 2025.',
        newText:
          'Per le spese sostenute dal 1° gennaio 2027 l’aliquota è pari al 50 per cento, nel limite complessivo di 96.000 euro per unità immobiliare.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Dossier Servizio Bilancio Senato n. 88, pag. 6',
        excerpt:
          '«L’aliquota è ridotta al 50 per cento nel limite complessivo di 96.000 euro per unità immobiliare.»',
      },
      {
        id: 2,
        source: 'Testo approvato Camera, Art. 2, comma 4',
        excerpt:
          '«La cessione del credito corrispondente alla detrazione è consentita esclusivamente a favore di banche e intermediari finanziari iscritti all’albo.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
  {
    id: 'ac-2102',
    code: 'DDL AC 2102',
    title: 'Riduzione dei tempi di attesa nel Servizio sanitario nazionale',
    summary:
      'Obblighi di pubblicazione delle agende, tetti al ricorso al privato accreditato e sanzioni per le regioni inadempienti.',
    date: '2026-08-11',
    iniziativa: 'governo',
    materia: 'sanita',
    copertura: 'a_debito',
    iterStatus: 'in_commissione',
    iterSteps: steps(1),
    decreesMissing: 3,
    decreeDeadline: '2026-05-15',
    financialNote:
      'Stanziamento aggiuntivo di 780 milioni nel 2026, in disavanzo, vincolato al rispetto dei tetti di spesa per il privato accreditato.',
    amendmentsApproved: 8,
    closedDoorNote:
      'Ufficio di presidenza della XII Commissione ha selezionato 8 emendamenti segnalati; il resto è stato dichiarato inammissibile per estraneità.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.86,
      source: 'Memoria AIOP, audizione 21 luglio 2026',
    },
    urgency: 95,
    inDiscussionThisWeek: true,
    keywords: ['sanità', 'liste di attesa', 'ssn', 'prenotazioni', 'cup'],
    ministry: 'Ministero della Salute',
    ragLead:
      'Il provvedimento impone trasparenza delle agende CUP e collega i fondi aggiuntivi a obiettivi di smaltimento delle liste d’attesa.',
    cittadino: [
      {
        text: 'Le agende di prenotazione di visite e esami devono essere visibili in tempo reale sul CUP regionale.',
        citationIds: [1],
      },
      {
        text: 'Se i tempi massimi sono superati, la prestazione può essere erogata in struttura privata con onere a carico del SSR.',
        citationIds: [2],
      },
      {
        text: 'Le regioni inadempienti per due trimestri consecutivi perdono una quota del fondo aggiuntivo.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Governance delle agende',
        body: 'Si istituisce un’anagrafe nazionale delle prestazioni, interoperabile con i CUP. Mancano tre decreti: tracciati XML, sanzioni e riparto del fondo.',
      },
      {
        title: 'Rapporto pubblico-privato',
        body: 'Il tetto al ricorso al privato accreditato è modulato per branca. In audizione AIOP ha chiesto deroga per la diagnostica per immagini: similarità testuale 86% con l’emendamento 4.12 poi ritirato.',
      },
    ],
    giurista: [
      {
        article: 'Art. 2, comma 3 — agende CUP',
        oldText:
          'Le regioni organizzano i sistemi di prenotazione secondo i propri modelli organizzativi, senza obblighi di pubblicazione in tempo reale.',
        newText:
          'Le regioni assicurano la pubblicazione in tempo reale, sul sistema CUP, di tutte le agende di prima visita e diagnostica, ivi comprese quelle del privato accreditato.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Testo DDL AC 2102, Art. 2, comma 3',
        excerpt:
          '«Le regioni assicurano la pubblicazione in tempo reale, sul sistema CUP, di tutte le agende di prima visita e diagnostica.»',
      },
      {
        id: 2,
        source: 'Dossier ISS / Servizio Studi, pag. 9',
        excerpt:
          '«Superati i tempi massimi, la prestazione è erogata presso strutture private con onere a carico del servizio sanitario regionale.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
  {
    id: 'l-18-2026',
    code: 'L. 18/2026',
    title: 'Modifiche al processo civile e all’ufficio per il processo',
    summary:
      'Legge già promulgata: digitalizzazione delle notifiche, termini di udienza e stabilizzazione parziale dell’ufficio per il processo.',
    date: '2026-03-18',
    iniziativa: 'governo',
    materia: 'giustizia',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    iterSteps: steps(4, true),
    decreesMissing: 4,
    decreeDeadline: '2026-04-30',
    financialNote:
      'Invarianza finanziaria dichiarata. I costi dell’ufficio per il processo sono coperti da residui del PNRR già autorizzati.',
    amendmentsApproved: 19,
    closedDoorNote:
      'In Commissione Giustizia 19 emendamenti approvati in sede referente; 2 articoli aggiuntivi in serata, senza resoconto stenografico integrale.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 40,
    inDiscussionThisWeek: false,
    keywords: ['giustizia', 'processo civile', 'notifiche', 'pnrr'],
    ministry: 'Ministero della Giustizia',
    ragLead:
      'La legge è in vigore ma quattro decreti attuativi sul processo telematico risultano scaduti, con ritardo medio superiore a 100 giorni.',
    cittadino: [
      {
        text: 'Le notifiche civili possono avvenire via PEC e domicilio digitale senza stampa cartacea, salvo eccezioni di legge.',
        citationIds: [1],
      },
      {
        text: 'I termini di udienza per le cause semplici sono compressi, con calendario vincolante per il giudice.',
        citationIds: [2],
      },
      {
        text: 'L’ufficio per il processo è parzialmente stabilizzato: i contratti PNRR non scadono tutti insieme a fine 2026.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Decreti mancanti',
        body: 'Mancano i decreti su: specifiche tecniche del fascicolo, interoperabilità con le cancellerie, formazione obbligatoria, tabelle organiche. Senza di essi le norme su calendario udienza restano inattuate.',
      },
    ],
    giurista: [
      {
        article: 'Art. 3 — notifiche',
        oldText:
          'La notificazione si esegue a mezzo ufficiale giudiziario o servizio postale, secondo le forme degli articoli 137 e seguenti c.p.c.',
        newText:
          'La notificazione si esegue, di regola, mediante domicilio digitale risultante dai pubblici elenchi, con avviso di avvenuta consegna avente valore di ricevuta.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'L. 18/2026, Art. 3, comma 1, in G.U. n. 72',
        excerpt:
          '«La notificazione si esegue, di regola, mediante domicilio digitale risultante dai pubblici elenchi.»',
      },
      {
        id: 2,
        source: 'Relazione illustrativa, pag. 11',
        excerpt:
          '«Il giudice fissa il calendario delle udienze in modo da definire il giudizio entro i termini previsti dall’articolo 81-bis disp. att. c.p.c., come modificato.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
  {
    id: 'ac-1760',
    code: 'DDL AC 1760',
    title: 'Disciplina dei contratti di lavoro a termine e della somministrazione',
    summary:
      'Revisione delle causali, tetti percentuali in organico e inasprimento delle sanzioni per uso elusivo.',
    date: '2026-07-28',
    iniziativa: 'parlamentare',
    materia: 'lavoro',
    copertura: 'tagli_spesa',
    iterStatus: 'in_aula',
    iterSteps: steps(2),
    decreesMissing: 1,
    decreeDeadline: '2026-08-20',
    financialNote:
      'Tagli di spesa da minore ricorso agli ammortizzatori connessi alla somministrazione irregolare; stima 180 milioni nel biennio.',
    amendmentsApproved: 11,
    closedDoorNote:
      'Commissione Lavoro: 11 emendamenti approvati, 5 di origine sindacale riformulati dal relatore in seduta riservata.',
    omnibusRisk: {
      article: 'Art. 7',
      description:
        'Norma su voucher turismo inserita in Aula, con bassa coerenza tematica rispetto alle causali del tempo determinato.',
    },
    lobbyCheck: null,
    urgency: 70,
    inDiscussionThisWeek: true,
    keywords: ['lavoro', 'contratti a termine', 'somministrazione', 'causali'],
    ministry: 'Ministero del Lavoro',
    ragLead:
      'Il testo restringe le causali del tempo determinato e inasprisce le sanzioni, con un decreto MLPS ancora atteso sui criteri di computo dell’organico.',
    cittadino: [
      {
        text: 'I contratti a termine oltre i 12 mesi richiedono causali oggettive più strette, indicate per iscritto.',
        citationIds: [1],
      },
      {
        text: 'Scatta la trasformazione a tempo indeterminato se le causali sono generiche o ripetute in modo elusivo.',
        citationIds: [2],
      },
      {
        text: 'Le agenzie di somministrazione hanno un tetto percentuale sui lavoratori in missione presso lo stesso utilizzatore.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Causali e giurisprudenza',
        body: 'Il testo recepisce orientamenti della Cassazione sulle causali “di comodo”. Resta da chiarire il rapporto con i contratti collettivi nazionali che già definiscono ipotesi specifiche.',
      },
    ],
    giurista: [
      {
        article: 'Art. 1 — d.lgs. 81/2015, art. 19',
        oldText:
          'Il contratto di lavoro a tempo determinato può essere stipulato per una durata non superiore a ventiquattro mesi, comprese le proroghe.',
        newText:
          'Il contratto di lavoro a tempo determinato superiore a dodici mesi è ammesso solo in presenza di esigenze temporanee e oggettive, estranee all’ordinaria attività, indicate in forma scritta a pena di conversione.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Testo DDL AC 1760, Art. 1, comma 1',
        excerpt:
          '«Il contratto a tempo determinato superiore a dodici mesi è ammesso solo in presenza di esigenze temporanee e oggettive, estranee all’ordinaria attività.»',
      },
      {
        id: 2,
        source: 'Dossier INPS / Servizio Studi, pag. 5',
        excerpt:
          '«La violazione delle disposizioni sulle causali comporta la trasformazione del contratto in rapporto a tempo indeterminato dalla data di stipulazione.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
  {
    id: 'ac-pop-44',
    code: 'DDL AC POP 44',
    title: 'Iniziativa popolare per la trasparenza delle concessioni idriche',
    summary:
      'Pubblicazione dei contratti di concessione, tetti tariffari e obbligo di bilancio idrico comunale.',
    date: '2026-05-09',
    iniziativa: 'popolare',
    materia: 'lavoro',
    copertura: 'invarianza',
    iterStatus: 'in_commissione',
    iterSteps: steps(1),
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: obblighi di pubblicazione e di bilancio idrico senza nuovi fondi statali.',
    amendmentsApproved: 0,
    closedDoorNote:
      'Ancora in esame in Commissione Ambiente. Nessun emendamento votato; tre proposte di riformulazione del relatore non ancora calendarizzate.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.87,
      source: 'Memoria Utilitalia, audizione 2 giugno 2026',
    },
    urgency: 55,
    inDiscussionThisWeek: false,
    keywords: ['acqua', 'concessioni', 'tariffe', 'iniziativa popolare'],
    ministry: 'MASE — Ambiente e Sicurezza energetica',
    ragLead:
      'L’iniziativa popolare impone trasparenza sui contratti idrici. Utilitalia ha depositato una memoria con similarità testuale elevata rispetto a una bozza di riformulazione del relatore.',
    cittadino: [
      {
        text: 'I contratti di concessione del servizio idrico devono essere pubblicati integralmente, allegati compresi.',
        citationIds: [1],
      },
      {
        text: 'Ogni comune è tenuto a un bilancio idrico annuale, con perdite di rete e costi tariffari.',
        citationIds: [2],
      },
      {
        text: 'I tetti tariffari sono ancorati a indicatori di qualità e non possono crescere oltre l’inflazione senza delibera motivata.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Iter e quorum',
        body: 'Le firme sono state convalidate. Il calendario in Commissione è slittato due volte. Il relatore ha circolato una riformulazione che attenua l’obbligo di pubblicazione degli allegati tecnici.',
      },
    ],
    giurista: [
      {
        article: 'Art. 2 — pubblicazione concessioni',
        oldText:
          'Gli enti affidanti pubblicano un estratto dei contratti di servizio, secondo le forme del d.lgs. 33/2013.',
        newText:
          'Gli enti affidanti pubblicano il testo integrale dei contratti di concessione e dei relativi allegati tecnici e finanziari, in formato aperto e ricercabile, entro trenta giorni dalla sottoscrizione.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'Testo presentato, Art. 2, comma 1 (iniziativa popolare)',
        excerpt:
          '«Gli enti affidanti pubblicano il testo integrale dei contratti di concessione e dei relativi allegati tecnici e finanziari, in formato aperto e ricercabile.»',
      },
      {
        id: 2,
        source: 'Relazione dei proponenti, pag. 3',
        excerpt:
          '«Ciascun comune approva annualmente un bilancio idrico che dà conto delle perdite di rete, dei volumi fatturati e della composizione tariffaria.»',
      },
    ],
    votes: VOTES_CAMERA.map((v) => ({
      ...v,
      favorevoli: Math.round((v.favorevoli + v.contrari) / 3),
      contrari: Math.round((v.favorevoli + v.contrari) / 4),
      astenuti: 8,
    })),
  },
  {
    id: 'ac-1655',
    code: 'DDL AC 1655',
    title: 'Delega per la riforma delle sanzioni tributarie e del contraddittorio',
    summary:
      'Principi di delega su proporzionalità delle sanzioni, contraddittorio preventivo e digitalizzazione degli avvisi.',
    date: '2026-04-02',
    iniziativa: 'governo',
    materia: 'fisco',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    iterSteps: steps(4, true),
    decreesMissing: 5,
    decreeDeadline: '2026-02-28',
    financialNote:
      'Invarianza finanziaria: la delega non autorizza nuovi oneri; i decreti legislativi dovranno essere a costo zero.',
    amendmentsApproved: 27,
    closedDoorNote:
      '27 principi aggiuntivi inseriti in Commissione Finanze, diversi dei quali in sedute notturne.',
    omnibusRisk: {
      article: 'Art. 4, lett. q)',
      description:
        'Principio di delega su giochi pubblici, distante dalla materia sanzionatoria tributaria dichiarata.',
    },
    lobbyCheck: null,
    urgency: 60,
    inDiscussionThisWeek: false,
    keywords: ['fisco', 'sanzioni', 'delega', 'contraddittorio', 'avvisi'],
    ministry: 'MEF — Economia e Finanze',
    ragLead:
      'La legge di delega è in vigore ma cinque decreti legislativi risultano oltre scadenza, lasciando inattuate proporzionalità e contraddittorio preventivo.',
    cittadino: [
      {
        text: 'Le sanzioni tributarie dovranno essere proporzionate all’entità della violazione, con sconti per chi collabora.',
        citationIds: [1],
      },
      {
        text: 'Prima di un avviso di accertamento l’Agenzia dovrà, di regola, attivare un contraddittorio scritto.',
        citationIds: [2],
      },
      {
        text: 'Fino all’emanazione dei decreti, restano in vigore le sanzioni attuali: la riforma non è ancora operativa.',
        citationIds: [1],
      },
    ],
    approfondito: [
      {
        title: 'Stallo attuativo',
        body: 'Cinque schemi di decreto sono all’esame del Consiglio di Stato. Il ritardo medio supera i 180 giorni rispetto alla scadenza di delega.',
      },
    ],
    giurista: [
      {
        article: 'Art. 1, comma 1, lett. b) — principi di delega',
        oldText:
          'Le sanzioni amministrative tributarie sono applicate secondo le misure fisse previste dal d.lgs. 471/1997, senza obbligo generalizzato di contraddittorio preventivo.',
        newText:
          'I decreti legislativi assicurano la proporzionalità delle sanzioni e il contraddittorio preventivo, salvo i casi di fondato pericolo per la riscossione, da motivare analiticamente.',
      },
    ],
    citations: [
      {
        id: 1,
        source: 'L. 12/2026 (delega), Art. 1, comma 1, lett. b)',
        excerpt:
          '«I decreti legislativi assicurano la proporzionalità delle sanzioni e il contraddittorio preventivo, salvo i casi di fondato pericolo per la riscossione.»',
      },
      {
        id: 2,
        source: 'Parere Consiglio di Stato, sez. consultiva, n. 412/2026',
        excerpt:
          '«Lo schema non definisce con sufficiente determinatezza i casi di deroga al contraddittorio, con rischio di disapplicazione di fatto del principio.»',
      },
    ],
    votes: VOTES_CAMERA,
  },
];

export const TRENDING_TOPICS = [
  { tag: '#CodiceDellaStrada', query: 'Cosa cambia con il nuovo codice della strada per monopattini e patente?' },
  { tag: '#Superbonus', query: 'Come viene rimodulato il Superbonus e chi resta salvaguardato?' },
  { tag: '#Sanità', query: 'Cosa prevede la riforma delle liste di attesa nel SSN?' },
  { tag: '#Fisco', query: 'Quali proroghe fiscali contiene il decreto 113/2026?' },
];

export const MINISTRY_DELAYS = [
  { ministry: 'MEF', pendingDecrees: 8, avgDaysLate: 142, acts: 3 },
  { ministry: 'Salute', pendingDecrees: 5, avgDaysLate: 105, acts: 1 },
  { ministry: 'Giustizia', pendingDecrees: 4, avgDaysLate: 120, acts: 1 },
  { ministry: 'MIT', pendingDecrees: 3, avgDaysLate: 59, acts: 1 },
  { ministry: 'Lavoro', pendingDecrees: 2, avgDaysLate: 8, acts: 1 },
  { ministry: 'MASE', pendingDecrees: 1, avgDaysLate: 0, acts: 1 },
];

export const BYPASS_INDEX = {
  fiduciaShare: 38,
  historicalFiducia: 24,
  aulaHoursCurrent: 6.5,
  aulaHoursHistorical: 14.2,
};

export const OMNIBUS_RADAR = [
  { label: 'Fisco / enti locali', score: 78 },
  { label: 'Trasporti / concessioni', score: 71 },
  { label: 'Lavoro / voucher', score: 54 },
  { label: 'Delega tributaria / giochi', score: 49 },
  { label: 'Sanità', score: 12 },
];

export function getActById(id: string): Act | undefined {
  return MOCK_ACTS.find((act) => act.id === id);
}

export function daysLate(deadline: string | null): number {
  if (!deadline) return 0;
  const [y, m, d] = deadline.split('-').map(Number);
  const end = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - end) / 86_400_000));
}

const SEARCH_STOPWORDS = new Set([
  'cosa',
  'come',
  'quali',
  'quale',
  'quando',
  'dove',
  'perche',
  'perché',
  'con',
  'per',
  'del',
  'della',
  'delle',
  'dei',
  'degli',
  'che',
  'una',
  'uno',
  'nel',
  'nella',
  'nelle',
  'nei',
  'cambia',
  'cambiano',
  'nuovo',
  'nuova',
  'nuove',
  'prevede',
  'riforma',
  'misure',
  'viene',
  'vengono',
  'tutti',
  'tutte',
  'anche',
  'solo',
  'sulla',
  'sul',
  'sugli',
]);

export function searchActs(query: string): Act[] {
  const q = query.toLowerCase().trim().replace(/#/g, '');
  if (!q) return [];
  const tokens = q
    .split(/[^a-zàèéìòù0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 3 && !SEARCH_STOPWORDS.has(t));

  const scored = MOCK_ACTS.map((act) => {
    const hay = [act.title, act.summary, act.code, act.ragLead, ...act.keywords]
      .join(' ')
      .toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (act.keywords.some((k) => k.includes(token) || token.includes(k))) score += 8;
      if (act.title.toLowerCase().includes(token)) score += 4;
      if (hay.includes(token)) score += 1;
    }
    return { act, score };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || b.act.urgency - a.act.urgency);
  return scored.map((row) => row.act);
}
