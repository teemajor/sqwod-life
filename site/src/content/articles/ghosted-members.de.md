---
urlSlug: ghosted-members
lang: de
counterpart: ghosted-members
title: "Geghostet: Fast die Hälfte der abgewanderten Mitglieder wurde nie kontaktiert"
seoTitle: "Ehemalige Mitglieder: Fast die Hälfte nie kontaktiert (Rückgewinnungs-Daten)"
description: "Fast die Hälfte der abgewanderten Mitglieder sagt, ihr Studio habe sich nie gemeldet, nachdem sie wegblieben, und 53% der Mitglieder sind schon einmal weggedriftet, ohne zu kündigen. Das billigste Wachstum, das du ignorierst. Ein lebender Sqwod-Intelligence-Report."
pillar: build
type: coaching-business
format: report
conversion: sqwod-os
publishedAt: 2026-06-29
updatedAt: 2026-10-28
asOf: Oktober 2026
author: "Sqwod Intelligence"
gated: true
sources:
  - { label: "Zenoti: The silent churn crisis, 2026 gym membership data (1.393 US-Mitglieder, Mai 2026, SurveyMonkey Audience, ±2,7%)", url: "https://www.zenoti.com/thecheckin/silent-churn-crisis-2026-gym-membership-data" }
  - { label: "Athletech News: '49% of lapsed members say their gym never reached out' (19. Juni 2026, Paywall; berichtet über dieselbe Zenoti-Befragung)", url: "https://athletechnews.com/atn-insights-49-percent-of-lapsed-members-say-their-gym-never-reached-out-after-they-stopped-attending/" }
  - { label: "Sperandei et al. (2016), Journal of Science and Medicine in Sport: Abbruchquoten bei 5.240 Mitgliedern eines Studios in Rio de Janeiro", url: "https://doi.org/10.1016/j.jsams.2015.12.522" }
  - { label: "Health & Fitness Association (HFA): 2025 Fitness Industry Benchmarking Report (175 Unternehmen, 17.000+ Standorte)", url: "https://www.healthandfitness.org/hfa-releases-2025-fitness-industry-benchmarking-report/" }
takeaways:
  - "Fast die Hälfte der abgewanderten Mitglieder sagt, ihr Studio habe sich nie von sich aus gemeldet, nachdem sie wegblieben (Zenoti-Befragung 2026, 1.393 US-Mitglieder)."
  - "53% der Mitglieder sagen, sie seien schon einmal weggeblieben, ohne je formell zu kündigen. Die meiste Abwanderung ist still, bevor sie offiziell wird."
  - "Das billigste Wachstum ist nicht Werbung. Es ist eine 'Wir haben gemerkt, dass du länger nicht da warst'-Nachricht, bevor die Kündigung kommt."
figures:
  - { label: "Abgewanderte ohne Kontakt", value: "~1 von 2", note: "sagt, das Studio habe sich nie von sich aus gemeldet; Zenoti-Befragung, Mai 2026", source: "Zenoti 2026", url: "https://www.zenoti.com/thecheckin/silent-churn-crisis-2026-gym-membership-data" }
  - { label: "Weggedriftet ohne Kündigung", value: "53%", note: "von 1.393 US-Studiomitgliedern, irgendwann einmal", source: "Zenoti 2026", url: "https://www.zenoti.com/thecheckin/silent-churn-crisis-2026-gym-membership-data" }
  - { label: "Aufgehört vor Monat 3", value: "63%", note: "der neuen Mitglieder eines Studios in Rio de Janeiro, 2005 bis 2014", source: "Sperandei et al. 2016", url: "https://doi.org/10.1016/j.jsams.2015.12.522" }
  - { label: "Jahres-Retention der Branche", value: "66,4%", note: "HFA 2025: 175 Unternehmen, 17.000+ Standorte", source: "HFA 2025", url: "https://www.healthandfitness.org/hfa-releases-2025-fitness-industry-benchmarking-report/" }
benchmark:
  label: "Deine Jahres-Mitgliederbindung"
  unit: "%"
  prompt: "Der Anteil der Mitglieder, die nach 12 Monaten noch aktiv sind. Trag deinen Wert ein und sieh, wohin dich das Leck im Vergleich zu den aktuellen Branchendaten bringt."
  betterIsHigh: true
  min: 40
  max: 100
  median: 66.4
  medianLabel: "Branchenschnitt"
  bands:
    - { to: 60, label: "Großes Leck" }
    - { to: 66, label: "Unter Schnitt" }
    - { to: 75, label: "Branchen-solide" }
    - { to: 85, label: "Boutique-stark" }
    - { to: 100, label: "Spitze" }
  source: "HFA 2025 Fitness Industry Benchmarking Report; Boutique-Stufe ist eine Anbieter-Schätzung (StudioPulse 2026), im Einklang mit IHRSAs Durchschnitt für unabhängige Clubs von 75,8% (2019)."
playbook:
  - { move: "Meld dich in der Woche, in der die Besuche abfallen, nicht erst nach der Kündigung.", why: "Fast die Hälfte der Abgewanderten hört gar nichts von ihrem Studio. Ein simpler Abwesenheits-Trigger ist quasi gratis und schlägt jeden Reaktivierungs-Rabatt." }
  - { move: "Mach den ersten Monat zum Programm, nicht zur Führung.", why: "Abbrüche passieren früh: In einer 9-jährigen Studiostudie hörten 63% der Neuen vor dem dritten Monat auf." }
  - { move: "Miss deine 'stille Abwanderung'.", why: "53% der Mitglieder sind schon einmal weggedriftet, ohne zu kündigen. Wer nicht sieht, wer nachlässt, kann niemanden erreichen. Markiere Besuchsrückgang, bevor er zur Kündigung wird." }
changelog:
  - { date: "29 Juni 2026", note: "Erstveröffentlichung: verknüpft Zenotis Befund 'nie kontaktiert' von 2026 mit Daten zur Abwanderung in den ersten 90 Tagen." }
  - { date: "28 Oktober 2026", note: "Korrektur: Die Überschrift nannte 49%. Zenotis öffentliche Auswertung spricht von 'fast der Hälfte', die 49% stehen nur in einer Athletech-Überschrift hinter einer Paywall, deshalb schreiben wir jetzt 'fast die Hälfte'. Außerdem haben wir eine unbelegte Aussage '~50% kündigen in 90 Tagen' durch eine benannte Studie ersetzt, eine Anbieter-Schätzung '5 bis 7× Gewinnungskosten' entfernt und Zenotis 53%-Wert zur stillen Abwanderung ergänzt." }
hero:
  kind: bars
  stat: "~1 von 2"
  statLabel: "Abgewanderte ohne Kontakt"
tags: ["kundenbindung", "studio-ops", "wachstum"]
---

Hier ist der teuerste Satz im Fitness-Business, und kaum jemand spricht ihn aus: *„Wir haben uns nie gemeldet."* In Zenotis Befragung von 1.393 US-Studiomitgliedern 2026 sagte **fast die Hälfte der abgewanderten Mitglieder, ihr Studio habe sich nie von sich aus gemeldet**, nachdem sie wegblieben. (Athletech News berichtete 49%; Zenotis öffentliche Auswertung spricht von „fast der Hälfte".) Die Hälfte derer, die wegdrifteten, traf auf Schweigen: keine Nachricht, kein Anruf, kein „Wir vermissen dich".

Dieselbe Befragung zeigt: **53% der Mitglieder sind schon einmal weggeblieben, ohne je formell zu kündigen**. Der häufigste Grund war nicht der Preis und keine schlechte Erfahrung. Das Leben wurde voll, und niemand im Studio hat es bemerkt.

Jetzt halte das dagegen, wie früh der Verlust passiert. In einer Studie mit 5.240 Mitgliedern eines Studios in Rio de Janeiro hörten **63% der neuen Mitglieder vor dem dritten Monat auf**. Der typische Betreiber zahlt also dafür, oben den Funnel zu füllen, sieht viele Neue binnen eines Quartals verblassen und tut dann, genau im Moment, in dem ein Anstupser am günstigsten und willkommensten wäre, nichts. Das ist kein Marketing-Problem. Es ist ein *Bemerken*-Problem.

Die Lösung ist kein größeres Werbebudget und kein Win-back-Rabatt. Es ist ein Trigger: In der Woche, in der die Besuche eines Mitglieds abfallen, meldet sich etwas oder jemand, bevor aus dem Wegbleiben eine Kündigung wird. Die Betreiber, die bei der Bindung leise gewinnen, sind nicht charismatischer. Sie **sehen das Wegdriften und handeln**, während der Branchenschnitt (66,4% Jahres-Retention, HFA 2025) Mitglieder verliert, denen er nicht einmal nachgewinkt hat.

Das Signal liegt längst in deinen Daten: Das Check-in-Log weiß, wer nachlässt, bevor gekündigt wird. Daraus ein rechtzeitiges, menschliches „Wir haben gemerkt, dass du länger nicht da warst" zu machen, ist der billigste Wachstumshebel, den du hast.

*Ein lebender Sqwod-Intelligence-Report. Jede Zahl nennt eine benannte Quelle, und wir aktualisieren sie, sobald neue Daten vorliegen (siehe Änderungslog). Trag oben deine eigene Retention ein und sieh, wohin dich das Leck bringt.*
