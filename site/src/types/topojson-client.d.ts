// topojson-client ships no types; the Investor Globe only uses feature().
declare module 'topojson-client' {
  export function feature(topology: any, object: any): any;
}
