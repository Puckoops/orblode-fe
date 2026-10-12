import { buildCloud, cloudBuffers, type CloudDetail, type PointCloud } from "./cloud.ts";
import { contours, cutFillGrid, cutFillImage, orthoPixels, type ContourRequest, type Contours, type CutFillGrid, type CutFillImage } from "./maps.ts";
import type { SurveySource } from "./site.ts";
import { buildSurveyScene, surveyBuffers, type SurveyScene } from "./survey.ts";

/** The landing page's heavy terrain work, run in a worker where the browser has one. */
export type Job =
  | { kind: "cloud"; detail: CloudDetail }
  | { kind: "ortho"; x0: number; y0: number; size: number; px: number; firstPileScale: number }
  | { kind: "cutFill" }
  | { kind: "cutFillGrid"; cell: number }
  | ({ kind: "contours" } & ContourRequest)
  | { kind: "survey"; source: SurveySource; origin: { east: number; north: number }; detail: CloudDetail; base: string };

export type JobResults = { cloud: PointCloud; ortho: Uint8ClampedArray; cutFill: CutFillImage; cutFillGrid: CutFillGrid; contours: Contours; survey: SurveyScene };
export type JobKind = Job["kind"];

const buffer = (a: ArrayBufferView) => a.buffer as ArrayBuffer;

/** Runs a job; `transfer` lists the buffers a worker can hand back without copying them. */
export async function runJob(job: Job): Promise<{ result: JobResults[JobKind]; transfer: ArrayBuffer[] }> {
  switch (job.kind) {
    case "survey": {
      const scene = await buildSurveyScene(job.source, job.origin, job.detail, job.base);
      return { result: scene, transfer: surveyBuffers(scene) };
    }
    case "cloud": {
      const cloud = buildCloud(job.detail);
      return { result: cloud, transfer: cloudBuffers(cloud) };
    }
    case "ortho": {
      const pixels = orthoPixels(job.x0, job.y0, job.size, job.px, job.firstPileScale);
      return { result: pixels, transfer: [buffer(pixels)] };
    }
    case "cutFill": {
      const image = cutFillImage();
      return { result: image, transfer: [buffer(image.pixels)] };
    }
    case "cutFillGrid": {
      const grid = cutFillGrid(job.cell);
      return { result: grid, transfer: [buffer(grid.diff)] };
    }
    case "contours": {
      const result = contours(job);
      return { result, transfer: [buffer(result.minor), buffer(result.major), ...(result.tint ? [buffer(result.tint)] : [])] };
    }
  }
}
