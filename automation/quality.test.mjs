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
