import { test } from "node:test";
import assert from "node:assert/strict";
import type { PhotoExif } from "../../api/mm.ts";
import { exifFromTags } from "../photoExif.ts";
import { candidatePhotos, coverage, flightGsdCm, metresPerPixel, projectToPixel } from "../photoGeometry.ts";
import { nameAll, photoName, stillToUpload, uploadPhotos, type PhotoToUpload } from "../photoUpload.ts";
import { fromUtm, toUtm } from "../utm.ts";

// A Phantom 4 Pro frame over the Mahanadi at 100 m: 5472 × 3648, 24 mm equivalent.
const camera = { lon: 85.83, lat: 20.47 };
const p4p = (over: Partial<PhotoExif> = {}): PhotoExif => ({
  ...camera,
  rel_alt_m: 100,
  focal_35mm: 24,
  width: 5472,
  height: 3648,
  yaw_deg: 0,
  ...over,
});
const offset = (de: number, dn: number, from = camera) => {
  const u = toUtm(from.lon, from.lat);
  return fromUtm(u.easting + de, u.northing + dn, u.zone, u.north);
};

test("DJI's tags give the photo's position, heights, heading, lens and RTK fix", () => {
  const exif = exifFromTags({
    latitude: 20.47,
    longitude: 85.83,
    GPSAltitude: 61.2,
    AbsoluteAltitude: "+61.20",
    RelativeAltitude: "+100.10",
    GimbalYawDegree: "-87.30",
    FlightYawDegree: "-88.00",
    FocalLength: 8.8,
    FocalLengthIn35mmFormat: 24,
    ExifImageWidth: 5472,
    ExifImageHeight: 3648,
    Make: "DJI ",
    Model: "FC6310R",
    DateTimeOriginal: new Date("2026-10-24T05:12:00Z"),
    RtkFlag: 50,
  });
  assert.deepEqual(exif, {
    lat: 20.47,
    lon: 85.83,
    altitude_m: 61.2,
    rel_alt_m: 100.1,
    yaw_deg: -87.3,
    focal_mm: 8.8,
    focal_35mm: 24,
    width: 5472,
    height: 3648,
    make: "DJI",
    model: "FC6310R",
    taken_at: "2026-10-24T05:12:00.000Z",
    rtk: true,
  });
});

test("a photo with no GPS fix has no position rather than 0, 0", () => {
  assert.equal(exifFromTags({ latitude: 0, longitude: 0 }).lat, undefined);
});

test("a Phantom 4 Pro at 100 m sees 2.74 cm a pixel, as DJI quotes", () => {
  assert.equal((metresPerPixel(p4p())! * 100).toFixed(2), "2.74");
  assert.equal(flightGsdCm([{ exif: p4p() }, { exif: p4p({ rel_alt_m: 80 }) }, { exif: p4p({ rel_alt_m: 120 }) }])!.toFixed(2), "2.74");
});

test("a point 30 m east sits right of centre heading north, and above it heading east", () => {
  const target = offset(30, 0);
  const north = projectToPixel(p4p(), target)!;
  assert.ok(Math.abs(north.x - (2736 + 30 / 0.027413)) < 3, `x ${north.x}`);
  assert.ok(Math.abs(north.y - 1824) < 3, `y ${north.y}`);
  const east = projectToPixel(p4p({ yaw_deg: 90 }), target)!;
  assert.ok(Math.abs(east.x - 2736) < 3, `x ${east.x}`);
  assert.ok(Math.abs(east.y - (1824 - 30 / 0.027413)) < 3, `y ${east.y}`);
});

test("a photo without height or lens can't be projected", () => {
  assert.equal(projectToPixel(p4p({ rel_alt_m: undefined }), camera), null);
  assert.equal(projectToPixel(p4p({ focal_35mm: undefined }), camera), null);
});

test("candidates are the photos that show the point, nearest their centre first", () => {
  const photos = [
    { name: "far.JPG", exif: p4p(offset(400, 0)) },
    { name: "edge.JPG", exif: p4p(offset(-60, 0)) },
    { name: "over.JPG", exif: p4p(offset(5, 5)) },
    { name: "nogps.JPG", exif: p4p({ lat: undefined, lon: undefined }) },
  ];
  assert.deepEqual(
    candidatePhotos(photos, camera).map((c) => c.name),
    ["over.JPG", "edge.JPG"]
  );
});

test("a grid of photos covers the area it was flown over, each point seen several times", () => {
  const photos: { exif: PhotoExif }[] = [];
  for (let e = -100; e <= 100; e += 30) for (let n = -100; n <= 100; n += 25) photos.push({ exif: p4p(offset(e, n)) });
  const square = [offset(-60, -60), offset(60, -60), offset(60, 60), offset(-60, 60), offset(-60, -60)].map((p) => [p.lon, p.lat] as [number, number]);
  const c = coverage(photos, [square])!;
  assert.equal(c.coveredPct, 100);
  assert.ok(c.medianPhotos >= 9, `median ${c.medianPhotos}`);
  const beyond = [offset(400, 400), offset(500, 400), offset(500, 500), offset(400, 500), offset(400, 400)].map((p) => [p.lon, p.lat] as [number, number]);
  assert.equal(coverage(photos, [beyond])!.coveredPct, 0);
});

test("photos keep their camera folder, without spaces, and clashes get a number", () => {
  assert.equal(photoName({ name: "DJI_0001.JPG", webkitRelativePath: "DCIM/100MEDIA/DJI_0001.JPG" }), "100MEDIA_DJI_0001.JPG");
  assert.equal(photoName({ name: "IMG 12.jpg" }), "IMG_12.jpg");
  const named = nameAll([{ name: "DJI_0001.JPG" }, { name: "DJI_0001.JPG" }, { name: "DJI_0002.JPG" }], ["DJI_0002.JPG"]);
  assert.deepEqual(
    named.map((n) => n.name),
    ["DJI_0001.JPG", "DJI_0001_2.JPG", "DJI_0002_2.JPG"]
  );
});

test("a resumed upload sends only what storage doesn't have", () => {
  assert.deepEqual(
    stillToUpload([{ name: "a.JPG" }, { name: "b.JPG" }, { name: "c.JPG" }], ["b.JPG"]).map((p) => p.name),
    ["a.JPG", "c.JPG"]
  );
});

const fakeFile = (name: string, size: number) => ({ name, size }) as File;

test("photos are signed in batches of 500 and a failing PUT is tried three times", async () => {
  const photos: PhotoToUpload[] = Array.from({ length: 1001 }, (_, i) => ({ name: `P${i}.JPG`, file: fakeFile(`P${i}.JPG`, 10), exif: {} }));
  const signed: number[] = [];
  const tries = new Map<string, number>();
  let last = { done: 0, total: 0, fraction: 0 };
  await uploadPhotos(
    {
      sign: async (batch) => {
        signed.push(batch.length);
        return Object.fromEntries(batch.map((p) => [p.name, `https://storage/${p.name}`]));
      },
      put: async (_url, file, contentType, onProgress) => {
        assert.equal(contentType, "image/jpeg");
        const n = (tries.get(file.name) ?? 0) + 1;
        tries.set(file.name, n);
        if (file.name === "P7.JPG" && n < 3) throw new Error("flaky");
        onProgress(1);
      },
    },
    photos,
    { onProgress: (p) => (last = p), retryDelayMs: 0 }
  );
  assert.deepEqual(signed, [500, 500, 1]);
  assert.equal(tries.get("P7.JPG"), 3);
  assert.deepEqual(last, { done: 1001, total: 1001, fraction: 1 });
});

test("a photo that keeps failing stops the upload", async () => {
  const photos: PhotoToUpload[] = [{ name: "bad.JPG", file: fakeFile("bad.JPG", 10), exif: {} }];
  await assert.rejects(
    uploadPhotos(
      {
        sign: async () => ({ "bad.JPG": "https://storage/bad.JPG" }),
        put: async () => {
          throw new Error("denied");
        },
      },
      photos,
      { retryDelayMs: 0 }
    ),
    /denied/
  );
});
