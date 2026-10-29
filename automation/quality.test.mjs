// Guard tests for the Sqwod Daily pipeline. Run: node automation/quality.test.mjs
// Each case is a real defect from the 3 to 16 Oct 2026 issues.
import assert from 'node:assert/strict';
import { noEmDash, phraseProblems, isObituary, stripPhrases, isGoogleNews } from './quality.mjs';
import { isOnBrand } from './onbrand.mjs';

const t = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n     ', e.message); process.exitCode = 1; } };

t('em dash between clauses becomes a colon', () =>
  assert.equal(noEmDash('Most gym owners run on gut feel — here are the 10 figures.'), 'Most gym owners run on gut feel: here are the 10 figures.'));
t('em dash pair becomes commas', () =>
  assert.equal(noEmDash("DSSV — the country's employer association — is presenting."), "DSSV, the country's employer association, is presenting."));
t('URLs are never touched', () => assert.equal(noEmDash('https://x.com/a—b'), 'https://x.com/a—b'));

t('clickbait is caught', () => assert.ok(phraseProblems("Suunto's Titanium Watch Has Garmin Sweating").length));
t('cheat sheet is caught', () => assert.ok(phraseProblems('the closest thing to a cheat sheet you will get').length));
t('Fitt tagline is caught', () => assert.ok(phraseProblems('Sqwod Daily, the business of fitness in five minutes').length));
t('a normal headline is clean', () => assert.equal(phraseProblems('Basic-Fit raises €61M to open 40 clubs').length, 0));
t('tagline is replaced', () => assert.equal(stripPhrases('Your edge in the business of fitness.'), 'Your edge in the fitness industry.'));

t('obituary is detected', () => assert.ok(isObituary('Eric Von Frohlich Remembered as Fitness Innovator')));
t('launch is not an obituary', () => assert.ok(!isObituary('Garmin launches the Forerunner 975')));

t('Google News link is detected', () => assert.ok(isGoogleNews('https://news.google.com/rss/articles/CBMiTEFV?oc=5')));
t('publisher link is not', () => assert.ok(!isGoogleNews('https://qz.com/gym-membership-trends')));

t('estate-agency franchise stays out', () => assert.ok(!isOnBrand('Martin & Co Huddersfield franchisee completes fourth agency acquisition')));
t('fitness franchise gets in', () => assert.ok(isOnBrand('Orangetheory franchisee buys 12 studios')));
t('DSSV gets in', () => assert.ok(isOnBrand('DSSV beim Deutschen Arbeitgebertag 2026')));
t('gold price stays out', () => assert.ok(!isOnBrand('Gold price hits record as investors seek recovery')));

// ---- 19 Oct 2026: German read out in the EN audio, off-topic stories, slang ----
import { isProductReview } from './onbrand.mjs';
import { extractArticle, feedSummary } from './article.mjs';
t('slang is caught', () => assert.ok(phraseProblems('The corporate wellness gravy train just hit a speed bump').length));
t('"serious flex" is caught', () => assert.ok(phraseProblems('the art market just had a serious flex').length));
t('plain news is clean', () => assert.equal(phraseProblems('Huppa raised €1 million to build software for studios.').length, 0));
t('art auction stays out', () => assert.ok(!isOnBrand("Christie's auctions in London raise $289 million, boosting the recovery of the global art market")));
t('Mind Gym (HR training firm) stays out', () => assert.ok(!isOnBrand('Mind Gym PLC Reports 15% Revenue Drop Amid Corporate HR Budget Cuts')));
t('product review is not news', () => assert.ok(isProductReview('Scarlet Rae Review: Wearable Heat Pad And Pocket Period Briefs')));
t('research review is news', () => assert.ok(!isProductReview('Creatine and cognition: a systematic review')));
t('studio software raise gets in', () => assert.ok(isOnBrand('Huppa raises €1 million to build an operating system for class-based gyms and studios')));
t('Cloudflare challenge page yields no text', () => assert.equal(extractArticle('<html><head><title>Just a moment...</title></head><body><p>' + 'x'.repeat(300) + '</p></body></html>'), ''));
t('article paragraphs are extracted', () => {
  const html = '<html><body><nav><p>Subscribe to our newsletter for daily updates and offers</p></nav><article><p>Reformd is expanding into the U.S. with plans to open the world\'s largest Lagree studio in Calabasas, California.</p><p>Slated to open in January 2027, the studio will feature 37 Lagree machines and six recovery rooms for members.</p></article></body></html>';
  const out = extractArticle(html);
  assert.ok(out.includes('Calabasas') && out.includes('January 2027') && !out.includes('Subscribe'));
});
t('feed summary strips escaped HTML', () => assert.ok(feedSummary('<description>&lt;p&gt;Huppa, an Amsterdam-based startup, has secured €1 million in pre-Seed funding.&lt;/p&gt;</description>').startsWith('Huppa, an Amsterdam')));

import { foreignSentences, wrongLanguage } from './quality.mjs';
const SCRIPT_19OCT = "And for studio operators in Germany: save the date: the DSSV is running an Online-Einweisung am 19. November 2026. Eine gute Gelegenheit, sich auf den neuesten Stand zu bringen, ohne das Studio auch nur kurz verlassen zu müssen.\n\nAnd that brings us back to Mind Gym's fifteen percent drop.";
t('German sentence in the EN audio is caught', () => assert.ok(foreignSentences(SCRIPT_19OCT, 'en').some((s) => s.startsWith('Eine gute Gelegenheit'))));
t('English place names with umlauts stay English', () => assert.equal(foreignSentences('Fitness First opened two clubs in Düsseldorf and München this week.', 'en').length, 0));
t('English sentence in the DE audio is caught', () => assert.ok(foreignSentences('Huppa hat eine Million Euro eingesammelt. This is a great opportunity for the studios that have been waiting for it.', 'de').length === 1));
t('German DE script is clean', () => assert.equal(foreignSentences('Huppa aus Amsterdam hat eine Million Euro eingesammelt. Das Geld fließt in eine Software für Kursstudios.', 'de').length, 0));
t('German headline in EN issue is wrong language', () => assert.ok(wrongLanguage('Online-Einweisung am 19. November: DSSV lädt Mitglieder ein', 'en')));

// ---- 19 Oct 2026 (evening): source overhaul, junk that outranked trade press ----
t('AI sales coaching stays out', () => assert.ok(!isOnBrand('AI Sales Coaching Platforms for Insurance: 11 Compared')));
t('hospital expansion stays out', () => assert.ok(!isOnBrand('IHH Healthcare expands Gleneagles Hospital Johor')));
t('beauty-school training stays out', () => assert.ok(!isOnBrand('BorboletaPro Expands Lash+Brow Training in Paul Mitchell Schools')));
t('personal training news gets in', () => assert.ok(isOnBrand('Personal training studio expands to five locations')));

// ---- 28 Oct 2026: old news as new, superseded gear pick ----
const { staleReason } = await import('./article.mjs');
const { pickGearRec } = await import('./quality.mjs');
const T = '2026-10-28';
t('republished 2025 earnings report is old news', () => assert.ok(staleReason('Xponential reported Q4 2024 revenue of $83.2 million. After results on March 13, 2025 shares fell 31%.', T)));
t('event that ended last week is old news (EN)', () => assert.ok(staleReason('The DSSV event takes place from 20 to 23 October 2026 in Torremolinos.', T, 'DSSV event')));
t('event that ended last week is old news (DE)', () => assert.ok(staleReason('Das DSSV-Event findet vom 20. bis 23. Oktober 2026 im Hotel Meliá statt.', T, 'DSSV-Event')));
t('yesterday\'s launch is news', () => assert.equal(staleReason('Precor presented a new Glutebuilder line on 27 October 2026.', T), ''));
t('an upcoming event is news', () => assert.equal(staleReason('Der DSSV bietet am 19. November 2026 eine Online-Einweisung an.', T, 'Webinar'), ''));
t('background dates do not make news old', () => assert.equal(staleReason('Reformd opens in Calabasas in January 2027. The Toronto studio opened in June 2025.', T), ''));
t('undated text is never called old', () => assert.equal(staleReason('Huppa, founded in 2024, raised €1 million.', T), ''));
t('gear pick skips a model we have a newer review for', () => assert.equal(
  pickGearRec({ reviewsDir: new URL('../site/src/content/reviews', import.meta.url).pathname, dailyDir: '/nonexistent', lang: 'en', items: [{ headline: 'Oura Ring 5 launches in India', dek: '' }], date: T }).url,
  '/en/verified/oura-ring-5'));
const { isLabelledAd } = await import('./article.mjs');
t('a labelled ad is not news', () => assert.ok(isLabelledAd('Die fM Redaktion Oktober 27, 2026 Lesezeit: 2 Minuten -Anzeige- Die neue Glutebuilder Selectorized Line')));
t('a complaint is not an ad', () => assert.ok(!isLabelledAd('Der Verband hat Anzeige gegen den Betreiber erstattet.')));
const { FINANCE_OUTLETS_RX } = await import('./onbrand.mjs');
t('stock-tip apps are not news outlets', () => assert.ok(FINANCE_OUTLETS_RX.test('Pluang')));
t('facts found for a headline are checked for age too', () => assert.ok(staleReason('Xponential reported fourth-quarter 2024 revenue of $83.2 million. After results on March 13, 2025 the stock fell 31%.', T)));
