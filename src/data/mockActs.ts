export type IterStatus =
  | 'in_commissione'
  | 'in_aula'
  | 'navetta_senato'
  | 'promulgata';

export type Iniziativa = 'governo' | 'parlamentare' | 'popolare';
export type Materia = 'codice_strada' | 'fisco' | 'sanita' | 'lavoro' | 'giustizia';
export type Copertura = 'invarianza' | 'a_debito' | 'tagli_spesa';

export type LawArticle = {
  number: string;
  heading: string;
  original: string;
  structured: string;
  simple: string;
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

const ID_ALIASES: Record<string, string> = {
  'ddl-1435': 'legge-105-2026',
};

export function getActById(id: string): Act | undefined {
  const resolved = ID_ALIASES[id] ?? id;
  return MOCK_ACTS.find((act) => act.id === resolved);
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

export function searchActs(query: string): Act[] {
  const q = query.toLowerCase().trim().replace(/#/g, '');
  if (!q) return MOCK_ACTS;
  const tokens = q
    .split(/[^a-zàèéìòù0-9]+/i)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 3 && !SEARCH_STOPWORDS.has(t));

  const scored = MOCK_ACTS.map((act) => {
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
