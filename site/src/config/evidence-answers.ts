import { type Lang } from '../i18n/ui';
import { type Tier, tierMeta } from './supplements-az';

// Answer box at the top of every Evidence playbook (27 Oct 2026, Tee approved
// "all 23"). The fast answer a coach came for: verdict, evidence grade, what to
// do, what to watch. Every line is taken from that playbook's own graded
// sections and "Your script for Monday": the box summarises, it never adds a
// claim. Supplement verdicts match config/supplements-az.ts. When a playbook
// changes, re-check its entry here.

type L = Record<Lang, string>;
export type AnswerTier = Tier | 'myth';
export const answerTierLabel = (t: AnswerTier, lang: Lang) =>
  t === 'myth' ? (lang === 'de' ? 'Mythos' : 'Myth') : tierMeta[t].label[lang];
export interface EvidenceAnswer {
  // Pill. Tier = "should a coach recommend it?". 'myth' (28 Oct 2026, Tee) = a
  // popular claim the research does not support (cycle-syncing, the anabolic window).
  tier?: AnswerTier;
  verdict: L;    // one sentence
  grade: L;      // strongest relevant grade from the page
  doThis: L;
  watch: L;
}

export const evidenceAnswers: Record<string, EvidenceAnswer> = {
  // ---------------------------------------------------------------- supplements
  'ashwagandha-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Small, real effects on stress, anxiety and sleep. The muscle and testosterone claims are small and oversold.', de: 'Kleine, echte Effekte auf Stress, Angst und Schlaf. Die Versprechen zu Muskeln und Testosteron sind klein und übertrieben.' },
    grade: { en: 'Moderate (stress, sleep)', de: 'Moderat (Stress, Schlaf)' },
    doThis: { en: '300 to 600 mg a day of a standardised extract for about 8 weeks, as a time-limited trial, not forever.', de: '300 bis 600 mg täglich eines standardisierten Extrakts über etwa 8 Wochen, als begrenzter Test, nicht dauerhaft.' },
    watch: { en: 'Not if pregnant or trying to conceive, or with a thyroid or liver condition. On prescription medication: doctor first. Rare liver injury is documented.', de: 'Nicht bei Schwangerschaft oder Kinderwunsch, Schilddrüsen- oder Lebererkrankung. Bei verschreibungspflichtigen Medikamenten zuerst ärztlich abklären. Seltene Leberschäden sind dokumentiert.' },
  },
  'bcaa-evidence-coach-playbook': {
    tier: 'skip',
    verdict: { en: 'BCAAs are 3 of the 9 essential amino acids. They ease soreness, but add nothing for muscle once protein is covered.', de: 'BCAAs sind 3 der 9 essenziellen Aminosäuren. Sie lindern Muskelkater, bringen aber nichts für Muskeln, wenn das Protein stimmt.' },
    grade: { en: 'Strong: no benefit over enough protein', de: 'Stark: kein Nutzen über genug Protein hinaus' },
    doThis: { en: 'Check daily protein first (about 1.6 g/kg). For muscle, buy whole protein or a full EAA blend instead.', de: 'Zuerst das Tagesprotein prüfen (etwa 1,6 g/kg). Für Muskeln lieber vollwertiges Protein oder einen kompletten EAA-Mix kaufen.' },
    watch: { en: 'The one real use is soreness, taken before the session. Not a muscle builder.', de: 'Der einzige echte Nutzen ist weniger Muskelkater, vor dem Training genommen. Kein Muskelaufbau-Mittel.' },
  },
  'beta-alanine-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'A small edge in hard efforts of about 30 seconds to 10 minutes, and nothing outside that window.', de: 'Ein kleiner Vorteil bei harten Belastungen von etwa 30 Sekunden bis 10 Minuten, außerhalb davon nichts.' },
    grade: { en: 'Strong for the window, small effect', de: 'Stark fürs Zeitfenster, kleiner Effekt' },
    doThis: { en: '4 to 6 g a day, split into smaller doses with meals, every day for at least a month.', de: '4 bis 6 g täglich, auf kleinere Dosen zu den Mahlzeiten verteilt, mindestens einen Monat lang.' },
    watch: { en: 'No effect on body composition or lifting. The tingle is harmless and is not a sign it works.', de: 'Kein Effekt auf Körperzusammensetzung oder Kraft. Das Kribbeln ist harmlos und kein Zeichen der Wirkung.' },
  },
  'caffeine-evidence-coach-playbook': {
    tier: 'yes',
    verdict: { en: 'One of the best-evidenced performance aids: about 2 to 4% faster endurance time trials, smaller gains for strength.', de: 'Eine der am besten belegten Leistungshilfen: etwa 2 bis 4 % schnellere Ausdauer-Zeitfahren, kleinere Effekte bei Kraft.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: '3 to 6 mg/kg about 60 minutes before hard sessions. Under about 400 mg a day, none in the last 9 hours before bed.', de: '3 bis 6 mg/kg etwa 60 Minuten vor harten Einheiten. Unter etwa 400 mg pro Tag, nichts in den 9 Stunden vor dem Schlafen.' },
    watch: { en: 'More is not better. Blood-pressure or heart issues: check with a doctor first.', de: 'Mehr ist nicht besser. Bei Blutdruck- oder Herzproblemen zuerst ärztlich abklären.' },
  },
  'creatine-evidence-coach-playbook': {
    tier: 'yes',
    verdict: { en: 'The most-researched supplement: more strength alongside training, and lean tissue in older adults.', de: 'Das am besten erforschte Supplement: mehr Kraft zusammen mit Training und mehr Muskelmasse bei Älteren.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: '5 g of plain creatine monohydrate a day, any time. Loading is optional.', de: '5 g einfaches Kreatin-Monohydrat täglich, Zeitpunkt egal. Eine Ladephase ist optional.' },
    watch: { en: 'Hair-loss and kidney fears are not supported in healthy adults. Pregnancy or a kidney condition: ask a doctor.', de: 'Ängste um Haarausfall und Nieren sind bei Gesunden nicht belegt. Bei Schwangerschaft oder Nierenerkrankung ärztlich abklären.' },
  },
  'omega-3-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Not a muscle supplement. The real case is moderate help with chronic pain and general health.', de: 'Kein Muskel-Supplement. Der echte Nutzen ist moderate Hilfe bei chronischen Schmerzen und für die Gesundheit allgemein.' },
    grade: { en: 'Moderate for pain; none for muscle', de: 'Moderat bei Schmerz; kein Muskeleffekt' },
    doThis: { en: 'About 1 to 1.5 g of EPA and DHA combined a day, for 3 months. Most cheap capsules contain far less.', de: 'Etwa 1 bis 1,5 g EPA und DHA zusammen pro Tag, über 3 Monate. Die meisten billigen Kapseln enthalten viel weniger.' },
    watch: { en: 'No megadosing: heart-rhythm risk rises above about 1 g a day. Heart condition, blood thinners or pregnancy: ask a doctor.', de: 'Keine Megadosen: Ab etwa 1 g pro Tag steigt das Risiko für Herzrhythmusstörungen. Bei Herzerkrankung, Blutverdünnern oder Schwangerschaft ärztlich abklären.' },
  },
  'magnesium-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Worth it when intake is low, which is common. The sleep effect is modest and uncertain.', de: 'Sinnvoll bei niedriger Zufuhr, und die ist häufig. Der Schlafeffekt ist klein und unsicher.' },
    grade: { en: 'Moderate when intake is low', de: 'Moderat bei niedriger Zufuhr' },
    doThis: { en: 'Food first: greens, beans, nuts, whole grains. If supplementing, citrate or glycinate, not oxide.', de: 'Zuerst über die Ernährung: Gemüse, Hülsenfrüchte, Nüsse, Vollkorn. Wenn Supplement, dann Citrat oder Glycinat, kein Oxid.' },
    watch: { en: 'No good evidence for common night cramps. Medical condition, pregnancy or medication: ask a doctor.', de: 'Keine gute Evidenz bei normalen nächtlichen Krämpfen. Bei Erkrankung, Schwangerschaft oder Medikamenten ärztlich abklären.' },
  },
  'peptides-evidence-coach-playbook': {
    tier: 'avoid',
    verdict: { en: 'BPC-157 and TB-500 are almost entirely animal data. MK-677 added mass but no strength, and raised blood sugar.', de: 'BPC-157 und TB-500 beruhen fast nur auf Tierdaten. MK-677 brachte Masse, aber keine Kraft, und erhöhte den Blutzucker.' },
    grade: { en: 'Preclinical (BPC-157, TB-500)', de: 'Präklinisch (BPC-157, TB-500)' },
    doThis: { en: 'Put the energy into what is proven. Collagen or whey peptides are a different, food-based thing.', de: 'Die Energie in das stecken, was belegt ist. Kollagen- oder Molkenpeptide sind etwas anderes, lebensmittelbasiert.' },
    watch: { en: 'Unapproved, unregulated, unknown contents, and banned in tested sport. The risk sits with the client.', de: 'Nicht zugelassen, unreguliert, unklarer Inhalt und im Wettkampfsport verboten. Das Risiko trägt der Kunde.' },
  },
  'protein-evidence-coach-playbook': {
    tier: 'yes',
    verdict: { en: 'The daily total drives muscle and strength, and only alongside resistance training.', de: 'Die Tagesmenge treibt Muskeln und Kraft, und nur zusammen mit Krafttraining.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: '1.6 to 2.2 g/kg a day, spread as 20 to 40 g per meal. Older clients: protein soon after training helps more.', de: '1,6 bis 2,2 g/kg pro Tag, verteilt auf 20 bis 40 g pro Mahlzeit. Ältere: Protein bald nach dem Training hilft mehr.' },
    watch: { en: 'The 30-minute window is mostly a myth. Existing kidney disease: ask a doctor.', de: 'Das 30-Minuten-Fenster ist größtenteils ein Mythos. Bei bestehender Nierenerkrankung ärztlich abklären.' },
  },
  'vitamin-d-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'A correction supplement, not a performance one. It helps people who are low, common in northern winters.', de: 'Ein Ausgleichs-, kein Leistungs-Supplement. Es hilft bei niedrigen Werten, häufig im nördlichen Winter.' },
    grade: { en: 'Moderate for people who are low', de: 'Moderat bei niedrigen Werten' },
    doThis: { en: 'A modest daily dose through the dark months. Daily beats monthly megadoses.', de: 'Eine moderate Tagesdosis in den dunklen Monaten. Täglich ist besser als monatliche Megadosen.' },
    watch: { en: 'Very high doses add side effects without benefit. Testing levels is the doctor’s job.', de: 'Sehr hohe Dosen bringen Nebenwirkungen ohne Nutzen. Den Spiegel testen ist Sache der Ärztin oder des Arztes.' },
  },
  'supplement-triage-evidence-coach-playbook': {
    verdict: { en: 'Keep creatine, caffeine for hard sessions, and protein only to fill a food gap. Drop BCAAs, test boosters and fat burners.', de: 'Behalten: Kreatin, Koffein für harte Einheiten und Protein nur bei einer Lücke. Weg: BCAAs, Testo-Booster und Fatburner.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'Buy only products with third-party batch testing on the label.', de: 'Nur Produkte mit unabhängiger Chargenprüfung auf dem Etikett kaufen.' },
    watch: { en: 'In one analysis of 200 products, 35% contained WADA-prohibited substances, most not listed on the label.', de: 'In einer Analyse von 200 Produkten enthielten 35 % Substanzen von der WADA-Verbotsliste, die meisten nicht auf dem Etikett.' },
  },
  // ------------------------------------------------------------------- training
  'blood-flow-restriction-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Builds about as much muscle as heavy lifting, with a little less strength. An option when heavy lifting is not right, not a shortcut.', de: 'Baut etwa so viel Muskel auf wie schweres Training, mit etwas weniger Kraftzuwachs. Eine Option, wenn schweres Training nicht passt, keine Abkürzung.' },
    grade: { en: 'Strong as an alternative to heavy lifting', de: 'Stark als Alternative zu schwerem Training' },
    doThis: { en: 'Set the cuff pressure properly for each person, with someone trained on the device.', de: 'Den Manschettendruck individuell richtig einstellen, mit jemandem, der am Gerät geschult ist.' },
    watch: { en: 'Heart or blood-pressure problems, clotting issues, diabetes, kidney problems, pregnancy or recent surgery: doctor or physio first.', de: 'Bei Herz- oder Blutdruckproblemen, Gerinnungsstörungen, Diabetes, Nierenproblemen, Schwangerschaft oder kürzlicher OP zuerst Arzt oder Physio.' },
  },
  'menopause-training-evidence-coach-playbook': {
    verdict: { en: 'Women build strength just as well after menopause. The background changes, so standing still costs more.', de: 'Frauen bauen nach der Menopause genauso gut Kraft auf. Die Ausgangslage ändert sich, Stillstand kostet mehr.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'Progressive, heavy-enough lifting with coached technique, more volume for body composition, about 1.2 g/kg protein a day.', de: 'Progressives, ausreichend schweres Krafttraining mit Technik-Betreuung, mehr Volumen für die Figur, etwa 1,2 g/kg Protein täglich.' },
    watch: { en: 'Evidence on symptoms is mixed. Hormone therapy and bone-density results are for the doctor.', de: 'Die Evidenz zu Beschwerden ist gemischt. Hormontherapie und Knochendichte-Werte gehören zur Ärztin oder zum Arzt.' },
  },
  'menstrual-cycle-periodization-evidence-coach-playbook': {
    tier: 'myth',
    verdict: { en: 'Phase-based programming shows small to no effect on strength or muscle. Birth control does not hold gains back.', de: 'Zyklusbasierte Trainingsplanung zeigt kleine bis keine Effekte auf Kraft oder Muskeln. Die Pille bremst den Fortschritt nicht.' },
    grade: { en: 'Weak and conflicting for cycle-syncing', de: 'Schwach und widersprüchlich für Zyklus-Training' },
    doThis: { en: 'Adjust to how she feels and performs week to week, not to a calendar.', de: 'Nach Befinden und Leistung von Woche zu Woche anpassen, nicht nach dem Kalender.' },
    watch: { en: 'Irregular or absent periods, or a diagnosed condition: a conversation for the doctor.', de: 'Unregelmäßige oder ausbleibende Periode oder eine Diagnose: ein Thema für die Ärztin oder den Arzt.' },
  },
  'zone-2-cardio-evidence-coach-playbook': {
    tier: 'yes',
    verdict: { en: 'Great for the aerobic base and easy to recover from, but not uniquely optimal and not a fat-loss trick.', de: 'Gut für die Grundlagenausdauer und leicht zu verkraften, aber nicht einzigartig und kein Fettverbrennungs-Trick.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'If you can talk in full sentences, you are there. Lots of easy, some moderate, a little hard.', de: 'Wer in ganzen Sätzen sprechen kann, ist im Bereich. Viel locker, etwas moderat, ein wenig hart.' },
    watch: { en: 'Heart-rate shortcuts often set the zone wrong. Short on time: intervals build the same engine faster.', de: 'Pulsformeln setzen die Zone oft falsch. Wenig Zeit: Intervalle bauen dieselbe Basis schneller auf.' },
  },
  // ------------------------------------------------------- nutrition & metabolism
  'glp1-muscle-evidence-coach-playbook': {
    verdict: { en: 'About a quarter of weight lost on GLP-1 drugs is lean mass. Lifting and protein are the evidence-based fix.', de: 'Etwa ein Viertel des Gewichtsverlusts unter GLP-1 ist fettfreie Masse. Krafttraining und Protein sind die belegte Gegenmaßnahme.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'Lift at least twice a week, 1.2 to 1.6 g/kg protein a day, and track strength rather than scan numbers.', de: 'Mindestens zweimal pro Woche Krafttraining, 1,2 bis 1,6 g/kg Protein täglich, und Kraft statt Scan-Werte verfolgen.' },
    watch: { en: 'Medication questions belong with the doctor. The coach handles training and food.', de: 'Fragen zum Medikament gehören zur Ärztin oder zum Arzt. Der Coach kümmert sich um Training und Ernährung.' },
  },
  'protein-timing-evidence-coach-playbook': {
    tier: 'myth',
    verdict: { en: 'The 30-minute anabolic window does not hold up. The daily total is what matters.', de: 'Das 30-Minuten-Fenster hält nicht. Entscheidend ist die Tagesmenge.' },
    grade: { en: 'Strong that timing is not the driver', de: 'Stark: Das Timing ist nicht entscheidend' },
    doThis: { en: '1.6 to 2.2 g/kg a day over about four protein meals. Some protein before bed if training late.', de: '1,6 bis 2,2 g/kg pro Tag über etwa vier Proteinmahlzeiten. Bei spätem Training etwas Protein vor dem Schlafen.' },
    watch: { en: 'There is no hard 20 to 30 g per-meal ceiling. Kidney condition: check the number with a doctor.', de: 'Es gibt keine feste Grenze von 20 bis 30 g pro Mahlzeit. Bei Nierenerkrankung die Menge ärztlich abklären.' },
  },
  'seed-oils-evidence-coach-playbook': {
    verdict: { en: 'The "toxic, inflammatory" claim is not what the biggest studies show. Higher linoleic acid tracks with lower mortality.', de: 'Die These "giftig und entzündlich" deckt sich nicht mit den größten Studien. Mehr Linolsäure geht mit geringerer Sterblichkeit einher.' },
    grade: { en: 'Strong against the inflammation claim', de: 'Stark gegen die Entzündungs-These' },
    doThis: { en: 'Cook with any fresh oil. Do not reuse frying oil again and again.', de: 'Mit jedem frischen Öl kochen. Frittieröl nicht immer wieder verwenden.' },
    watch: { en: 'Proof that they are actively heart-protective is weaker than claimed either way.', de: 'Der Beweis, dass sie das Herz aktiv schützen, ist schwächer als oft behauptet.' },
  },
  // -------------------------------------------------------------- recovery & sleep
  'cold-plunge-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Good for soreness and next-day recovery. Right after lifting, it blunts muscle growth.', de: 'Gut gegen Muskelkater und für die Erholung am nächsten Tag. Direkt nach dem Krafttraining bremst es den Muskelaufbau.' },
    grade: { en: 'Moderate to strong for soreness', de: 'Moderat bis stark gegen Muskelkater' },
    doThis: { en: '10 to 15 minutes at 11 to 15 °C after matches, races or hard weeks. Keep a few hours away from lifting.', de: '10 bis 15 Minuten bei 11 bis 15 °C nach Spielen, Rennen oder harten Wochen. Einige Stunden Abstand zum Krafttraining.' },
    watch: { en: 'Never alone, build up gradually. Heart condition or medical issues: doctor first. The fat-loss story does not hold.', de: 'Nie allein, langsam steigern. Bei Herzerkrankung oder anderen Erkrankungen zuerst ärztlich abklären. Die Fettverbrennungs-Story hält nicht.' },
  },
  'sauna-heat-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'A good habit linked to better heart health, mostly from observational studies. An add-on to training, not a replacement.', de: 'Eine gute Gewohnheit, verbunden mit besserer Herzgesundheit, meist aus Beobachtungsstudien. Eine Ergänzung zum Training, kein Ersatz.' },
    grade: { en: 'Strong but observational', de: 'Stark, aber beobachtend' },
    doThis: { en: '15 to 20 minutes, a few times a week, and hydrate. Useful for heat acclimation before a hot race.', de: '15 bis 20 Minuten, ein paar Mal pro Woche, und viel trinken. Nützlich zur Hitzeanpassung vor einem heißen Rennen.' },
    watch: { en: '"Detox" and fat loss are not real. Heart condition, medication, pregnancy or alcohol: doctor first.', de: '"Detox" und Fettabbau sind nicht belegt. Bei Herzerkrankung, Medikamenten, Schwangerschaft oder Alkohol zuerst ärztlich abklären.' },
  },
  'sleep-performance-evidence-coach-playbook': {
    verdict: { en: 'Sleep is a training variable: a bad night costs about 7% of physical performance on average.', de: 'Schlaf ist eine Trainingsvariable: Eine schlechte Nacht kostet im Schnitt etwa 7 % der körperlichen Leistung.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'After a bad night, move hard sessions to the morning. Add 30 to 60 minutes of sleep, or a nap ending over an hour before training.', de: 'Nach einer schlechten Nacht harte Einheiten auf den Morgen legen. 30 bis 60 Minuten mehr Schlaf oder ein Nickerchen, das über eine Stunde vor dem Training endet.' },
    watch: { en: 'Regularly lying awake or snoring badly: a doctor conversation, not a coaching one.', de: 'Regelmäßig wach liegen oder starkes Schnarchen: ein Thema für die Ärztin oder den Arzt, nicht fürs Coaching.' },
  },
  // ----------------------------------------------------------- wearables & devices
  'red-light-therapy-evidence-coach-playbook': {
    tier: 'conditional',
    verdict: { en: 'Works for specific uses at specific doses: hair is best, pain and pre-workout are modest, skin is weakest.', de: 'Wirkt für bestimmte Anwendungen in bestimmten Dosen: Haare am besten, Schmerz und vor dem Training moderat, Haut am schwächsten.' },
    grade: { en: 'Strong for hair; moderate for pain', de: 'Stark für Haare; moderat bei Schmerz' },
    doThis: { en: 'Check wavelength and power, aim the light at the muscle used, and follow the time on the label.', de: 'Wellenlänge und Leistung prüfen, das Licht auf den genutzten Muskel richten und die Zeit laut Etikett einhalten.' },
    watch: { en: 'Longer is not better. Whole-body panels and beds have no performance evidence.', de: 'Länger ist nicht besser. Ganzkörper-Panels und -Liegen haben keine Leistungs-Evidenz.' },
  },
  'sleep-wearables-evidence-coach-playbook': {
    verdict: { en: 'Trackers are good at total sleep time and weekly trends. Deep-sleep, REM and the nightly score are estimates.', de: 'Tracker messen Gesamtschlaf und Wochentrends gut. Tiefschlaf, REM und der nächtliche Score sind Schätzungen.' },
    grade: { en: 'Strong', de: 'Stark' },
    doThis: { en: 'Watch the weekly average. Same sleep and wake times, a dark cool room, no caffeine within 9 hours of bed.', de: 'Auf den Wochenschnitt achten. Feste Schlafens- und Aufstehzeiten, dunkler kühler Raum, kein Koffein 9 Stunden vor dem Schlafen.' },
    watch: { en: 'Accuracy is worst on bad nights. Loud snoring or real insomnia: doctor, not app.', de: 'Am ungenauesten in schlechten Nächten. Lautes Schnarchen oder echte Schlaflosigkeit: Arzt, nicht App.' },
  },
};
