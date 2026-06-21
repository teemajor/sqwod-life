// Sqwod Verified — category buyer's guides.
// Truth wins: a pick is either `reviewSlug` (we've tested it → real Sqwod Score
// from the reviews collection) OR an editorial pick (named leader, NO fake score).
// `affiliate: true` = we have / will have a partner program (link labeled + rel=sponsored);
// `affiliate: false` = listed on merit only, plainly linked, clearly "not affiliated".
import type { Lang } from '../i18n/ui';

export interface Pick {
  product: string;
  brand: string;
  url: string;                 // brand/product page (until /go offers exist)
  affiliate: boolean;
  reviewSlug?: string;         // if we have a full review (→ Sqwod Score)
  bestFor: Record<Lang, string>;
  why: Record<Lang, string>;
}
export interface Category {
  slug: string;
  glyph: 'ring' | 'watch' | 'band' | 'tracker';
  label: Record<Lang, string>;
  blurb: Record<Lang, string>;
  picks: Pick[];
}

const en = (s: string) => s; // readability helper

export const categories: Category[] = [
  {
    slug: 'wearables',
    glyph: 'ring',
    label: { en: 'Wearables & Trackers', de: 'Wearables & Tracker' },
    blurb: {
      en: 'Rings, watches and bands that turn training and recovery into data you can coach with.',
      de: 'Ringe, Uhren und Bänder, die Training und Erholung in Daten verwandeln, mit denen du coachen kannst.',
    },
    picks: [
      { product: 'Oura Ring Gen3', brand: 'Oura', url: 'https://ouraring.com/', affiliate: true, reviewSlug: 'oura-ring-gen3',
        bestFor: { en: 'Sleep & recovery', de: 'Schlaf & Erholung' }, why: { en: 'The most wearable recovery tracker — sleep and readiness without a screen on your wrist.', de: 'Der alltagstauglichste Recovery-Tracker — Schlaf und Readiness ohne Display am Handgelenk.' } },
      { product: 'Whoop 4.0', brand: 'Whoop', url: 'https://www.whoop.com/', affiliate: true, reviewSlug: 'whoop-4',
        bestFor: { en: 'Strain & performance', de: 'Belastung & Leistung' }, why: { en: 'The coach\'s strain-and-recovery band — screenless, built to program by readiness.', de: 'Das Belastungs- und Recovery-Band für Coaches — ohne Display, fürs Programmieren nach Readiness.' } },
      { product: 'Apple Watch Series 9', brand: 'Apple', url: 'https://www.apple.com/apple-watch-series-9/', affiliate: false, reviewSlug: 'apple-watch-9',
        bestFor: { en: 'Everyday smartwatch', de: 'Alltags-Smartwatch' }, why: { en: 'The best all-round smartwatch if your clients live in the Apple ecosystem.', de: 'Die beste Allround-Smartwatch, wenn deine Kund:innen im Apple-Ökosystem leben.' } },
      { product: 'Garmin Forerunner 165', brand: 'Garmin', url: 'https://www.garmin.com/', affiliate: true, reviewSlug: 'garmin-forerunner-165',
        bestFor: { en: 'Runners, best value', de: 'Läufer:innen, Preis-Leistung' }, why: { en: 'Garmin\'s full training metrics at an entry price — the value pick for endurance.', de: 'Garmins volle Trainings-Metriken zum Einstiegspreis — der Preis-Leistungs-Tipp für Ausdauer.' } },
      { product: 'Fitbit Charge 6', brand: 'Fitbit', url: 'https://www.fitbit.com/', affiliate: false, reviewSlug: 'fitbit-charge-6',
        bestFor: { en: 'Affordable all-rounder', de: 'Günstiger Allrounder' }, why: { en: 'The best-value everyday tracker — accurate sensors and ECG for ~€130.', de: 'Der beste Alltags-Tracker fürs Geld — genaue Sensoren und EKG für ~130 €.' } },
      { product: 'Ultrahuman Ring AIR', brand: 'Ultrahuman', url: 'https://www.ultrahuman.com/', affiliate: true,
        bestFor: { en: 'Metabolic + ring fans', de: 'Stoffwechsel + Ring-Fans' }, why: { en: 'Subscription-free smart ring with a metabolic angle (glucose add-on). On our review list.', de: 'Abofreier Smart Ring mit Stoffwechsel-Fokus (Glukose-Add-on). Auf unserer Test-Liste.' } },
    ],
  },
  {
    slug: 'recovery',
    glyph: 'band',
    label: { en: 'Recovery & Massage', de: 'Recovery & Massage' },
    blurb: {
      en: 'Percussion, compression and heat/cold tools that get clients training again sooner.',
      de: 'Percussion-, Kompressions- und Wärme/Kälte-Tools, mit denen Kund:innen schneller wieder trainieren.',
    },
    picks: [
      { product: 'Theragun Prime Plus', brand: 'Therabody', url: 'https://www.therabody.com/', affiliate: true, reviewSlug: 'theragun-prime-plus',
        bestFor: { en: 'Percussion + heat', de: 'Percussion + Wärme' }, why: { en: 'Deep 16mm percussion plus fast heat in a grip you can hold all session.', de: 'Tiefe 16-mm-Percussion plus schnelle Wärme in einem Griff für die ganze Session.' } },
      { product: 'Hyperice Hypervolt / Normatec', brand: 'Hyperice', url: 'https://hyperice.com/', affiliate: true,
        bestFor: { en: 'Compression boots', de: 'Kompressions-Stiefel' }, why: { en: 'Normatec boots are the studio-recovery standard; Hypervolt rivals Theragun. Review coming.', de: 'Normatec-Stiefel sind der Studio-Recovery-Standard; Hypervolt fordert Theragun heraus. Test folgt.' } },
    ],
  },
  {
    slug: 'sleep',
    glyph: 'tracker',
    label: { en: 'Sleep', de: 'Schlaf' },
    blurb: {
      en: 'Temperature, light and sound systems for the most underrated performance lever.',
      de: 'Temperatur-, Licht- und Klang-Systeme für den meistunterschätzten Leistungs-Hebel.',
    },
    picks: [
      { product: 'Eight Sleep Pod 4', brand: 'Eight Sleep', url: 'https://www.eightsleep.com/', affiliate: true, reviewSlug: 'eight-sleep-pod-4',
        bestFor: { en: 'Temperature control', de: 'Temperatur-Steuerung' }, why: { en: 'The most effective sleep-temperature system — dual-zone heating/cooling that works.', de: 'Das wirksamste Schlaf-Temperatursystem — Zwei-Zonen-Heizen/Kühlen, das funktioniert.' } },
      { product: 'Hatch Restore', brand: 'Hatch', url: 'https://www.hatch.co/', affiliate: true,
        bestFor: { en: 'Wind-down & wake', de: 'Runterkommen & Aufwachen' }, why: { en: 'Sunrise alarm + sound for a screen-free wind-down routine. Review coming.', de: 'Sonnenaufgangs-Wecker + Sound für eine bildschirmfreie Abendroutine. Test folgt.' } },
    ],
  },
  {
    slug: 'supplements',
    glyph: 'ring',
    label: { en: 'Supplements & Nutrition', de: 'Supplements & Ernährung' },
    blurb: {
      en: 'Third-party-tested basics worth recommending — protein, creatine, daily essentials.',
      de: 'Laborgeprüfte Basics, die man empfehlen kann — Protein, Kreatin, tägliche Essentials.',
    },
    picks: [
      { product: 'Momentous (Creatine + Protein)', brand: 'Momentous', url: 'https://www.livemomentous.com/', affiliate: true, reviewSlug: 'momentous',
        bestFor: { en: 'NSF-certified basics', de: 'NSF-zertifizierte Basics' }, why: { en: 'Sports-science supplements with NSF/Informed-Sport testing — safe to recommend to tested athletes.', de: 'Sport-Supplements mit NSF/Informed-Sport-Prüfung — bedenkenlos für getestete Athlet:innen.' } },
      { product: 'Ritual Essential', brand: 'Ritual', url: 'https://ritual.com/', affiliate: true,
        bestFor: { en: 'Daily multivitamin', de: 'Tägliches Multivitamin' }, why: { en: 'Transparent, traceable multivitamins — a clean default for general clients. Review coming.', de: 'Transparente, rückverfolgbare Multivitamine — saubere Standardwahl. Test folgt.' } },
      { product: 'Seed DS-01', brand: 'Seed', url: 'https://seed.com/', affiliate: true,
        bestFor: { en: 'Gut health', de: 'Darmgesundheit' }, why: { en: 'Research-backed synbiotic with serious adherence to evidence. Review coming.', de: 'Forschungsbasiertes Synbiotikum mit hohem Evidenz-Anspruch. Test folgt.' } },
      { product: 'David Protein', brand: 'David', url: 'https://davidprotein.com/', affiliate: true,
        bestFor: { en: 'High-protein bar', de: 'High-Protein-Riegel' }, why: { en: '28g protein, near-zero sugar — the buzziest performance bar right now. Review coming.', de: '28 g Protein, fast null Zucker — aktuell der meistdiskutierte Performance-Riegel. Test folgt.' } },
    ],
  },
  {
    slug: 'connected-fitness',
    glyph: 'watch',
    label: { en: 'Connected Fitness & Equipment', de: 'Connected Fitness & Equipment' },
    blurb: {
      en: 'At-home machines and platforms — what actually earns its footprint and subscription.',
      de: 'Heim-Geräte und Plattformen — was Stellfläche und Abo wirklich wert ist.',
    },
    picks: [
      { product: 'Peloton Bike / Tread', brand: 'Peloton', url: 'https://www.onepeloton.com/', affiliate: true,
        bestFor: { en: 'Class experience', de: 'Kurs-Erlebnis' }, why: { en: 'Still the benchmark for connected cardio classes and community. Review coming.', de: 'Weiterhin der Maßstab für vernetzte Cardio-Kurse und Community. Test folgt.' } },
      { product: 'Tonal', brand: 'Tonal', url: 'https://www.tonal.com/', affiliate: true,
        bestFor: { en: 'Strength at home', de: 'Kraft zuhause' }, why: { en: 'Digital cable machine with adaptive resistance — strength in a wall\'s footprint. Review coming.', de: 'Digitale Kabelzug-Maschine mit adaptivem Widerstand — Kraft auf Wandfläche. Test folgt.' } },
      { product: 'Zwift', brand: 'Zwift', url: 'https://www.zwift.com/', affiliate: false,
        bestFor: { en: 'Indoor cycling/running', de: 'Indoor-Cycling/Laufen' }, why: { en: 'The social training platform for turbo trainers and treadmills. Listed on merit.', de: 'Die soziale Trainings-Plattform für Rollentrainer und Laufbänder. Auf Empfehlung gelistet.' } },
    ],
  },
  {
    slug: 'apparel',
    glyph: 'band',
    label: { en: 'Apparel & Footwear', de: 'Bekleidung & Schuhe' },
    blurb: {
      en: 'Training kit and shoes that hold up — for coaches, members and gift guides.',
      de: 'Trainings-Kleidung und Schuhe, die halten — für Coaches, Mitglieder und Geschenk-Guides.',
    },
    picks: [
      { product: 'Gymshark', brand: 'Gymshark', url: 'https://www.gymshark.com/', affiliate: true,
        bestFor: { en: 'Gym apparel', de: 'Gym-Bekleidung' }, why: { en: 'Creator-built gymwear with broad range and strong value. Review coming.', de: 'Creator-Marke für Gymwear mit breitem Sortiment und gutem Preis. Test folgt.' } },
      { product: 'Ten Thousand', brand: 'Ten Thousand', url: 'https://www.tenthousand.cc/', affiliate: true,
        bestFor: { en: 'Training shorts', de: 'Trainings-Shorts' }, why: { en: 'Durability-first men\'s training kit favored by serious lifters. Review coming.', de: 'Langlebige Herren-Trainingskleidung, beliebt bei ambitionierten Lifter:innen. Test folgt.' } },
      { product: 'Alo Yoga', brand: 'Alo Yoga', url: 'https://www.aloyoga.com/', affiliate: true,
        bestFor: { en: 'Yoga & studio', de: 'Yoga & Studio' }, why: { en: 'Studio-to-street apparel with strong brand pull. Review coming.', de: 'Studio-to-Street-Bekleidung mit starker Markenwirkung. Test folgt.' } },
    ],
  },
  {
    slug: 'apps',
    glyph: 'tracker',
    label: { en: 'Training Apps & Software', de: 'Trainings-Apps & Software' },
    blurb: {
      en: 'Logging, programming and coaching apps for athletes and the coaches who guide them.',
      de: 'Apps fürs Tracking, Programmieren und Coaching — für Athlet:innen und ihre Coaches.',
    },
    picks: [
      { product: 'TrainingPeaks', brand: 'TrainingPeaks', url: 'https://www.trainingpeaks.com/', affiliate: true,
        bestFor: { en: 'Endurance coaching', de: 'Ausdauer-Coaching' }, why: { en: 'The standard for structured endurance programming and athlete management. Review coming.', de: 'Der Standard für strukturiertes Ausdauer-Programmieren und Athleten-Management. Test folgt.' } },
      { product: 'Runna', brand: 'Runna', url: 'https://www.runna.com/', affiliate: true,
        bestFor: { en: 'Guided run plans', de: 'Geführte Lauf-Pläne' }, why: { en: 'Personalized run plans that bridge solo runners and coaches. Review coming.', de: 'Personalisierte Lauf-Pläne als Brücke zwischen Solo-Läufer:innen und Coaches. Test folgt.' } },
      { product: 'MyFitnessPal', brand: 'MyFitnessPal', url: 'https://www.myfitnesspal.com/', affiliate: true,
        bestFor: { en: 'Nutrition logging', de: 'Ernährungs-Tracking' }, why: { en: 'The largest food database for clients who track intake. Listed on merit.', de: 'Die größte Lebensmittel-Datenbank fürs Tracking. Auf Empfehlung gelistet.' } },
    ],
  },
  {
    slug: 'studio-tools',
    glyph: 'watch',
    label: { en: 'Coaching & Studio Tools', de: 'Coaching- & Studio-Tools' },
    blurb: {
      en: 'Software that runs a coaching business or studio — booking, payments, client management.',
      de: 'Software, die ein Coaching-Business oder Studio betreibt — Buchung, Zahlungen, Kund:innen.',
    },
    picks: [
      { product: 'PushPress', brand: 'PushPress', url: 'https://www.pushpress.com/', affiliate: false,
        bestFor: { en: 'Gym management', de: 'Gym-Management' }, why: { en: 'Member, billing and check-in management built for independent gyms. Listed on merit — routes to Sqwod OS.', de: 'Mitglieder-, Abrechnungs- und Check-in-Verwaltung für unabhängige Gyms. Auf Empfehlung — führt zu Sqwod OS.' } },
      { product: 'Lenus', brand: 'Lenus', url: 'https://www.lenus.io/', affiliate: false,
        bestFor: { en: 'Coach platform', de: 'Coach-Plattform' }, why: { en: 'All-in-one platform for scaling an online coaching business. Listed on merit.', de: 'All-in-one-Plattform zum Skalieren eines Online-Coaching-Business. Auf Empfehlung gelistet.' } },
      { product: 'ISSA Certification', brand: 'ISSA', url: 'https://www.issaonline.com/', affiliate: true,
        bestFor: { en: 'Trainer certification', de: 'Trainer-Zertifizierung' }, why: { en: 'Widely recognized PT + wellness coaching certifications. Review coming.', de: 'Weit anerkannte PT- + Wellness-Coaching-Zertifizierungen. Test folgt.' } },
    ],
  },
];

export const byCategory = (slug: string) => categories.find((c) => c.slug === slug);
