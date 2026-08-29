export type IterStatus =
  | 'in_commissione'
  | 'in_aula'
  | 'navetta_senato'
  | 'promulgata';

export type Iniziativa = 'governo' | 'parlamentare' | 'popolare';
export type Materia = 'codice_strada' | 'fisco' | 'sanita' | 'lavoro' | 'giustizia';
export type Copertura = 'invarianza' | 'a_debito' | 'tagli_spesa';
export type ImpactType = 'sostituzione' | 'abrogazione' | 'integrazione' | 'deroga';

export type NormImpact = {
  modifiedActCode: string;
  targetArticle: string;
  impactType: ImpactType;
  previousRuleSummary: string;
  newEffectSummary: string;
  officialSourceUrl?: string;
};

export type LawArticle = {
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
  impact?: NormImpact;
};

export type Act = {
  id: string;
  code: string;
  formalTitle: string;
  officialTitle: string;
  popularTitle: string;
  summary: string;
  date: string;
  publishedAt: string | null;
  inForceAt: string | null;
  sourceUrl: string;
  sourceLabel: string;
  iniziativa: Iniziativa;
  materia: Materia;
  copertura: Copertura;
  iterStatus: IterStatus;
  decreesMissing: number;
  decreeDeadline: string | null;
  financialNote: string;
  omnibusRisk: { article: string; description: string } | null;
  lobbyCheck: { similarity: number; source: string } | null;
  democraticBypass?: {
    executiveDominanceScore: number;
    statusLevel: 'ordinario' | 'accelerato' | 'bypass_elevato';
    confidenceVotePlaced: boolean;
    summaryDescription: string;
  } | null;
  urgency: number;
  keywords: string[];
  ministry: string;
  preamble: string;
  articles: LawArticle[];
};

export const MOCK_ACTS: Act[] = [
  {
    id: 'legge-105-2026',
    code: 'L. 105/2026',
    formalTitle: 'LEGGE 24 luglio 2026, n. 105',
    officialTitle:
      'Disposizioni in materia di sicurezza stradale e di modifica al decreto legislativo 30 aprile 1992, n. 285.',
    popularTitle: 'Riforma del Codice della Strada',
    summary:
      'Sanzioni per l’uso del telefono alla guida, contrassegno e RC per i monopattini, limiti per i neopatentati.',
    date: '2026-07-24',
    publishedAt: '2026-07-25',
    inForceAt: '2026-08-09',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'codice_strada',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 2,
    decreeDeadline: '2026-06-30',
    financialNote:
      'Clausola di invarianza finanziaria: zero nuovi fondi. I controlli restano a carico delle risorse ordinarie della Polizia di Stato e delle polizie locali.',
    omnibusRisk: {
      article: 'Art. 5',
      description:
        'Proroga delle concessioni autostradali: materia semanticamente estranea al Codice della Strada (topic-drift 0,71).',
    },
    lobbyCheck: {
      similarity: 0.88,
      source: 'Memoria ANIASA depositata in audizione, 12 marzo 2026',
    },
    urgency: 92,
    keywords: [
      'codice della strada',
      'monopattini',
      'patente',
      'smartphone',
      'sicurezza stradale',
      'neopatentati',
    ],
    ministry: 'MIT — Infrastrutture e Trasporti',
    preamble:
      'La Camera dei deputati e il Senato della Repubblica hanno approvato; IL PRESIDENTE DELLA REPUBBLICA Promulga la seguente legge:',
    articles: [
      {
        number: '1',
        heading: 'Finalità e oggetto',
        original:
          '1. La presente legge reca disposizioni volte a rafforzare la sicurezza della circolazione stradale, con particolare riguardo alla prevenzione degli incidenti connessi all’uso di dispositivi di comunicazione durante la guida e alla disciplina dei veicoli di micromobilità.\n2. Per le finalità di cui al comma 1 sono apportate modifiche al decreto legislativo 30 aprile 1992, n. 285, e successive modificazioni, di seguito denominato «codice della strada».',
        structured:
          'L’articolo definisce l’oggetto: sicurezza stradale, contrasto all’uso del telefono alla guida, disciplina della micromobilità. Le modifiche si innestano sul d.lgs. 285/1992 (Codice della strada).',
        simple:
          'Questa legge cambia il Codice della strada. Punti centrali: meno incidenti da smartphone alla guida e regole più chiare per monopattini e mezzi simili.',
      },
      {
        number: '2',
        heading: 'Uso di apparecchi radiotelefonici e sanzione accessoria',
        original:
          '1. All’articolo 173 del codice della strada, dopo il comma 3-bis, è inserito il seguente:\n«3-ter. Qualora il conducente sia colto nell’uso di un apparecchio radiotelefonico, di cuffie o di altri dispositivi di comunicazione non consentiti e risulti in possesso di un punteggio della patente inferiore a venti punti, si applica la sanzione accessoria del ritiro della patente da sette a quindici giorni, secondo le modalità di cui all’articolo 216.»\n2. In caso di recidiva nel biennio, la durata del ritiro è raddoppiata.',
        structured:
          'Novella dell’art. 173 C.d.S.: se si usa il telefono (o cuffie/dispositivi vietati) e i punti patente sono sotto 20, scatta il ritiro breve da 7 a 15 giorni (art. 216). Recidiva nel biennio: durata raddoppiata.',
        simple:
          'Se usi il telefono alla guida e hai meno di 20 punti sulla patente, te la ritirano da 7 a 15 giorni. Se succede di nuovo entro due anni, i giorni raddoppiano.',
        impact: {
          modifiedActCode: 'D.Lgs. 285/1992 (Codice della Strada)',
          targetArticle: 'Art. 173, dopo il comma 3-bis',
          impactType: 'integrazione',
          previousRuleSummary:
            'L’uso del telefono alla guida era già vietato, con sanzione pecuniaria e decurtazione di punti, ma senza ritiro breve automatico legato al punteggio residuo.',
          newEffectSummary:
            'Si aggiunge il comma 3-ter: sotto i 20 punti patente scatta il ritiro da 7 a 15 giorni; in caso di recidiva nel biennio la durata è raddoppiata.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1992-04-30;285',
        },
      },
      {
        number: '3',
        heading: 'Veicoli di mobilità personale',
        original:
          '1. L’articolo 75 del codice della strada è sostituito dal seguente:\n«Art. 75 (Veicoli di mobilità personale). — 1. I veicoli di mobilità personale a propulsione prevalentemente elettrica, ivi compresi i monopattini, devono essere muniti di contrassegno identificativo e di copertura assicurativa per la responsabilità civile verso terzi.\n2. Con decreto del Ministro delle infrastrutture e dei trasporti, da adottare entro sessanta giorni dalla data di entrata in vigore della presente disposizione, di concerto con il Ministro dell’economia e delle finanze, sono definite le caratteristiche del contrassegno e le modalità di iscrizione in apposita anagrafe.»',
        structured:
          'Sostituzione dell’art. 75 C.d.S.: obbligo di contrassegno (targa) e RC per monopattini e analoghi. Due decreti MIT/MEF entro 60 giorni: caratteristiche del contrassegno e anagrafe dei veicoli. Senza i decreti l’obbligo resta inattuato sul piano operativo.',
        simple:
          'Monopattini elettrici: servono una targa (contrassegno) e l’assicurazione RC. I dettagli tecnici arriveranno con due decreti del Ministero delle Infrastrutture: finché non escono, nella pratica manca il “come si fa”.',
        impact: {
          modifiedActCode: 'D.Lgs. 285/1992 (Codice della Strada)',
          targetArticle: 'Art. 75',
          impactType: 'sostituzione',
          previousRuleSummary:
            'L’art. 75 disciplinava i veicoli in genere senza un regime specifico di identificazione e assicurazione per i mezzi di micromobilità elettrica.',
          newEffectSummary:
            'Il testo è integralmente sostituito: monopattini e analoghi devono avere contrassegno identificativo e RC; le modalità operative sono rinviate a decreto MIT/MEF entro 60 giorni.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1992-04-30;285',
        },
      },
      {
        number: '4',
        heading: 'Neopatentati e limiti di velocità',
        original:
          '1. All’articolo 117 del codice della strada, il comma 2-bis è sostituito dal seguente:\n«2-bis. Per i primi tre anni dal conseguimento della patente di categoria B è vietato il superamento della velocità di 90 km/h sulle strade extraurbane principali e di 100 km/h sulle autostrade.»',
        structured:
          'Per i neopatentati B il vincolo passa a tre anni: 90 km/h extraurbane principali, 100 km/h in autostrada.',
        simple:
          'Se hai la patente B da meno di tre anni: massimo 90 km/h fuori città (strade principali) e 100 km/h in autostrada.',
        impact: {
          modifiedActCode: 'D.Lgs. 285/1992 (Codice della Strada)',
          targetArticle: 'Art. 117, comma 2-bis',
          impactType: 'sostituzione',
          previousRuleSummary:
            'I limiti per neopatentati di categoria B valevano per un periodo più breve e con soglie di velocità diverse rispetto al testo novellato.',
          newEffectSummary:
            'Il comma 2-bis è sostituito: per i primi tre anni, massimo 90 km/h sulle extraurbane principali e 100 km/h in autostrada.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1992-04-30;285',
        },
      },
      {
        number: '5',
        heading: 'Disposizioni transitorie in materia di concessioni',
        original:
          '1. In attesa del riordino della disciplina delle concessioni autostradali, i termini di scadenza delle concessioni in essere alla data di entrata in vigore della presente legge, relativi a tratte di interesse nazionale, sono prorogati di ventiquattro mesi.\n2. All’attuazione del presente articolo si provvede nell’ambito delle risorse umane, strumentali e finanziarie disponibili a legislazione vigente, senza nuovi o maggiori oneri per la finanza pubblica.',
        structured:
          'Comma estraneo all’oggetto dichiarato: proroga di 24 mesi delle concessioni autostradali nazionali. Il comma 2 ribadisce l’invarianza finanziaria. Segnalato in apparato critico come rischio omnibus.',
        simple:
          'Questo articolo non parla di patenti o monopattini: allunga di due anni alcune concessioni autostradali. È il pezzo “fuori tema” della legge.',
      },
    ],
  },
  {
    id: 'dl-113-2026',
    code: 'DL 113/2026',
    formalTitle: 'DECRETO-LEGGE 4 agosto 2026, n. 113',
    officialTitle:
      'Misure urgenti in materia fiscale, di ammortizzatori sociali e di sostegno alle imprese energivore.',
    popularTitle: 'Decreto fiscale d’agosto',
    summary:
      'Proroghe IVA/IRAP, rifinanziamento CIG in deroga e credito d’imposta per le imprese energivore, in sede di conversione.',
    date: '2026-08-04',
    publishedAt: '2026-08-04',
    inForceAt: '2026-08-05',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'fisco',
    copertura: 'a_debito',
    iterStatus: 'in_commissione',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Copertura a debito per 1,2 miliardi di euro nel 2026, tramite maggiore emissione di titoli di Stato (art. 4, comma 1).',
    omnibusRisk: {
      article: 'Art. 3',
      description:
        'Norma su commissari straordinari di enti locali, estranea alla materia fiscale dichiarata nel preambolo.',
    },
    lobbyCheck: null,
    urgency: 88,
    keywords: ['fisco', 'proroghe', 'iva', 'irap', 'energivore', 'decreto legge', 'ammortizzatori'],
    ministry: 'MEF — Economia e Finanze',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVisti gli articoli 77 e 87 della Costituzione;\nRitenuta la straordinaria necessità e urgenza di introdurre misure in materia fiscale e di sostegno al tessuto produttivo;\nSulla proposta del Presidente del Consiglio dei ministri e del Ministro dell’economia e delle finanze;\nEmana il seguente decreto-legge:',
    articles: [
      {
        number: '1',
        heading: 'Differimento di versamenti IVA e IRAP',
        original:
          '1. Per i soggetti passivi con volume d’affari non superiore a 170.000 euro, i versamenti dell’imposta sul valore aggiunto e dell’imposta regionale sulle attività produttive relativi al terzo trimestre dell’anno 2026 sono effettuati entro il 16 dicembre 2026, senza applicazione di interessi e sanzioni.\n2. Restano fermi gli obblighi dichiarativi previsti dalla legislazione vigente.',
        structured:
          'Slittamento al 16 dicembre 2026 dei versamenti IVA e IRAP del III trimestre 2026 per chi ha volume d’affari ≤ 170.000 euro. Nessun interesse né sanzione sul differimento. Le dichiarazioni restano alle scadenze ordinarie.',
        simple:
          'Se sei una piccola partita IVA (fino a 170.000 euro di volume d’affari), IVA e IRAP del terzo trimestre 2026 le paghi entro il 16 dicembre, senza extra. Le dichiarazioni però restano alle date di sempre.',
      },
      {
        number: '2',
        heading: 'Integrazione salariale in deroga e credito d’imposta energivori',
        original:
          '1. L’autorizzazione di spesa di cui all’articolo 44, comma 6-bis, del decreto legislativo 14 settembre 2015, n. 148, è incrementata di 420 milioni di euro per l’anno 2026.\n2. Alle imprese a forte consumo di energia elettrica, come definite dal decreto del Ministro dello sviluppo economico 21 dicembre 2017, è riconosciuto, per il secondo trimestre 2026, un credito d’imposta parametrato al costo medio della componente energia, nei limiti e con le modalità stabiliti con decreto del Ministro dell’economia e delle finanze.',
        structured:
          'Comma 1: +420 milioni alla CIG in deroga (rinvio al d.lgs. 148/2015). Comma 2: credito d’imposta energivori sul II trimestre 2026, con decreto MEF sui criteri. Il credito non è autoapplicativo.',
        simple:
          'Arrivano 420 milioni in più per la cassa integrazione in deroga. Le imprese che consumano tanta energia possono avere un credito d’imposta sul caro-bollette del secondo trimestre 2026: i dettagli li scrive il MEF con un decreto.',
        impact: {
          modifiedActCode: 'D.Lgs. 148/2015',
          targetArticle: 'Art. 44, comma 6-bis',
          impactType: 'integrazione',
          previousRuleSummary:
            'L’autorizzazione di spesa per la CIG in deroga era fissata nella misura prevista dal d.lgs. 148/2015, senza l’incremento 2026.',
          newEffectSummary:
            'L’autorizzazione è incrementata di 420 milioni di euro per il 2026; il credito d’imposta energivori resta subordinato a decreto MEF.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-09-14;148',
        },
      },
      {
        number: '3',
        heading: 'Commissioni straordinarie presso gli enti locali',
        original:
          '1. All’articolo 141 del testo unico delle leggi sull’ordinamento degli enti locali, di cui al decreto legislativo 18 agosto 2000, n. 267, dopo il comma 2 è inserito il seguente:\n«2-bis. Il prefetto può disporre, per motivate ragioni di continuità amministrativa, la proroga della commissione straordinaria fino a ulteriori sei mesi, sentita la Conferenza Stato-città ed autonomie locali.»',
        structured:
          'Novella al TUEL (d.lgs. 267/2000): possibile proroga di sei mesi delle commissioni straordinarie comunali. Materia ordinamentale locale, non fiscale: segnalata come omnibus.',
        simple:
          'Questo articolo non riguarda tasse o bonus: allunga fino a sei mesi i commissari straordinari nei comuni. È un pezzo “altro” dentro un decreto fiscale.',
        impact: {
          modifiedActCode: 'D.Lgs. 267/2000 (TUEL)',
          targetArticle: 'Art. 141, dopo il comma 2',
          impactType: 'integrazione',
          previousRuleSummary:
            'Le commissioni straordinarie presso gli enti locali avevano la durata prevista dal TUEL, senza una proroga prefettizia ulteriore di sei mesi.',
          newEffectSummary:
            'Si inserisce il comma 2-bis: il prefetto può prorogare la commissione straordinaria fino a ulteriori sei mesi, sentita la Conferenza Stato-città.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-08-18;267',
        },
      },
      {
        number: '4',
        heading: 'Copertura finanziaria',
        original:
          '1. Agli oneri derivanti dagli articoli 1 e 2, valutati in 1.200 milioni di euro per l’anno 2026, si provvede mediante corrispondente incremento del ricorso al mercato finanziario, ai sensi dell’articolo 3 della legge 12 agosto 1977, n. 506.\n2. Il Ministro dell’economia e delle finanze è autorizzato ad apportare, con propri decreti, le occorrenti variazioni di bilancio.',
        structured:
          'Oneri 1,2 miliardi nel 2026 coperti con maggiore indebitamento (ricorso al mercato). Variazioni di bilancio con decreti MEF.',
        simple:
          'Il decreto costa 1,2 miliardi nel 2026. Non ci sono tagli altrove: si copre facendo più debito pubblico.',
      },
    ],
  },
  {
    id: 'ac-2102',
    code: 'DDL AC 2102',
    formalTitle: 'Disegno di legge A.C. 2102',
    officialTitle:
      'Disposizioni per la riduzione dei tempi di attesa delle prestazioni sanitarie e per la trasparenza delle agende di prenotazione.',
    popularTitle: 'Liste d’attesa nel Servizio sanitario',
    summary:
      'Agende CUP visibili in tempo reale, prestazione in struttura privata se i tempi massimi scattano, vincoli di fondo per le regioni inadempienti.',
    date: '2026-08-11',
    publishedAt: null,
    inForceAt: null,
    sourceUrl: 'https://dati.camera.it/sparql',
    sourceLabel: 'Testo all’esame della Camera — LOD SPARQL',
    iniziativa: 'governo',
    materia: 'sanita',
    copertura: 'a_debito',
    iterStatus: 'in_commissione',
    decreesMissing: 3,
    decreeDeadline: '2026-05-15',
    financialNote:
      'Stanziamento aggiuntivo di 780 milioni nel 2026, in disavanzo, vincolato al rispetto dei tetti di spesa per il privato accreditato.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.86,
      source: 'Memoria AIOP, audizione 21 luglio 2026',
    },
    urgency: 95,
    keywords: ['sanità', 'liste di attesa', 'ssn', 'cup', 'prenotazioni'],
    ministry: 'Ministero della Salute',
    preamble:
      'Onorevoli Deputati! — Il presente disegno di legge è volto a rendere effettivi i tempi massimi di attesa per le prestazioni di specialistica ambulatoriale e di diagnostica, mediante obblighi di pubblicazione delle agende e meccanismi di garanzia per l’assistito.',
    articles: [
      {
        number: '1',
        heading: 'Finalità',
        original:
          '1. La presente legge persegue la finalità di garantire l’erogazione delle prestazioni di assistenza specialistica ambulatoriale e di diagnostica strumentale nel rispetto dei tempi massimi di attesa definiti dalla normativa vigente e dagli accordi Stato-Regioni.\n2. All’attuazione della presente legge le regioni e le province autonome provvedono nell’esercizio delle proprie competenze in materia di tutela della salute.',
        structured:
          'Finalità: rispetto dei tempi massimi già previsti (non se ne inventano di nuovi). Competenza regionale sulla salute resta ferma: lo Stato pone obblighi di risultato e di trasparenza.',
        simple:
          'Lo scopo è far rispettare i tempi massimi già previsti per visite ed esami. Le regioni restano titolari della sanità; lo Stato impone regole di trasparenza e garanzie per il paziente.',
      },
      {
        number: '2',
        heading: 'Trasparenza delle agende di prenotazione',
        original:
          '1. Le regioni assicurano la pubblicazione in tempo reale, sul sistema CUP, di tutte le agende di prima visita e di diagnostica, ivi comprese quelle delle strutture private accreditate.\n2. Con decreto del Ministro della salute, di concerto con il Ministro per la pubblica amministrazione, da adottare entro trenta giorni dalla data di entrata in vigore della presente legge, sono definiti i tracciati informatici e gli standard di interoperabilità.',
        structured:
          'Obbligo di visibilità in tempo reale delle agende CUP, incluso il privato accreditato. Decreto Salute/PA entro 30 giorni sui tracciati XML/interoperabilità: senza di esso il comma 1 è difficilmente azionabile in modo uniforme.',
        simple:
          'Sul CUP regionale devi poter vedere subito tutti gli slot liberi, anche delle cliniche convenzionate. Un decreto del Ministero della Salute deve ancora dire come collegare i sistemi informatici.',
      },
      {
        number: '3',
        heading: 'Garanzia per l’assistito e vincoli di fondo',
        original:
          '1. Decorsi i tempi massimi di attesa senza che la prestazione sia stata erogata, l’assistito ha diritto di ottenere la medesima prestazione presso una struttura privata, con onere a carico del servizio sanitario regionale, secondo i tariffe massime fissate con decreto del Ministro della salute.\n2. Le regioni che, per due trimestri consecutivi, non rispettano gli obiettivi di smaltimento delle liste di attesa decadono, per la quota parte, dall’accesso al fondo di cui all’articolo 4.',
        structured:
          'Meccanismo di garanzia: superati i tempi, prestazione in privato a carico del SSR, con tetto tariffario da decreto. Sanzione finanziaria regionale dopo due trimestri di inadempimento sul fondo art. 4.',
        simple:
          'Se aspetti oltre il tempo massimo, puoi fare visita o esame in una struttura privata e paga il servizio sanitario regionale. Se una regione sbaglia per due trimestri di fila, perde una fetta dei soldi extra del fondo.',
      },
      {
        number: '4',
        heading: 'Fondo per lo smaltimento delle liste di attesa',
        original:
          '1. Nello stato di previsione del Ministero della salute è istituito un fondo, con una dotazione di 780 milioni di euro per l’anno 2026, destinato al concorso dello Stato agli oneri di cui all’articolo 3.\n2. Il riparto del fondo è stabilito con decreto del Ministro della salute, di concerto con il Ministro dell’economia e delle finanze, sentita la Conferenza permanente per i rapporti tra lo Stato, le regioni e le province autonome di Trento e di Bolzano.',
        structured:
          'Fondo 780 milioni/2026. Riparto con decreto Salute/MEF in Conferenza Stato-Regioni: terzo decreto attuativo del pacchetto, oltre a tracciati e tariffe.',
        simple:
          'Lo Stato mette 780 milioni nel 2026 per smaltire le liste. Come si dividono tra le regioni lo decide un altro decreto, d’accordo con il MEF e le regioni.',
      },
    ],
  },
  {
    id: 'ac-1760',
    code: 'DDL AC 1760',
    formalTitle: 'Disegno di legge A.C. 1760',
    officialTitle:
      'Modifiche al decreto legislativo 15 giugno 2015, n. 81, in materia di contratto di lavoro a tempo determinato e di somministrazione.',
    popularTitle: 'Causali dei contratti a termine',
    summary:
      'Causali oggettive oltre i 12 mesi, conversione in indeterminato se elusive, tetti alla somministrazione.',
    date: '2026-07-28',
    publishedAt: null,
    inForceAt: null,
    sourceUrl: 'https://dati.camera.it/sparql',
    sourceLabel: 'Testo all’esame della Camera — LOD SPARQL',
    iniziativa: 'parlamentare',
    materia: 'lavoro',
    copertura: 'tagli_spesa',
    iterStatus: 'in_aula',
    decreesMissing: 1,
    decreeDeadline: '2026-08-20',
    financialNote:
      'Tagli di bilancio stimati in 180 milioni nel biennio, da minore ricorso agli ammortizzatori connessi alla somministrazione irregolare.',
    omnibusRisk: {
      article: 'Art. 3',
      description: 'Norma su voucher turismo inserita in Aula, a bassa coerenza tematica con le causali del tempo determinato.',
    },
    lobbyCheck: null,
    urgency: 70,
    keywords: ['lavoro', 'contratti a termine', 'somministrazione', 'causali'],
    ministry: 'Ministero del Lavoro',
    preamble:
      'Onorevoli Colleghi! — Il provvedimento interviene sull’articolo 19 del decreto legislativo n. 81 del 2015 al fine di circoscrivere l’uso del contratto a termine alle effettive esigenze temporanee.',
    articles: [
      {
        number: '1',
        heading: 'Contratto a tempo determinato',
        original:
          '1. All’articolo 19, comma 1, del decreto legislativo 15 giugno 2015, n. 81, le parole «ventiquattro mesi» sono sostituite dalle seguenti: «dodici mesi, ovvero ventiquattro mesi in presenza di esigenze temporanee e oggettive, estranee all’ordinaria attività, indicate in forma scritta a pena di conversione del rapporto in contratto a tempo indeterminato».',
        structured:
          'Soglia ordinaria a 12 mesi. Oltre, servono causali oggettive scritte, estranee all’attività ordinaria; altrimenti conversione in indeterminato. Rinvio al d.lgs. 81/2015, art. 19.',
        simple:
          'Il contratto a termine “semplice” arriva a 12 mesi. Per andare oltre serve scrivere una ragione vera e temporanea. Se la ragione è finta o manca, il contratto diventa a tempo indeterminato.',
        impact: {
          modifiedActCode: 'D.Lgs. 81/2015',
          targetArticle: 'Art. 19, comma 1',
          impactType: 'sostituzione',
          previousRuleSummary:
            'Il contratto a termine poteva arrivare a ventiquattro mesi senza l’obbligo generale di causali oggettive scritte oltre i dodici mesi.',
          newEffectSummary:
            'Soglia ordinaria a 12 mesi; oltre servono esigenze temporanee e oggettive, estranee all’attività ordinaria, indicate per iscritto, a pena di conversione in indeterminato.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-06-15;81',
        },
      },
      {
        number: '2',
        heading: 'Somministrazione',
        original:
          '1. La somministrazione di lavoro a tempo determinato non può eccedere, presso ciascun utilizzatore, il 20 per cento dei lavoratori a tempo indeterminato in forza. Il Ministro del lavoro e delle politiche sociali, con decreto da adottare entro trenta giorni, definisce i criteri di computo dell’organico.',
        structured:
          'Cap del 20% di somministrati sull’organico indeterminato. Decreto MLPS sul computo: senza di esso il tetto è di difficile applicazione ispettiva.',
        simple:
          'In azienda i somministrati non possono superare il 20% di chi è assunto a tempo indeterminato. Un decreto del Lavoro deve spiegare come si conta l’organico.',
        impact: {
          modifiedActCode: 'D.Lgs. 81/2015',
          targetArticle: 'Art. 31',
          impactType: 'sostituzione',
          previousRuleSummary:
            'Il tetto legale alla somministrazione a termine era del 30% dell’organico a tempo indeterminato, salvo diversa disposizione dei contratti collettivi.',
          newEffectSummary:
            'Il cap scende al 20% dei lavoratori a tempo indeterminato in forza; i criteri di computo sono rinviati a decreto del Ministro del lavoro entro 30 giorni.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-06-15;81',
        },
      },
      {
        number: '3',
        heading: 'Prestazioni occasionali nel settore turistico',
        original:
          '1. In via sperimentale, per l’anno 2027, i datori di lavoro del settore turismo e pubblici esercizi possono ricorrere alle prestazioni di lavoro occasionale di cui all’articolo 54-bis del decreto-legge 24 aprile 2017, n. 50, convertito, con modificazioni, dalla legge 21 giugno 2017, n. 96, nel limite di 15.000 euro per prestatore.',
        structured:
          'Sperimentazione 2027: tetto voucher turismo a 15.000 euro/prestatore. Coerenza tematica bassa rispetto alle causali del tempo determinato.',
        simple:
          'Articolo extra: nel 2027 alberghi e ristoranti potrebbero usare di più i voucher (fino a 15.000 euro a persona). Non c’entra direttamente con le causali dei contratti a termine.',
        impact: {
          modifiedActCode: 'DL 50/2017',
          targetArticle: 'Art. 54-bis',
          impactType: 'deroga',
          previousRuleSummary:
            'Le prestazioni occasionali restano disciplinate dall’art. 54-bis del DL 50/2017, con i limiti ordinari per prestatore e datore.',
          newEffectSummary:
            'In via sperimentale per il 2027, turismo e pubblici esercizi possono ricorrere ai voucher nel limite di 15.000 euro per prestatore.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto-legge:2017-04-24;50',
        },
      },
    ],
  },
  {
    id: 'l-18-2026',
    code: 'L. 18/2026',
    formalTitle: 'LEGGE 18 marzo 2026, n. 18',
    officialTitle:
      'Modifiche al codice di procedura civile in materia di notificazioni e di ufficio per il processo.',
    popularTitle: 'Notifiche digitali e ufficio per il processo',
    summary:
      'Notifica via domicilio digitale come regola; parziale stabilizzazione dell’ufficio per il processo.',
    date: '2026-03-18',
    publishedAt: '2026-03-19',
    inForceAt: '2026-04-03',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'giustizia',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 4,
    decreeDeadline: '2026-04-30',
    financialNote:
      'Invarianza finanziaria dichiarata. I costi dell’ufficio per il processo sono coperti da residui PNRR già autorizzati.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 40,
    keywords: ['giustizia', 'processo civile', 'notifiche', 'pnrr'],
    ministry: 'Ministero della Giustizia',
    preamble:
      'La Camera dei deputati e il Senato della Repubblica hanno approvato; IL PRESIDENTE DELLA REPUBBLICA Promulga la seguente legge:',
    articles: [
      {
        number: '1',
        heading: 'Notificazioni al domicilio digitale',
        original:
          '1. All’articolo 137 del codice di procedura civile, dopo il primo comma è inserito il seguente: «La notificazione si esegue, di regola, mediante invio al domicilio digitale risultante dai pubblici elenchi. L’avviso di avvenuta consegna ha valore di ricevuta.»',
        structured:
          'Regola generale: notifica PEC/domicilio digitale; l’accettazione del sistema vale ricevuta. Deroghe cartacee restano nei casi di legge non novellati qui.',
        simple:
          'Le notifiche civili, di regola, arrivano sulla PEC o sul domicilio digitale, non più per raccomandata. La ricevuta è quella del sistema.',
        impact: {
          modifiedActCode: 'Codice di procedura civile',
          targetArticle: 'Art. 137, dopo il primo comma',
          impactType: 'integrazione',
          previousRuleSummary:
            'La notificazione si eseguiva secondo le forme cartacee e telematiche già previste dal codice, senza una regola generale di domicilio digitale.',
          newEffectSummary:
            'La notifica si esegue di regola al domicilio digitale risultante dai pubblici elenchi; l’avviso di avvenuta consegna vale come ricevuta.',
          officialSourceUrl: 'https://www.normattiva.it/',
        },
      },
      {
        number: '2',
        heading: 'Ufficio per il processo',
        original:
          '1. I contratti di lavoro flessibile conferiti nell’ambito dell’ufficio per il processo, in essere alla data di entrata in vigore della presente legge e finanziati con risorse del Piano nazionale di ripresa e resilienza, possono essere prorogati, nei limiti delle risorse disponibili, fino al 31 dicembre 2027.\n2. Con decreto del Ministro della giustizia sono definite le tabelle organiche e le modalità di formazione obbligatoria.',
        structured:
          'Proroga contrattuale UPP fino al 31/12/2027 a valere su residui PNRR. Due (o più) decreti su organici e formazione: oggi risultano mancanti, con ritardo sulla scadenza di aprile 2026.',
        simple:
          'Chi lavora nell’ufficio per il processo con contratti PNRR può restare fino a fine 2027, se i soldi bastano. Mancano ancora i decreti su organici e corsi obbligatori.',
      },
    ],
  },
  {
    id: 'ac-pop-44',
    code: 'DDL AC POP 44',
    formalTitle: 'Disegno di legge di iniziativa popolare A.C. POP 44',
    officialTitle:
      'Disposizioni per la trasparenza dei contratti di concessione del servizio idrico integrato e per il bilancio idrico comunale.',
    popularTitle: 'Trasparenza delle concessioni idriche',
    summary:
      'Pubblicazione integrale dei contratti di concessione, bilancio idrico annuale, tetti tariffari ancorati all’inflazione.',
    date: '2026-05-09',
    publishedAt: null,
    inForceAt: null,
    sourceUrl: 'https://dati.camera.it/sparql',
    sourceLabel: 'Testo presentato — LOD Camera',
    iniziativa: 'popolare',
    materia: 'lavoro',
    copertura: 'invarianza',
    iterStatus: 'in_commissione',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: obblighi di pubblicazione e di bilancio idrico senza nuovi fondi statali.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.87,
      source: 'Memoria Utilitalia, audizione 2 giugno 2026',
    },
    urgency: 55,
    keywords: ['acqua', 'concessioni', 'tariffe', 'iniziativa popolare'],
    ministry: 'MASE — Ambiente e Sicurezza energetica',
    preamble:
      'I sottoscritti cittadini esercitano l’iniziativa legislativa ai sensi dell’articolo 71, secondo comma, della Costituzione e presentano il seguente disegno di legge:',
    articles: [
      {
        number: '1',
        heading: 'Pubblicazione dei contratti di concessione',
        original:
          '1. Gli enti affidanti il servizio idrico integrato pubblicano il testo integrale dei contratti di concessione e dei relativi allegati tecnici e finanziari, in formato aperto e ricercabile, entro trenta giorni dalla sottoscrizione ovvero, per i rapporti in essere, entro novanta giorni dalla data di entrata in vigore della presente legge.',
        structured:
          'Obbligo di open data sul contratto intero (non un estratto FOIA). Termine: 30 giorni dalla firma; 90 giorni a regime per i contratti già in essere.',
        simple:
          'I contratti dell’acqua (e gli allegati) devono finire online, interi e cercabili. Per quelli già firmati c’è tempo 90 giorni dall’entrata in vigore.',
      },
      {
        number: '2',
        heading: 'Bilancio idrico e tetto tariffario',
        original:
          '1. Ciascun comune approva annualmente un bilancio idrico che dà conto delle perdite di rete, dei volumi fatturati e della composizione tariffaria.\n2. Gli incrementi tariffari eccedenti l’indice armonizzato dei prezzi al consumo sono ammessi solo con delibera motivata dell’ente di governo d’ambito.',
        structured:
          'Bilancio idrico annuale obbligatorio. Tariffe: aumenti sopra IPCA solo con delibera motivata dell’EGA.',
        simple:
          'Ogni comune deve dire ogni anno quante perdite ha la rete e come è fatta la bolletta. La tariffa non può salire più dell’inflazione senza una delibera che lo spieghi.',
      },
    ],
  },
  {
    id: 'dl-17-2022',
    code: 'DL 17/2022',
    formalTitle: 'DECRETO-LEGGE 1 marzo 2022, n. 17',
    officialTitle:
      'Misure urgenti per il contenimento dei costi dell’energia elettrica e del gas naturale.',
    popularTitle: 'Decreto Energia 2022',
    summary:
      'Credito d’imposta per le imprese energivore, rateizzazione delle bollette e fondo di emergenza per le famiglie in difficoltà.',
    date: '2022-03-01',
    publishedAt: '2022-03-01',
    inForceAt: '2022-03-02',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'fisco',
    copertura: 'a_debito',
    iterStatus: 'promulgata',
    decreesMissing: 1,
    decreeDeadline: '2022-06-30',
    financialNote:
      'Oneri per 2,1 miliardi di euro nel 2022, coperti con maggiore ricorso al mercato finanziario (art. 5).',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.82,
      source: 'Memoria Confindustria Energia, audizione 15 febbraio 2022',
    },
    urgency: 20,
    keywords: ['energia', 'bollette', 'energivore', 'gas', 'decreto legge'],
    ministry: 'MASE — Ambiente e Sicurezza energetica',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVisti gli articoli 77 e 87 della Costituzione;\nRitenuta la straordinaria necessità e urgenza di contenere gli effetti dell’aumento dei costi dell’energia;\nEmana il seguente decreto-legge:',
    articles: [
      {
        number: '1',
        heading: 'Credito d’imposta per le imprese energivore',
        original:
          '1. Alle imprese a forte consumo di energia elettrica è riconosciuto, per il primo trimestre 2022, un credito d’imposta pari al 20 per cento delle spese sostenute per la componente energetica, come rilevata nelle fatture di acquisto.',
        structured:
          'Credito d’imposta 20% sulla componente energia, I trimestre 2022, per le imprese energivore. Base di calcolo: fatture di acquisto documentate.',
        simple:
          'Le aziende che consumano tanta energia recuperano il 20% di quanto pagato in più sulla bolletta del primo trimestre 2022.',
      },
      {
        number: '2',
        heading: 'Rateizzazione delle bollette',
        original:
          '1. I soggetti titolari di utenze non domestiche possono richiedere, per le fatture emesse nel primo semestre 2022, la rateizzazione fino a trentasei rate mensili di pari importo, senza applicazione di interessi.',
        structured:
          'Diritto alla rateizzazione fino a 36 mensilità senza interessi per le utenze non domestiche, fatture del I semestre 2022.',
        simple:
          'Le partite IVA possono dividere le bollette del primo semestre 2022 fino in 36 rate, senza pagare interessi.',
      },
      {
        number: '3',
        heading: 'Fondo di emergenza per le famiglie in difficoltà economica',
        original:
          '1. È istituito, nello stato di previsione del Ministero del lavoro e delle politiche sociali, un fondo con una dotazione di 400 milioni di euro per l’anno 2022, destinato al sostegno delle famiglie in condizioni di disagio economico a causa dell’aumento dei costi energetici.',
        structured:
          'Fondo 400 milioni/2022 al Lavoro per bonus energia alle famiglie in disagio economico. Riparto con decreto attuativo successivo.',
        simple:
          'Lo Stato mette 400 milioni per aiutare le famiglie in difficoltà a pagare le bollette più care.',
      },
    ],
  },
  {
    id: 'legge-38-2023',
    code: 'L. 38/2023',
    formalTitle: 'LEGGE 24 aprile 2023, n. 38',
    officialTitle:
      'Disposizioni in materia di detrazioni edilizie e rimodulazione degli incentivi per l’efficientamento energetico.',
    popularTitle: 'Rimodulazione del Superbonus',
    summary:
      'Riduzione dell’aliquota di detrazione, cessione del credito limitata a banche e intermediari, salvaguardia dei cantieri già avviati.',
    date: '2023-04-24',
    publishedAt: '2023-04-25',
    inForceAt: '2023-05-10',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'fisco',
    copertura: 'tagli_spesa',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Riduzione della spesa fiscale stimata in 4,8 miliardi nel triennio 2023-2025, per contrazione dell’aliquota di detrazione.',
    omnibusRisk: null,
    lobbyCheck: {
      similarity: 0.9,
      source: 'Position paper ANCE, audizione 10 marzo 2023',
    },
    urgency: 18,
    keywords: ['superbonus', 'detrazioni', 'edilizia', 'efficientamento', '110'],
    ministry: 'MEF — Economia e Finanze',
    preamble:
      'La Camera dei deputati e il Senato della Repubblica hanno approvato; IL PRESIDENTE DELLA REPUBBLICA Promulga la seguente legge:',
    articles: [
      {
        number: '1',
        heading: 'Rimodulazione dell’aliquota di detrazione',
        original:
          '1. Per le spese sostenute a decorrere dal 1° gennaio 2023, l’aliquota della detrazione di cui all’articolo 119 del decreto-legge 19 maggio 2020, n. 34, è ridotta al 90 per cento.',
        structured:
          'Riduzione dell’aliquota Superbonus dal 110% al 90% per le spese sostenute dal 1° gennaio 2023, novellando l’art. 119 del DL 34/2020.',
        simple:
          'Dal 2023 il Superbonus non copre più il 110%, ma il 90% delle spese.',
        impact: {
          modifiedActCode: 'DL 34/2020',
          targetArticle: 'Art. 119',
          impactType: 'sostituzione',
          previousRuleSummary:
            'Per le spese ammesse l’aliquota di detrazione Superbonus era pari al 110%.',
          newEffectSummary:
            'Dal 1° gennaio 2023 l’aliquota è ridotta al 90% per le spese sostenute a quella data in poi.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto-legge:2020-05-19;34',
        },
      },
      {
        number: '2',
        heading: 'Cessione del credito',
        original:
          '1. La cessione del credito d’imposta corrispondente alla detrazione è consentita esclusivamente a favore di banche, intermediari finanziari e imprese di assicurazione, con esclusione di ogni ulteriore cessione a soggetti privati.',
        structured:
          'La cessione del credito è riservata a banche/intermediari/assicurazioni; vietata la cessione a privati, per contenere il rischio di frodi.',
        simple:
          'Il credito derivante dal Superbonus si può cedere solo a banche o assicurazioni, non più a privati.',
        impact: {
          modifiedActCode: 'DL 34/2020',
          targetArticle: 'Art. 121',
          impactType: 'deroga',
          previousRuleSummary:
            'La cessione del credito corrispondente alla detrazione era ammessa anche verso soggetti privati, con possibilità di cessioni successive.',
          newEffectSummary:
            'La cessione è consentita solo a banche, intermediari finanziari e imprese di assicurazione, con divieto di ulteriore cessione a privati.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto-legge:2020-05-19;34',
        },
      },
      {
        number: '3',
        heading: 'Salvaguardia dei cantieri in corso',
        original:
          '1. Le disposizioni di cui all’articolo 1 non si applicano agli interventi per i quali, alla data del 31 dicembre 2022, sia stata presentata la comunicazione di inizio lavori asseverata (CILAS).',
        structured:
          'Clausola di salvaguardia: i cantieri con CILAS presentata entro il 31/12/2022 restano all’aliquota del 110%.',
        simple:
          'Se i lavori erano già iniziati con la pratica giusta (CILAS) prima del 2023, resta valido il vecchio 110%.',
        impact: {
          modifiedActCode: 'DL 34/2020',
          targetArticle: 'Art. 119',
          impactType: 'deroga',
          previousRuleSummary:
            'L’art. 1 della stessa legge riduce l’aliquota al 90% per tutte le spese dal 1° gennaio 2023.',
          newEffectSummary:
            'Chi aveva già presentato la CILAS entro il 31 dicembre 2022 resta sul regime del 110%.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto-legge:2020-05-19;34',
        },
      },
    ],
  },
  {
    id: 'dl-60-2024',
    code: 'DL 60/2024',
    formalTitle: 'DECRETO-LEGGE 7 maggio 2024, n. 60',
    officialTitle:
      'Ulteriori disposizioni urgenti in materia di politiche di coesione, sicurezza nei luoghi di lavoro e occupazione giovanile.',
    popularTitle: 'Decreto Coesione 2024',
    summary:
      'Incentivi all’assunzione di giovani e donne, patente a crediti nei cantieri, rafforzamento dell’Ispettorato del lavoro.',
    date: '2024-05-07',
    publishedAt: '2024-05-07',
    inForceAt: '2024-05-08',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'lavoro',
    copertura: 'a_debito',
    iterStatus: 'promulgata',
    decreesMissing: 1,
    decreeDeadline: '2024-09-30',
    financialNote:
      'Oneri per 1,8 miliardi di euro nel triennio 2024-2026, a valere sul Fondo di rotazione per le politiche di coesione.',
    omnibusRisk: {
      article: 'Art. 11',
      description:
        'Disposizioni su zone economiche speciali del Mezzogiorno, a bassa coerenza tematica con le misure sull’occupazione giovanile.',
    },
    lobbyCheck: null,
    urgency: 15,
    keywords: ['lavoro', 'occupazione', 'giovani', 'sicurezza cantieri', 'coesione'],
    ministry: 'Ministero del Lavoro',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVisti gli articoli 77 e 87 della Costituzione;\nRitenuta la straordinaria necessità e urgenza di adottare misure per l’occupazione giovanile e la sicurezza nei cantieri;\nEmana il seguente decreto-legge:',
    articles: [
      {
        number: '1',
        heading: 'Incentivi all’assunzione di giovani e donne',
        original:
          '1. Ai datori di lavoro privati che assumono, con contratto a tempo indeterminato, lavoratori di età inferiore a trentacinque anni o donne prive di impiego regolarmente retribuito, è riconosciuto, per un periodo massimo di ventiquattro mesi, l’esonero dal versamento dei contributi previdenziali a carico del datore di lavoro, nel limite massimo di 650 euro mensili per lavoratore.',
        structured:
          'Esonero contributivo datoriale fino a 650 euro/mese per 24 mesi, per assunzioni a tempo indeterminato di under 35 o donne disoccupate.',
        simple:
          'Se un’azienda assume a tempo indeterminato un giovane under 35 o una donna senza lavoro, per due anni paga meno contributi (fino a 650 euro al mese in meno).',
      },
      {
        number: '2',
        heading: 'Patente a crediti nei cantieri',
        original:
          '1. A decorrere dal 1° ottobre 2024, le imprese operanti nei cantieri temporanei o mobili sono tenute al possesso della patente a crediti, rilasciata dall’Ispettorato nazionale del lavoro, quale requisito per l’esecuzione dei lavori.',
        structured:
          'Obbligo di patente a crediti INL per le imprese di cantiere dal 1° ottobre 2024, come requisito abilitante per operare.',
        simple:
          'Dall’autunno 2024 le imprese che lavorano nei cantieri devono avere una “patente a punti” rilasciata dall’Ispettorato del lavoro, altrimenti non possono operare.',
        impact: {
          modifiedActCode: 'D.Lgs. 81/2008 (Testo unico sicurezza)',
          targetArticle: 'Titolo IV — cantieri temporanei o mobili',
          impactType: 'integrazione',
          previousRuleSummary:
            'L’accesso ai cantieri era disciplinato dagli obblighi di sicurezza del d.lgs. 81/2008, senza un requisito abilitante a punti rilasciato dall’INL.',
          newEffectSummary:
            'Dal 1° ottobre 2024 le imprese di cantiere devono possedere la patente a crediti dell’Ispettorato nazionale del lavoro, pena l’impossibilità di eseguire i lavori.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2008-04-09;81',
        },
      },
      {
        number: '3',
        heading: 'Rafforzamento dell’Ispettorato nazionale del lavoro',
        original:
          '1. La dotazione organica dell’Ispettorato nazionale del lavoro è incrementata di 1.024 unità, da assumere con concorso pubblico, secondo le modalità stabilite con decreto del Ministro del lavoro e delle politiche sociali.',
        structured:
          'Incremento organico INL di 1.024 unità via concorso pubblico. Decreto attuativo sulle modalità di assunzione ancora atteso.',
        simple:
          'Assumono più di mille ispettori del lavoro in più, ma il concorso e le regole precise arrivano con un decreto successivo.',
      },
    ],
  },
  {
    id: 'legge-15-2025',
    code: 'L. 15/2025',
    formalTitle: 'LEGGE 12 febbraio 2025, n. 15',
    officialTitle:
      'Modifiche al codice penale e al codice di procedura penale in materia di reati informatici e di sicurezza delle infrastrutture digitali.',
    popularTitle: 'Riforma dei reati informatici',
    summary:
      'Nuova aggravante per gli attacchi a infrastrutture critiche, obbligo di notifica dei data breach, task force cybersecurity nelle procure.',
    date: '2025-02-12',
    publishedAt: '2025-02-13',
    inForceAt: '2025-02-28',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'giustizia',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 2,
    decreeDeadline: '2025-05-30',
    financialNote:
      'Invarianza finanziaria: le nuove competenze sono assorbite dalle strutture esistenti presso le procure distrettuali.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 22,
    keywords: ['cybersecurity', 'reati informatici', 'data breach', 'infrastrutture critiche'],
    ministry: 'Ministero della Giustizia',
    preamble:
      'La Camera dei deputati e il Senato della Repubblica hanno approvato; IL PRESIDENTE DELLA REPUBBLICA Promulga la seguente legge:',
    articles: [
      {
        number: '1',
        heading: 'Aggravante per attacchi a infrastrutture critiche',
        original:
          '1. All’articolo 635-quater del codice penale è aggiunto, in fine, il seguente periodo: «La pena è aumentata da un terzo alla metà se il fatto è commesso in danno di sistemi informatici o telematici di pubblica utilità o di infrastrutture critiche nazionali.»',
        structured:
          'Novella dell’art. 635-quater c.p.: aggravante speciale (aumento da 1/3 alla metà) per danneggiamento di sistemi informatici di infrastrutture critiche o di pubblica utilità.',
        simple:
          'Chi attacca informaticamente ospedali, reti energetiche o altri servizi essenziali rischia una pena più alta.',
        impact: {
          modifiedActCode: 'Codice penale',
          targetArticle: 'Art. 635-quater',
          impactType: 'integrazione',
          previousRuleSummary:
            'Il danneggiamento di sistemi informatici era già sanzionato, senza un’aggravante specifica per infrastrutture critiche o di pubblica utilità.',
          newEffectSummary:
            'La pena è aumentata da un terzo alla metà se il fatto è commesso in danno di sistemi di pubblica utilità o di infrastrutture critiche nazionali.',
          officialSourceUrl: 'https://www.normattiva.it/',
        },
      },
      {
        number: '2',
        heading: 'Obbligo di notifica dei data breach',
        original:
          '1. I titolari del trattamento che gestiscono infrastrutture digitali di rilevanza strategica nazionale notificano all’Agenzia per la cybersicurezza nazionale, entro ventiquattro ore dalla conoscenza, ogni violazione di dati che comporti un rischio elevato per i diritti e le libertà delle persone fisiche.',
        structured:
          'Obbligo di notifica entro 24 ore all’ACN per i data breach ad alto rischio, in capo ai titolari di infrastrutture digitali strategiche.',
        simple:
          'Se un’azienda strategica subisce un attacco che espone dati sensibili, deve avvisare l’Agenzia per la cybersicurezza entro un giorno.',
      },
      {
        number: '3',
        heading: 'Task force cybersecurity nelle procure',
        original:
          '1. Presso le procure della Repubblica aventi sede nel capoluogo di ogni distretto di corte d’appello è istituita una task force specializzata in materia di reati informatici, composta da magistrati e personale tecnico con specifiche competenze, nell’ambito delle risorse umane disponibili.',
        structured:
          'Istituzione di task force cybersecurity nelle procure distrettuali, a organico invariato (nessuna nuova assunzione prevista dalla norma).',
        simple:
          'In ogni procura di distretto nasce un gruppo specializzato in reati informatici, ma senza nuovo personale assunto apposta.',
      },
    ],
  },
  {
    id: 'dlgs-285-1992',
    code: 'D.Lgs. 285/1992',
    formalTitle: 'DECRETO LEGISLATIVO 30 aprile 1992, n. 285',
    officialTitle: 'Nuovo codice della strada.',
    popularTitle: 'Codice della Strada (testo storico)',
    summary:
      'Il testo fondativo della disciplina della circolazione stradale in Italia: principi generali, classificazione dei veicoli e regime sanzionatorio.',
    date: '1992-04-30',
    publishedAt: '1992-05-18',
    inForceAt: '1993-01-01',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'codice_strada',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: l’attuazione è assicurata nell’ambito delle risorse ordinarie degli enti competenti.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 10,
    keywords: ['codice della strada', 'circolazione', 'veicoli', 'patente', 'sanzioni'],
    ministry: 'MIT — Infrastrutture e Trasporti',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVista la legge 13 giugno 1991, n. 190, recante delega al Governo per la revisione delle norme sulla disciplina della circolazione stradale;\nEmana il seguente decreto legislativo:',
    articles: [
      {
        number: '1',
        heading: 'Principi generali',
        original:
          '1. La sicurezza delle persone, nella circolazione stradale, rientra tra le finalità primarie di ordine sociale ed economico perseguite dallo Stato.\n2. Le norme del presente codice, in attuazione dei principi costituzionali di libertà di circolazione, di tutela della salute e di sicurezza pubblica, disciplinano la circolazione dei pedoni, dei veicoli e degli animali sulle strade.',
        structured:
          'Norma di apertura: la sicurezza stradale è finalità primaria dello Stato. Il codice disciplina pedoni, veicoli e animali sulle strade, in attuazione dei principi costituzionali.',
        simple:
          'Questo articolo dice perché esiste il codice: rendere sicura la strada per tutti, pedoni compresi.',
      },
      {
        number: '46',
        heading: 'Classificazione dei veicoli',
        original:
          '1. Ai fini del presente codice si intendono per veicoli tutte le macchine di qualsiasi specie che circolano sulle strade guidate dall’uomo, e per veicoli a motore quelli provvisti di un motore proprio di propulsione.',
        structured:
          'Definizione generale di “veicolo” e di “veicolo a motore”, base per tutte le successive discipline speciali (compresa la micromobilità elettrica introdotta da leggi successive).',
        simple:
          'Qui il codice spiega cosa conta come “veicolo”: qualunque macchina guidata da una persona che si muove su strada.',
      },
      {
        number: '213',
        heading: 'Sanzioni accessorie e sequestro del veicolo',
        original:
          '1. Nei casi previsti dal presente codice, il veicolo con il quale è stata commessa la violazione può essere sottoposto a sequestro ai fini della confisca amministrativa, secondo le modalità stabilite dal regolamento di esecuzione.',
        structured:
          'Base normativa storica del sequestro amministrativo dei veicoli, richiamata dalle leggi successive che introducono nuove sanzioni accessorie.',
        simple:
          'Il codice prevede da sempre che, in certi casi, il veicolo usato per commettere l’infrazione possa essere sequestrato.',
      },
    ],
  },
  {
    id: 'l-300-1970',
    code: 'L. 300/1970',
    formalTitle: 'LEGGE 20 maggio 1970, n. 300',
    officialTitle:
      'Norme sulla tutela della libertà e dignità dei lavoratori, della libertà sindacale e dell’attività sindacale nei luoghi di lavoro, e norme sul collocamento.',
    popularTitle: 'Statuto dei Lavoratori',
    summary:
      'Il testo fondativo dei diritti dei lavoratori in fabbrica e in azienda: libertà di opinione, limiti ai controlli e tutela contro i licenziamenti illegittimi.',
    date: '1970-05-20',
    publishedAt: '1970-05-27',
    inForceAt: '1970-06-11',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'lavoro',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: la legge disciplina diritti e procedure, senza istituire nuovi fondi statali.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 8,
    keywords: ['statuto dei lavoratori', 'sindacale', 'licenziamento', 'dignità', 'lavoro'],
    ministry: 'Ministero del Lavoro',
    preamble:
      'La Camera dei deputati e il Senato della Repubblica hanno approvato; IL PRESIDENTE DELLA REPUBBLICA Promulga la seguente legge:',
    articles: [
      {
        number: '1',
        heading: 'Libertà di opinione',
        original:
          '1. I lavoratori, senza distinzione di opinioni politiche, sindacali e di fede religiosa, hanno diritto, nei luoghi dove prestano la loro opera, di manifestare liberamente il proprio pensiero, nel rispetto dei principi della Costituzione e delle norme della presente legge.',
        structured:
          'Diritto alla libera manifestazione del pensiero sul luogo di lavoro, senza distinzione di opinioni politiche, sindacali o religiose, nel rispetto della Costituzione.',
        simple:
          'Sul posto di lavoro puoi esprimere le tue opinioni, senza essere discriminato per quello che pensi o in cui credi.',
      },
      {
        number: '4',
        heading: 'Impianti audiovisivi e controllo a distanza',
        original:
          '1. È vietato l’uso di impianti audiovisivi e di altre apparecchiature per finalità di controllo a distanza dell’attività dei lavoratori. Gli impianti e le apparecchiature di controllo che siano richiesti da esigenze organizzative e produttive ovvero dalla sicurezza del lavoro, ma dai quali derivi anche la possibilità di controllo a distanza dell’attività dei lavoratori, possono essere installati soltanto previo accordo con le rappresentanze sindacali aziendali.',
        structured:
          'Divieto generale di controllo a distanza dei lavoratori tramite audiovisivi; deroga solo per esigenze organizzative/produttive o di sicurezza, previo accordo sindacale (norma poi modificata dal Jobs Act nel 2015).',
        simple:
          'Il datore di lavoro non può spiarti con telecamere solo per controllarti. Se servono per altri motivi (sicurezza, organizzazione), deve prima accordarsi con i sindacati.',
      },
      {
        number: '18',
        heading: 'Reintegrazione nel posto di lavoro',
        original:
          '1. Ove il giudice accerti che non sussistono gli estremi del licenziamento per giusta causa o giustificato motivo addotti dal datore di lavoro, nelle imprese con più di quindici dipendenti, ordina al datore di lavoro la reintegrazione del lavoratore nel posto di lavoro.',
        structured:
          'Tutela reale nelle imprese sopra i 15 dipendenti: se il licenziamento è illegittimo, il giudice ordina la reintegrazione (regime poi ridimensionato da riforme successive, tra cui il Jobs Act del 2015).',
        simple:
          'Nel testo originale, se ti licenziano senza un vero motivo e l’azienda ha più di 15 dipendenti, il giudice può obbligarla a riprenderti.',
      },
    ],
  },
  {
    id: 'dlgs-267-2000',
    code: 'D.Lgs. 267/2000',
    formalTitle: 'DECRETO LEGISLATIVO 18 agosto 2000, n. 267',
    officialTitle: 'Testo unico delle leggi sull’ordinamento degli enti locali.',
    popularTitle: 'TUEL — Testo Unico Enti Locali',
    summary:
      'Il testo che raccoglie l’ordinamento di comuni e province: organi di governo, autonomia statutaria e regole di bilancio.',
    date: '2000-08-18',
    publishedAt: '2000-09-28',
    inForceAt: '2000-10-13',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'giustizia',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: testo unico di riordino, senza nuovi oneri per la finanza pubblica.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 6,
    keywords: ['enti locali', 'comuni', 'tuel', 'ordinamento', 'bilancio comunale'],
    ministry: 'Ministero dell’Interno',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVista la legge 8 giugno 1990, n. 142, e successive modificazioni;\nEmana il seguente decreto legislativo:',
    articles: [
      {
        number: '1',
        heading: 'Principi generali sull’autonomia dei comuni',
        original:
          '1. La Repubblica riconosce e promuove le autonomie locali. Il comune è l’ente locale che rappresenta la propria comunità, ne cura gli interessi e ne promuove lo sviluppo.',
        structured:
          'Norma di principio: il comune come ente rappresentativo della comunità locale, titolare di autonomia statutaria, organizzativa e finanziaria nei limiti della legge.',
        simple:
          'Il comune è l’ente che rappresenta i cittadini di un territorio e si occupa dei loro interessi.',
      },
      {
        number: '36',
        heading: 'Organi di governo del comune',
        original:
          '1. Sono organi di governo del comune il consiglio, la giunta, il sindaco.',
        structured:
          'Definizione della struttura di governo comunale: consiglio (organo di indirizzo e controllo), giunta (organo esecutivo), sindaco (organo di vertice e rappresentanza).',
        simple:
          'Un comune è governato da tre organi: il consiglio comunale, la giunta e il sindaco.',
      },
      {
        number: '151',
        heading: 'Principi di bilancio',
        original:
          '1. Gli enti locali deliberano il bilancio di previsione finanziario entro il termine stabilito con decreto del Ministro dell’interno, di concerto con il Ministro dell’economia e delle finanze, osservando i principi di unità, annualità, universalità ed integrità, veridicità, pareggio finanziario e pubblicità.',
        structured:
          'Principi contabili fondamentali del bilancio comunale: unità, annualità, universalità, veridicità, pareggio e pubblicità. Termine di approvazione fissato con decreto ministeriale.',
        simple:
          'Ogni comune deve fare un bilancio annuale, in pareggio e pubblico, seguendo regole comuni a tutta Italia.',
      },
    ],
  },
  {
    id: 'dlgs-81-2015',
    code: 'D.Lgs. 81/2015',
    formalTitle: 'DECRETO LEGISLATIVO 15 giugno 2015, n. 81',
    officialTitle:
      'Disciplina organica dei contratti di lavoro e revisione della normativa in tema di mansioni, a norma dell’articolo 1, comma 7, della legge 10 dicembre 2014, n. 183.',
    popularTitle: 'Jobs Act — contratti di lavoro',
    summary:
      'Riordino dei contratti di lavoro: causali del tempo determinato, somministrazione e nuova disciplina dello ius variandi sulle mansioni.',
    date: '2015-06-15',
    publishedAt: '2015-06-24',
    inForceAt: '2015-07-25',
    sourceUrl: 'https://www.normattiva.it/',
    sourceLabel: 'Gazzetta Ufficiale — testo su Normattiva',
    iniziativa: 'governo',
    materia: 'lavoro',
    copertura: 'invarianza',
    iterStatus: 'promulgata',
    decreesMissing: 0,
    decreeDeadline: null,
    financialNote:
      'Invarianza finanziaria: il riordino dei contratti non comporta nuovi oneri diretti per la finanza pubblica.',
    omnibusRisk: null,
    lobbyCheck: null,
    urgency: 12,
    keywords: ['jobs act', 'contratti a termine', 'somministrazione', 'mansioni', 'causali'],
    ministry: 'Ministero del Lavoro',
    preamble:
      'IL PRESIDENTE DELLA REPUBBLICA\nVista la legge 10 dicembre 2014, n. 183, recante delega al Governo in materia di riforma degli ammortizzatori sociali e dei contratti di lavoro;\nEmana il seguente decreto legislativo:',
    articles: [
      {
        number: '19',
        heading: 'Apposizione del termine e durata massima',
        original:
          '1. Al contratto di lavoro subordinato può essere apposto un termine di durata non superiore a trentasei mesi.\n2. Il termine del contratto può essere prorogato, con il consenso del lavoratore, per un massimo di cinque volte nell’arco di trentasei mesi.',
        structured:
          'Testo originario (2015) del regime del tempo determinato: durata massima 36 mesi, fino a 5 proroghe, senza obbligo generale di causale (regime poi ristretto da riforme successive).',
        simple:
          'Nella versione del 2015, un contratto a termine poteva durare fino a 3 anni e essere rinnovato fino a 5 volte, senza dover sempre spiegare il perché.',
        impact: {
          modifiedActCode: 'D.Lgs. 368/2001',
          targetArticle: 'Disciplina organica del contratto a termine',
          impactType: 'abrogazione',
          previousRuleSummary:
            'Il contratto a tempo determinato era regolato dal d.lgs. 368/2001, con causali e limiti propri di quel testo unico.',
          newEffectSummary:
            'Il d.lgs. 81/2015 sostituisce quel regime: durata massima 36 mesi e fino a cinque proroghe, senza obbligo generale di causale nel testo originario del 2015.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-09-06;368',
        },
      },
      {
        number: '31',
        heading: 'Limiti quantitativi alla somministrazione',
        original:
          '1. Salva diversa disposizione dei contratti collettivi applicati dall’utilizzatore, il numero dei lavoratori somministrati con contratto a tempo determinato non può eccedere il 30 per cento del numero dei lavoratori a tempo indeterminato in forza presso l’utilizzatore.',
        structured:
          'Tetto legale del 30% alla somministrazione a termine sull’organico stabile, derogabile dai contratti collettivi.',
        simple:
          'Un’azienda non può avere più del 30% di lavoratori “in prestito” (somministrati) rispetto agli assunti fissi, salvo accordi diversi del contratto collettivo.',
      },
      {
        number: '3',
        heading: 'Mansioni e ius variandi',
        original:
          '1. Il lavoratore può essere assegnato dal datore di lavoro a mansioni riconducibili allo stesso livello e categoria legale di inquadramento delle ultime effettivamente svolte, ovvero a mansioni appartenenti al livello di inquadramento inferiore purché rientranti nella medesima categoria legale.',
        structured:
          'Ampliamento del potere datoriale di modifica delle mansioni (ius variandi), estendibile anche a un livello di inquadramento inferiore, nella stessa categoria legale.',
        simple:
          'Il capo può, in certi casi, cambiarti mansione anche verso un livello un po’ più basso, se resta nella stessa categoria di inquadramento.',
        impact: {
          modifiedActCode: 'L. 300/1970 (Statuto dei Lavoratori)',
          targetArticle: 'Art. 13',
          impactType: 'sostituzione',
          previousRuleSummary:
            'Lo Statuto vincolava il lavoratore alle mansioni per le quali era stato assunto, con ius variandi più ristretto.',
          newEffectSummary:
            'Il datore può assegnare mansioni dello stesso livello e, in certi casi, del livello inferiore nella medesima categoria legale.',
          officialSourceUrl: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300',
        },
      },
    ],
  },
];

const ID_ALIASES: Record<string, string> = {
  'ddl-1435': 'legge-105-2026',
};

const RECENT_YEARS_WINDOW = 5;

export function currentYear(): number {
  return new Date().getFullYear();
}

export function isRecentAct(act: Act): boolean {
  const year = Number(act.date.slice(0, 4));
  return year >= currentYear() - RECENT_YEARS_WINDOW;
}

export function resolveActId(id: string): string {
  return ID_ALIASES[id] ?? id;
}

export function getActById(id: string): Act | null {
  const resolved = resolveActId(id);
  return MOCK_ACTS.find((act) => act.id === resolved) ?? null;
}

export function collectNormImpacts(act: Act): { articleNumber: string; impact: NormImpact }[] {
  return act.articles.flatMap((article) =>
    article.impact ? [{ articleNumber: article.number, impact: article.impact }] : [],
  );
}

export function actIdFromNormCode(code: string): string | null {
  const s = code.toLowerCase().replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/d\.?\s*lgs\.?\s*(\d+)\s*\/\s*(\d{4})/))) return `dlgs-${m[1]}-${m[2]}`;
  if ((m = s.match(/\bdl\s+(\d+)\s*\/\s*(\d{4})/))) return `dl-${m[1]}-${m[2]}`;
  if ((m = s.match(/(?:decreto-legge|d\.?\s*l\.)\s*(\d+)\s*\/\s*(\d{4})/))) return `dl-${m[1]}-${m[2]}`;
  if ((m = s.match(/(?:legge|l\.)\s*(\d+)\s*\/\s*(\d{4})/))) {
    const lId = `l-${m[1]}-${m[2]}`;
    if (MOCK_ACTS.some((act) => act.id === lId)) return lId;
    return `legge-${m[1]}-${m[2]}`;
  }
  return null;
}

export { calculateDelayDays as daysLate } from '@/lib/dates';

const SEARCH_STOPWORDS = new Set([
  'cosa',
  'come',
  'quali',
  'quale',
  'quando',
  'dove',
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
  'cambia',
  'nuovo',
  'nuova',
  'prevede',
  'riforma',
  'misure',
  'liste',
]);

export function searchActs(query: string, acts: Act[] = MOCK_ACTS): Act[] {
  const q = query.toLowerCase().trim().replace(/#/g, '');
  if (!q) return acts;
  const tokens = q
    .split(/[^a-zàèéìòù0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 3 && !SEARCH_STOPWORDS.has(t));

  const scored = acts.map((act) => {
    const hay = [
      act.popularTitle,
      act.officialTitle,
      act.formalTitle,
      act.summary,
      act.code,
      ...act.keywords,
      ...act.articles.map((a) => a.heading),
    ]
      .join(' ')
      .toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (act.keywords.some((k) => k.includes(token) || token.includes(k))) score += 8;
      if (act.popularTitle.toLowerCase().includes(token) || act.code.toLowerCase().includes(token)) score += 5;
      if (hay.includes(token)) score += 1;
    }
    if (tokens.length === 0 && hay.includes(q)) score += 3;
    return { act, score };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || b.act.urgency - a.act.urgency);
  return scored.map((row) => row.act);
}
