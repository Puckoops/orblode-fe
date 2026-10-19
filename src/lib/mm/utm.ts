// WGS 84 to and from UTM by the Krüger series, accurate to well under a millimetre inside a zone. Pure, so
// the boundary parser can read pillars given in eastings and northings without loading proj4.

const a = 6378137;
const f = 1 / 298.257223563;
const k0 = 0.9996;
const n = f / (2 - f);
const A = (a / (1 + n)) * (1 + (n * n) / 4 + (n ** 4) / 64);
const alpha = [n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3, (13 / 48) * n ** 2 - (3 / 5) * n ** 3, (61 / 240) * n ** 3];
const beta = [n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3, (1 / 48) * n ** 2 + (1 / 15) * n ** 3, (17 / 480) * n ** 3];
const delta = [2 * n - (2 / 3) * n ** 2 - 2 * n ** 3, (7 / 3) * n ** 2 - (8 / 5) * n ** 3, (56 / 15) * n ** 3];
const rad = Math.PI / 180;

export interface Utm {
  zone: number;
  north: boolean;
  easting: number;
  northing: number;
}

export const zoneOf = (lon: number) => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
export const epsgOf = (zone: number, north: boolean) => (north ? 32600 : 32700) + zone;

export function toUtm(lon: number, lat: number, zone = zoneOf(lon)): Utm {
  const lon0 = (zone - 1) * 6 - 180 + 3;
  const phi = lat * rad;
  const lam = (lon - lon0) * rad;
  const e = Math.sqrt(f * (2 - f));
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam));
  const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let E = eta;
  let N = xi;
  for (let j = 1; j <= 3; j++) {
    E += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    N += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  const north = lat >= 0;
  return { zone, north, easting: 500000 + k0 * A * E, northing: (north ? 0 : 10000000) + k0 * A * N };
}

export function fromUtm(easting: number, northing: number, zone: number, north: boolean): { lon: number; lat: number } {
  const xi = (northing - (north ? 0 : 10000000)) / (k0 * A);
  const eta = (easting - 500000) / (k0 * A);
  let x = xi;
  let y = eta;
  for (let j = 1; j <= 3; j++) {
    x -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    y -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(x) / Math.cosh(y));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += delta[j - 1] * Math.sin(2 * j * chi);
  const lon0 = (zone - 1) * 6 - 180 + 3;
  return { lon: lon0 + Math.atan2(Math.sinh(y), Math.cos(x)) / rad, lat: phi / rad };
}
