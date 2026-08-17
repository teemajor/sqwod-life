// Sqwod Verified — "best of" buyer's guides (the roundup layer).
//
// WHY THIS EXISTS
// Sqwod Verified was built around two page types: one product (/verified/<slug>)
// and one pair (/verified/compare/<a>-vs-<b>). Both are real. Neither is shaped
// like the question people actually type — which is "best X for Y". As of Aug
// 2026 the site had 58 scored products across 8 categories and zero pages
// answering that question, while competitors with weaker data ranked and got
// cited for exactly it.
//
// Nothing here is new research. Every score, price and sub-score is pulled live
// from the reviews collection at build time. This file holds only the things a
// database can't hold: the localized URL, the editorial judgement in the lede,
// the buying guidance, and the questions readers actually ask.
//
// SLUGS ARE LOCALIZED, NOT TRANSLATED.
// A German buyer searches "beste Fitness-Tracker", never "beste wearables".
// The pair below is the single source of truth for both the route and the
// hreflang tag, so the two can never drift apart.
import type { Lang } from '../i18n/ui';

export interface BestFaq {
  q: Record<Lang, string>;
  a: Record<Lang, string>;
}

export interface BestGuide {
  /** matches a slug in config/verified-categories.ts */
  category: string;
  /** localized URL segment — /en/best/<slug> and /de/beste/<slug> */
  slug: Record<Lang, string>;
  /** noun phrase for the H1: "Best <title> <year>" */
  title: Record<Lang, string>;
  /** meta description */
  description: Record<Lang, string>;
  /** the editorial half of the direct-answer lede — the factual half (winner,
   *  score, price) is generated from live data in the page template. */
  lede: Record<Lang, string>;
  /** "what to know before buying" — 3-5 items, the real decision criteria */
  before: Array<Record<Lang, string>>;
  /** Rail B: the paragraph written for someone buying for a business, not a
   *  garage. No competitor in this category writes this section. */
  operator: Record<Lang, string>;
  faq: BestFaq[];
}

/** URL segment that precedes the category. Localized. */
export const GUIDE_PREFIX: Record<Lang, string> = { en: 'best', de: 'beste' };

export const guides: BestGuide[] = [
  // ------------------------------------------------------------------ wearables
  {
    category: 'wearables',
    slug: { en: 'wearables', de: 'fitness-tracker' },
    title: { en: 'Fitness Trackers & Wearables', de: 'Fitness-Tracker & Wearables' },
    description: {
      en: 'Every wearable we score, ranked 0–100 on the public Sqwod Score. Rings, watches and bands — what each one is actually for, what it costs, and what the subscription really adds.',
      de: 'Alle Wearables mit Sqwod Score von 0–100. Ringe, Uhren und Bänder — wofür jedes wirklich taugt, was es kostet und was das Abo wirklich bringt.',
    },
    lede: {
      en: 'It wins on the least glamorous thing that matters most: you will actually wear it overnight, and overnight is where the data that changes training gets made.',
      de: 'Er gewinnt an der unspektakulärsten Stelle, die am meisten zählt: Du trägst ihn nachts wirklich — und nachts entstehen die Daten, die Training verändern.',
    },
    before: [
      {
        en: 'Ring or watch is the first fork, and it is a compliance question, not a spec question. A ring wins if you care about sleep and recovery, because the failure mode of a watch is that people take it off to charge at exactly the hours it should be measuring. A watch wins if you want live metrics, GPS and a screen mid-session.',
        de: 'Ring oder Uhr ist die erste Entscheidung — und es ist eine Frage der Konsequenz, nicht der Ausstattung. Ein Ring gewinnt bei Schlaf und Erholung, denn die typische Schwäche einer Uhr ist, dass sie genau in den Stunden am Ladekabel hängt, in denen sie messen sollte. Eine Uhr gewinnt bei Live-Daten, GPS und Display im Training.',
      },
      {
        en: 'Subscriptions change the maths more than the sticker price does. Price the thing over three years, including the subscription, before you compare anything. A cheaper device on a mandatory plan is often the more expensive device.',
        de: 'Abos verändern die Rechnung stärker als der Kaufpreis. Rechne über drei Jahre inklusive Abo, bevor du überhaupt vergleichst. Ein günstigeres Gerät mit Pflicht-Abo ist oft das teurere Gerät.',
      },
      {
        en: 'Sleep-stage accuracy is not what the marketing implies. Wearables are good at telling you whether last night was better or worse than your own average, and much weaker at telling you exactly how much deep sleep you got. Use the trend, not the number.',
        de: 'Die Genauigkeit der Schlafphasen ist nicht das, was die Werbung suggeriert. Wearables sind gut darin zu zeigen, ob eine Nacht besser oder schlechter war als dein eigener Durchschnitt — und deutlich schwächer darin, exakt Tiefschlafminuten zu beziffern. Nutze den Trend, nicht die Zahl.',
      },
      {
        en: 'Battery life is a compliance feature, not a spec line. A tracker on the nightstand measures nothing. Anything you have to charge daily will lose you nights.',
        de: 'Akkulaufzeit ist ein Konsequenz-Feature, keine Spec-Zeile. Ein Tracker auf dem Nachttisch misst nichts. Alles, was täglich ans Kabel muss, kostet dich Nächte.',
      },
      {
        en: 'Check whether you can get your own data out. If a coach will ever look at it, export matters more than any sensor on the spec sheet.',
        de: 'Prüfe, ob du deine Daten wieder herausbekommst. Sobald ein Coach draufschaut, ist der Export wichtiger als jeder Sensor im Datenblatt.',
      },
    ],
    operator: {
      en: 'Rolling wearables out across a client roster is a different purchase. Price it per client per month over three years including subscription, not per unit. Check whether the platform has a genuine coach dashboard or whether you will be reading twenty separate apps. Confirm you can export raw data into your own booking or programming stack. And weigh compliance hardest of all — the best tracker for a roster is the one still being worn in week six, which is usually the one nobody has to remember to charge. In the EU, client biometric data in a coaching relationship carries GDPR obligations: know where it is stored and what you are agreeing to on your clients behalf.',
      de: 'Wearables für einen ganzen Kundenstamm sind ein anderer Kauf. Rechne pro Kunde und Monat über drei Jahre inklusive Abo, nicht pro Gerät. Prüfe, ob die Plattform ein echtes Coach-Dashboard hat oder ob du zwanzig einzelne Apps liest. Kläre, ob du Rohdaten in dein Buchungs- oder Programmier-System exportieren kannst. Und gewichte die Konsequenz am höchsten — der beste Tracker für einen Kundenstamm ist der, der in Woche sechs noch getragen wird, und das ist meist der, den niemand ans Ladekabel denken muss. In der EU gilt: Biometrische Kundendaten im Coaching sind DSGVO-relevant. Wisse, wo sie liegen und wozu du im Namen deiner Kund:innen zustimmst.',
    },
    faq: [
      {
        q: { en: 'Do I actually need a smart ring, or is a watch enough?', de: 'Brauche ich wirklich einen Smart Ring oder reicht eine Uhr?' },
        a: {
          en: 'A ring is the better buy if your main goal is sleep and recovery, because you will keep it on overnight without thinking about it. A watch is the better buy if you want live training metrics, GPS and a screen you can read mid-session. If you train hard and sleep badly, start with the ring — that is where the biggest unmanaged variable usually sits.',
          de: 'Ein Ring ist die bessere Wahl, wenn es dir vor allem um Schlaf und Erholung geht — du trägst ihn nachts, ohne darüber nachzudenken. Eine Uhr ist besser, wenn du Live-Trainingsdaten, GPS und ein ablesbares Display willst. Wer hart trainiert und schlecht schläft, fängt mit dem Ring an: Dort liegt meist die größte unbeachtete Stellschraube.',
        },
      },
      {
        q: { en: 'Which fitness trackers work without a subscription?', de: 'Welche Fitness-Tracker funktionieren ohne Abo?' },
        a: {
          en: 'Several do, and the subscription column in the comparison table on this page shows which. It matters more than most buyers expect: over three years a mandatory plan can cost more than the device itself, so a subscription-free tracker at a higher sticker price is frequently the cheaper option. Decide on the three-year total, not the shelf price.',
          de: 'Mehrere — die Abo-Spalte in der Vergleichstabelle auf dieser Seite zeigt, welche. Das Thema ist wichtiger, als die meisten erwarten: Über drei Jahre kann ein Pflicht-Abo mehr kosten als das Gerät selbst. Ein abofreier Tracker mit höherem Kaufpreis ist deshalb oft die günstigere Wahl. Entscheide nach Dreijahres-Gesamtkosten, nicht nach Regalpreis.',
        },
      },
      {
        q: { en: 'How accurate are wearable sleep trackers really?', de: 'Wie genau messen Wearables den Schlaf wirklich?' },
        a: {
          en: 'Good at direction, weak at precision. Consumer wearables track total sleep time and night-to-night change reasonably well, and they are considerably less reliable at splitting a night into exact deep, light and REM minutes — that is a hard problem even in a lab. Treat the nightly stage breakdown as a rough sketch and the multi-week trend as the real signal.',
          de: 'Gut in der Richtung, schwach in der Präzision. Consumer-Wearables erfassen Gesamtschlafzeit und Veränderungen von Nacht zu Nacht ordentlich — und sind deutlich unzuverlässiger, wenn es um exakte Minuten in Tief-, Leicht- und REM-Schlaf geht. Das ist selbst im Labor schwierig. Nimm die nächtliche Phasenaufteilung als grobe Skizze und den Trend über Wochen als das eigentliche Signal.',
        },
      },
      {
        q: { en: 'What is a good HRV score?', de: 'Was ist ein guter HRV-Wert?' },
        a: {
          en: 'There is no universal good number, and comparing yours to someone elses tells you nothing. HRV varies enormously between people by age, genetics and measurement method. What is useful is your own baseline: build two to four weeks of data, then read meaningful drops against that, especially alongside poor sleep or a hard training block.',
          de: 'Es gibt keinen allgemein guten Wert, und der Vergleich mit anderen sagt nichts aus. HRV schwankt zwischen Menschen enorm — nach Alter, Genetik und Messmethode. Nützlich ist allein deine eigene Baseline: Sammle zwei bis vier Wochen Daten und lies deutliche Abweichungen dagegen, besonders zusammen mit schlechtem Schlaf oder einem harten Trainingsblock.',
        },
      },
      {
        q: { en: 'Can I use one wearable platform across a whole client roster?', de: 'Kann ich eine Wearable-Plattform für meinen ganzen Kundenstamm nutzen?' },
        a: {
          en: 'Some platforms offer a coach or team view; many do not, and you end up reading individual apps one at a time. Before committing a roster, check three things: whether a genuine multi-client dashboard exists, what per-seat licensing costs, and whether raw data exports. In the EU also settle where client biometric data is stored — that is a GDPR question, not an IT preference.',
          de: 'Manche Plattformen bieten eine Coach- oder Team-Ansicht, viele nicht — dann liest du einzelne Apps nacheinander. Vor der Entscheidung für einen ganzen Kundenstamm drei Dinge prüfen: Gibt es ein echtes Mehr-Kunden-Dashboard, was kostet die Lizenz pro Platz, und lassen sich Rohdaten exportieren? In der EU zusätzlich klären, wo biometrische Kundendaten liegen — das ist eine DSGVO-Frage, keine IT-Vorliebe.',
        },
      },
    ],
  },

  // ------------------------------------------------------------------- recovery
  {
    category: 'recovery',
    slug: { en: 'recovery', de: 'recovery' },
    title: { en: 'Recovery & Massage Tools', de: 'Recovery- & Massage-Tools' },
    description: {
      en: 'Massage guns, compression and heat/cold tools scored 0–100 on the public Sqwod Score — what each is genuinely for, and where the evidence actually sits.',
      de: 'Massagepistolen, Kompression und Wärme/Kälte mit Sqwod Score von 0–100 — wofür sie wirklich taugen und wie die Evidenz tatsächlich aussieht.',
    },
    lede: {
      en: 'Most recovery tools are bought for what they promise and kept for how they feel; this one earns its place on both, which is rarer than the category suggests.',
      de: 'Die meisten Recovery-Tools werden für ihr Versprechen gekauft und für ihr Gefühl behalten. Dieses hier überzeugt bei beidem — seltener, als die Kategorie vermuten lässt.',
    },
    before: [
      {
        en: 'Be clear what you are buying. The strong evidence for percussion and compression is about how you feel — perceived soreness and short-term range of motion. The evidence that they meaningfully speed up physiological recovery is much thinner. Feeling better is a legitimate reason to buy; just buy it knowingly.',
        de: 'Sei dir klar, was du kaufst. Die gute Evidenz für Percussion und Kompression betrifft das Gefühl — empfundenen Muskelkater und kurzfristige Beweglichkeit. Dass sie die physiologische Erholung wirklich beschleunigen, ist deutlich schwächer belegt. Sich besser zu fühlen ist ein legitimer Kaufgrund — kauf nur mit offenen Augen.',
      },
      {
        en: 'Power is oversold. Stall force and amplitude matter for thick muscle like quads and glutes, and actively work against you on the neck, shoulders and anywhere near a joint. A lighter tool you can steer one-handed beats a flagship you cannot comfortably hold up.',
        de: 'Leistung wird überverkauft. Stall Force und Amplitude zählen bei dicker Muskulatur wie Quadrizeps und Gesäß — und arbeiten am Nacken, an den Schultern und rund um Gelenke gegen dich. Ein leichtes Gerät, das du einhändig führst, schlägt ein Flaggschiff, das du nicht bequem hochhältst.',
      },
      {
        en: 'Noise decides whether you use it. A tool loud enough to be unpleasant gets left in the cupboard, and the one in the cupboard has an effect size of zero.',
        de: 'Die Lautstärke entscheidet über die Nutzung. Ein Gerät, das unangenehm laut ist, bleibt im Schrank — und was im Schrank liegt, hat eine Wirkung von exakt null.',
      },
      {
        en: 'Never use percussion on the front or sides of the neck, on the spine, or over an acute injury, swelling or numbness. That is not a caveat, it is a hard limit.',
        de: 'Niemals Percussion an Vorder- oder Seitenhals, auf der Wirbelsäule oder über akuten Verletzungen, Schwellungen oder tauben Stellen anwenden. Das ist keine Einschränkung, sondern eine harte Grenze.',
      },
    ],
    operator: {
      en: 'In a studio a recovery tool is shared equipment, and that changes every criterion. Battery becomes throughput — how many client sessions between charges. Attachments become a hygiene question, so favour heads you can actually wipe down between people. Build quality is judged against dozens of sessions a week, not weekly home use, and most consumer warranties quietly exclude commercial settings — check before you buy, not after something fails. Price it per member-session across the expected service life; a device at twice the cost that survives three times as long is the cheaper machine.',
      de: 'Im Studio ist ein Recovery-Tool Gemeinschaftsgerät — und das ändert jedes Kriterium. Akku wird zu Durchsatz: wie viele Kundeneinheiten pro Ladung. Aufsätze werden zur Hygienefrage, also Köpfe bevorzugen, die sich zwischen Personen wirklich abwischen lassen. Verarbeitung misst sich an Dutzenden Einheiten pro Woche, nicht an wöchentlicher Heimnutzung — und die meisten Consumer-Garantien schließen gewerbliche Nutzung still aus. Vorher prüfen, nicht nach dem Defekt. Rechne pro Mitgliedereinheit über die erwartete Lebensdauer: Ein Gerät zum doppelten Preis, das dreimal so lange hält, ist die günstigere Maschine.',
    },
    faq: [
      {
        q: { en: 'Do massage guns actually work?', de: 'Bringen Massagepistolen wirklich etwas?' },
        a: {
          en: 'For how you feel, yes — the evidence for reduced perceived soreness and short-term improvements in range of motion is reasonably consistent. For actually accelerating tissue repair or clearing metabolic waste, the evidence is much weaker than the marketing suggests. Buy one because moving more comfortably has value, not because it will make you recover faster.',
          de: 'Fürs Gefühl ja — die Evidenz für weniger empfundenen Muskelkater und kurzfristig bessere Beweglichkeit ist recht konsistent. Dass sie die Geweberegeneration beschleunigen oder Stoffwechselprodukte abtransportieren, ist deutlich schwächer belegt, als die Werbung nahelegt. Kauf eine, weil angenehmere Bewegung einen Wert hat — nicht, weil du schneller regenerierst.',
        },
      },
      {
        q: { en: 'How long should I use a massage gun on one area?', de: 'Wie lange sollte ich eine Massagepistole auf einer Stelle anwenden?' },
        a: {
          en: 'Roughly 30 to 90 seconds per area, kept moving rather than pressed into one spot. Longer and harder is not better and can leave the muscle more irritated than when you started. Short and frequent beats long and aggressive.',
          de: 'Etwa 30 bis 90 Sekunden pro Bereich, in Bewegung geführt statt auf einen Punkt gedrückt. Länger und härter ist nicht besser und kann den Muskel gereizter zurücklassen als vorher. Kurz und regelmäßig schlägt lang und aggressiv.',
        },
      },
      {
        q: { en: 'Is it safe to use a massage gun on your neck?', de: 'Ist eine Massagepistole am Nacken sicher?' },
        a: {
          en: 'Only on the upper trapezius — the muscle across the back and outer slope of the shoulders — and only on the lowest speed with a soft, broad head and light pressure. Never on the front or sides of the neck, where the carotid arteries run, and never on the throat, the spine itself or the base of the skull. Stop immediately for sharp pain, numbness, tingling or dizziness.',
          de: 'Nur am oberen Trapezius — dem Muskel über dem Rücken und der äußeren Schulterpartie — und nur auf niedrigster Stufe mit weichem, breitem Aufsatz und leichtem Druck. Nie an Vorder- oder Seitenhals, wo die Halsschlagadern verlaufen, und nie an Kehle, Wirbelsäule oder Schädelbasis. Bei stechendem Schmerz, Taubheit, Kribbeln oder Schwindel sofort aufhören.',
        },
      },
      {
        q: { en: 'Massage gun or foam roller — which should I buy first?', de: 'Massagepistole oder Faszienrolle — was zuerst?' },
        a: {
          en: 'A foam roller if you are buying one thing and want the broadest use for the least money; it covers large surfaces well and costs a fraction. A massage gun if you want targeted work you can do in ninety seconds without getting on the floor — which, realistically, is why people use it more often.',
          de: 'Eine Faszienrolle, wenn du nur eine Sache kaufst und maximale Vielseitigkeit fürs wenigste Geld willst — sie deckt große Flächen gut ab und kostet einen Bruchteil. Eine Massagepistole, wenn du gezielt in neunzig Sekunden arbeiten willst, ohne dich auf den Boden zu legen — was realistisch der Grund ist, warum sie öfter genutzt wird.',
        },
      },
      {
        q: { en: 'Who should avoid percussion therapy entirely?', de: 'Wer sollte auf Percussion ganz verzichten?' },
        a: {
          en: 'Anyone on blood thinners or with a clotting disorder, a history of stroke or carotid artery disease, osteoporosis, a recent injury, or an implant in the area — check with a clinician first. Always avoid acute injuries, bruising, swelling and numb areas regardless of health status.',
          de: 'Wer Blutverdünner nimmt oder eine Gerinnungsstörung hat, nach Schlaganfall oder bei Karotiserkrankung, bei Osteoporose, frischer Verletzung oder Implantat im Bereich — vorher ärztlich abklären. Akute Verletzungen, Blutergüsse, Schwellungen und taube Stellen sind unabhängig vom Gesundheitszustand immer tabu.',
        },
      },
    ],
  },

  // ---------------------------------------------------------------------- sleep
  {
    category: 'sleep',
    slug: { en: 'sleep', de: 'schlaf' },
    title: { en: 'Sleep Tech', de: 'Schlaf-Technik' },
    description: {
      en: 'Sleep tech scored 0–100 on the public Sqwod Score — what genuinely moves sleep quality, and what is an expensive way to measure a problem you already know you have.',
      de: 'Schlaf-Technik mit Sqwod Score von 0–100 — was Schlafqualität wirklich verbessert und was nur eine teure Art ist, ein längst bekanntes Problem zu messen.',
    },
    lede: {
      en: 'It earns the top spot because it changes something about the night rather than only reporting on it — the distinction that separates most of this category.',
      de: 'Es steht oben, weil es die Nacht verändert und nicht nur darüber berichtet — genau die Unterscheidung, an der sich diese Kategorie trennt.',
    },
    before: [
      {
        en: 'Separate measuring from changing. A tracker tells you the night was bad. A mattress, a cooling layer, blackout or a temperature change makes the night better. If you already know you sleep badly, spend on the thing that changes it before the thing that quantifies it.',
        de: 'Trenne Messen von Verändern. Ein Tracker sagt dir, dass die Nacht schlecht war. Eine Matratze, eine Kühlschicht, Verdunkelung oder eine Temperaturänderung macht die Nacht besser. Wenn du ohnehin weißt, dass du schlecht schläfst, investiere zuerst in das, was es ändert.',
      },
      {
        en: 'Temperature is the most reliably useful lever in the whole category, and the least glamorous. A cooler sleeping environment does more for most people than any app.',
        de: 'Temperatur ist der zuverlässigste Hebel der ganzen Kategorie — und der unspektakulärste. Eine kühlere Schlafumgebung bringt den meisten mehr als jede App.',
      },
      {
        en: 'Watch for tracking anxiety. For a subset of people, a nightly score makes sleep measurably worse by turning rest into a performance to be graded. If checking the number in the morning affects your mood, that is a signal to track less often.',
        de: 'Achte auf Tracking-Angst. Bei manchen verschlechtert ein nächtlicher Score den Schlaf messbar, weil Erholung zur benoteten Leistung wird. Wenn die Zahl am Morgen deine Stimmung beeinflusst, ist das ein Signal, seltener zu messen.',
      },
      {
        en: 'Persistent sleep problems belong with a clinician, not a device. Sleep apnoea and insomnia are diagnosable and treatable, and no consumer product substitutes for that.',
        de: 'Anhaltende Schlafprobleme gehören ärztlich abgeklärt, nicht auf ein Gerät. Schlafapnoe und Insomnie sind diagnostizier- und behandelbar — kein Consumer-Produkt ersetzt das.',
      },
    ],
    operator: {
      en: 'Sleep is the highest-leverage thing a coach can influence and the one most often skipped, because it sits outside the session. If you are advising clients rather than buying for yourself, the useful question is what you can credibly recommend at each price point — and where the honest answer is that a fan and a blackout blind beat a four-figure device. Recommending less can be worth more to a client relationship than recommending the top of this list.',
      de: 'Schlaf ist der wirksamste Hebel, den ein Coach beeinflussen kann — und der am häufigsten übersprungene, weil er außerhalb der Einheit liegt. Wenn du Kund:innen berätst statt für dich selbst zu kaufen, ist die nützliche Frage, was du in jeder Preisklasse glaubwürdig empfehlen kannst — und wo die ehrliche Antwort lautet, dass Ventilator und Verdunkelung ein vierstelliges Gerät schlagen. Weniger zu empfehlen kann für die Kundenbeziehung mehr wert sein als die Spitze dieser Liste.',
    },
    faq: [
      {
        q: { en: 'Is sleep tracking worth it, or does it make sleep worse?', de: 'Lohnt sich Schlaftracking oder verschlechtert es den Schlaf?' },
        a: {
          en: 'It is worth it if you use the trend to change a behaviour — bedtime, alcohol, room temperature, training load. It works against you if the nightly score becomes something to worry about, which is common enough to have a name. If the number affects your mood in the morning, track weekly rather than nightly, or stop.',
          de: 'Es lohnt sich, wenn du den Trend nutzt, um etwas zu ändern — Zubettgehzeit, Alkohol, Raumtemperatur, Trainingsbelastung. Es arbeitet gegen dich, wenn der nächtliche Score zur Sorge wird — häufig genug, um einen eigenen Namen zu haben. Wenn die Zahl morgens deine Stimmung beeinflusst, miss wöchentlich statt nächtlich oder hör auf.',
        },
      },
      {
        q: { en: 'What actually improves sleep quality the most?', de: 'Was verbessert die Schlafqualität am meisten?' },
        a: {
          en: 'Consistency of timing, a cool dark room, and cutting alcohol and late caffeine — all free, and collectively worth more than anything on this page. Buy hardware to solve a problem those four have not, most often temperature or noise.',
          de: 'Regelmäßige Zeiten, ein kühler dunkler Raum und weniger Alkohol sowie kein später Koffeinkonsum — alles kostenlos und zusammen mehr wert als alles auf dieser Seite. Kauf Hardware für das Problem, das diese vier nicht gelöst haben — meist Temperatur oder Lärm.',
        },
      },
      {
        q: { en: 'Do sleep trackers detect sleep apnoea?', de: 'Erkennen Schlaftracker Schlafapnoe?' },
        a: {
          en: 'Some flag possible breathing disturbances, and that can be a useful prompt — but a flag is not a diagnosis and the absence of one is not an all-clear. If you snore heavily, wake gasping, or are exhausted despite adequate hours, that belongs with a doctor regardless of what any device says.',
          de: 'Manche weisen auf mögliche Atemstörungen hin, und das kann ein nützlicher Anstoß sein — aber ein Hinweis ist keine Diagnose, und sein Fehlen ist keine Entwarnung. Wer stark schnarcht, nach Luft ringend aufwacht oder trotz ausreichender Stunden erschöpft ist, gehört zum Arzt, unabhängig vom Gerät.',
        },
      },
      {
        q: { en: 'Is a cooling mattress or a tracker the better first purchase?', de: 'Kühlmatratze oder Tracker — was zuerst kaufen?' },
        a: {
          en: 'If you already know you sleep badly, buy the thing that changes the night. Temperature regulation has a more direct effect on sleep quality than measurement does. Buy the tracker when you need to find out what is wrong, not to confirm what you already feel every morning.',
          de: 'Wenn du ohnehin weißt, dass du schlecht schläfst, kauf das, was die Nacht verändert. Temperaturregulierung wirkt direkter auf die Schlafqualität als Messung. Den Tracker kaufst du, um herauszufinden was los ist — nicht, um zu bestätigen, was du jeden Morgen spürst.',
        },
      },
    ],
  },

  // --------------------------------------------------------------- supplements
  {
    category: 'supplements',
    slug: { en: 'supplements', de: 'supplements' },
    title: { en: 'Supplements & Nutrition', de: 'Supplements & Ernährung' },
    description: {
      en: 'Supplements scored 0–100 on the public Sqwod Score, with the evidence graded separately — what is actually proven, what is promising, and what is marketing.',
      de: 'Supplements mit Sqwod Score von 0–100 und separat bewerteter Evidenz — was wirklich belegt ist, was vielversprechend und was Marketing.',
    },
    lede: {
      en: 'It tops the list on the two things that survive scrutiny in this category: third-party testing you can verify, and a dose that matches what the studies actually used.',
      de: 'Es steht oben wegen der zwei Dinge, die in dieser Kategorie einer Prüfung standhalten: nachweisbare Fremdtestung und eine Dosis, die dem entspricht, was in den Studien wirklich verwendet wurde.',
    },
    before: [
      {
        en: 'Dose beats brand almost every time. A well-marketed product at half the studied dose does nothing the studies showed. Check the amount per serving against the research before you compare labels.',
        de: 'Die Dosis schlägt fast immer die Marke. Ein gut vermarktetes Produkt mit der halben Studiendosis leistet nicht das, was die Studien zeigten. Prüfe die Menge pro Portion gegen die Forschung, bevor du Etiketten vergleichst.',
      },
      {
        en: 'Third-party testing is the one label claim worth paying for, because supplement labels are not independently verified by default. Certification means someone checked that what is on the label is in the tub.',
        de: 'Fremdtestung ist die eine Auszeichnung, für die sich Aufpreis lohnt — denn Supplement-Etiketten werden standardmäßig nicht unabhängig geprüft. Zertifizierung heißt: Jemand hat kontrolliert, ob drin ist, was draufsteht.',
      },
      {
        en: 'Compare price per effective dose, not price per tub. A larger container at a lower dose per serving is routinely the more expensive product.',
        de: 'Vergleiche den Preis pro wirksamer Dosis, nicht pro Dose. Ein größerer Behälter mit niedrigerer Dosis pro Portion ist regelmäßig das teurere Produkt.',
      },
      {
        en: 'Proprietary blends hide doses. If a label lists a blend total instead of per-ingredient amounts, you cannot tell whether anything is present in a meaningful quantity — treat that as a reason to look elsewhere.',
        de: 'Proprietäre Mischungen verstecken Dosierungen. Wenn ein Etikett nur eine Blend-Summe statt Einzelmengen nennt, kannst du nicht erkennen, ob irgendetwas in relevanter Menge enthalten ist — das ist ein Grund, weiterzusuchen.',
      },
      {
        en: 'Anything involving a medical condition, pregnancy or medication belongs with a qualified professional. This is coaching information, not medical advice.',
        de: 'Alles, was Erkrankungen, Schwangerschaft oder Medikamente betrifft, gehört zu qualifizierten Fachleuten. Das hier ist Coaching-Information, keine medizinische Beratung.',
      },
    ],
    operator: {
      en: 'Recommending supplements to clients carries a duty of care that buying for yourself does not. Third-party certification stops being a nice-to-have and becomes the baseline, particularly for anyone tested in competition. Be careful about affiliate incentives shaping advice — the fastest way to lose a client relationship is a recommendation that turns out to have been paid for. And know what you are and are not qualified to advise on: anything touching medication, pregnancy or a diagnosed condition is a referral, not a recommendation.',
      de: 'Supplements an Kund:innen zu empfehlen bringt eine Sorgfaltspflicht mit sich, die der Eigenkauf nicht hat. Fremdzertifizierung ist dann kein Extra mehr, sondern Mindeststandard — besonders für alle, die im Wettkampf getestet werden. Sei vorsichtig, dass Affiliate-Anreize die Beratung nicht formen: Der schnellste Weg, eine Kundenbeziehung zu verlieren, ist eine Empfehlung, die sich als bezahlt herausstellt. Und kenne die Grenze deiner Qualifikation: Alles rund um Medikamente, Schwangerschaft oder Diagnosen ist eine Überweisung, keine Empfehlung.',
    },
    faq: [
      {
        q: { en: 'Which supplements actually have strong evidence behind them?', de: 'Welche Supplements haben wirklich starke Evidenz?' },
        a: {
          en: 'A short list, and it is much shorter than the shelf suggests. Creatine monohydrate, caffeine and protein for meeting intake targets are the ones with repeated meta-analytic support for training outcomes. Most of the rest sits somewhere between promising and unproven — our Sqwod Evidence briefings grade each claim and link the studies rather than asking you to take our word for it.',
          de: 'Eine kurze Liste — deutlich kürzer, als das Regal vermuten lässt. Kreatin-Monohydrat, Koffein und Protein zum Erreichen der Zufuhr sind die mit wiederholter Meta-Analysen-Unterstützung für Trainingsergebnisse. Der Rest liegt meist zwischen vielversprechend und unbelegt — unsere Sqwod-Evidence-Briefings bewerten jede Aussage und verlinken die Studien, statt um Vertrauen zu bitten.',
        },
      },
      {
        q: { en: 'What does third-party tested actually mean?', de: 'Was bedeutet fremdgetestet eigentlich?' },
        a: {
          en: 'That an independent lab verified the product contains what the label claims and no undisclosed contaminants. It matters because supplements are not pre-approved the way medicines are, so without it you are trusting the manufacturers own word. For anyone subject to competition testing it is not optional.',
          de: 'Dass ein unabhängiges Labor geprüft hat, ob das Produkt enthält, was das Etikett verspricht — und keine unerklärten Verunreinigungen. Wichtig, weil Supplements nicht wie Arzneimittel vorab zugelassen werden: Ohne Prüfung vertraust du allein dem Hersteller. Für alle mit Wettkampfkontrollen ist das keine Option, sondern Pflicht.',
        },
      },
      {
        q: { en: 'How do I compare supplement prices properly?', de: 'Wie vergleiche ich Supplement-Preise richtig?' },
        a: {
          en: 'Per effective dose, not per container. Work out the cost of one serving at the dose the research used — per five grams for creatine, per gram of protein for powder, per elemental milligram for minerals. Tub size and scoop size are the two variables most often used to make a product look cheaper than it is.',
          de: 'Pro wirksamer Dosis, nicht pro Behälter. Rechne die Kosten einer Portion in der Dosis aus, die die Forschung verwendet hat — pro fünf Gramm bei Kreatin, pro Gramm Protein beim Pulver, pro elementarem Milligramm bei Mineralstoffen. Dosengröße und Messlöffel sind die zwei Variablen, mit denen Produkte am häufigsten günstiger wirken, als sie sind.',
        },
      },
      {
        q: { en: 'Do I need to cycle creatine?', de: 'Muss ich Kreatin zyklisieren?' },
        a: {
          en: 'No. The evidence supports a consistent daily dose without cycling, and loading phases are optional — they fill stores faster but reach the same place. Consistency matters far more than timing or protocol.',
          de: 'Nein. Die Evidenz spricht für eine gleichbleibende Tagesdosis ohne Zyklen, und Ladephasen sind optional — sie füllen die Speicher schneller, landen aber am selben Punkt. Konsequenz zählt deutlich mehr als Timing oder Protokoll.',
        },
      },
      {
        q: { en: 'Does an affiliate link affect how you score supplements?', de: 'Beeinflusst ein Affiliate-Link eure Bewertung?' },
        a: {
          en: 'No. Commission never affects the Sqwod Score or the ranking — scores follow the published methodology only, affiliate links are labelled and marked rel="sponsored", and we publish low scores. There are products on this site scoring in the sixties that we still earn commission on.',
          de: 'Nein. Provisionen beeinflussen weder Sqwod Score noch Ranking — Bewertungen folgen ausschließlich der veröffentlichten Methodik, Affiliate-Links sind gekennzeichnet und mit rel="sponsored" markiert, und wir veröffentlichen auch schlechte Werte. Auf dieser Seite stehen Produkte mit Werten um die sechzig, an denen wir trotzdem verdienen.',
        },
      },
    ],
  },

  // --------------------------------------------------------- connected fitness
  {
    category: 'connected-fitness',
    slug: { en: 'connected-fitness', de: 'fitnessgeraete' },
    title: { en: 'Connected Fitness & Equipment', de: 'Connected Fitness & Fitnessgeräte' },
    description: {
      en: 'Connected machines and home equipment scored 0–100 on the public Sqwod Score — including what the subscription costs over three years and what happens when it ends.',
      de: 'Vernetzte Geräte und Heim-Equipment mit Sqwod Score von 0–100 — inklusive Abokosten über drei Jahre und was passiert, wenn das Abo endet.',
    },
    lede: {
      en: 'It wins because it is still a good machine with the subscription switched off — the test most of this category quietly fails.',
      de: 'Es gewinnt, weil es auch ohne Abo eine gute Maschine bleibt — der Test, an dem diese Kategorie meist stillschweigend scheitert.',
    },
    before: [
      {
        en: 'Ask what it is worth when the subscription lapses. Some connected machines become ordinary equipment; a few become close to unusable. That answer should drive the purchase more than the screen size does.',
        de: 'Frage, was es wert ist, wenn das Abo ausläuft. Manche vernetzten Geräte werden zu normalem Equipment, einige nahezu unbrauchbar. Diese Antwort sollte den Kauf stärker bestimmen als die Bildschirmgröße.',
      },
      {
        en: 'Price the full three years. Machine plus subscription plus delivery and assembly is the real number, and it frequently doubles the figure on the product page.',
        de: 'Rechne die vollen drei Jahre. Gerät plus Abo plus Lieferung und Aufbau ist die echte Zahl — und sie verdoppelt den Betrag auf der Produktseite häufig.',
      },
      {
        en: 'Measure the footprint before you fall in love. Include the clearance you need around it in use, not just the folded dimensions in the spec sheet.',
        de: 'Miss den Platzbedarf, bevor du dich verliebst. Rechne die Bewegungsfreiheit im Betrieb mit ein, nicht nur die Klappmaße aus dem Datenblatt.',
      },
      {
        en: 'Check what happens when it breaks. Service network, parts availability and warranty length matter more on a heavy machine than on anything else you will buy for training.',
        de: 'Prüfe, was bei einem Defekt passiert. Servicenetz, Ersatzteilverfügbarkeit und Garantiedauer zählen bei einer schweren Maschine mehr als bei allem anderen, was du fürs Training kaufst.',
      },
    ],
    operator: {
      en: 'This is where consumer and commercial diverge most sharply, and where the mistake is most expensive. Most home equipment warranties explicitly void under commercial use — putting a consumer machine in a studio can leave you with no cover from day one, and almost nobody publishes this clearly. Ask the manufacturer directly and get it in writing. Then judge on revenue per square metre and cost per member-session over the service life, not sticker price: a commercial-rated machine at three times the cost that survives ten times the sessions is not the expensive option. We run this category under genuine commercial load across two Berlin rooms, and the gap between how equipment behaves at home and at forty sessions a week is larger than any spec sheet suggests.',
      de: 'Hier trennen sich Consumer und Commercial am deutlichsten — und hier ist der Fehler am teuersten. Die meisten Heimgeräte-Garantien erlöschen bei gewerblicher Nutzung ausdrücklich. Eine Consumer-Maschine im Studio kann ab Tag eins ohne Schutz sein, und kaum jemand schreibt das klar hin. Frag den Hersteller direkt und lass es dir schriftlich geben. Bewerte dann nach Umsatz pro Quadratmeter und Kosten pro Mitgliedereinheit über die Lebensdauer, nicht nach Kaufpreis: Eine gewerbetaugliche Maschine zum dreifachen Preis, die zehnmal so viele Einheiten übersteht, ist nicht die teure Option. Wir betreiben diese Kategorie unter echter gewerblicher Last in zwei Berliner Räumen — und der Unterschied zwischen Heimnutzung und vierzig Einheiten pro Woche ist größer, als jedes Datenblatt vermuten lässt.',
    },
    faq: [
      {
        q: { en: 'What happens to a connected machine if I cancel the subscription?', de: 'Was passiert mit einem vernetzten Gerät, wenn ich das Abo kündige?' },
        a: {
          en: 'It varies enormously and it is the single most important question in this category. Some machines keep full manual control and become ordinary equipment. Others lose programmes, resistance control or most of the screen. Ask before buying, because the answer determines what you own in three years.',
          de: 'Das variiert enorm und ist die wichtigste Frage der Kategorie. Manche Geräte behalten volle manuelle Steuerung und werden zu normalem Equipment. Andere verlieren Programme, Widerstandssteuerung oder den Großteil des Displays. Frag vor dem Kauf — die Antwort bestimmt, was du in drei Jahren besitzt.',
        },
      },
      {
        q: { en: 'Is home gym equipment allowed in a commercial studio?', de: 'Darf Heim-Equipment im gewerblichen Studio stehen?' },
        a: {
          en: 'Physically yes, contractually often not. A large share of consumer equipment warranties exclude commercial use outright, which means a failure in month four may not be covered at all. Insurance and liability can be affected too. Confirm commercial rating in writing before it goes on a studio floor.',
          de: 'Physisch ja, vertraglich oft nicht. Ein großer Teil der Consumer-Garantien schließt gewerbliche Nutzung komplett aus — ein Defekt im vierten Monat ist dann möglicherweise gar nicht gedeckt. Auch Versicherung und Haftung können betroffen sein. Lass dir die Gewerbetauglichkeit schriftlich bestätigen, bevor es auf die Studiofläche kommt.',
        },
      },
      {
        q: { en: 'How much space do I actually need?', de: 'Wie viel Platz brauche ich wirklich?' },
        a: {
          en: 'More than the footprint listed. Add clearance for the movement itself, safe access on the sides you use, and room to fold or move it if that is part of the plan. Ceiling height matters for anything overhead — measure before ordering, not after delivery.',
          de: 'Mehr als die angegebene Stellfläche. Rechne Bewegungsraum, sicheren Zugang an den genutzten Seiten und Platz zum Klappen oder Verschieben dazu. Deckenhöhe zählt bei allem über Kopf — vor der Bestellung messen, nicht nach der Lieferung.',
        },
      },
      {
        q: { en: 'Are cheaper machines a false economy?', de: 'Sind günstige Geräte am Ende teurer?' },
        a: {
          en: 'For light home use, often not — a well-built budget machine used four times a week can last years. Under heavy or shared use the calculation inverts quickly, because bearings, belts and frames are where cost is removed. Judge it on expected sessions over the service life rather than on price alone.',
          de: 'Bei leichter Heimnutzung oft nicht — ein solides günstiges Gerät hält bei viermal wöchentlich Jahren stand. Bei starker oder geteilter Nutzung kippt die Rechnung schnell, denn an Lagern, Riemen und Rahmen wird gespart. Bewerte nach erwarteten Einheiten über die Lebensdauer statt nach Preis allein.',
        },
      },
    ],
  },

  // -------------------------------------------------------------------- apparel
  {
    category: 'apparel',
    slug: { en: 'apparel', de: 'sportbekleidung' },
    title: { en: 'Training Apparel & Footwear', de: 'Sportbekleidung & Schuhe' },
    description: {
      en: 'Training apparel and shoes scored 0–100 on the public Sqwod Score — what holds up to real training volume rather than a first wash.',
      de: 'Sportbekleidung und Schuhe mit Sqwod Score von 0–100 — was echtem Trainingsvolumen standhält und nicht nur der ersten Wäsche.',
    },
    lede: {
      en: 'It comes out on top for the boring reason that decides this category: it still performs after fifty washes, which is where most of the competition quietly falls apart.',
      de: 'Es steht oben aus dem langweiligen Grund, der diese Kategorie entscheidet: Es funktioniert nach fünfzig Wäschen noch — genau dort, wo die Konkurrenz still auseinanderfällt.',
    },
    before: [
      {
        en: 'Match the shoe to the movement, not the brand. A raised, rigid heel helps squats and Olympic lifts and actively hurts deadlifts. A flat, firm sole is better for pulling and general strength work. A cushioned running shoe is the wrong tool for almost everything under a barbell.',
        de: 'Wähle den Schuh nach der Bewegung, nicht nach der Marke. Eine erhöhte, feste Ferse hilft bei Kniebeugen und olympischem Heben — und schadet beim Kreuzheben. Eine flache, feste Sohle ist besser fürs Ziehen und allgemeine Krafttraining. Ein gedämpfter Laufschuh ist unter der Langhantel fast immer das falsche Werkzeug.',
      },
      {
        en: 'Judge apparel over its life, not on day one. Everything feels good new. What separates products is odour retention, seam durability and whether the fabric still does its job after months of washing.',
        de: 'Bewerte Bekleidung über die Lebensdauer, nicht am ersten Tag. Neu fühlt sich alles gut an. Der Unterschied liegt in Geruchsbildung, Nahtfestigkeit und ob der Stoff nach Monaten Wäsche noch seine Aufgabe erfüllt.',
      },
      {
        en: 'Sizing varies more between brands than within them. Use the brands own measurement chart rather than your usual size, particularly for anything compressive.',
        de: 'Größen unterscheiden sich zwischen Marken stärker als innerhalb. Nutze die Maßtabelle der Marke statt deiner üblichen Größe — besonders bei allem Kompressiven.',
      },
      {
        en: 'If you compete, check the federation rules before you buy. Thickness and length limits on sleeves and belts are specific, enforced, and cheaper to read than to discover on the platform.',
        de: 'Wer im Wettkampf startet, prüft vorher das Reglement. Dicken- und Längenlimits bei Bandagen und Gürteln sind konkret, werden kontrolliert — und sind billiger nachzulesen als auf der Bühne herauszufinden.',
      },
    ],
    operator: {
      en: 'Coaches buy apparel differently: you are on the floor for far more hours than any client, so durability per euro over a year is the honest metric, not how something looks new. If you are considering branded kit for a studio, the questions are minimum order quantities, whether the blank holds up to commercial laundering, and how the colour looks after twenty washes. Recommending gear to clients also carries a quiet responsibility — a shoe recommendation that puts someone in the wrong heel height for their lift is a coaching error wearing a shopping decision.',
      de: 'Coaches kaufen Bekleidung anders: Du stehst deutlich mehr Stunden auf der Fläche als jede:r Kund:in, also ist Haltbarkeit pro Euro über ein Jahr die ehrliche Kennzahl — nicht, wie etwas neu aussieht. Bei gebrandeter Studio-Kleidung lauten die Fragen: Mindestbestellmenge, hält der Rohling gewerbliche Wäsche aus, und wie sieht die Farbe nach zwanzig Wäschen aus? Empfehlungen an Kund:innen tragen zudem eine stille Verantwortung — ein Schuhtipp mit falscher Absatzhöhe für die jeweilige Übung ist ein Coaching-Fehler im Gewand einer Kaufentscheidung.',
    },
    faq: [
      {
        q: { en: 'Do I need weightlifting shoes, or is this just marketing?', de: 'Brauche ich Gewichtheberschuhe oder ist das nur Marketing?' },
        a: {
          en: 'They genuinely help if limited ankle mobility is capping your squat depth or you do Olympic lifts, because the raised heel lets you reach depth with a more upright torso. They are unhelpful and often counterproductive for deadlifts, where you want to be as close to the floor as possible. If you mainly deadlift and press, a flat firm sole is the better buy.',
          de: 'Sie helfen wirklich, wenn eingeschränkte Sprunggelenksbeweglichkeit deine Kniebeugentiefe begrenzt oder du olympisch hebst — die erhöhte Ferse ermöglicht Tiefe bei aufrechterem Oberkörper. Beim Kreuzheben sind sie unnütz und oft hinderlich, weil du dem Boden möglichst nah sein willst. Wer vor allem zieht und drückt, kauft besser eine flache, feste Sohle.',
        },
      },
      {
        q: { en: 'What heel height should I choose?', de: 'Welche Absatzhöhe soll ich wählen?' },
        a: {
          en: 'Lower heels suit those with reasonable ankle mobility and anyone doing mixed training; higher heels suit longer femurs, restricted ankles and dedicated Olympic lifting. If you are unsure, go lower — a heel that is too high shifts load forward and can make the squat feel less stable, not more.',
          de: 'Niedrigere Absätze passen bei ordentlicher Sprunggelenksbeweglichkeit und gemischtem Training, höhere bei langen Oberschenkeln, eingeschränkten Sprunggelenken und gezieltem olympischem Heben. Im Zweifel niedriger: Ein zu hoher Absatz verlagert die Last nach vorn und kann die Kniebeuge instabiler machen, nicht stabiler.',
        },
      },
      {
        q: { en: 'How should knee sleeves fit?', de: 'Wie sollen Kniebandagen sitzen?' },
        a: {
          en: 'Snug enough that they take real effort to pull on, without cutting off circulation or numbing anything below the knee. Use the brands measurement chart rather than your clothing size, and expect to size differently between brands. If you compete, check your federations thickness and length limits first.',
          de: 'So eng, dass das Anziehen echte Mühe kostet — ohne die Durchblutung abzuschnüren oder etwas unterhalb des Knies taub werden zu lassen. Nutze die Maßtabelle der Marke statt deiner Kleidergröße und rechne mit Unterschieden zwischen Marken. Im Wettkampf zuerst Dicken- und Längenlimits des Verbands prüfen.',
        },
      },
      {
        q: { en: 'Is expensive training apparel worth it?', de: 'Lohnt sich teure Sportbekleidung?' },
        a: {
          en: 'Sometimes, and the reason is longevity rather than performance. Better fabric and construction usually mean less odour retention and seams that survive more washes, which matters if you train four or five times a week. If you train twice a week, the premium is much harder to justify.',
          de: 'Manchmal — und der Grund ist Haltbarkeit, nicht Leistung. Besserer Stoff und Verarbeitung bedeuten meist weniger Geruchsbildung und Nähte, die mehr Wäschen überstehen. Das zählt bei vier bis fünf Einheiten pro Woche. Wer zweimal wöchentlich trainiert, rechtfertigt den Aufpreis schwerer.',
        },
      },
    ],
  },

  // ----------------------------------------------------------------------- apps
  {
    category: 'apps',
    slug: { en: 'training-apps', de: 'trainings-apps' },
    title: { en: 'Training Apps & Software', de: 'Trainings-Apps & Software' },
    description: {
      en: 'Training apps and coaching software scored 0–100 on the public Sqwod Score — including what it costs to leave and whether your data comes with you.',
      de: 'Trainings-Apps und Coaching-Software mit Sqwod Score von 0–100 — inklusive Wechselkosten und ob deine Daten mitkommen.',
    },
    lede: {
      en: 'It leads because it is the one you will still be using in a year, which in software is a completely different question from which one demos best.',
      de: 'Sie führt, weil du sie in einem Jahr noch nutzt — bei Software eine völlig andere Frage als die, welche sich am besten vorführen lässt.',
    },
    before: [
      {
        en: 'Ask how you leave before you ask how you start. Whether your history exports in a usable format determines whether this is a tool or a trap. Test the export on day one, not in year two.',
        de: 'Frag, wie du wieder rauskommst, bevor du fragst, wie du reinkommst. Ob sich deine Historie brauchbar exportieren lässt, entscheidet, ob das ein Werkzeug oder eine Falle ist. Teste den Export an Tag eins, nicht im zweiten Jahr.',
      },
      {
        en: 'The best app is the one you open on a bad day. Sophistication you will not maintain is worth less than something simple you actually log in.',
        de: 'Die beste App ist die, die du an einem schlechten Tag öffnest. Raffinesse, die du nicht durchhältst, ist weniger wert als etwas Einfaches, das du tatsächlich ausfüllst.',
      },
      {
        en: 'Check what it connects to. An app that does not talk to your wearable, your calendar or your billing system creates the admin it promised to remove.',
        de: 'Prüfe die Anbindungen. Eine App, die nicht mit Wearable, Kalender oder Abrechnung spricht, erzeugt genau die Verwaltung, die sie abschaffen wollte.',
      },
      {
        en: 'Watch for per-client pricing. Software that is cheap at ten clients can become your largest fixed cost at sixty, so model it at the roster size you are aiming for, not the one you have.',
        de: 'Achte auf Preise pro Kunde. Software, die bei zehn Kund:innen günstig ist, kann bei sechzig dein größter Fixkostenblock werden. Rechne mit der Kundenzahl, die du anstrebst — nicht der aktuellen.',
      },
    ],
    operator: {
      en: 'For a coach or studio this is infrastructure, not an app, and switching later is genuinely painful — it costs you history, client habits and often a few clients. Model the cost at the roster size you are targeting rather than todays. Insist on data export in a real format before you commit. And check the GDPR position properly if you operate in the EU: where client data is stored, who processes it, and whether you have a data processing agreement. That is not paperwork for its own sake — it is the thing that becomes a problem exactly when the business is going well.',
      de: 'Für Coaches und Studios ist das Infrastruktur, keine App — und ein späterer Wechsel tut wirklich weh: Er kostet Historie, Kundengewohnheiten und meist ein paar Kund:innen. Rechne mit der angestrebten Kundenzahl, nicht der heutigen. Bestehe vor der Entscheidung auf Datenexport in einem echten Format. Und kläre die DSGVO-Lage sauber, wenn du in der EU arbeitest: wo Kundendaten liegen, wer sie verarbeitet, und ob ein Auftragsverarbeitungsvertrag vorliegt. Das ist kein Papierkram um seiner selbst willen — es wird genau dann zum Problem, wenn das Geschäft gut läuft.',
    },
    faq: [
      {
        q: { en: 'What should I check before committing to coaching software?', de: 'Was sollte ich vor der Entscheidung für Coaching-Software prüfen?' },
        a: {
          en: 'Three things, in this order: whether your data exports in a usable format, what it costs at the client count you are aiming for rather than the one you have, and whether it integrates with the tools you already run. Features are easy to compare and rarely what you regret.',
          de: 'Drei Dinge, in dieser Reihenfolge: ob sich deine Daten brauchbar exportieren lassen, was es bei der angestrebten Kundenzahl kostet statt der aktuellen, und ob es sich in deine bestehenden Tools einfügt. Features lassen sich leicht vergleichen und sind selten das, was man später bereut.',
        },
      },
      {
        q: { en: 'Is a free training app good enough?', de: 'Reicht eine kostenlose Trainings-App?' },
        a: {
          en: 'For training yourself, very often yes — logging consistently matters more than the software doing it. For coaching others, free tools usually break down on client management, billing and data protection rather than on programming features.',
          de: 'Fürs eigene Training sehr oft ja — konsequentes Protokollieren zählt mehr als die Software dahinter. Fürs Coaching anderer scheitern kostenlose Tools meist an Kundenverwaltung, Abrechnung und Datenschutz, nicht an den Programmierfunktionen.',
        },
      },
      {
        q: { en: 'Can I move my training history between apps?', de: 'Kann ich meine Trainingshistorie zwischen Apps mitnehmen?' },
        a: {
          en: 'Sometimes, and less often than you would hope. Export quality varies from a clean structured file to a screenshot-grade summary. Test the export in your first week while you still have nothing to lose — that single check tells you more about a company than its feature list.',
          de: 'Manchmal — und seltener, als man hofft. Die Exportqualität reicht von sauberer strukturierter Datei bis zur Zusammenfassung auf Screenshot-Niveau. Teste den Export in der ersten Woche, solange du nichts zu verlieren hast. Diese eine Prüfung sagt mehr über ein Unternehmen als jede Feature-Liste.',
        },
      },
      {
        q: { en: 'Where does client data sit, and does that matter?', de: 'Wo liegen Kundendaten — und spielt das eine Rolle?' },
        a: {
          en: 'It matters a great deal in the EU. Training and health data about identifiable clients falls under GDPR, which means you need to know where it is processed and to have an agreement in place with the provider. Ask before you onboard clients, not after.',
          de: 'In der EU sehr. Trainings- und Gesundheitsdaten identifizierbarer Kund:innen fallen unter die DSGVO — du musst wissen, wo sie verarbeitet werden, und brauchst eine Vereinbarung mit dem Anbieter. Frag, bevor du Kund:innen einlädst, nicht danach.',
        },
      },
    ],
  },

  // --------------------------------------------------------------- studio tools
  {
    category: 'studio-tools',
    slug: { en: 'studio-tools', de: 'studio-tools' },
    title: { en: 'Coaching & Studio Tools', de: 'Coaching- & Studio-Tools' },
    description: {
      en: 'Booking, payments and studio operations software scored 0–100 on the public Sqwod Score — judged on what it costs to run a real business, not what it looks like in a demo.',
      de: 'Buchung, Zahlung und Studio-Betrieb mit Sqwod Score von 0–100 — bewertet nach den Kosten im echten Betrieb, nicht nach dem Eindruck in der Demo.',
    },
    lede: {
      en: 'It comes first because it disappears into the day rather than adding to it — the only meaningful test for software you have to touch every morning.',
      de: 'Es steht vorn, weil es im Alltag verschwindet statt ihn zu belasten — der einzige sinnvolle Test für Software, die du jeden Morgen anfassen musst.',
    },
    before: [
      {
        en: 'Count the total cost of taking money, not the monthly fee. Payment processing percentages, per-transaction charges and payout timing usually outweigh the subscription line by a wide margin.',
        de: 'Zähle die Gesamtkosten des Geldeinnehmens, nicht die Monatsgebühr. Zahlungsgebühren in Prozent, Transaktionskosten und Auszahlungszeiten übersteigen den Abopreis meist deutlich.',
      },
      {
        en: 'Judge it from the clients side. If booking takes more than about thirty seconds on a phone, the friction shows up as lost bookings long before it shows up as a complaint.',
        de: 'Beurteile es aus Kundensicht. Wenn eine Buchung am Handy länger als etwa dreißig Sekunden dauert, zeigt sich die Reibung als verlorene Buchung, lange bevor sie als Beschwerde ankommt.',
      },
      {
        en: 'Check no-show handling before anything else. Deposits, cancellation windows and automatic reminders protect more revenue than any marketing feature in the same product.',
        de: 'Prüfe zuerst den Umgang mit No-Shows. Anzahlungen, Stornofristen und automatische Erinnerungen schützen mehr Umsatz als jede Marketing-Funktion im selben Produkt.',
      },
      {
        en: 'Confirm you can export your client list. It is your business asset, and a platform that makes leaving hard has told you something about how it plans to keep you.',
        de: 'Stelle sicher, dass du deine Kundenliste exportieren kannst. Sie ist dein Geschäftswert — und eine Plattform, die den Wechsel erschwert, hat dir etwas darüber gesagt, wie sie dich halten will.',
      },
    ],
    operator: {
      en: 'This whole category is Rail B, so the framing is straightforward: every item is judged on what it does to utilisation, no-show rate and admin hours, because those are the three numbers that decide whether a small studio works. We run this stack ourselves across two Berlin locations, which means the assessments here come from operating the software rather than reviewing it — including the parts that only become visible in month six, like what happens to a booking when a client changes timezone or a payment fails at 6am on a Saturday.',
      de: 'Diese Kategorie ist komplett Rail B, also ist die Sicht klar: Jedes Produkt wird daran gemessen, was es mit Auslastung, No-Show-Quote und Verwaltungsstunden macht — die drei Zahlen, die über ein kleines Studio entscheiden. Wir betreiben diesen Stack selbst an zwei Berliner Standorten. Die Bewertungen stammen also aus dem Betrieb, nicht aus dem Test — inklusive der Dinge, die erst im sechsten Monat sichtbar werden, etwa was mit einer Buchung passiert, wenn eine Zeitzone wechselt oder eine Zahlung samstags um sechs Uhr früh scheitert.',
    },
    faq: [
      {
        q: { en: 'What actually reduces no-shows?', de: 'Was reduziert No-Shows wirklich?' },
        a: {
          en: 'A card on file with a clear cancellation window does most of the work, followed by automatic reminders timed close enough to matter. Softer measures help at the margin, but nothing moves the number like a client having something at stake and knowing the rule in advance.',
          de: 'Eine hinterlegte Karte mit klarer Stornofrist leistet den größten Teil, gefolgt von automatischen Erinnerungen zum richtigen Zeitpunkt. Weichere Maßnahmen helfen am Rand — aber nichts bewegt die Zahl so wie ein spürbarer Einsatz und eine vorab bekannte Regel.',
        },
      },
      {
        q: { en: 'How much should booking software cost?', de: 'Was sollte Buchungssoftware kosten?' },
        a: {
          en: 'Judge it as a percentage of the revenue that flows through it, including payment processing, rather than as a monthly figure. A cheaper subscription with higher transaction fees is frequently the more expensive system once you are actually busy.',
          de: 'Bewerte sie als Prozentsatz des durchlaufenden Umsatzes inklusive Zahlungsgebühren, nicht als Monatsbetrag. Ein günstigeres Abo mit höheren Transaktionsgebühren ist bei echter Auslastung häufig das teurere System.',
        },
      },
      {
        q: { en: 'Do I need studio software as a solo coach?', de: 'Brauche ich Studio-Software als Einzelcoach?' },
        a: {
          en: 'Not immediately. A calendar and an invoice work fine early on. The switch usually pays for itself when scheduling admin passes a couple of hours a week, or when no-shows start costing more than the software would.',
          de: 'Nicht sofort. Ein Kalender und eine Rechnung reichen am Anfang. Der Wechsel rechnet sich meist, wenn die Terminverwaltung ein paar Stunden pro Woche übersteigt oder No-Shows mehr kosten als die Software.',
        },
      },
      {
        q: { en: 'What happens to my clients if I switch platforms?', de: 'Was passiert mit meinen Kund:innen bei einem Plattformwechsel?' },
        a: {
          en: 'Expect to lose some, which is why export matters. You will need your client list, their booking history and their payment details in a portable form, and payment tokens in particular are often not transferable. Plan a switch around a quiet period and communicate it before it happens rather than after.',
          de: 'Rechne mit Verlusten — deshalb zählt der Export. Du brauchst Kundenliste, Buchungshistorie und Zahlungsdaten in portabler Form, wobei gerade Zahlungs-Token oft nicht übertragbar sind. Plane den Wechsel in eine ruhige Phase und kommuniziere ihn vorher, nicht hinterher.',
        },
      },
    ],
  },
];

export const byGuideCategory = (slug: string) => guides.find((g) => g.category === slug);

/** Resolve a localized URL slug back to its guide (for getStaticPaths). */
export const byLocalizedSlug = (lang: Lang, slug: string) =>
  guides.find((g) => g.slug[lang] === slug);
