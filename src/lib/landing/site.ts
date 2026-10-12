import { CRS, EARLIER_SURVEY_DATE, EXTENT, ORIGIN, PILES, PIT, RIM, SITE_NAME, SURVEY_COUNT, SURVEY_DATE, cutFillTotals, pileOutline, pileStats } from "./terrain.ts";

/** A measurement to feature, with its outline in site-local metres east and north of the site's origin. */
export type Featured = {
  name: string;
  outline: [number, number][];
  centre: [number, number];
  reach: number;
  volume: number | null;
  area: number | null;
  base: string | null;
  computedAt: string | null;
};

export type CutFillFigures = { cut: number; fill: number; label: string };

export type OrthoSource = { template: string; minZoom: number; maxZoom: number };

/** What the browser reads to draw a real survey: same-origin paths and the CRS's proj4 definition. */
export type SurveySource = {
  dsm: string;
  ortho: OrthoSource | null;
  earlierDsm: string | null;
  earlierOrtho: OrthoSource | null;
  projDef: string;
};

/**
 * Everything the landing page says about the site it shows, decided on the server: the invented
 * sample quarry, or a survey flagged as the showcase in orblode-svc. Plain data, so it can cross
 * from server to client components.
 */
export type SiteInfo = {
  mode: "sample" | "survey";
  name: string;
  crs: string;
  origin: { east: number; north: number };
  lat: number;
  lon: number;
  surveyDate: string;
  earlierDate: string | null;
  surveyCount: number;
  featured: Featured | null;
  cutFill: CutFillFigures | null;
  source: SurveySource | null;
};

/** Where the views point: the data's centre and size, its ground and low heights, and the featured measurement. */
export type SceneFrame = {
  cx: number;
  cy: number;
  radius: number;
  /** The data's footprint: west, south, east, north in site-local metres. */
  extent: [number, number, number, number];
  ground: number;
  low: number;
  focus: { x: number; y: number; z: number; reach: number } | null;
};

export function sampleSite(): SiteInfo {
  const pile = PILES[0], { volume, footprint } = pileStats(), { cut, fill } = cutFillTotals();
  return {
    mode: "sample",
    name: SITE_NAME,
    crs: CRS,
    origin: { ...ORIGIN },
    lat: -32.4,
    lon: 151.25,
    surveyDate: SURVEY_DATE,
    earlierDate: EARLIER_SURVEY_DATE,
    surveyCount: SURVEY_COUNT,
    featured: {
      name: "Stockpile 1",
      outline: pileOutline().map(([x, y]) => [x, y]),
      centre: [pile.x, pile.y],
      reach: pile.radius * Math.max(pile.stretchX, pile.stretchY),
      volume,
      area: footprint,
      base: "Lowest perimeter point",
      computedAt: null,
    },
    cutFill: { cut, fill, label: "Pad against design" },
    source: null,
  };
}

export const SAMPLE_FRAME: SceneFrame = {
  cx: 0,
  cy: 0,
  radius: EXTENT,
  extent: [-EXTENT, -EXTENT, EXTENT, EXTENT],
  ground: RIM,
  low: RIM - PIT.depth * 0.6,
  focus: { x: PILES[0].x, y: PILES[0].y, z: 50, reach: PILES[0].radius * PILES[0].stretchX },
};
