import { type Lang } from '../i18n/ui';

// Supplements A to Z hub (/[lang]/evidence/supplements), added 27 Oct 2026.
// One row per supplement Sqwod Evidence has graded. Every line here must be
// traceable to the linked playbook's own takeaways or graded sections: the hub
// summarises, it never adds a claim. When a playbook is updated, re-check its row.
// `playbook` is the article urlSlug (same slug in EN and DE). Rows without their
// own playbook point at the supplement-triage piece where they are graded.

export type Tier = 'yes' | 'conditional' | 'skip' | 'avoid';

export const tierMeta: Record<Tier, { label: Record<Lang, string>; desc: Record<Lang, string> }> = {
  yes: {
    label: { en: 'Default yes', de: 'Klares Ja' },
    desc: { en: 'Works for a general training population.', de: 'Wirkt für eine normale Trainingspopulation.' },
  },
  conditional: {
    label: { en: 'Conditional yes', de: 'Bedingtes Ja' },
    desc: { en: 'Works for specific people or goals only.', de: 'Wirkt nur für bestimmte Menschen oder Ziele.' },
  },
  skip: {
    label: { en: 'Skip', de: 'Weglassen' },
    desc: { en: 'Studied, and the claims do not hold up.', de: 'Untersucht, und die Versprechen halten nicht.' },
  },
  avoid: {
    label: { en: 'Avoid', de: 'Finger weg' },
    desc: { en: 'Not a coaching call: unapproved, with real risk.', de: 'Keine Coaching-Entscheidung: nicht zugelassen, mit echtem Risiko.' },
  },
};

export interface SupplementRow {
  id: string;
  name: Record<Lang, string>;
  aka?: string;
  tier: Tier;
  grade: Record<Lang, string>;
  line: Record<Lang, string>;
  playbook: string;
  own: boolean; // true = has its own playbook; false = graded inside the triage piece
}

export const supplements: SupplementRow[] = [
  {
    id: 'ashwagandha',
    name: { en: 'Ashwagandha', de: 'Ashwagandha' },
    tier: 'conditional',
    grade: { en: 'Moderate (stress, sleep)', de: 'Moderat (Stress, Schlaf)' },
    line: {
      en: 'Small, real effects on stress and sleep. Screen first: rare liver injury is documented, and pregnancy is a clear no.',
      de: 'Kleine, echte Effekte auf Stress und Schlaf. Vorher abklären: Seltene Leberschäden sind dokumentiert, in der Schwangerschaft klar nein.',
    },
    playbook: 'ashwagandha-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'bcaa',
    name: { en: 'BCAAs', de: 'BCAAs' },
    aka: 'branched-chain amino acids',
    tier: 'skip',
    grade: { en: 'Strong: no benefit over enough protein', de: 'Stark: kein Nutzen über genug Protein hinaus' },
    line: {
      en: 'Only 3 of the 9 essential amino acids. Some relief from soreness, but no extra gains once daily protein is covered.',
      de: 'Nur 3 der 9 essenziellen Aminosäuren. Etwas weniger Muskelkater, aber kein Zusatznutzen, wenn das Tagesprotein stimmt.',
    },
    playbook: 'bcaa-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'beta-alanine',
    name: { en: 'Beta-alanine', de: 'Beta-Alanin' },
    tier: 'conditional',
    grade: { en: 'Strong for the window, small effect', de: 'Stark fürs Zeitfenster, kleiner Effekt' },
    line: {
      en: 'Helps only in hard efforts of about 30 seconds to 10 minutes. No effect on body composition. The tingle is a side effect, not proof it works.',
      de: 'Hilft nur bei harten Belastungen von etwa 30 Sekunden bis 10 Minuten. Kein Effekt auf die Körperzusammensetzung. Das Kribbeln ist eine Nebenwirkung, kein Wirkungsbeweis.',
    },
    playbook: 'beta-alanine-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'caffeine',
    name: { en: 'Caffeine', de: 'Koffein' },
    tier: 'yes',
    grade: { en: 'Strong', de: 'Stark' },
    line: {
      en: 'About 2 to 4% faster endurance time trials at 3 to 6 mg/kg, roughly 60 minutes before. A tool for the session: it costs sleep if taken late.',
      de: 'Etwa 2 bis 4 % schnellere Ausdauer-Zeitfahren mit 3 bis 6 mg/kg, rund 60 Minuten vorher. Ein Werkzeug für die Einheit: Spät genommen kostet es Schlaf.',
    },
    playbook: 'caffeine-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'creatine',
    name: { en: 'Creatine monohydrate', de: 'Kreatin-Monohydrat' },
    tier: 'yes',
    grade: { en: 'Strong', de: 'Stark' },
    line: {
      en: 'More strength alongside training. 5 g a day, timing irrelevant. Hair-loss and kidney fears are not supported in healthy adults.',
      de: 'Mehr Kraft zusammen mit Training. 5 g pro Tag, Zeitpunkt egal. Ängste um Haarausfall und Nieren sind bei gesunden Erwachsenen nicht belegt.',
    },
    playbook: 'creatine-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'omega-3',
    name: { en: 'Fish oil (omega-3)', de: 'Fischöl (Omega-3)' },
    aka: 'EPA, DHA',
    tier: 'conditional',
    grade: { en: 'Moderate for pain; none for muscle', de: 'Moderat bei Schmerz; kein Muskeleffekt' },
    line: {
      en: 'Not a muscle builder. Moderate help for chronic pain, but not for osteoarthritis. Heart-rhythm risk rises above 1 g a day, so more is not better.',
      de: 'Kein Muskelaufbau-Mittel. Moderate Hilfe bei chronischen Schmerzen, nicht bei Arthrose. Ab etwa 1 g pro Tag steigt das Risiko für Herzrhythmusstörungen, mehr ist also nicht besser.',
    },
    playbook: 'omega-3-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'magnesium',
    name: { en: 'Magnesium', de: 'Magnesium' },
    tier: 'conditional',
    grade: { en: 'Moderate when intake is low', de: 'Moderat bei niedriger Zufuhr' },
    line: {
      en: 'Worth it when intake is low, which is common. The sleep effect is modest and uncertain, and it does not help common night cramps. Choose citrate or glycinate over oxide.',
      de: 'Sinnvoll bei niedriger Zufuhr, und die ist häufig. Der Schlafeffekt ist klein und unsicher, bei normalen nächtlichen Krämpfen hilft es nicht. Citrat oder Glycinat statt Oxid.',
    },
    playbook: 'magnesium-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'pre-workout',
    name: { en: 'Pre-workouts and fat burners', de: 'Pre-Workouts und Fatburner' },
    tier: 'skip',
    grade: { en: 'Strong: highest contamination risk', de: 'Stark: höchstes Verunreinigungsrisiko' },
    line: {
      en: 'Caffeine is the part that works, and you can dose it on its own. Pre-workouts and fat burners were among the products most likely to contain banned substances.',
      de: 'Koffein ist der Teil, der wirkt, und lässt sich allein dosieren. Pre-Workouts und Fatburner gehörten zu den Produkten, die am häufigsten verbotene Substanzen enthielten.',
    },
    playbook: 'supplement-triage-evidence-coach-playbook',
    own: false,
  },
  {
    id: 'protein',
    name: { en: 'Protein powder', de: 'Proteinpulver' },
    aka: 'whey',
    tier: 'yes',
    grade: { en: 'Strong', de: 'Stark' },
    line: {
      en: 'Only useful to close a food gap. Gains stop at about 1.6 g/kg of total protein a day, so ask what the client eats first.',
      de: 'Nur sinnvoll, um eine Lücke in der Ernährung zu schließen. Ab etwa 1,6 g/kg Gesamtprotein pro Tag gibt es keinen Zusatznutzen, also zuerst fragen, was gegessen wird.',
    },
    playbook: 'protein-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'peptides',
    name: { en: 'Research peptides', de: 'Forschungs-Peptide' },
    aka: 'BPC-157, TB-500, MK-677',
    tier: 'avoid',
    grade: { en: 'Preclinical (BPC-157, TB-500)', de: 'Präklinisch (BPC-157, TB-500)' },
    line: {
      en: 'Almost all animal data. Unapproved, unregulated and banned in tested sport. MK-677 added mass but no strength, and raised blood sugar.',
      de: 'Fast nur Tierdaten. Nicht zugelassen, unreguliert und im Wettkampfsport verboten. MK-677 brachte Masse, aber keine Kraft, und erhöhte den Blutzucker.',
    },
    playbook: 'peptides-evidence-coach-playbook',
    own: true,
  },
  {
    id: 'testosterone-boosters',
    name: { en: 'Testosterone boosters', de: 'Testosteron-Booster' },
    tier: 'skip',
    grade: { en: 'Strong: claims not supported', de: 'Stark: Versprechen nicht belegt' },
    line: {
      en: 'In an audit of 50 products, 90% claimed a testosterone boost but only 24.8% had any published data behind it. Some contained ingredients shown to lower it.',
      de: 'In einer Prüfung von 50 Produkten versprachen 90 % mehr Testosteron, aber nur 24,8 % hatten dafür überhaupt veröffentlichte Daten. Manche enthielten Zutaten, die es nachweislich senken.',
    },
    playbook: 'supplement-triage-evidence-coach-playbook',
    own: false,
  },
  {
    id: 'vitamin-d',
    name: { en: 'Vitamin D', de: 'Vitamin D' },
    tier: 'conditional',
    grade: { en: 'Moderate for people who are low', de: 'Moderat bei niedrigen Werten' },
    line: {
      en: 'A correction supplement, not a performance one. Helps people who are low, which is common in European winters. No effect on fractures, and high doses carry risk.',
      de: 'Ein Ausgleichs-, kein Leistungs-Supplement. Hilft bei niedrigen Werten, die im europäischen Winter häufig sind. Kein Effekt auf Knochenbrüche, und hohe Dosen bergen Risiken.',
    },
    playbook: 'vitamin-d-evidence-coach-playbook',
    own: true,
  },
];

// Visible FAQ on the hub, mirrored 1:1 into FAQPage JSON-LD. Answers come from the
// supplement-triage playbook.
export const supplementFaq: { q: Record<Lang, string>; a: Record<Lang, string> }[] = [
  {
    q: { en: 'Which supplements actually work for strength training?', de: 'Welche Supplements wirken beim Krafttraining wirklich?' },
    a: {
      en: 'Three earn a default yes for a general training population: creatine monohydrate, caffeine for specific sessions, and protein powder only when food leaves a gap. Beta-alanine helps only in hard efforts of about 30 seconds to 10 minutes.',
      de: 'Drei verdienen ein klares Ja für eine normale Trainingspopulation: Kreatin-Monohydrat, Koffein für bestimmte Einheiten und Proteinpulver nur, wenn die Ernährung eine Lücke lässt. Beta-Alanin hilft nur bei harten Belastungen von etwa 30 Sekunden bis 10 Minuten.',
    },
  },
  {
    q: { en: 'Which supplements can my clients skip?', de: 'Welche Supplements können meine Kunden weglassen?' },
    a: {
      en: 'BCAAs when daily protein is already adequate, testosterone boosters, and multi-ingredient pre-workouts and fat burners. These claims have been studied and do not hold up.',
      de: 'BCAAs, wenn das Tagesprotein schon stimmt, Testosteron-Booster sowie Pre-Workouts und Fatburner mit vielen Zutaten. Diese Versprechen wurden untersucht und halten nicht.',
    },
  },
  {
    q: { en: 'How do I know a supplement is clean?', de: 'Woran erkenne ich, dass ein Supplement sauber ist?' },
    a: {
      en: 'Buy only products with third-party batch certification. In a 2022 Sport Integrity Australia analysis of 200 sports supplements, 35% contained substances on the WADA prohibited list, and most of those were not listed on the label.',
      de: 'Kaufe nur Produkte mit unabhängiger Chargenzertifizierung. In einer Analyse von Sport Integrity Australia (2022) mit 200 Sportsupplements enthielten 35 % Substanzen von der WADA-Verbotsliste, die meisten davon nicht auf dem Etikett angegeben.',
    },
  },
];
