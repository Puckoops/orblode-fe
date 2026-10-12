import { ORIGIN } from "./terrain.ts";

export const formatNumber = (n: number, digits = 0) => n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A signed figure with a real minus sign, for differences such as net cut and fill. */
export const formatSigned = (n: number, digits = 0) => `${n >= 0 ? "+" : "−"}${formatNumber(Math.abs(n), digits)}`;

/** Site-local metres as MGA eastings and northings. */
export const formatEastNorth = (x: number, y: number, digits = 1) => `E ${formatNumber(ORIGIN.east + x, digits)} · N ${formatNumber(ORIGIN.north + y, digits)}`;

/** A yaw in radians as a three-digit compass heading. */
export const formatHeading = (yaw: number) => `${String(Math.round((((yaw * 180) / Math.PI) % 360) + 360) % 360).padStart(3, "0")}°`;
