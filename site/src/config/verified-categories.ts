// Sqwod Verified — category buyer's guides.
// Truth wins: a pick is either `reviewSlug` (we've tested it → real Sqwod Score
// from the reviews collection) OR an editorial pick (named leader, NO fake score).
// `affiliate: true` = we have / will have a partner program (link labeled + rel=sponsored);
// `affiliate: false` = listed on merit only, plainly linked, clearly "not affiliated".
//
// AFFILIATE LINK CONVENTION (2026-08-28) — `url` may now be a network tracking link:
//   * Impact  https://<vanity>/c/2210087/<adId>/<campaignId>   (2210087 = Sqwod's Impact partner ID)
//     Deep-link to a specific page by appending ?u=<urlencoded destination>.
//   * Awin    https://www.awin1.com/cread.php?awinmid=<MID>&awinaffid=245789&ued=<encoded url>
//   * Amazon  plain amazon.de /dp/<ASIN> URL with ?tag=sqwod-21
//   Only brands with a LIVE, accepted program get a tracking link. A declined or pending
//   program keeps its plain brand URL — see project memory ref-affiliate-programs.
// AMAZON TAG GAP — TESTED 2026-09-11, mostly NOT worth closing. Shoe ASINs are variant-level
//   (one colour, one size); sports-nutrition buy-boxes are reseller-won; flavour ranges split
//   per ASIN; some picks aren't on amazon.de at all. Leave these on the brand URL and pursue a
//   brand programme instead. Details: project memory ref-amazon-shoe-asins.
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
  /** device type for guide filters (wearables: ring | watch | band) */
  kind?: string;
  /** generation family: picks sharing a family collapse to one row on the guide (highest score leads, tie → current) */
  family?: string;
  /** the generation on sale now; the guide notes the others as "newer" / "older" */
  current?: boolean;
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

// A pick only "earns" when its URL is a real tracking link. `affiliate: true` on a
// plain brand homepage meant readers saw "Affiliate" on 43 links that paid nothing
// (audit 17 Oct 2026). Labels and rel="sponsored" now follow the link itself, so
// swapping in a network link flips the label with no other edit.
// 2026-10-17 programme check: no affiliate programme covers Germany for Brooks, Vuori,
// Gymshark, Compex, Ten Thousand, Tonal, Hatch, Ritual, David, Maurten or NÜOBELL, and
// TrainingPeaks, Runna and MyFitnessPal are software (no SaaS partnerships, Tee's rule
// 2026-07-24). Those picks are `affiliate: false` until a DE programme exists.
export const TRACKED_RX = /pxf\.io|sjv\.io|r7kg\.net|awin1\.com|[?&]tag=sqwod|prf\.hn|tradedoubler|partnerize|impact\.com|clk\./i;
export const earns = (p?: Pick | null) => !!p && p.affiliate && TRACKED_RX.test(p.url);
// The pick behind a review (its /go/ target), and whether that link earns.
export const pickForReview = (slug: string) => { for (const c of categories) { const p = c.picks.find((x) => x.reviewSlug === slug); if (p) return p; } return null; };
export const reviewEarns = (slug: string) => earns(pickForReview(slug));

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
      { product: 'Oura Ring Gen3', brand: 'Oura', kind: 'ring', family: 'oura-ring', url: 'https://ouraring.com/', affiliate: true, reviewSlug: 'oura-ring-gen3',
        bestFor: { en: 'Sleep & recovery', de: 'Schlaf & Erholung' }, why: { en: 'The most wearable recovery tracker: sleep and readiness without a screen on your wrist.', de: 'Der alltagstauglichste Recovery-Tracker: Schlaf und Readiness ohne Display am Handgelenk.' } },
      { product: 'Whoop 4.0', brand: 'Whoop', kind: 'band', family: 'whoop', url: 'https://www.whoop.com/', affiliate: true, reviewSlug: 'whoop-4',
        bestFor: { en: 'Strain & performance', de: 'Belastung & Leistung' }, why: { en: 'The coach\'s strain-and-recovery band: screenless, built to program by readiness.', de: 'Das Belastungs- und Recovery-Band für Coaches, ohne Display, fürs Programmieren nach Readiness.' } },
      // NOTE (2026-07-23): Series 9 is discontinued — its only amazon.de buy-box was a REFURBISHED unit from a 3rd-party
      // reseller (CarbonPhone / Amazon Renewed), which violates our "link the brand, not a reseller / new only" rule.
      // Deal now points to the current, NEW, Apple-sold model (Series 11, ASIN B0FQFLMHSX, verified sold-by Apple 2026-07-23).
      { product: 'Apple Watch Series 9', brand: 'Apple', kind: 'watch', family: 'apple-watch', url: 'https://www.amazon.de/dp/B0FQFLMHSX?tag=sqwod-21', affiliate: true, reviewSlug: 'apple-watch-9',
        bestFor: { en: 'Everyday smartwatch', de: 'Alltags-Smartwatch' }, why: { en: 'The best all-round smartwatch if your clients live in the Apple ecosystem.', de: 'Die beste Allround-Smartwatch, wenn deine Kund:innen im Apple-Ökosystem leben.' } },
      // 2026-07-24: switched from reseller-buy-box B0CT3SGHXL (LT-Ecom) to the Amazon-sold listing B0CT3VBDTV (€189, verified sold-by-Amazon).
      { product: 'Garmin Forerunner 165', brand: 'Garmin', kind: 'watch', family: 'forerunner-1xx', url: 'https://www.amazon.de/dp/B0CT3VBDTV?tag=sqwod-21', affiliate: true, reviewSlug: 'garmin-forerunner-165',
        bestFor: { en: 'Runners, best value', de: 'Läufer:innen, Preis-Leistung' }, why: { en: 'Garmin\'s full training metrics at an entry price: the value pick for endurance.', de: 'Garmins volle Trainings-Metriken zum Einstiegspreis: der Preis-Leistungs-Tipp für Ausdauer.' } },
      { product: 'Garmin Forerunner 170', brand: 'Garmin', kind: 'watch', family: 'forerunner-1xx', current: true, url: 'https://www.garmin.com/de-DE/', affiliate: true, reviewSlug: 'garmin-forerunner-170',
        bestFor: { en: 'Runners, best value', de: 'Läufer:innen, Preis-Leistung' }, why: { en: 'Training Readiness, running power and Garmin Pay now at the entry price.', de: 'Training Readiness, Laufleistung und Garmin Pay jetzt zum Einstiegspreis.' } },
      { product: 'Fitbit Charge 6', brand: 'Fitbit', kind: 'band', current: true, url: 'https://www.amazon.de/dp/B0CHN3W617?tag=sqwod-21', affiliate: true, reviewSlug: 'fitbit-charge-6',
        bestFor: { en: 'Affordable all-rounder', de: 'Günstiger Allrounder' }, why: { en: 'The best-value everyday tracker: accurate sensors and ECG for ~€130.', de: 'Der beste Alltags-Tracker fürs Geld: genaue Sensoren und EKG für ~130 €.' } },
      { product: 'Oura Ring 5', brand: 'Oura', kind: 'ring', family: 'oura-ring', current: true, url: 'https://ouraring.com/', affiliate: true, reviewSlug: 'oura-ring-5',
        bestFor: { en: 'Current-gen recovery ring', de: 'Recovery-Ring, aktuelle Gen' }, why: { en: 'The newest, smallest Oura: the recovery benchmark, now current-gen.', de: 'Der neueste, kleinste Oura: der Recovery-Maßstab, jetzt aktuelle Generation.' } },
      { product: 'Apple Watch Series 11', brand: 'Apple', kind: 'watch', family: 'apple-watch', url: 'https://www.amazon.de/dp/B0FQFLMHSX?tag=sqwod-21', affiliate: true, reviewSlug: 'apple-watch-11',
        bestFor: { en: 'Previous Series, often discounted', de: 'Vorgänger, oft reduziert' }, why: { en: '24h battery, hypertension alerts, 5G. Series 12 is now out; we have not scored it yet.', de: '24 h Akku, Bluthochdruck-Hinweise, 5G. Die Series 12 ist inzwischen da; sie ist noch nicht bewertet.' } },
      { product: 'Apple Watch Series 12', brand: 'Apple', kind: 'watch', family: 'apple-watch', current: true, url: 'https://www.apple.com/de/watch/', affiliate: true, reviewSlug: 'apple-watch-12',
        bestFor: { en: 'Latest Apple Watch we scored', de: 'Neueste von uns bewertete Apple Watch' }, why: { en: 'Current Series: heart rate every five seconds, daily Readiness and near-chest-strap accuracy.', de: 'Die aktuelle Series: Puls alle fünf Sekunden, täglicher Readiness-Wert und fast Brustgurt-Genauigkeit.' } },
      { product: 'WHOOP 5.0', brand: 'Whoop', kind: 'band', family: 'whoop', current: true, url: 'https://www.whoop.com/', affiliate: true, reviewSlug: 'whoop-5',
        bestFor: { en: 'Current-gen strain band', de: 'Strain-Band, aktuelle Gen' }, why: { en: '14-day battery, ECG + BP on the MG tier: the current screenless recovery band.', de: '14 Tage Akku, EKG + Blutdruck (MG-Tier): das aktuelle Recovery-Band ohne Display.' } },
      { product: 'Ultrahuman Ring AIR', brand: 'Ultrahuman', kind: 'ring', current: true, url: 'https://ultrahumanhealthcare.pxf.io/c/2210087/3981492/38784', affiliate: true, reviewSlug: 'ultrahuman-ring-air',
        bestFor: { en: 'Subscription-free ring', de: 'Abofreier Ring' }, why: { en: 'Oura-class recovery accuracy with no subscription, plus an optional metabolic angle.', de: 'Recovery-Genauigkeit auf Oura-Niveau ohne Abo, plus optionaler Stoffwechsel-Fokus.' } },
      { product: 'Withings ScanWatch 2', brand: 'Withings', kind: 'watch', current: true, url: 'https://www.amazon.de/dp/B0CG6PJLY3?tag=sqwod-21', affiliate: true, reviewSlug: 'withings-scanwatch-2',
        bestFor: { en: 'Hybrid health watch', de: 'Hybrid-Health-Uhr' }, why: { en: 'ECG, SpO2 and ~30-day battery in a classic-looking hybrid: health-first, no GPS.', de: 'EKG, SpO2 und ~30 Tage Akku in einer klassischen Hybrid-Uhr: Gesundheit zuerst, kein GPS.' } },
      { product: 'Garmin Forerunner 965', brand: 'Garmin', kind: 'watch', family: 'forerunner-9xx', url: 'https://www.garmin.com/de-DE/', affiliate: true, reviewSlug: 'garmin-forerunner-965',
        bestFor: { en: 'Premium running/tri', de: 'Premium Laufen/Tri' }, why: { en: 'Garmin\'s near-flagship AMOLED runner: full maps and the complete training suite.', de: 'Garmins Beinahe-Flaggschiff mit AMOLED: volle Karten und die komplette Trainingsanalyse.' } },
      { product: 'Garmin Forerunner 970', brand: 'Garmin', kind: 'watch', family: 'forerunner-9xx', current: true, url: 'https://www.garmin.com/de-DE/', affiliate: true, reviewSlug: 'garmin-forerunner-970',
        bestFor: { en: 'Premium running/tri', de: 'Premium Laufen/Tri' }, why: { en: 'The most complete Forerunner: ECG, flashlight, Gen 5 heart-rate sensor and new load tools.', de: 'Die kompletteste Forerunner: EKG, Taschenlampe, Gen-5-Pulssensor und neue Belastungs-Tools.' } },
      { product: 'COROS PACE 3', brand: 'COROS', kind: 'watch', family: 'coros-pace', url: 'https://www.amazon.de/dp/B0CFQQ9FDL?tag=sqwod-21', affiliate: true, reviewSlug: 'coros-pace-3',
        bestFor: { en: 'Best value GPS', de: 'Beste Preis-Leistung' }, why: { en: 'Featherweight, accurate dual-frequency GPS and huge battery for the money.', de: 'Federleicht, genaues Dual-Frequency-GPS und riesiger Akku fürs Geld.' } },
      { product: 'COROS PACE 4', brand: 'COROS', kind: 'watch', family: 'coros-pace', current: true, url: 'https://www.coros.com/', affiliate: true, reviewSlug: 'coros-pace-4',
        bestFor: { en: 'Best value GPS', de: 'Beste Preis-Leistung' }, why: { en: 'The PACE formula with an AMOLED screen: ultralight, accurate GPS, up to 19 days of battery.', de: 'Das PACE-Rezept mit AMOLED: ultraleicht, genaues GPS, bis zu 19 Tage Akku.' } },
      { product: 'Polar Vantage V3', brand: 'Polar', kind: 'watch', current: true, url: 'https://www.polar.com/de', affiliate: true, reviewSlug: 'polar-vantage-v3',
        bestFor: { en: 'Multisport sensors', de: 'Multisport-Sensoren' }, why: { en: 'Deep sensor suite (ECG, SpO2) and week-long battery for data-hungry endurance athletes.', de: 'Umfangreiche Sensoren (EKG, SpO2) und Wochen-Akku für datenhungrige Ausdauersportler.' } },
      { product: 'RingConn Gen 2', brand: 'RingConn', kind: 'ring', family: 'ringconn', url: 'https://de.ringconn.com/', affiliate: true, reviewSlug: 'ringconn-gen-2',
        bestFor: { en: 'Subscription-free smart ring', de: 'Smart Ring ohne Abo' }, why: { en: 'Every metric free forever, 10–12 day battery and a ~150-day charging case: the no-subscription pick.', de: 'Alle Werte für immer gratis, 10–12 Tage Akku und ~150-Tage-Case: die Wahl ohne Abo.' } },
      { product: 'RingConn Gen 3', brand: 'RingConn', kind: 'ring', family: 'ringconn', current: true, url: 'https://de.ringconn.com/', affiliate: true, reviewSlug: 'ringconn-gen-3',
        bestFor: { en: 'Subscription-free smart ring', de: 'Smart Ring ohne Abo' }, why: { en: 'Still no subscription, now up to 14 days per charge and a universal charging case.', de: 'Weiterhin ohne Abo, jetzt bis zu 14 Tage pro Ladung und ein universelles Ladecase.' } },
      { product: 'Suunto Race', brand: 'Suunto', kind: 'watch', family: 'suunto-race', url: 'https://suunto.pxf.io/c/2210087/3998915/35454', affiliate: true, reviewSlug: 'suunto-race',
        bestFor: { en: 'Value dual-band GPS watch', de: 'Preis-Leistungs-GPS-Uhr' }, why: { en: 'Dual-band GPS, AMOLED and offline maps with ~26-day battery: Garmin features for far less.', de: 'Dual-Band-GPS, AMOLED und Offline-Karten mit ~26 Tagen Akku: Garmin-Features für deutlich weniger.' } },
      { product: 'Suunto Race 2', brand: 'Suunto', kind: 'watch', family: 'suunto-race', current: true, url: 'https://suunto.pxf.io/c/2210087/3998915/35454', affiliate: true, reviewSlug: 'suunto-race-2',
        bestFor: { en: 'Multisport, dual-band GPS', de: 'Multisport, Dualband-GPS' }, why: { en: 'Dual-band GPS, free offline maps and a huge battery, now with much better wrist heart rate.', de: 'Dualband-GPS, kostenlose Offline-Karten und riesiger Akku, jetzt mit deutlich besserem Handgelenkpuls.' } },
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
      { product: 'Theragun Prime Plus', brand: 'Therabody', kind: 'gun', url: 'https://www.therabody.com/de/de-de/', affiliate: true, reviewSlug: 'theragun-prime-plus',
        bestFor: { en: 'Percussion + heat', de: 'Percussion + Wärme' }, why: { en: 'Deep 16mm percussion plus fast heat in a grip you can hold all session.', de: 'Tiefe 16-mm-Percussion plus schnelle Wärme in einem Griff für die ganze Session.' } },
      { product: 'Hyperice Hypervolt 2', brand: 'Hyperice', kind: 'gun', url: 'https://www.amazon.de/dp/B0CVSD725F?tag=sqwod-21', affiliate: true, reviewSlug: 'hyperice-hypervolt-2',
        bestFor: { en: 'Everyday percussion', de: 'Percussion für den Alltag' }, why: { en: 'Quiet, light, app-guided percussion for warm-ups and client recovery.', de: 'Leise, leichte, app-geführte Percussion für Warm-up und Kund:innen-Recovery.' } },
      // 2026-11-25: Hyperice DE via Awin (MID 25773, publisher 245789, 10%), link from Michael Ricatto 14 Nov. Hypervolt 2 and Go 2
      // are no longer sold on hyperice.com/de-de (404), so those two stay on the Amazon listing sold by Hyperice.
      { product: 'Hyperice Hypervolt 3', brand: 'Hyperice', kind: 'gun', url: 'https://www.awin1.com/cread.php?awinmid=25773&awinaffid=245789&ued=https%3A%2F%2Fhyperice.com%2Fde-de%2Fproducts%2Fhypervolt-3', affiliate: true, reviewSlug: 'hyperice-hypervolt-3',
        bestFor: { en: 'Quiet, app-guided gun', de: 'Leise, app-geführte Pistole' }, why: { en: 'Five speeds, pressure sensor and a heated head; now €199.', de: 'Fünf Stufen, Drucksensor und Wärmeaufsatz; jetzt 199 €.' } },
      { product: 'BLACKROLL Fascia Gun', brand: 'BLACKROLL', kind: 'gun', url: 'https://www.amazon.de/dp/B09HV3329D?tag=sqwod-21', affiliate: true, reviewSlug: 'blackroll-fascia-gun',
        bestFor: { en: 'Best-tested in Germany', de: 'In Deutschland am besten getestet' }, why: { en: 'Stiftung Warentest 07/2024 winner of 11 guns: small, gentle, easy to hold.', de: 'Testsieger Stiftung Warentest 07/2024 von 11 Pistolen: klein, sanft, gut zu halten.' } },
      { product: 'Bob and Brad Q2 Pro', brand: 'Bob and Brad', kind: 'gun', url: 'https://www.amazon.de/dp/B0D16W8531?tag=sqwod-21', affiliate: true, reviewSlug: 'bob-and-brad-q2-pro',
        bestFor: { en: 'Travel gun with heat & cold', de: 'Reise-Pistole mit Wärme & Kälte' }, why: { en: 'Pocket-size, 4.7★ across 14,000+ Amazon.de ratings, about €80.', de: 'Taschenformat, 4,7★ bei über 14.000 Amazon.de-Bewertungen, rund 80 €.' } },
      { product: 'RENPHO Massage Gun (R3)', brand: 'RENPHO', kind: 'gun', url: 'https://www.amazon.de/dp/B085NTR26K?tag=sqwod-21', affiliate: true, reviewSlug: 'renpho-massage-gun',
        bestFor: { en: 'Best value gun', de: 'Beste Preis-Leistung' }, why: { en: '35,000+ ratings, 0.68 kg, about €65. Not lab-tested.', de: 'Über 35.000 Bewertungen, 0,68 kg, rund 65 €. Nicht laborgeprüft.' } },
      { product: 'Hyperice Hypervolt Go 2', brand: 'Hyperice', kind: 'gun', url: 'https://www.amazon.de/dp/B0CDMX8QBZ?tag=sqwod-21', affiliate: true, reviewSlug: 'hyperice-hypervolt-go-2',
        bestFor: { en: 'Quiet mini gun', de: 'Leise Mini-Pistole' }, why: { en: 'Whisper-quiet and pocketable at €99 now the Go 3 is out.', de: 'Flüsterleise und taschentauglich für 99 €, seit die Go 3 da ist.' } },
      { product: 'BLACKROLL Standard', brand: 'BLACKROLL', kind: 'roller', url: 'https://www.amazon.de/dp/B003BP5AGA?tag=sqwod-21', affiliate: true, reviewSlug: 'blackroll-standard',
        bestFor: { en: 'Foam rolling', de: 'Faszienrolle' }, why: { en: 'The German original: durable, medium-firm, physio-trusted foam roller.', de: 'Das deutsche Original: langlebige, mittelfeste, physio-erprobte Faszienrolle.' } },
      { product: 'BLACKROLL Blackbox Set', brand: 'BLACKROLL', kind: 'roller', url: 'https://www.amazon.de/dp/B016D5QDAQ?tag=sqwod-21', affiliate: true, reviewSlug: 'blackroll-blackbox-set',
        bestFor: { en: 'Complete roller kit', de: 'Komplettes Rollen-Set' }, why: { en: 'Standard roller, mini roller, DUOBALL and ball for about €43.', de: 'Standardrolle, Mini-Rolle, DUOBALL und Ball für rund 43 €.' } },
      { product: 'Liebscher & Bracht Fascia Roller + Ball Set', brand: 'Liebscher & Bracht', kind: 'roller', url: 'https://www.amazon.de/dp/B01BVTWXFI?tag=sqwod-21', affiliate: true, reviewSlug: 'liebscher-bracht-fascia-set',
        bestFor: { en: 'Softer start', de: 'Sanfter Einstieg' }, why: { en: 'Soft surface over a firm core; 10,700+ ratings at 4.6★.', de: 'Weiche Oberfläche über festem Kern; über 10.700 Bewertungen mit 4,6★.' } },
      { product: 'BLACKROLL DUOBALL', brand: 'BLACKROLL', kind: 'roller', url: 'https://www.amazon.de/dp/B08P1SCSJW?tag=sqwod-21', affiliate: true, reviewSlug: 'blackroll-duoball',
        bestFor: { en: 'Upper back & spine', de: 'Oberer Rücken & Wirbelsäule' }, why: { en: 'Peanut shape works either side of the spine; pricey alone.', de: 'Erdnussform für beide Seiten der Wirbelsäule; einzeln teuer.' } },
      { product: 'Hyperice Vyper 3', brand: 'Hyperice', kind: 'roller', url: 'https://www.awin1.com/cread.php?awinmid=25773&awinaffid=245789&ued=https%3A%2F%2Fhyperice.com%2Fde-de%2Fproducts%2Fvyper-3', affiliate: true, reviewSlug: 'hyperice-vyper-3',
        bestFor: { en: 'Vibrating roller', de: 'Vibrierende Rolle' }, why: { en: 'Makes firm rolling easier to tolerate; €159.', de: 'Macht festes Rollen erträglicher; 159 €.' } },
      { product: 'Hyperice Normatec 3', brand: 'Hyperice', kind: 'compression', url: 'https://www.awin1.com/cread.php?awinmid=25773&awinaffid=245789&ued=https%3A%2F%2Fhyperice.com%2Fde-de%2Fproducts%2Fnormatec-3-legs', affiliate: true, reviewSlug: 'hyperice-normatec-3',
        bestFor: { en: 'Compression recovery', de: 'Kompressions-Recovery' }, why: { en: 'Premium, user-loved pneumatic compression boots: cordless with app control.', de: 'Hochwertige, beliebte Kompressionsstiefel: kabellos mit App-Steuerung.' } },
      { product: 'Compex SP 8.0 Wireless', brand: 'Compex', kind: 'ems', url: 'https://www.compex.com/de/', affiliate: false, reviewSlug: 'compex-sp-80',
        bestFor: { en: 'Wireless EMS', de: 'Kabelloses EMS' }, why: { en: 'Compex\'s most capable wireless EMS unit: a premium training adjunct.', de: 'Compex\' leistungsstärkstes kabelloses EMS-Gerät: ein Premium-Trainings-Add-on.' } },
      { product: 'Pulsetto', brand: 'Pulsetto', kind: 'nerve', url: 'https://eu.pulsetto.tech/', affiliate: true, reviewSlug: 'pulsetto-vagus',
        bestFor: { en: 'Vagus-nerve relaxation', de: 'Vagusnerv-Entspannung' }, why: { en: 'A hands-free, well-loved relaxation aid at half the price of rivals: a low-risk try (see our honest evidence note).', de: 'Freihändige, beliebte Entspannungshilfe zum halben Preis der Rivalen: ein risikoarmer Versuch (siehe ehrliche Studien-Einordnung).' } },
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
      { product: 'Eight Sleep Pod 4', brand: 'Eight Sleep', kind: 'bed', family: 'eight-sleep-pod', url: 'https://www.eightsleep.com/', affiliate: true, reviewSlug: 'eight-sleep-pod-4',
        bestFor: { en: 'Temperature control', de: 'Temperatur-Steuerung' }, why: { en: 'The most effective sleep-temperature system: dual-zone heating/cooling that works.', de: 'Das wirksamste Schlaf-Temperatursystem: Zwei-Zonen-Heizen/Kühlen, das funktioniert.' } },
      { product: 'Eight Sleep Pod 5', brand: 'Eight Sleep', kind: 'bed', family: 'eight-sleep-pod', url: 'https://www.eightsleep.com/', affiliate: false, reviewSlug: 'eight-sleep-pod-5',
        bestFor: { en: 'Previous Pod', de: 'Vorheriger Pod' }, why: { en: 'Dual-zone heating and cooling plus the hydro blanket. Replaced by Pod 6 in September 2026.', de: 'Zwei-Zonen-Heizen und -Kühlen plus Hydro-Decke. Im September 2026 vom Pod 6 abgelöst.' } },
      { product: 'Eight Sleep Pod 6', brand: 'Eight Sleep', kind: 'bed', family: 'eight-sleep-pod', current: true, url: 'https://www.eightsleep.com/de/product/pod-cover/', affiliate: false, reviewSlug: 'eight-sleep-pod-6',
        bestFor: { en: 'Current Pod', de: 'Aktueller Pod' }, why: { en: 'The strongest bed cooling we have reviewed, now in a single size from €2,199. Autopilot (from €199/yr) is required.', de: 'Die stärkste Bettkühlung, die wir bewertet haben, jetzt auch als Einzelbett ab 2.199 €. Autopilot (ab 199 €/Jahr) ist Pflicht.' } },
      { product: 'Muse S Athena', brand: 'Muse', kind: 'eeg', url: 'https://www.amazon.de/dp/B0F4F15WDD?tag=sqwod-21', affiliate: true, reviewSlug: 'muse-s-athena',
        bestFor: { en: 'Meditation & sleep EEG', de: 'Meditation & Schlaf-EEG' }, why: { en: 'EEG + fNIRS headband for objective meditation, focus and sleep biofeedback.', de: 'EEG-+-fNIRS-Stirnband für objektives Biofeedback bei Meditation, Fokus und Schlaf.' } },
      { product: 'Hatch Restore', brand: 'Hatch', url: 'https://www.hatch.co/', affiliate: false,
        bestFor: { en: 'Wind-down & wake', de: 'Runterkommen & Aufwachen' }, why: { en: 'Sunrise alarm + sound for a screen-free wind-down routine. Review coming.', de: 'Sonnenaufgangs-Wecker + Sound für eine bildschirmfreie Abendroutine. Bewertung folgt.' } },
      { product: 'Manta Sleep Mask', brand: 'Manta Sleep', kind: 'mask', url: 'https://mantasleep.pxf.io/c/2210087/4019676/41195', affiliate: true, reviewSlug: 'manta-sleep-mask',
        bestFor: { en: 'Total blackout', de: 'Komplette Dunkelheit' }, why: { en: 'Genuinely blackout, pressure-free mask that serious sleepers swear by.', de: 'Wirklich lichtdichte, druckfreie Maske, auf die anspruchsvolle Schläfer schwören.' } },
      { product: 'Gritin 3D Sleep Mask', brand: 'Gritin', kind: 'mask', url: 'https://www.amazon.de/dp/B0CRYX3FCZ?tag=sqwod-21', affiliate: true, reviewSlug: 'gritin-3d-sleep-mask',
        bestFor: { en: 'Best budget mask', de: 'Beste günstige Maske' }, why: { en: '4.7★ across 15,000+ ratings, side-sleeper shape, under €9.', de: '4,7★ bei über 15.000 Bewertungen, für Seitenschlaf geformt, unter 9 €.' } },
      { product: 'MyHalos 3D Sleep Mask', brand: 'MyHalos', kind: 'mask', url: 'https://www.amazon.de/dp/B09CZ68WV3?tag=sqwod-21', affiliate: true, reviewSlug: 'myhalos-3d-sleep-mask',
        bestFor: { en: 'Most popular mask', de: 'Beliebteste Maske' }, why: { en: '27,000+ ratings; contoured cups keep pressure off the eyes.', de: 'Über 27.000 Bewertungen; geformte Schalen ohne Druck auf die Augen.' } },
      { product: 'Loop Eclipse Sleep Mask', brand: 'Loop', kind: 'mask', url: 'https://www.amazon.de/dp/B0H3V1J9MD?tag=sqwod-21', affiliate: true, reviewSlug: 'loop-eclipse-sleep-mask',
        bestFor: { en: 'Premium mask upgrade', de: 'Premium-Upgrade' }, why: { en: 'Opaque fabric and movable eye pads; €39.95.', de: 'Lichtdichter Stoff und verstellbare Augenpolster; 39,95 €.' } },
      { product: 'Loop Quiet 2', brand: 'Loop', kind: 'earplugs', url: 'https://www.amazon.de/dp/B0D3V4V1KD?tag=sqwod-21', affiliate: true, reviewSlug: 'loop-quiet-2',
        bestFor: { en: 'Reusable earplugs', de: 'Wiederverwendbare Ohrstöpsel' }, why: { en: 'Comfortable 24 dB silicone earplugs: a strong side-sleeper pick.', de: 'Bequeme 24-dB-Silikon-Ohrstöpsel: top für Seitenschläfer.' } },
      { product: 'OHROPAX Good Night (silicone)', brand: 'OHROPAX', kind: 'earplugs', url: 'https://www.amazon.de/dp/B0FNCMSDPV?tag=sqwod-21', affiliate: true, reviewSlug: 'ohropax-good-night',
        bestFor: { en: 'Most comfortable earplugs', de: 'Bequemste Ohrstöpsel' }, why: { en: 'Mouldable silicone seals over the ear, nothing inside the canal.', de: 'Formbares Silikon dichtet außen ab, nichts im Gehörgang.' } },
      { product: 'Alpine SleepDeep', brand: 'Alpine', kind: 'earplugs', url: 'https://www.amazon.de/dp/B0B9CDC567?tag=sqwod-21', affiliate: true, reviewSlug: 'alpine-sleepdeep',
        bestFor: { en: 'Budget reusable earplugs', de: 'Günstige wiederverwendbare Ohrstöpsel' }, why: { en: 'About €12 and reusable; get the size right.', de: 'Rund 12 € und wiederverwendbar; die Größe muss stimmen.' } },
      { product: 'Loop Dream', brand: 'Loop', kind: 'earplugs', url: 'https://www.amazon.de/dp/B0FBMLPWSV?tag=sqwod-21', affiliate: true, reviewSlug: 'loop-dream',
        bestFor: { en: 'Maximum blocking', de: 'Maximale Dämpfung' }, why: { en: '27 dB, but rated below the Quiet 2. Try the Quiet 2 first.', de: '27 dB, aber schlechter bewertet als der Quiet 2. Erst den Quiet 2 probieren.' } },
      { product: 'Philips SmartSleep (Somneo) HF3650', brand: 'Philips', kind: 'light', url: 'https://www.philips.de/', affiliate: true, reviewSlug: 'philips-smartsleep-wakeup',
        bestFor: { en: 'Sunrise wake-up', de: 'Sonnenaufgangs-Wecker' }, why: { en: 'Flagship sunrise-simulation alarm for dark winter mornings.', de: 'Flaggschiff-Lichtwecker mit Sonnenaufgangs-Simulation für dunkle Wintermorgen.' } },
    ],
  },
  {
    slug: 'supplements',
    glyph: 'ring',
    label: { en: 'Supplements & Nutrition', de: 'Supplements & Ernährung' },
    blurb: {
      en: 'Third-party-tested basics worth recommending: protein, creatine, daily essentials.',
      de: 'Laborgeprüfte Basics, die man empfehlen kann: Protein, Kreatin, tägliche Essentials.',
    },
    picks: [
      { product: 'Momentous (Creatine + Protein)', brand: 'Momentous', kind: 'basics', url: 'https://www.livemomentous.com/', affiliate: true, reviewSlug: 'momentous',
        bestFor: { en: 'NSF-certified basics', de: 'NSF-zertifizierte Basics' }, why: { en: 'Sports-science supplements with NSF/Informed-Sport testing: safe to recommend to tested athletes.', de: 'Sport-Supplements mit NSF/Informed-Sport-Prüfung: bedenkenlos für getestete Athlet:innen.' } },
      { product: 'Ritual Essential for Women 18+', brand: 'Ritual', kind: 'multi', url: 'https://ritual.com/', affiliate: false, reviewSlug: 'ritual-essential-women',
        bestFor: { en: 'Daily multivitamin', de: 'Tägliches Multivitamin' }, why: { en: 'Transparent, USP-verified vegan multivitamin: a clean fill-the-gaps default.', de: 'Transparentes, USP-verifiziertes veganes Multivitamin: saubere Lücken-füllen-Wahl.' } },
      { product: 'Seed DS-01', brand: 'Seed', kind: 'probiotic', url: 'https://seed.com/', affiliate: true, reviewSlug: 'seed-ds-01',
        bestFor: { en: 'Gut health', de: 'Darmgesundheit' }, why: { en: 'Broad 24-strain synbiotic with an acid-protective capsule and real (if brand-funded) trials.', de: 'Breites 24-Stämme-Synbiotikum mit säureschützender Kapsel und echten (wenn markenfinanzierten) Studien.' } },
      { product: 'David Protein', brand: 'David', url: 'https://davidprotein.com/', affiliate: false,
        bestFor: { en: 'High-protein bar', de: 'High-Protein-Riegel' }, why: { en: '28g protein, near-zero sugar: the buzziest performance bar right now. Review coming.', de: '28 g Protein, fast null Zucker: aktuell der meistdiskutierte Performance-Riegel. Bewertung folgt.' } },
      { product: 'Myprotein Impact Whey', brand: 'Myprotein', kind: 'protein', url: 'https://www.myprotein.de/', affiliate: true, reviewSlug: 'myprotein-impact-whey',
        bestFor: { en: 'Value whey', de: 'Preis-Leistungs-Whey' }, why: { en: 'The certified ~€30/kg value benchmark: buy it on a discount code.', de: 'Der zertifizierte ~30-€/kg-Preis-Leistungs-Maßstab, mit Rabattcode kaufen.' } },
      { product: 'ESN Designer Whey', brand: 'ESN', kind: 'protein', url: 'https://www.amazon.de/dp/B004U4WUFU?tag=sqwod-21', affiliate: true, reviewSlug: 'esn-designer-whey',
        bestFor: { en: 'German lab-tested whey', de: 'Deutsches laborgeprüftes Whey' }, why: { en: 'Germany\'s most popular whey: lab-tested quality at a mid-premium price.', de: 'Deutschlands beliebtestes Whey: laborgeprüfte Qualität zum mittleren Premium-Preis.' } },
      { product: 'ESN Ultrapure Creatine', brand: 'ESN', kind: 'creatine', url: 'https://www.amazon.de/dp/B0057ED9AM?tag=sqwod-21', affiliate: true, reviewSlug: 'esn-ultrapure-creatine',
        bestFor: { en: 'Creatine', de: 'Kreatin' }, why: { en: 'Clean, vegan, lab-tested creatine: the most evidence-backed supplement, done right.', de: 'Cleanes, veganes, laborgetestetes Kreatin: das bestbelegte Supplement, richtig gemacht.' } },
      { product: 'Optimum Nutrition Micronised Creatine', brand: 'Optimum Nutrition', kind: 'creatine', url: 'https://www.amazon.de/dp/B00T7L20EC?tag=sqwod-21', affiliate: true, reviewSlug: 'optimum-nutrition-micronised-creatine',
        bestFor: { en: 'Best all-round creatine', de: 'Bestes Allround-Kreatin' }, why: { en: 'Informed Sport certified at about 12 cents a serving: the one to recommend to anyone.', de: 'Informed-Sport-zertifiziert für rund 12 Cent pro Portion: das eine, das man allen empfehlen kann.' } },
      { product: 'Bulk Creatine Monohydrate', brand: 'Bulk', kind: 'creatine', url: 'https://www.amazon.de/dp/B00SP2ZKW8?tag=sqwod-21', affiliate: true, reviewSlug: 'bulk-creatine-monohydrate',
        bestFor: { en: 'Cheapest effective creatine', de: 'Günstigstes wirksames Kreatin' }, why: { en: 'About 7 cents a dose, sold by Amazon. No banned-substance certificate, so not for tested athletes.', de: 'Rund 7 Cent pro Dosis, Verkauf durch Amazon. Kein Doping-Prüfsiegel, daher nicht für getestete Athlet:innen.' } },
      { product: 'Myprotein Creatine Monohydrate', brand: 'Myprotein', kind: 'creatine', url: 'https://www.amazon.de/dp/B00IXIS60C?tag=sqwod-21', affiliate: true, reviewSlug: 'myprotein-creatine-monohydrate',
        bestFor: { en: 'Creatine in your Myprotein order', de: 'Kreatin zur Myprotein-Bestellung' }, why: { en: 'Solid micronised monohydrate at about 13 cents a dose in the 1 kg bag.', de: 'Solides mikronisiertes Monohydrat für rund 13 Cent pro Dosis im 1-kg-Beutel.' } },
      { product: 'PILLAR Performance Creatine Monohydrate', brand: 'PILLAR Performance', kind: 'creatine', url: 'https://eu.pillarperformance.com/products/creatine-monohydrate', affiliate: false, reviewSlug: 'pillar-creatine-monohydrate',
        bestFor: { en: 'Creapure + Informed Sport', de: 'Creapure + Informed Sport' }, why: { en: 'The purest tub on the list, for tested athletes who will pay about 29 cents a dose.', de: 'Die reinste Dose auf der Liste, für getestete Athlet:innen, die rund 29 Cent pro Dosis zahlen.' } },
      { product: 'MORE Nutrition Daily Creatine', brand: 'MORE Nutrition', kind: 'creatine', url: 'https://morenutrition.de/products/daily-creatine', affiliate: false, reviewSlug: 'more-nutrition-daily-creatine',
        bestFor: { en: 'Fan-favourite brand', de: 'Fan-Lieblingsmarke' }, why: { en: 'Correct dose, but about 37 cents a serving and no third-party certificate found.', de: 'Richtige Dosis, aber rund 37 Cent pro Portion und kein unabhängiges Prüfsiegel gefunden.' } },
      { product: 'SiS GO Hydro Tablets', brand: 'Science in Sport', kind: 'electrolyte', url: 'https://www.scienceinsport.com/', affiliate: false, reviewSlug: 'sis-go-hydro',
        bestFor: { en: 'Best-value tested electrolyte', de: 'Bestes geprüftes Elektrolyt fürs Geld' }, why: { en: 'Informed Sport, 690 mg sodium per litre, about 35 cents a tablet.', de: 'Informed Sport, 690 mg Natrium pro Liter, rund 35 Cent pro Tablette.' } },
      { product: 'Precision Fuel & Hydration PH 1000', brand: 'Precision Fuel & Hydration', kind: 'electrolyte', url: 'https://www.amazon.de/dp/B0D4QRF5FZ?tag=sqwod-21', affiliate: true, reviewSlug: 'precision-fuel-hydration-ph-1000',
        bestFor: { en: 'Long sessions, heavy sweaters', de: 'Lange Einheiten, Vielschwitzer' }, why: { en: '1,000 mg sodium per litre in four strengths you can match to your sweat.', de: '1.000 mg Natrium pro Liter, in vier Stärken passend zum eigenen Schweiß.' } },
      { product: 'PILLAR Performance Electrolyte Hydration', brand: 'PILLAR Performance', kind: 'electrolyte', url: 'https://pillarperformance.com/products/electrolyte-hydration', affiliate: false, reviewSlug: 'pillar-electrolyte-hydration',
        bestFor: { en: 'Best-dosed daily electrolyte', de: 'Am besten dosiertes Alltags-Elektrolyt' }, why: { en: '400 mg sodium, hypotonic, Informed Sport. Ships from Australia until it reaches the EU shop.', de: '400 mg Natrium, hypoton, Informed Sport. Versand aus Australien, bis es im EU-Shop ist.' } },
      { product: 'DRYLL Electrolyte Sticks', brand: 'DRYLL', kind: 'electrolyte', url: 'https://www.amazon.de/dp/B0HJHH2TFX?tag=sqwod-21', affiliate: true, reviewSlug: 'dryll-electrolyte-sticks',
        bestFor: { en: 'High-salt, made in Germany', de: 'High-Salt aus Deutschland' }, why: { en: 'Clean 1,000 mg sodium stick on the Kölner Liste. Use a full litre for everyday training.', de: 'Sauberer 1.000-mg-Natrium-Stick auf der Kölner Liste. Für normales Training auf einen Liter strecken.' } },
      { product: 'Hydraid Hydration Helper', brand: 'Hydraid', kind: 'electrolyte', url: 'https://www.amazon.de/dp/B097DQDKZ3?tag=sqwod-21', affiliate: true, reviewSlug: 'hydraid-hydration-helper',
        bestFor: { en: 'Popular, but ÖKO-TEST "mangelhaft"', de: 'Beliebt, aber ÖKO-TEST "mangelhaft"' }, why: { en: 'Kölner Liste listed, but vitamin and zinc extras cost money without helping hydration.', de: 'Auf der Kölner Liste, aber Vitamin- und Zink-Extras kosten Geld, ohne der Hydration zu helfen.' } },
      { product: 'Sunday Natural Magnesium Bisglycinate', brand: 'Sunday Natural', kind: 'magnesium', url: 'https://www.amazon.de/dp/B0FMS5KYCB?tag=sqwod-21', affiliate: true, reviewSlug: 'sunday-natural-magnesium-bisglycinate',
        bestFor: { en: 'Best everyday magnesium', de: 'Bestes Alltags-Magnesium' }, why: { en: 'A gentle 150 mg of bisglycinate a day, well under the German ceiling.', de: 'Sanfte 150 mg Bisglycinat am Tag, klar unter der deutschen Grenze.' } },
      { product: 'Abtei Magnesium 240 mg', brand: 'Abtei', kind: 'magnesium', url: 'https://www.amazon.de/dp/B0C6HVK4S2?tag=sqwod-21', affiliate: true, reviewSlug: 'abtei-magnesium-240',
        bestFor: { en: 'Cheapest sensible magnesium', de: 'Günstigstes vernünftiges Magnesium' }, why: { en: 'One 240 mg capsule a day for a few cents; among the better products in ÖKO-TEST 6/2026.', de: 'Eine 240-mg-Kapsel am Tag für ein paar Cent; unter den besseren Produkten im ÖKO-TEST 6/2026.' } },
      { product: 'natural elements Magnesium Complex', brand: 'natural elements', kind: 'magnesium', url: 'https://www.amazon.de/dp/B07NS4RX11?tag=sqwod-21', affiliate: true, reviewSlug: 'natural-elements-magnesium-complex',
        bestFor: { en: 'Amazon bestseller (take one)', de: 'Amazon-Bestseller (eine nehmen)' }, why: { en: 'Well liked, but the labelled 400 mg is above the BfR ceiling: one capsule is enough.', de: 'Beliebt, aber die 400 mg laut Etikett liegen über der BfR-Grenze: eine Kapsel reicht.' } },
      { product: 'Doppelherz Pure Magnesium 400', brand: 'Doppelherz', kind: 'magnesium', url: 'https://www.amazon.de/dp/B08NWZ7W95?tag=sqwod-21', affiliate: true, reviewSlug: 'doppelherz-pure-magnesium-400',
        bestFor: { en: 'Bottom of ÖKO-TEST\'s table', de: 'Tabellenende bei ÖKO-TEST' }, why: { en: '400 mg in one capsule you cannot split. Only if a doctor asked for 400 mg.', de: '400 mg in einer nicht teilbaren Kapsel. Nur, wenn ärztlich 400 mg verordnet sind.' } },
      { product: 'PILLAR Performance Triple Magnesium', brand: 'PILLAR Performance', kind: 'magnesium', url: 'https://eu.pillarperformance.com/products/triple-magnesium-powder-lemon-lime', affiliate: false, reviewSlug: 'pillar-triple-magnesium',
        bestFor: { en: 'Tested athletes', de: 'Getestete Athlet:innen' }, why: { en: 'Exactly 250 mg of well-absorbed forms, Informed Sport, at over a euro a day.', de: 'Genau 250 mg gut verwertbarer Formen, Informed Sport, für über einen Euro am Tag.' } },
      { product: 'Igennus Pure & Essential Omega-3', brand: 'Igennus', kind: 'omega3', url: 'https://www.amazon.de/dp/B08WC3W52Y?tag=sqwod-21', affiliate: true, reviewSlug: 'igennus-omega-3-wild-fish-oil',
        bestFor: { en: 'Best-verified fish oil', de: 'Am besten geprüftes Fischöl' }, why: { en: 'IFOS certified, 1,000 mg EPA+DHA in two softgels.', de: 'IFOS-zertifiziert, 1.000 mg EPA+DHA in zwei Kapseln.' } },
      { product: 'natural elements Omega 3', brand: 'natural elements', kind: 'omega3', url: 'https://www.amazon.de/dp/B082FH6GDL?tag=sqwod-21', affiliate: true, reviewSlug: 'natural-elements-omega-3',
        bestFor: { en: 'Budget omega-3', de: 'Günstiges Omega-3' }, why: { en: '600 mg EPA+DHA for about 12 cents a day.', de: '600 mg EPA+DHA für rund 12 Cent am Tag.' } },
      { product: 'ESN Omega-3', brand: 'ESN', kind: 'omega3', url: 'https://www.amazon.de/dp/B0GDQY4JGP?tag=sqwod-21', affiliate: true, reviewSlug: 'esn-omega-3',
        bestFor: { en: 'High-dose omega-3', de: 'Hochdosiertes Omega-3' }, why: { en: '2,100 mg EPA+DHA a day, batch-tested for heavy metals, made in Germany.', de: '2.100 mg EPA+DHA am Tag, chargenweise auf Schwermetalle geprüft, aus Deutschland.' } },
      { product: 'Sunday Natural Omega 3 Vegan Forte', brand: 'Sunday Natural', kind: 'omega3', url: 'https://www.amazon.de/dp/B0FMS1C66V?tag=sqwod-21', affiliate: true, reviewSlug: 'sunday-natural-omega-3-vegan-forte',
        bestFor: { en: 'Best vegan omega-3', de: 'Bestes veganes Omega-3' }, why: { en: 'Algae oil with 700 mg DHA a day, no fish involved.', de: 'Algenöl mit 700 mg DHA am Tag, ganz ohne Fisch.' } },
      { product: 'NORSAN Omega-3 Total Oil', brand: 'NORSAN', kind: 'omega3', url: 'https://www.amazon.de/dp/B0BRSWPSTB?tag=sqwod-21', affiliate: true, reviewSlug: 'norsan-omega-3-total',
        bestFor: { en: 'Liquid omega-3', de: 'Flüssiges Omega-3' }, why: { en: '2,000 mg in one spoon, Friend of the Sea, for people who hate capsules.', de: '2.000 mg in einem Löffel, Friend of the Sea, für alle, die keine Kapseln mögen.' } },
      { product: 'Sunday Natural Vitamin D3 + K2 Drops', brand: 'Sunday Natural', kind: 'vitamind', url: 'https://www.amazon.de/dp/B0FMS3FM95?tag=sqwod-21', affiliate: true, reviewSlug: 'sunday-natural-vitamin-d3-k2-drops',
        bestFor: { en: 'Cleanest vitamin D', de: 'Sauberstes Vitamin D' }, why: { en: 'Pure D3 + K2, Kölner Liste, cents a day. 1,000 IU per drop: every other day keeps you inside German guidance.', de: 'Reines D3 + K2, Kölner Liste, Cent-Beträge. 1.000 I.E. pro Tropfen: jeden zweiten Tag bleibt innerhalb der deutschen Empfehlung.' } },
      { product: 'Rotbäckchen Vital Vitamin D', brand: 'Rotbäckchen', kind: 'vitamind', url: 'https://www.amazon.de/dp/B07HB218XQ?tag=sqwod-21', affiliate: true, reviewSlug: 'rotbaeckchen-vital-vitamin-d',
        bestFor: { en: 'Stiftung Warentest winner', de: 'Testsieger Stiftung Warentest' }, why: { en: '400 IU a day in a juice shot; one of two products Stiftung Warentest recommended in 1/2026.', de: '400 I.E. am Tag als Saft-Shot; eines von zwei Produkten, die die Stiftung Warentest 1/2026 empfahl.' } },
      { product: 'natural elements Vitamin D3 + K2 Softgels', brand: 'natural elements', kind: 'vitamind', url: 'https://www.amazon.de/dp/B0DM6CH4QK?tag=sqwod-21', affiliate: true, reviewSlug: 'natural-elements-vitamin-d3-k2',
        bestFor: { en: 'Vitamin D capsule', de: 'Vitamin-D-Kapsel' }, why: { en: '1,000 IU D3 + K2 per softgel for people who dislike drops.', de: '1.000 I.E. D3 + K2 pro Kapsel für alle, die keine Tropfen mögen.' } },
      { product: 'GSE Vitamin D Bio', brand: 'GSE', kind: 'vitamind', url: 'https://www.gse.de/', affiliate: false,
        bestFor: { en: 'Low-dose organic pick', de: 'Niedrig dosiert, bio' }, why: { en: '200 IU a day; one of two products Stiftung Warentest recommended in 1/2026. Not scored: too few public reviews.', de: '200 I.E. am Tag; eines von zwei Produkten, die die Stiftung Warentest 1/2026 empfahl. Ohne Score: zu wenige öffentliche Bewertungen.' } },
      { product: 'Optimum Nutrition Gold Standard Pre-Workout', brand: 'Optimum Nutrition', kind: 'preworkout', url: 'https://www.amazon.de/dp/B00TFB0YX8?tag=sqwod-21', affiliate: true, reviewSlug: 'optimum-nutrition-gold-standard-pre-workout',
        bestFor: { en: 'Best all-round pre-workout', de: 'Bestes Allround-Pre-Workout' }, why: { en: '175 mg caffeine plus 3.4 g creatine in one scoop.', de: '175 mg Koffein plus 3,4 g Kreatin in einem Messlöffel.' } },
      { product: 'C4 Original Pre-Workout', brand: 'Cellucor', kind: 'preworkout', url: 'https://www.amazon.de/dp/B07L33PRHV?tag=sqwod-21', affiliate: true, reviewSlug: 'c4-original-pre-workout',
        bestFor: { en: 'Beginner pre-workout', de: 'Pre-Workout für Einsteiger' }, why: { en: 'A gentle 150 mg caffeine for about 57 cents; the extras are under-dosed.', de: 'Sanfte 150 mg Koffein für rund 57 Cent; die Extras sind unterdosiert.' } },
      { product: 'Myprotein THE Pre-Workout', brand: 'Myprotein', kind: 'preworkout', url: 'https://www.myprotein.de/', affiliate: false, reviewSlug: 'myprotein-the-pre-workout',
        bestFor: { en: 'Best-dosed formula', de: 'Am besten dosierte Formel' }, why: { en: '3 g creatine, 3 g beta-alanine, 200 mg caffeine. Skip the coffee on top.', de: '3 g Kreatin, 3 g Beta-Alanin, 200 mg Koffein. Keinen Kaffee dazu.' } },
      { product: 'Optimum Nutrition Gold Standard 100% Isolate', brand: 'Optimum Nutrition', kind: 'protein', url: 'https://www.amazon.de/dp/B07QXZ7DWK?tag=sqwod-21', affiliate: true, reviewSlug: 'optimum-nutrition-gold-standard-isolate',
        bestFor: { en: 'Premium whey isolate', de: 'Premium-Whey-Isolat' }, why: { en: '25 g protein per 30 g, Informed Choice tested.', de: '25 g Protein pro 30 g, Informed-Choice-geprüft.' } },
      { product: 'ESN Isoclear Whey Isolate', brand: 'ESN', kind: 'protein', url: 'https://www.esn.com/', affiliate: false, reviewSlug: 'esn-isoclear-whey-isolate',
        bestFor: { en: 'Clear protein drink', de: 'Klarer Protein-Drink' }, why: { en: 'Drinks like iced tea, 25 g protein; about €2 a serving.', de: 'Trinkt sich wie Eistee, 25 g Protein; rund 2 € pro Portion.' } },
      { product: 'Optimum Nutrition Gold Standard', brand: 'Optimum Nutrition', kind: 'protein', url: 'https://www.amazon.de/dp/B000QSNYGI?tag=sqwod-21', affiliate: true, reviewSlug: 'optimum-nutrition-gold-standard',
        bestFor: { en: 'All-round whey', de: 'Allround-Whey' }, why: { en: 'The genre-defining whey: great mixability and Informed-Choice tested.', de: 'Der Whey-Klassiker: top Löslichkeit und Informed-Choice-getestet.' } },
      { product: 'Maurten GEL 100', brand: 'Maurten', kind: 'fuel', url: 'https://www.maurten.com/', affiliate: false, reviewSlug: 'maurten-gel-100',
        bestFor: { en: 'Race-day fuel', de: 'Wettkampf-Verpflegung' }, why: { en: 'Superbly gut-friendly endurance gel elites swear by (at a premium).', de: 'Extrem magenfreundliches Ausdauer-Gel, auf das Top-Athleten schwören (zum Premiumpreis).' } },
      { product: 'AG1 (Athletic Greens)', brand: 'AG1', kind: 'greens', url: 'https://drinkag1nordic.pxf.io/c/2210087/3862778/23569', affiliate: true, reviewSlug: 'ag1-athletic-greens',
        bestFor: { en: 'Convenience greens', de: 'Greens für unterwegs' }, why: { en: 'Exhaustively tested greens powder: convenient, but premium-priced with thin evidence.', de: 'Ausführlich getestetes Greens-Pulver: praktisch, aber teuer und dünn belegt.' } },
      { product: 'waterdrop Microdrink', brand: 'waterdrop', kind: 'drink', url: 'https://www.waterdrop.com/', affiliate: true, reviewSlug: 'waterdrop-microdrink',
        bestFor: { en: 'Functional hydration', de: 'Funktionale Hydration' }, why: { en: 'Sugar-light flavor cubes that make drinking more water genuinely easy and sustainable.', de: 'Zuckerarme Geschmackswürfel, die mehr Trinken wirklich leicht und nachhaltig machen.' } },
      { product: 'yfood Ready-to-Drink Meal', brand: 'yfood', kind: 'drink', url: 'https://www.yfood.eu/', affiliate: true, reviewSlug: 'yfood-vital-drink',
        bestFor: { en: 'Complete-meal drink', de: 'Trinkmahlzeit' }, why: { en: 'Germany\'s category leader: 500 kcal, 33 g protein and 26 vitamins with genuinely good taste.', de: 'Deutschlands Kategorieführer: 500 kcal, 33 g Protein und 26 Vitamine bei wirklich gutem Geschmack.' } },
      { product: 'Barebells Protein Bar', brand: 'Barebells', kind: 'bar', url: 'https://barebells.de/', affiliate: true, reviewSlug: 'barebells-protein-bar',
        bestFor: { en: 'Protein snack', de: 'Protein-Snack' }, why: { en: 'The best-tasting mainstream protein bar: 20 g protein, no sugar alcohols, candy-bar texture.', de: 'Der bestschmeckende Mainstream-Proteinriegel: 20 g Protein, ohne Zuckeralkohole, Schoko-Riegel-Feeling.' } },
      { product: 'Performance Lab Core Series', brand: 'Performance Lab', url: 'https://performancelabltd.pxf.io/c/2210087/3977490/48739', affiliate: true,
        bestFor: { en: 'Clean-label stacks', de: 'Clean-Label-Stacks' }, why: { en: 'Minimal-additive, single-purpose formulas that are easy to defend to a client. Review coming.', de: 'Zusatzstoffarme Einzweck-Formeln, die sich Kund:innen gut erkl\u00e4ren lassen. Bewertung folgt.' } },
    ],
  },
  {
    slug: 'connected-fitness',
    glyph: 'watch',
    label: { en: 'Connected Fitness & Equipment', de: 'Connected Fitness & Equipment' },
    blurb: {
      en: 'At-home machines and platforms: what actually earns its footprint and subscription.',
      de: 'Heim-Geräte und Plattformen: was Stellfläche und Abo wirklich wert ist.',
    },
    picks: [
      { product: 'Peloton Bike', brand: 'Peloton', kind: 'bike', url: 'https://www.onepeloton.com/', affiliate: true, reviewSlug: 'peloton-bike',
        bestFor: { en: 'Class experience', de: 'Kurs-Erlebnis' }, why: { en: 'The benchmark for connected cardio classes: worth it if you use the subscription.', de: 'Der Maßstab für vernetzte Cardio-Kurse: lohnt sich, wenn du das Abo nutzt.' } },
      { product: 'Peloton Cross Training Bike', brand: 'Peloton', kind: 'bike', url: 'https://www.onepeloton.com/', affiliate: true, reviewSlug: 'peloton-cross-training-bike',
        bestFor: { en: 'Class experience', de: 'Kurs-Erlebnis' }, why: { en: 'Peloton\'s classes on a bike whose screen swivels 360 degrees for floor workouts.', de: 'Pelotons Kurse auf einem Bike, dessen Screen sich für Bodentraining um 360 Grad dreht.' } },
      { product: 'Tonal', brand: 'Tonal', url: 'https://www.tonal.com/', affiliate: false,
        bestFor: { en: 'Strength at home', de: 'Kraft zuhause' }, why: { en: 'Digital cable machine with adaptive resistance: strength in a wall\'s footprint. Review coming.', de: 'Digitale Kabelzug-Maschine mit adaptivem Widerstand: Kraft auf Wandfläche. Bewertung folgt.' } },
      { product: 'Zwift', brand: 'Zwift', url: 'https://www.zwift.com/', affiliate: false,
        bestFor: { en: 'Indoor cycling/running', de: 'Indoor-Cycling/Laufen' }, why: { en: 'The social training platform for turbo trainers and treadmills. Listed on merit.', de: 'Die soziale Trainings-Plattform für Rollentrainer und Laufbänder. Auf Empfehlung gelistet.' } },
      { product: 'Wahoo KICKR CORE 2', brand: 'Wahoo', kind: 'trainer', url: 'https://www.wahoofitness.com/', affiliate: true, reviewSlug: 'wahoo-kickr-core',
        bestFor: { en: 'Smart trainer value', de: 'Smart-Trainer Preis-Leistung' }, why: { en: '±2% accurate, quiet direct-drive trainer: near-flagship for mid-tier money.', de: '±2% genauer, leiser Direct-Drive-Trainer: Beinahe-Flaggschiff zum Mittelklassepreis.' } },
      { product: 'Concept2 RowErg', brand: 'Concept2', kind: 'rower', url: 'https://www.amazon.de/dp/B0CMZJHPZK?tag=sqwod-21', affiliate: true, reviewSlug: 'concept2-rowerg',
        bestFor: { en: 'Indoor rowing', de: 'Indoor-Rudern' }, why: { en: 'The gold-standard erg: near-indestructible with accurate PM5 data.', de: 'Der Goldstandard unter den Ergos: nahezu unkaputtbar mit präzisen PM5-Daten.' } },
      { product: 'Speediance Gym Monster 2', brand: 'Speediance', kind: 'strength', url: 'https://eu.speediance.com/', affiliate: true, reviewSlug: 'speediance-gym-monster-2',
        bestFor: { en: 'All-in-one smart gym', de: 'All-in-one Smart-Gym' }, why: { en: 'A compact digital cable machine with a strong app: a whole gym in one footprint.', de: 'Kompakte digitale Kabelmaschine mit starker App: ein ganzes Gym auf einer Stellfläche.' } },
      { product: 'NÜOBELL Adjustable Dumbbell', brand: 'NÜOBELL', kind: 'strength', url: 'https://eu.nuoathletics.com/', affiliate: false, reviewSlug: 'nuobell-adjustable-dumbbell',
        bestFor: { en: 'Adjustable dumbbells', de: 'Verstellbare Kurzhanteln' }, why: { en: 'Gym-grade 5–24 kg dial dumbbells that replace a whole rack in seconds.', de: 'Gym-taugliche 5–24-kg-Dreh-Kurzhanteln, die ein ganzes Rack in Sekunden ersetzen.' } },
    ],
  },
  {
    slug: 'apparel',
    glyph: 'band',
    label: { en: 'Apparel & Footwear', de: 'Bekleidung & Schuhe' },
    blurb: {
      en: 'Training kit and shoes that hold up: for coaches, members and gift guides.',
      de: 'Trainings-Kleidung und Schuhe, die halten: für Coaches, Mitglieder und Geschenk-Guides.',
    },
    picks: [
      { product: 'Gymshark Vital Seamless 2.0', brand: 'Gymshark', kind: 'top', url: 'https://www.gymshark.com/', affiliate: false, reviewSlug: 'gymshark-vital-seamless',
        bestFor: { en: 'Gym apparel', de: 'Gym-Bekleidung' }, why: { en: 'Affordable, iconic seamless training staple that ships fast to Germany.', de: 'Bezahlbarer, ikonischer Seamless-Klassiker fürs Training, schnell nach Deutschland geliefert.' } },
      { product: 'Ten Thousand Interval Short', brand: 'Ten Thousand', kind: 'short', url: 'https://www.tenthousand.cc/', affiliate: false, reviewSlug: 'ten-thousand-interval-short',
        bestFor: { en: 'Training shorts', de: 'Trainings-Shorts' }, why: { en: 'Durable, high-mobility do-everything short (US-only shipping: see review).', de: 'Langlebige, sehr bewegliche Allround-Short (nur US-Versand: siehe Test).' } },
      { product: 'Alo High-Waist Airlift Legging', brand: 'Alo Yoga', kind: 'legging', url: 'https://www.aloyoga.com/en-de/', affiliate: true, reviewSlug: 'alo-airlift-legging',
        bestFor: { en: 'Yoga & studio', de: 'Yoga & Studio' }, why: { en: 'Premium, sculpting compression legging with a localized German store.', de: 'Hochwertige, formende Kompressions-Legging mit lokalisiertem deutschen Store.' } },
      { product: 'ASICS Gel-Nimbus 27', brand: 'ASICS', kind: 'road', family: 'asics-nimbus', url: 'https://www.asics.com/de/de-de/', affiliate: true, reviewSlug: 'asics-gel-nimbus-27',
        bestFor: { en: 'Max-cushion easy miles', de: 'Max-Cushion für lockere Läufe' }, why: { en: 'Plush, stable max-cushion daily trainer: the value pick on discount.', de: 'Weicher, stabiler Max-Cushion-Alltagsschuh: der Preis-Tipp im Angebot.' } },
      { product: 'ASICS Gel-Nimbus 28', brand: 'ASICS', kind: 'road', family: 'asics-nimbus', current: true, url: 'https://www.asics.com/de/de-de/', affiliate: true, reviewSlug: 'asics-gel-nimbus-28',
        bestFor: { en: 'Max-cushion easy miles', de: 'Max-Cushion für lockere Läufe' }, why: { en: 'A lighter Nimbus that keeps the plush, stable ride for easy miles.', de: 'Ein leichterer Nimbus mit dem weichen, stabilen Laufgefühl für lockere Kilometer.' } },
      { product: 'Brooks Ghost 18', brand: 'Brooks', kind: 'road', url: 'https://www.brooksrunning.com/de_de/', affiliate: false, reviewSlug: 'brooks-ghost-18',
        bestFor: { en: 'Foolproof daily trainer', de: 'Narrensicherer Alltagsschuh' }, why: { en: 'Dependable, durable neutral trainer: safe over spectacular.', de: 'Zuverlässiger, langlebiger Neutralschuh: sicher statt spektakulär.' } },
      { product: 'Nike Pegasus 42', brand: 'Nike', kind: 'road', url: 'https://www.nike.com/de/', affiliate: true, reviewSlug: 'nike-pegasus-42',
        bestFor: { en: 'Everyday workhorse', de: 'Alltags-Arbeitstier' }, why: { en: 'Reliable, durable neutral trainer that nails comfort: an average but safe ride.', de: 'Zuverlässiger, langlebiger Neutralschuh mit top Komfort: durchschnittliches, aber sicheres Laufgefühl.' } },
      { product: 'HOKA Clifton 10', brand: 'HOKA', kind: 'road', family: 'hoka-clifton', url: 'https://www.hoka.com/de/de/', affiliate: true, reviewSlug: 'hoka-clifton-10',
        bestFor: { en: 'Max-cushion easy days', de: 'Maximale Dämpfung, lockere Tage' }, why: { en: 'A plush, protective max-cushion cruiser for easy miles.', de: 'Ein weicher, schützender Max-Cushion-Cruiser für lockere Kilometer.' } },
      { product: 'HOKA Clifton 11', brand: 'HOKA', kind: 'road', family: 'hoka-clifton', current: true, url: 'https://www.hoka.com/de/de/', affiliate: true, reviewSlug: 'hoka-clifton-11',
        bestFor: { en: 'Max-cushion easy days', de: 'Maximale Dämpfung, lockere Tage' }, why: { en: 'Lighter, softer and better fitting: the daily trainer for easy miles.', de: 'Leichter, weicher und besser sitzend: der Alltagsschuh für lockere Kilometer.' } },
      { product: 'On Cloudmonster 2', brand: 'On', kind: 'road', family: 'on-cloudmonster', url: 'https://www.on.com/de-de/', affiliate: true, reviewSlug: 'on-cloudmonster-2',
        bestFor: { en: 'Firm max-cushion', de: 'Feste Max-Dämpfung' }, why: { en: 'Stable, durable daily trainer with a firm, cushioned roll.', de: 'Stabiler, langlebiger Daily-Trainer mit festem, gedämpftem Abrollen.' } },
      { product: 'On Cloudmonster 3', brand: 'On', kind: 'road', family: 'on-cloudmonster', current: true, url: 'https://www.on.com/de-de/', affiliate: true, reviewSlug: 'on-cloudmonster-3',
        bestFor: { en: 'Firm max-cushion', de: 'Feste Max-Dämpfung' }, why: { en: 'A refined upper and smoother roll on On\'s firm, max-cushion rocker.', de: 'Besseres Obermaterial und runderes Abrollen auf Ons festem Max-Cushion-Rocker.' } },
      { product: 'Saucony Endorphin Speed 4', brand: 'Saucony', kind: 'road', family: 'saucony-endorphin-speed', url: 'https://www.saucony.com/', affiliate: true, reviewSlug: 'saucony-endorphin-speed-4',
        bestFor: { en: 'Do-it-all super-trainer', de: 'Allround-Super-Trainer' }, why: { en: 'Versatile nylon-plated trainer: easy days to race day, now a steal.', de: 'Vielseitiger Trainer mit Nylon-Platte: von locker bis Wettkampf, jetzt ein Schnäppchen.' } },
      { product: 'Saucony Endorphin Speed 5', brand: 'Saucony', kind: 'road', family: 'saucony-endorphin-speed', current: true, url: 'https://www.saucony.com/', affiliate: true, reviewSlug: 'saucony-endorphin-speed-5',
        bestFor: { en: 'Do-it-all super-trainer', de: 'Allround-Super-Trainer' }, why: { en: 'One of the most versatile plated trainers, now softer, bouncier and roomier.', de: 'Einer der vielseitigsten Trainer mit Platte, jetzt weicher, federnder und geräumiger.' } },
      { product: 'New Balance Fresh Foam X 1080v14', brand: 'New Balance', kind: 'road', family: 'nb-1080', url: 'https://www.newbalance.de/', affiliate: true, reviewSlug: 'new-balance-1080-v14',
        bestFor: { en: 'Plush daily miles', de: 'Weiche Alltagskilometer' }, why: { en: 'Comfort-first max-cushion daily trainer for easy and recovery runs.', de: 'Komfortorientierter Max-Cushion-Trainer für lockere Läufe und Regeneration.' } },
      { product: 'New Balance Fresh Foam X 1080v15', brand: 'New Balance', kind: 'road', family: 'nb-1080', current: true, url: 'https://www.newbalance.de/', affiliate: true, reviewSlug: 'new-balance-1080-v15',
        bestFor: { en: 'Plush daily miles', de: 'Weiche Alltagskilometer' }, why: { en: 'A new supercritical foam makes the 1080 lighter, softer and livelier.', de: 'Ein neuer superkritischer Schaum macht den 1080 leichter, weicher und spritziger.' } },
      { product: 'Vivobarefoot Primus Lite III', brand: 'Vivobarefoot', kind: 'barefoot', family: 'vivo-primus', url: 'https://vivobarefootltd.pxf.io/c/2210087/3827543/48989?u=https%3A%2F%2Fwww.vivobarefoot.com%2Fde', affiliate: true, reviewSlug: 'vivobarefoot-primus-lite',
        bestFor: { en: 'Barefoot training shoe', de: 'Barfuß-Trainingsschuh' }, why: { en: 'Premium wide-toe barefoot trainer with real ground feel for natural movement.', de: 'Hochwertiger Barfuß-Trainer mit breiter Zehenbox und echtem Bodengefühl für natürliche Bewegung.' } },
      { product: 'Vivobarefoot Primus Lite IV', brand: 'Vivobarefoot', kind: 'barefoot', family: 'vivo-primus', current: true, url: 'https://vivobarefootltd.pxf.io/c/2210087/3827543/48989?u=https%3A%2F%2Fwww.vivobarefoot.com%2Fde', affiliate: true, reviewSlug: 'vivobarefoot-primus-lite-4',
        bestFor: { en: 'Barefoot training shoe', de: 'Barfuß-Trainingsschuh' }, why: { en: 'Class-leading ground feel in a lighter build for barefoot strength work.', de: 'Erstklassiges Bodengefühl in leichterer Bauweise für Barfuß-Krafttraining.' } },
      { product: 'Vuori Kore Short', brand: 'Vuori', kind: 'short', url: 'https://vuoriclothing.de/', affiliate: false, reviewSlug: 'vuori-kore-short',
        bestFor: { en: 'Do-everything short', de: 'Allround-Short' }, why: { en: 'A cult-favorite short with buttery fabric that goes from gym to lounge effortlessly.', de: 'Kult-Short mit ultraweichem Stoff: vom Gym bis zur Couch mühelos vielseitig.' } },
    ],
  },
  {
    slug: 'apps',
    glyph: 'tracker',
    label: { en: 'Training Apps & Software', de: 'Trainings-Apps & Software' },
    blurb: {
      en: 'Logging, programming and coaching apps for athletes and the coaches who guide them.',
      de: 'Apps fürs Tracking, Programmieren und Coaching: für Athlet:innen und ihre Coaches.',
    },
    picks: [
      { product: 'TrainingPeaks', brand: 'TrainingPeaks', url: 'https://www.trainingpeaks.com/', affiliate: false, reviewSlug: 'trainingpeaks',
        bestFor: { en: 'Endurance coaching', de: 'Ausdauer-Coaching' }, why: { en: 'The standard for structured endurance programming and athlete management.', de: 'Der Standard für strukturiertes Ausdauer-Programmieren und Athleten-Management.' } },
      { product: 'Runna', brand: 'Runna', url: 'https://www.runna.com/', affiliate: false,
        bestFor: { en: 'Guided run plans', de: 'Geführte Lauf-Pläne' }, why: { en: 'Personalized run plans that bridge solo runners and coaches. Review coming.', de: 'Personalisierte Lauf-Pläne als Brücke zwischen Solo-Läufer:innen und Coaches. Bewertung folgt.' } },
      { product: 'MyFitnessPal', brand: 'MyFitnessPal', url: 'https://www.myfitnesspal.com/', affiliate: false,
        bestFor: { en: 'Nutrition logging', de: 'Ernährungs-Tracking' }, why: { en: 'The largest food database for clients who track intake. Listed on merit.', de: 'Die größte Lebensmittel-Datenbank fürs Tracking. Auf Empfehlung gelistet.' } },
      { product: 'Pvolve', brand: 'Pvolve', url: 'https://pvolve.r7kg.net/c/2210087/1295530/8810', affiliate: true,
        bestFor: { en: 'Low-impact strength', de: 'Gelenkschonendes Krafttraining' }, why: { en: 'Resistance-based method for clients who need joint-friendly progressive loading. Review coming.', de: 'Widerstandsbasierte Methode f\u00fcr Kund:innen, die gelenkschonende progressive Belastung brauchen. Bewertung folgt.' } },
    ],
  },
  {
    slug: 'studio-tools',
    glyph: 'watch',
    label: { en: 'Coaching & Studio Tools', de: 'Coaching- & Studio-Tools' },
    blurb: {
      en: 'Software that runs a coaching business or studio: booking, payments, client management.',
      de: 'Software, die ein Coaching-Business oder Studio betreibt: Buchung, Zahlungen, Kund:innen.',
    },
    picks: [
      { product: 'PushPress', brand: 'PushPress', url: 'https://www.pushpress.com/', affiliate: false, reviewSlug: 'pushpress',
        bestFor: { en: 'Gym management', de: 'Gym-Management' }, why: { en: 'All-in-one gym management with a real free tier: US-focused; routes to Sqwod OS.', de: 'All-in-one-Gym-Management mit echter Gratis-Stufe: US-fokussiert; führt zu Sqwod OS.' } },
      { product: 'Lenus', brand: 'Lenus', url: 'https://www.lenus.io/', affiliate: false,
        bestFor: { en: 'Coach platform', de: 'Coach-Plattform' }, why: { en: 'All-in-one platform for scaling an online coaching business. Listed on merit.', de: 'All-in-one-Plattform zum Skalieren eines Online-Coaching-Business. Auf Empfehlung gelistet.' } },
      { product: 'ISSA Certification', brand: 'ISSA', url: 'https://issa.sjv.io/c/2210087/3921138/12162', affiliate: true,
        bestFor: { en: 'Trainer certification', de: 'Trainer-Zertifizierung' }, why: { en: 'Widely recognized PT + wellness coaching certifications. Review coming.', de: 'Weit anerkannte PT- + Wellness-Coaching-Zertifizierungen. Bewertung folgt.' } },
    ],
  },
];

export const byCategory = (slug: string) => categories.find((c) => c.slug === slug);
