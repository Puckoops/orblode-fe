export const formatNumber = (n: number, digits = 0) => n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A signed figure with a real minus sign, for differences such as net cut and fill. */
export const formatSigned = (n: number, digits = 0) => `${n >= 0 ? "+" : "−"}${formatNumber(Math.abs(n), digits)}`;

/** Site-local metres as eastings and northings in the site's projected CRS. */
export const formatEastNorth = (x: number, y: number, origin: { east: number; north: number }, digits = 1) =>
  `E ${formatNumber(origin.east + x, digits)} · N ${formatNumber(origin.north + y, digits)}`;

/** A yaw in radians as a three-digit compass heading. */
export const formatHeading = (yaw: number) => `${String(Math.round((((yaw * 180) / Math.PI) % 360) + 360) % 360).padStart(3, "0")}°`;
