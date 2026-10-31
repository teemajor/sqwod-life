// Country flags for the Deal Tracker. SVGs come from the flag-icons package (MIT, self-hosted
// via node_modules at build time, nothing loaded from a CDN) and are inlined once per page as
// <symbol>s by DealGlyphs.astro; Flag.astro references them with <use>.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Lang } from '../i18n/ui';

/** Country name as stored in deals.json (English) -> ISO 3166-1 alpha-2 code used by flag-icons. */
export const COUNTRY_CODE: Record<string, string> = {
  'United States': 'us', USA: 'us', 'United Kingdom': 'gb', UK: 'gb', Germany: 'de', Austria: 'at', Switzerland: 'ch', Liechtenstein: 'li',
  France: 'fr', Netherlands: 'nl', Belgium: 'be', Luxembourg: 'lu', Ireland: 'ie', Spain: 'es', Portugal: 'pt', Italy: 'it', Sweden: 'se',
  Norway: 'no', Denmark: 'dk', Finland: 'fi', Iceland: 'is', Poland: 'pl', Czechia: 'cz', 'Czech Republic': 'cz', Slovakia: 'sk', Hungary: 'hu',
  Romania: 'ro', Bulgaria: 'bg', Greece: 'gr', Croatia: 'hr', Slovenia: 'si', Estonia: 'ee', Latvia: 'lv', Lithuania: 'lt', Malta: 'mt', Cyprus: 'cy',
  Canada: 'ca', Mexico: 'mx', Brazil: 'br', Argentina: 'ar', Chile: 'cl', Colombia: 'co', Peru: 'pe',
  'United Arab Emirates': 'ae', UAE: 'ae', 'Saudi Arabia': 'sa', Qatar: 'qa', Kuwait: 'kw', Bahrain: 'bh', Oman: 'om', Israel: 'il', Turkey: 'tr',
  India: 'in', China: 'cn', 'Hong Kong': 'hk', Taiwan: 'tw', Japan: 'jp', 'South Korea': 'kr', Korea: 'kr', Singapore: 'sg', Malaysia: 'my',
  Thailand: 'th', Indonesia: 'id', Vietnam: 'vn', Philippines: 'ph', Australia: 'au', 'New Zealand': 'nz', 'South Africa': 'za', Nigeria: 'ng', Kenya: 'ke',
  'European Union': 'eu',
};
const COUNTRY_DE: Record<string, string> = {
  'United States': 'USA', 'United Kingdom': 'Großbritannien', Germany: 'Deutschland', Austria: 'Österreich', Switzerland: 'Schweiz', France: 'Frankreich',
  Netherlands: 'Niederlande', Belgium: 'Belgien', Ireland: 'Irland', Spain: 'Spanien', Italy: 'Italien', Sweden: 'Schweden', Norway: 'Norwegen',
  Denmark: 'Dänemark', Finland: 'Finnland', Poland: 'Polen', Czechia: 'Tschechien', Hungary: 'Ungarn', Romania: 'Rumänien', Greece: 'Griechenland',
  Canada: 'Kanada', Mexico: 'Mexiko', Brazil: 'Brasilien', 'United Arab Emirates': 'VAE', 'Saudi Arabia': 'Saudi-Arabien', India: 'Indien',
  'Hong Kong': 'Hongkong', 'South Korea': 'Südkorea', Singapore: 'Singapur', Australia: 'Australien', 'New Zealand': 'Neuseeland', 'South Africa': 'Südafrika',
};
export const flagCode = (country?: string | null): string => (country && COUNTRY_CODE[country.trim()]) || '';
export const countryName = (country: string, lang: Lang): string => (lang === 'de' ? COUNTRY_DE[country] || country : country);

const DIR = join(process.cwd(), 'node_modules', 'flag-icons', 'flags', '4x3');
/** The flag as a <symbol id="fl-xx"> for the page sprite; empty string when the package has no such flag. */
export function flagSymbol(code: string): string {
  const p = join(DIR, `${code}.svg`);
  if (!/^[a-z]{2}(-[a-z]{2,3})?$/.test(code) || !existsSync(p)) return '';
  const inner = readFileSync(p, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<symbol id="fl-${code}" viewBox="0 0 640 480">${inner}</symbol>`;
}
