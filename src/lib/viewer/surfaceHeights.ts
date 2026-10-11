import { Cartesian3, Cartographic, sampleTerrainMostDetailed, type TerrainProvider } from "cesium";

type Sampler = (source: TerrainProvider, positions: Cartographic[]) => Promise<unknown>;

const CACHE_LIMIT = 4096;
const QUEUE_LIMIT = 64;

const keyOf = (c: Cartographic) => `${c.longitude.toFixed(9)},${c.latitude.toFixed(9)}`;

/**
 * Heights of the survey surface for a scene drawn flat, where a pick only finds the flat plane. A terrain
 * provider is sampled at its most detailed level, one batch at a time, and the results are cached by
 * position. Spots the provider cannot answer for read NaN.
 */
export class SurfaceHeights {
  private source: TerrainProvider | null = null;
  private heights = new Map<string, number>();
  private queued = new Map<string, Cartographic>();
  private inFlight = new Set<string>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private readonly sampler: Sampler;

  constructor(sampler: Sampler = sampleTerrainMostDetailed) {
    this.sampler = sampler;
  }

  get active(): boolean {
    return this.source !== null;
  }

  readonly version = (): number => this.revision;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** null switches sampling off: every read falls through to the positions as given. */
  setSource(source: TerrainProvider | null): void {
    if (source === this.source) return;
    this.source = source;
    this.heights.clear();
    this.queued.clear();
    this.changed();
    void this.drain();
  }

  at(p: Cartesian3): number | undefined {
    if (!this.source) return undefined;
    const c = Cartographic.fromCartesian(p);
    return c ? this.heights.get(keyOf(c)) : undefined;
  }

  /** The points at their sampled heights, where those are known. */
  lift(points: Cartesian3[]): Cartesian3[] {
    if (!this.source) return points;
    return points.map((p) => {
      const c = Cartographic.fromCartesian(p);
      const h = c ? this.heights.get(keyOf(c)) : undefined;
      return c && h !== undefined && Number.isFinite(h) ? Cartesian3.fromRadians(c.longitude, c.latitude, h) : p;
    });
  }

  /** Queues the points not sampled yet; subscribers hear when their heights land. */
  request(points: Cartesian3[]): void {
    if (!this.source) return;
    for (const p of points) {
      const c = Cartographic.fromCartesian(p);
      if (!c) continue;
      const key = keyOf(c);
      if (this.heights.has(key) || this.queued.has(key) || this.inFlight.has(key)) continue;
      if (this.queued.size >= QUEUE_LIMIT) this.queued.delete(this.queued.keys().next().value!);
      this.queued.set(key, new Cartographic(c.longitude, c.latitude));
    }
    void this.drain();
  }

  /** The height under one point once sampled; undefined while sampling is off. */
  sample(p: Cartesian3): Promise<number | undefined> {
    const known = this.at(p);
    if (known !== undefined || !this.source) return Promise.resolve(known);
    const source = this.source;
    return new Promise((resolve) => {
      const stop = this.subscribe(() => {
        const h = this.source === source ? this.at(p) : undefined;
        if (h === undefined && this.source === source) return;
        stop();
        resolve(h);
      });
      this.request([p]);
    });
  }

  private async drain(): Promise<void> {
    const source = this.source;
    if (this.inFlight.size > 0 || !source || this.queued.size === 0) return;
    const batch = [...this.queued];
    this.queued.clear();
    for (const [key] of batch) this.inFlight.add(key);
    try {
      await this.sampler(
        source,
        batch.map(([, c]) => c)
      );
    } catch {
      for (const [, c] of batch) c.height = Number.NaN;
    }
    this.inFlight.clear();
    if (source === this.source) {
      for (const [key, c] of batch) {
        if (this.heights.size >= CACHE_LIMIT) this.heights.delete(this.heights.keys().next().value!);
        this.heights.set(key, typeof c.height === "number" ? c.height : Number.NaN);
      }
      this.changed();
    }
    void this.drain();
  }

  private changed(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}
