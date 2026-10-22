// Real solar geometry (simplified NOAA-style declination). Times are local solar time.
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
export function dayOfYear(d) { const s = new Date(d.getFullYear(), 0, 0); return Math.floor((d - s) / 86400000); }
export function declination(n) { return 23.44 * Math.sin(rad((360 / 365) * (284 + n))); }
// Sun elevation in degrees at solar hour h (0..24).
export function elevation(lat, n, h) {
  const dec = rad(declination(n)), phi = rad(lat), H = rad(15 * (h - 12));
  return deg(Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)));
}
export function sunriseSunset(lat, n) {
  const x = -Math.tan(rad(lat)) * Math.tan(rad(declination(n)));
  const H0 = deg(Math.acos(Math.max(-1, Math.min(1, x))));
  return { sunrise: 12 - H0 / 15, sunset: 12 + H0 / 15 };
}
export const fmtHour = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
