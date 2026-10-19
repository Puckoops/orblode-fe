declare module "shpjs" {
  /** A zipped shapefile (or its parts) as GeoJSON: one FeatureCollection, or one per layer. */
  export default function shp(input: ArrayBuffer): Promise<unknown>;
}
