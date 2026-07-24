// Sqwod Verified — category buyer's guides.
// Truth wins: a pick is either `reviewSlug` (we've tested it → real Sqwod Score
// from the reviews collection) OR an editorial pick (named leader, NO fake score).
// `affiliate: true` = we have / will have a partner program (link labeled + rel=sponsored);
// `affiliate: false` = listed on merit only, plainly linked, clearly "not affiliated".
//
// LINK-INTEGRITY POLICY (2026-07-23) — every Amazon `url` MUST be verified before wiring:
//   1. CONDITION = NEW. Never a "Renewed"/"Refurbished"/"Generalüberholt" ASIN.
//   2. SELLER = Amazon or the brand's own store — NOT a 3rd-party marketplace reseller.
//      (Amazon's buy-box rotates, so re-verify periodically; a plain /dp/<ASIN> can flip to a reseller.)
//   3. PRICE is never hardcoded into the CTA button (see verified/[slug].astro) — it went stale and
//      contradicted the live listing. Price shown on-site is the researched RRP in the value section, dated.
//   4. If no clean NEW + first-party offer exists (e.g. discontinued models), link the brand's own page
//      or the current-gen new listing — never a refurbished/reseller unit.
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
      // NOTE (2026-07-23): Series 9 is discontinued — its only amazon.de buy-box was a REFURBISHED unit from a 3rd-party
      // reseller (CarbonPhone / Amazon Renewed), which violates our "link the brand, not a reseller / new only" rule.
      // Deal now points to the current, NEW, Apple-sold model (Series 11, ASIN B0FQFLMHSX, verified sold-by Apple 2026-07-23).
      { product: 'Apple Watch Series 9', brand: 'Apple', url: 'https://www.amazon.de/dp/B0FQFLMHSX?tag=sqwod-21', affiliate: true, reviewSlug: 'apple-watch-9',
        bestFor: { en: 'Everyday smartwatch', de: 'Alltags-Smartwatch' }, why: { en: 'The best all-round smartwatch if your clients live in the Apple ecosystem.', de: 'Die beste Allround-Smartwatch, wenn deine Kund:innen im Apple-Ökosystem leben.' } },
      // 2026-07-24: switched from reseller-buy-box B0CT3SGHXL (LT-Ecom) to the Amazon-sold listing B0CT3VBDTV (€189, verified sold-by-Amazon).
      { product: 'Garmin Forerunner 165', brand: 'Garmin', url: 'https://www.amazon.de/dp/B0CT3VBDTV?tag=sqwod-21', affiliate: true, reviewSlug: 'garmin-forerunner-165',
        bestFor: { en: 'Runners, best value', de: 'Läufer:innen, Preis-Leistung' }, why: { en: 'Garmin\'s full training metrics at an entry price — the value pick for endurance.', de: 'Garmins volle Trainings-Metriken zum Einstiegspreis — der Preis-Leistungs-Tipp für Ausdauer.' } },
      { product: 'Fitbit Charge 6', brand: 'Fitbit', url: 'https://www.amazon.de/dp/B0CHN3W617?tag=sqwod-21', affiliate: true, reviewSlug: 'fitbit-charge-6',
        bestFor: { en: 'Affordable all-rounder', de: 'Günstiger Allrounder' }, why: { en: 'The best-value everyday tracker — accurate sensors and ECG for ~€130.', de: 'Der beste Alltags-Tracker fürs Geld — genaue Sensoren und EKG für ~130 €.' } },
      { product: 'Oura Ring 5', brand: 'Oura', url: 'https://ouraring.com/', affiliate: true, reviewSlug: 'oura-ring-5',
        bestFor: { en: 'Current-gen recovery ring', de: 'Recovery-Ring, aktuelle Gen' }, why: { en: 'The newest, smallest Oura — the recovery benchmark, now current-gen.', de: 'Der neueste, kleinste Oura — der Recovery-Maßstab, jetzt aktuelle Generation.' } },
      { product: 'Apple Watch Series 11', brand: 'Apple', url: 'https://www.amazon.de/dp/B0FQFLMHSX?tag=sqwod-21', affiliate: true, reviewSlug: 'apple-watch-11',
        bestFor: { en: 'Current-gen smartwatch', de: 'Smartwatch, aktuelle Gen' }, why: { en: 'The current Apple Watch — 24h battery, hypertension alerts, 5G. New, Apple-sold.', de: 'Die aktuelle Apple Watch — 24 h Akku, Bluthochdruck-Hinweise, 5G. Neu, von Apple verkauft.' } },
      { product: 'WHOOP 5.0', brand: 'Whoop', url: 'https://www.whoop.com/', affiliate: true, reviewSlug: 'whoop-5',
        bestFor: { en: 'Current-gen strain band', de: 'Strain-Band, aktuelle Gen' }, why: { en: '14-day battery, ECG + BP on the MG tier — the current screenless recovery band.', de: '14 Tage Akku, EKG + Blutdruck (MG-Tier) — das aktuelle Recovery-Band ohne Display.' } },
      { product: 'Ultrahuman Ring AIR', brand: 'Ultrahuman', url: 'https://www.amazon.de/dp/B0CHF6BZ9H?tag=sqwod-21', affiliate: true, reviewSlug: 'ultrahuman-ring-air',
        bestFor: { en: 'Subscription-free ring', de: 'Abofreier Ring' }, why: { en: 'Oura-class recovery accuracy with no subscription, plus an optional metabolic angle.', de: 'Recovery-Genauigkeit auf Oura-Niveau ohne Abo, plus optionaler Stoffwechsel-Fokus.' } },
      { product: 'Withings ScanWatch 2', brand: 'Withings', url: 'https://www.amazon.de/dp/B0CG6PJLY3?tag=sqwod-21', affiliate: true, reviewSlug: 'withings-scanwatch-2',
        bestFor: { en: 'Hybrid health watch', de: 'Hybrid-Health-Uhr' }, why: { en: 'ECG, SpO2 and ~30-day battery in a classic-looking hybrid — health-first, no GPS.', de: 'EKG, SpO2 und ~30 Tage Akku in einer klassischen Hybrid-Uhr — Gesundheit zuerst, kein GPS.' } },
      { product: 'Garmin Forerunner 965', brand: 'Garmin', url: 'https://www.garmin.com/de-DE/', affiliate: true, reviewSlug: 'garmin-forerunner-965',
        bestFor: { en: 'Premium running/tri', de: 'Premium Laufen/Tri' }, why: { en: 'Garmin\'s near-flagship AMOLED runner — full maps and the complete training suite.', de: 'Garmins Beinahe-Flaggschiff mit AMOLED — volle Karten und die komplette Trainingsanalyse.' } },
      { product: 'COROS PACE 3', brand: 'COROS', url: 'https://www.amazon.de/dp/B0CFQQ9FDL?tag=sqwod-21', affiliate: true, reviewSlug: 'coros-pace-3',
        bestFor: { en: 'Best value GPS', de: 'Beste Preis-Leistung' }, why: { en: 'Featherweight, accurate dual-frequency GPS and huge battery for the money.', de: 'Federleicht, genaues Dual-Frequency-GPS und riesiger Akku fürs Geld.' } },
      { product: 'Polar Vantage V3', brand: 'Polar', url: 'https://www.polar.com/de', affiliate: true, reviewSlug: 'polar-vantage-v3',
        bestFor: { en: 'Multisport sensors', de: 'Multisport-Sensoren' }, why: { en: 'Deep sensor suite (ECG, SpO2) and week-long battery for data-hungry endurance athletes.', de: 'Umfangreiche Sensoren (EKG, SpO2) und Wochen-Akku für datenhungrige Ausdauersportler.' } },
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
      // 2026-07-24: Prime Plus only has a reseller buy-box on Amazon.de (NurFürDich, €359, overpriced). Therabody sells direct on
      // Amazon.de as "TheraGun Europe" but not this SKU — so pointed to brand-direct until a clean first-party Prime Plus listing exists.
      { product: 'Theragun Prime Plus', brand: 'Therabody', url: 'https://www.therabody.com/de/de-de/', affiliate: true, reviewSlug: 'theragun-prime-plus',
        bestFor: { en: 'Percussion + heat', de: 'Percussion + Wärme' }, why: { en: 'Deep 16mm percussion plus fast heat in a grip you can hold all session.', de: 'Tiefe 16-mm-Percussion plus schnelle Wärme in einem Griff für die ganze Session.' } },
      { product: 'Hyperice Hypervolt 2', brand: 'Hyperice', url: 'https://www.amazon.de/dp/B0CVSD725F?tag=sqwod-21', affiliate: true, reviewSlug: 'hyperice-hypervolt-2',
        bestFor: { en: 'Everyday percussion', de: 'Percussion für den Alltag' }, why: { en: 'Quiet, light, app-guided percussion for warm-ups and client recovery.', de: 'Leise, leichte, app-geführte Percussion für Warm-up und Kund:innen-Recovery.' } },
      { product: 'BLACKROLL Standard', brand: 'BLACKROLL', url: 'https://www.amazon.de/dp/B003BP5AGA?tag=sqwod-21', affiliate: true, reviewSlug: 'blackroll-standard',
        bestFor: { en: 'Foam rolling', de: 'Faszienrolle' }, why: { en: 'The German original — durable, medium-firm, physio-trusted foam roller.', de: 'Das deutsche Original — langlebige, mittelfeste, physio-erprobte Faszienrolle.' } },
      { product: 'Hyperice Normatec 3', brand: 'Hyperice', url: 'https://hyperice.com/', affiliate: true, reviewSlug: 'hyperice-normatec-3',
        bestFor: { en: 'Compression recovery', de: 'Kompressions-Recovery' }, why: { en: 'Premium, user-loved pneumatic compression boots — cordless with app control.', de: 'Hochwertige, beliebte Kompressionsstiefel — kabellos mit App-Steuerung.' } },
      { product: 'Compex SP 8.0 Wireless', brand: 'Compex', url: 'https://www.compex.com/de/', affiliate: true, reviewSlug: 'compex-sp-80',
        bestFor: { en: 'Wireless EMS', de: 'Kabelloses EMS' }, why: { en: 'Compex\'s most capable wireless EMS unit — a premium training adjunct.', de: 'Compex\' leistungsstärkstes kabelloses EMS-Gerät — ein Premium-Trainings-Add-on.' } },
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
      { product: 'Eight Sleep Pod 5', brand: 'Eight Sleep', url: 'https://www.eightsleep.com/', affiliate: true, reviewSlug: 'eight-sleep-pod-5',
        bestFor: { en: 'Current-gen temp control', de: 'Temp-Steuerung, aktuelle Gen' }, why: { en: 'The newest Pod — dual-zone heating/cooling plus the hydro blanket.', de: 'Der neueste Pod — Zwei-Zonen-Heizen/Kühlen plus Hydro-Decke.' } },
      { product: 'Muse S Athena', brand: 'Muse', url: 'https://www.amazon.de/dp/B0F4F15WDD?tag=sqwod-21', affiliate: true, reviewSlug: 'muse-s-athena',
        bestFor: { en: 'Meditation & sleep EEG', de: 'Meditation & Schlaf-EEG' }, why: { en: 'EEG + fNIRS headband for objective meditation, focus and sleep biofeedback.', de: 'EEG-+-fNIRS-Stirnband für objektives Biofeedback bei Meditation, Fokus und Schlaf.' } },
      { product: 'Hatch Restore', brand: 'Hatch', url: 'https://www.hatch.co/', affiliate: true,
        bestFor: { en: 'Wind-down & wake', de: 'Runterkommen & Aufwachen' }, why: { en: 'Sunrise alarm + sound for a screen-free wind-down routine. Review coming.', de: 'Sonnenaufgangs-Wecker + Sound für eine bildschirmfreie Abendroutine. Test folgt.' } },
      { product: 'Manta Sleep Mask', brand: 'Manta Sleep', url: 'https://www.amazon.de/dp/B07PRG2CQY?tag=sqwod-21', affiliate: true, reviewSlug: 'manta-sleep-mask',
        bestFor: { en: 'Total blackout', de: 'Komplette Dunkelheit' }, why: { en: 'Genuinely blackout, pressure-free mask that serious sleepers swear by.', de: 'Wirklich lichtdichte, druckfreie Maske, auf die anspruchsvolle Schläfer schwören.' } },
      { product: 'Loop Quiet 2', brand: 'Loop', url: 'https://www.amazon.de/dp/B0D3V4V1KD?tag=sqwod-21', affiliate: true, reviewSlug: 'loop-quiet-2',
        bestFor: { en: 'Reusable earplugs', de: 'Wiederverwendbare Ohrstöpsel' }, why: { en: 'Comfortable 24 dB silicone earplugs — a strong side-sleeper pick.', de: 'Bequeme 24-dB-Silikon-Ohrstöpsel — top für Seitenschläfer.' } },
      { product: 'Philips Somneo HF3650', brand: 'Philips', url: 'https://www.philips.de/', affiliate: true, reviewSlug: 'philips-smartsleep-wakeup',
        bestFor: { en: 'Sunrise wake-up', de: 'Sonnenaufgangs-Wecker' }, why: { en: 'Flagship sunrise-simulation alarm for dark winter mornings.', de: 'Flaggschiff-Lichtwecker mit Sonnenaufgangs-Simulation für dunkle Wintermorgen.' } },
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
      { product: 'Ritual Essential for Women 18+', brand: 'Ritual', url: 'https://ritual.com/', affiliate: true, reviewSlug: 'ritual-essential-women',
        bestFor: { en: 'Daily multivitamin', de: 'Tägliches Multivitamin' }, why: { en: 'Transparent, USP-verified vegan multivitamin — a clean fill-the-gaps default.', de: 'Transparentes, USP-verifiziertes veganes Multivitamin — saubere Lücken-füllen-Wahl.' } },
      { product: 'Seed DS-01', brand: 'Seed', url: 'https://seed.com/', affiliate: true, reviewSlug: 'seed-ds-01',
        bestFor: { en: 'Gut health', de: 'Darmgesundheit' }, why: { en: 'Broad 24-strain synbiotic with an acid-protective capsule and real (if brand-funded) trials.', de: 'Breites 24-Stämme-Synbiotikum mit säureschützender Kapsel und echten (wenn markenfinanzierten) Studien.' } },
      { product: 'David Protein', brand: 'David', url: 'https://davidprotein.com/', affiliate: true,
        bestFor: { en: 'High-protein bar', de: 'High-Protein-Riegel' }, why: { en: '28g protein, near-zero sugar — the buzziest performance bar right now. Review coming.', de: '28 g Protein, fast null Zucker — aktuell der meistdiskutierte Performance-Riegel. Test folgt.' } },
      { product: 'Myprotein Impact Whey', brand: 'Myprotein', url: 'https://www.myprotein.de/', affiliate: true, reviewSlug: 'myprotein-impact-whey',
        bestFor: { en: 'Value whey', de: 'Preis-Leistungs-Whey' }, why: { en: 'The certified ~€30/kg value benchmark — buy it on a discount code.', de: 'Der zertifizierte ~30-€/kg-Preis-Leistungs-Maßstab — mit Rabattcode kaufen.' } },
      { product: 'ESN Designer Whey', brand: 'ESN', url: 'https://www.amazon.de/dp/B004U4WUFU?tag=sqwod-21', affiliate: true, reviewSlug: 'esn-designer-whey',
        bestFor: { en: 'German lab-tested whey', de: 'Deutsches laborgeprüftes Whey' }, why: { en: 'Germany\'s most popular whey — lab-tested quality at a mid-premium price.', de: 'Deutschlands beliebtestes Whey — laborgeprüfte Qualität zum mittleren Premium-Preis.' } },
      { product: 'ESN Ultrapure Creatine', brand: 'ESN', url: 'https://www.amazon.de/dp/B0057ED9AM?tag=sqwod-21', affiliate: true, reviewSlug: 'esn-ultrapure-creatine',
        bestFor: { en: 'Creatine', de: 'Kreatin' }, why: { en: 'Clean, vegan, lab-tested creatine — the most evidence-backed supplement, done right.', de: 'Cleanes, veganes, laborgetestetes Kreatin — das bestbelegte Supplement, richtig gemacht.' } },
      { product: 'Optimum Nutrition Gold Standard', brand: 'Optimum Nutrition', url: 'https://www.amazon.de/dp/B000QSNYGI?tag=sqwod-21', affiliate: true, reviewSlug: 'optimum-nutrition-gold-standard',
        bestFor: { en: 'All-round whey', de: 'Allround-Whey' }, why: { en: 'The genre-defining whey — great mixability and Informed-Choice tested.', de: 'Der Whey-Klassiker — top Löslichkeit und Informed-Choice-getestet.' } },
      { product: 'Maurten GEL 100', brand: 'Maurten', url: 'https://www.maurten.com/', affiliate: true, reviewSlug: 'maurten-gel-100',
        bestFor: { en: 'Race-day fuel', de: 'Wettkampf-Verpflegung' }, why: { en: 'Superbly gut-friendly endurance gel elites swear by (at a premium).', de: 'Extrem magenfreundliches Ausdauer-Gel, auf das Top-Athleten schwören (zum Premiumpreis).' } },
      { product: 'AG1 (Athletic Greens)', brand: 'AG1', url: 'https://drinkag1.com/', affiliate: true, reviewSlug: 'ag1-athletic-greens',
        bestFor: { en: 'Convenience greens', de: 'Greens für unterwegs' }, why: { en: 'Exhaustively tested greens powder — convenient, but premium-priced with thin evidence.', de: 'Ausführlich getestetes Greens-Pulver — praktisch, aber teuer und dünn belegt.' } },
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
      { product: 'Peloton Bike', brand: 'Peloton', url: 'https://www.onepeloton.com/', affiliate: true, reviewSlug: 'peloton-bike',
        bestFor: { en: 'Class experience', de: 'Kurs-Erlebnis' }, why: { en: 'The benchmark for connected cardio classes — worth it if you use the subscription.', de: 'Der Maßstab für vernetzte Cardio-Kurse — lohnt sich, wenn du das Abo nutzt.' } },
      { product: 'Tonal', brand: 'Tonal', url: 'https://www.tonal.com/', affiliate: true,
        bestFor: { en: 'Strength at home', de: 'Kraft zuhause' }, why: { en: 'Digital cable machine with adaptive resistance — strength in a wall\'s footprint. Review coming.', de: 'Digitale Kabelzug-Maschine mit adaptivem Widerstand — Kraft auf Wandfläche. Test folgt.' } },
      { product: 'Zwift', brand: 'Zwift', url: 'https://www.zwift.com/', affiliate: false,
        bestFor: { en: 'Indoor cycling/running', de: 'Indoor-Cycling/Laufen' }, why: { en: 'The social training platform for turbo trainers and treadmills. Listed on merit.', de: 'Die soziale Trainings-Plattform für Rollentrainer und Laufbänder. Auf Empfehlung gelistet.' } },
      { product: 'Wahoo KICKR CORE 2', brand: 'Wahoo', url: 'https://www.wahoofitness.com/', affiliate: true, reviewSlug: 'wahoo-kickr-core',
        bestFor: { en: 'Smart trainer value', de: 'Smart-Trainer Preis-Leistung' }, why: { en: '±2% accurate, quiet direct-drive trainer — near-flagship for mid-tier money.', de: '±2% genauer, leiser Direct-Drive-Trainer — Beinahe-Flaggschiff zum Mittelklassepreis.' } },
      { product: 'Concept2 RowErg', brand: 'Concept2', url: 'https://www.amazon.de/dp/B0CMZJHPZK?tag=sqwod-21', affiliate: true, reviewSlug: 'concept2-rowerg',
        bestFor: { en: 'Indoor rowing', de: 'Indoor-Rudern' }, why: { en: 'The gold-standard erg — near-indestructible with accurate PM5 data.', de: 'Der Goldstandard unter den Ergos — nahezu unkaputtbar mit präzisen PM5-Daten.' } },
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
      { product: 'Gymshark Vital Seamless 2.0', brand: 'Gymshark', url: 'https://www.gymshark.com/', affiliate: true, reviewSlug: 'gymshark-vital-seamless',
        bestFor: { en: 'Gym apparel', de: 'Gym-Bekleidung' }, why: { en: 'Affordable, iconic seamless training staple that ships fast to Germany.', de: 'Bezahlbarer, ikonischer Seamless-Klassiker fürs Training, schnell nach Deutschland geliefert.' } },
      { product: 'Ten Thousand Interval Short', brand: 'Ten Thousand', url: 'https://www.tenthousand.cc/', affiliate: true, reviewSlug: 'ten-thousand-interval-short',
        bestFor: { en: 'Training shorts', de: 'Trainings-Shorts' }, why: { en: 'Durable, high-mobility do-everything short (US-only shipping — see review).', de: 'Langlebige, sehr bewegliche Allround-Short (nur US-Versand — siehe Test).' } },
      { product: 'Alo High-Waist Airlift Legging', brand: 'Alo Yoga', url: 'https://www.aloyoga.com/en-de/', affiliate: true, reviewSlug: 'alo-airlift-legging',
        bestFor: { en: 'Yoga & studio', de: 'Yoga & Studio' }, why: { en: 'Premium, sculpting compression legging with a localized German store.', de: 'Hochwertige, formende Kompressions-Legging mit lokalisiertem deutschen Store.' } },
      { product: 'ASICS Gel-Nimbus 27', brand: 'ASICS', url: 'https://www.asics.com/de/de-de/', affiliate: true, reviewSlug: 'asics-gel-nimbus-27',
        bestFor: { en: 'Max-cushion easy miles', de: 'Max-Cushion für lockere Läufe' }, why: { en: 'Plush, stable max-cushion daily trainer — the value pick on discount.', de: 'Weicher, stabiler Max-Cushion-Alltagsschuh — der Preis-Tipp im Angebot.' } },
      { product: 'Brooks Ghost 18', brand: 'Brooks', url: 'https://www.brooksrunning.com/de_de/', affiliate: true, reviewSlug: 'brooks-ghost-18',
        bestFor: { en: 'Foolproof daily trainer', de: 'Narrensicherer Alltagsschuh' }, why: { en: 'Dependable, durable neutral trainer — safe over spectacular.', de: 'Zuverlässiger, langlebiger Neutralschuh — sicher statt spektakulär.' } },
      { product: 'Nike Pegasus 42', brand: 'Nike', url: 'https://www.nike.com/de/', affiliate: true, reviewSlug: 'nike-pegasus-42',
        bestFor: { en: 'Everyday workhorse', de: 'Alltags-Arbeitstier' }, why: { en: 'Reliable, durable neutral trainer that nails comfort — an average but safe ride.', de: 'Zuverlässiger, langlebiger Neutralschuh mit top Komfort — durchschnittliches, aber sicheres Laufgefühl.' } },
      { product: 'HOKA Clifton 10', brand: 'HOKA', url: 'https://www.hoka.com/de/de/', affiliate: true, reviewSlug: 'hoka-clifton-10',
        bestFor: { en: 'Max-cushion easy days', de: 'Maximale Dämpfung, lockere Tage' }, why: { en: 'A plush, protective max-cushion cruiser for easy miles.', de: 'Ein weicher, schützender Max-Cushion-Cruiser für lockere Kilometer.' } },
      { product: 'On Cloudmonster 2', brand: 'On', url: 'https://www.on.com/de-de/', affiliate: true, reviewSlug: 'on-cloudmonster-2',
        bestFor: { en: 'Firm max-cushion', de: 'Feste Max-Dämpfung' }, why: { en: 'Stable, durable daily trainer with a firm, cushioned roll.', de: 'Stabiler, langlebiger Daily-Trainer mit festem, gedämpftem Abrollen.' } },
      { product: 'Saucony Endorphin Speed 4', brand: 'Saucony', url: 'https://www.saucony.com/', affiliate: true, reviewSlug: 'saucony-endorphin-speed-4',
        bestFor: { en: 'Do-it-all super-trainer', de: 'Allround-Super-Trainer' }, why: { en: 'Versatile nylon-plated trainer — easy days to race day, now a steal.', de: 'Vielseitiger Trainer mit Nylon-Platte — von locker bis Wettkampf, jetzt ein Schnäppchen.' } },
      { product: 'New Balance Fresh Foam X 1080v14', brand: 'New Balance', url: 'https://www.newbalance.de/', affiliate: true, reviewSlug: 'new-balance-1080-v14',
        bestFor: { en: 'Plush daily miles', de: 'Weiche Alltagskilometer' }, why: { en: 'Comfort-first max-cushion daily trainer for easy and recovery runs.', de: 'Komfortorientierter Max-Cushion-Trainer für lockere Läufe und Regeneration.' } },
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
      { product: 'TrainingPeaks', brand: 'TrainingPeaks', url: 'https://www.trainingpeaks.com/', affiliate: true, reviewSlug: 'trainingpeaks',
        bestFor: { en: 'Endurance coaching', de: 'Ausdauer-Coaching' }, why: { en: 'The standard for structured endurance programming and athlete management.', de: 'Der Standard für strukturiertes Ausdauer-Programmieren und Athleten-Management.' } },
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
      { product: 'PushPress', brand: 'PushPress', url: 'https://www.pushpress.com/', affiliate: false, reviewSlug: 'pushpress',
        bestFor: { en: 'Gym management', de: 'Gym-Management' }, why: { en: 'All-in-one gym management with a real free tier — US-focused; routes to Sqwod OS.', de: 'All-in-one-Gym-Management mit echter Gratis-Stufe — US-fokussiert; führt zu Sqwod OS.' } },
      { product: 'Lenus', brand: 'Lenus', url: 'https://www.lenus.io/', affiliate: false,
        bestFor: { en: 'Coach platform', de: 'Coach-Plattform' }, why: { en: 'All-in-one platform for scaling an online coaching business. Listed on merit.', de: 'All-in-one-Plattform zum Skalieren eines Online-Coaching-Business. Auf Empfehlung gelistet.' } },
      { product: 'ISSA Certification', brand: 'ISSA', url: 'https://www.issaonline.com/', affiliate: true,
        bestFor: { en: 'Trainer certification', de: 'Trainer-Zertifizierung' }, why: { en: 'Widely recognized PT + wellness coaching certifications. Review coming.', de: 'Weit anerkannte PT- + Wellness-Coaching-Zertifizierungen. Test folgt.' } },
    ],
  },
];

export const byCategory = (slug: string) => categories.find((c) => c.slug === slug);
