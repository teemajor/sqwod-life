// Coordinates for the Investor Globe: investor cities first, country centroids as the fallback.
// Hand-entered (approximate city centres), good enough to place a dot on a globe.
const CITY: Record<string, [number, number]> = {
  // [lat, lng]
  'Amsterdam': [52.37, 4.90], 'Amstelveen': [52.30, 4.86], 'Andover': [51.21, -1.48], 'Atlanta': [33.75, -84.39], 'Austin': [30.27, -97.74], 'Bangalore': [12.97, 77.59], 'Bengaluru': [12.97, 77.59],
  'Barcelona': [41.39, 2.17], 'Beaverton': [45.49, -122.80], 'Berlin': [52.52, 13.40], 'Berlin and Boston': [52.52, 13.40], 'Bethesda': [38.98, -77.09], 'Black Forest': [48.33, 8.10], 'Lahr': [48.34, 7.87],
  'Bologna': [44.49, 11.34], 'Boston': [42.36, -71.06], 'Boulder': [40.01, -105.27], 'Brussels': [50.85, 4.35], 'Cambridge, MA': [42.37, -71.11], 'Cambridge, Massachusetts': [42.37, -71.11],
  'Canberra': [-35.28, 149.13], 'Cardiff': [51.48, -3.18], 'Charlotte': [35.23, -80.84], 'Chicago': [41.88, -87.63], 'Cincinnati': [39.10, -84.51], 'Cologne': [50.94, 6.96], 'Copenhagen': [55.68, 12.57],
  'Delhi': [28.61, 77.21], 'Dubai': [25.20, 55.27], 'Edinburgh': [55.95, -3.19], 'Gurugram': [28.46, 77.03], 'Gurgaon': [28.46, 77.03], 'Hamburg': [53.55, 9.99], 'Hasharon': [32.17, 34.84], 'Highland Park, Illinois': [42.18, -87.80],
  'Hoofddorp': [52.30, 4.69], 'Houston': [29.76, -95.37], 'Indianapolis': [39.77, -86.16], 'Jackson, Wyoming': [43.48, -110.76], 'Jaipur': [26.91, 75.79], 'Karlsruhe': [49.01, 8.40], 'Kobe': [34.69, 135.20],
  'Las Vegas': [36.17, -115.14], 'Lausanne': [46.52, 6.63], 'Leeds': [53.80, -1.55], 'London': [51.51, -0.13], 'Los Angeles': [34.05, -118.24], 'Madrid': [40.42, -3.70], 'Melbourne': [-37.81, 144.96], 'Menlo Park': [37.45, -122.18],
  'Miami': [25.76, -80.19], 'Monaco': [43.74, 7.43], 'Montreal': [45.50, -73.57], 'Mumbai': [19.08, 72.88], 'Munich': [48.14, 11.58], 'New York': [40.71, -74.01], 'Newark': [40.74, -74.17], 'Newcastle': [54.98, -1.61], 'Newcastle upon Tyne': [54.98, -1.61],
  'Oakland': [37.80, -122.27], 'Olathe, Kansas': [38.88, -94.82], 'Orlando (Lake Nona academy)': [28.37, -81.27], 'Palo Alto': [37.44, -122.14], 'Pittsburgh': [40.44, -79.99], 'Saint Louis': [38.63, -90.20], 'St. Louis': [38.63, -90.20],
  'San Francisco': [37.77, -122.42], 'San Jose': [9.93, -84.08], 'San Mateo': [37.56, -122.33], 'Santa Ana': [33.75, -117.87], 'Santa Monica': [34.02, -118.49], 'Senningerberg': [49.65, 6.23], 'Singapore': [1.35, 103.82],
  'Stamford, Connecticut': [41.05, -73.54], 'Swindon': [51.56, -1.78], 'Tokyo': [35.68, 139.69], 'Toronto': [43.65, -79.38], 'Vienna': [48.21, 16.37], 'Wayne, Pennsylvania': [40.04, -75.39], 'Winterthur': [47.50, 8.72], 'Zurich': [47.38, 8.54],
};
const COUNTRY: Record<string, [number, number]> = {
  'United States': [39.5, -98.4], 'United Kingdom': [52.4, -1.5], Germany: [51.2, 10.4], Austria: [47.6, 14.1], Switzerland: [46.8, 8.2], Liechtenstein: [47.2, 9.5], France: [46.6, 2.4], Netherlands: [52.2, 5.3], Belgium: [50.6, 4.6],
  Luxembourg: [49.8, 6.1], Ireland: [53.3, -8.0], Spain: [40.3, -3.7], Portugal: [39.6, -8.0], Italy: [42.5, 12.5], Sweden: [62.0, 15.0], Norway: [61.0, 9.0], Denmark: [56.0, 10.0], Finland: [64.0, 26.0], Iceland: [65.0, -18.0], Poland: [52.0, 19.5],
  Czechia: [49.8, 15.5], 'Czech Republic': [49.8, 15.5], Slovakia: [48.7, 19.7], Hungary: [47.2, 19.5], Romania: [45.9, 25.0], Bulgaria: [42.7, 25.5], Greece: [39.0, 22.0], Croatia: [45.1, 15.2], Slovenia: [46.1, 14.8], Estonia: [58.6, 25.0],
  Latvia: [56.9, 24.6], Lithuania: [55.2, 23.9], Malta: [35.9, 14.4], Cyprus: [35.1, 33.4], Canada: [56.1, -106.3], Mexico: [23.6, -102.5], Brazil: [-14.2, -51.9], Argentina: [-38.4, -63.6], Chile: [-35.7, -71.5], Colombia: [4.6, -74.3], Peru: [-9.2, -75.0],
  'Costa Rica': [9.7, -83.8], 'United Arab Emirates': [24.0, 54.0], UAE: [24.0, 54.0], 'Saudi Arabia': [24.0, 45.0], Qatar: [25.3, 51.2], Kuwait: [29.3, 47.5], Bahrain: [26.0, 50.5], Oman: [21.5, 55.9], Israel: [31.5, 34.9], Turkey: [39.0, 35.2],
  India: [21.0, 78.0], China: [35.9, 104.2], 'Hong Kong': [22.3, 114.2], Taiwan: [23.7, 121.0], Japan: [36.2, 138.3], 'South Korea': [36.5, 127.9], Singapore: [1.35, 103.8], Malaysia: [4.2, 102.0], Thailand: [15.9, 100.9], Indonesia: [-2.5, 118.0],
  Vietnam: [14.1, 108.3], Philippines: [12.9, 121.8], Australia: [-25.3, 133.8], 'New Zealand': [-41.0, 174.0], 'South Africa': [-30.6, 22.9], Nigeria: [9.1, 8.7], Kenya: [-0.02, 37.9], Monaco: [43.74, 7.43], 'European Union': [50.85, 4.35],
};
/** [lat, lng, precise] for an investor: the city when known, else the country centre. */
export function locate(city: string | undefined, country: string): [number, number, boolean] | null {
  const key = (city || '').trim();
  if (key && CITY[key]) return [...CITY[key], true];
  const c = COUNTRY[country.trim()];
  return c ? [...c, false] : null;
}
export const countryCentre = (country: string) => COUNTRY[country.trim()] || null;
