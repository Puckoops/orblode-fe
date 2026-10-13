import { formatNumber, formatSigned } from "@/lib/landing/format";
import type { LandingMedia } from "@/lib/landing/media";
import type { SiteInfo } from "@/lib/landing/site";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";
import { SurveySwipe } from "./SurveyMaps";

type Media = Pick<LandingMedia, "figures" | "stills">;

const FORMATS = ["GeoTIFF", "LAS / LAZ", "LandXML", "DXF", "IFC", "OBJ", "OSGB / 3MX", "SHP / GeoJSON"];

const shortDate = (date: string) => date.split(" ").slice(0, 2).join(" ");

function CutFillRow({ cut, fill, legend }: { cut: number; fill: number; legend: boolean }) {
  return (
    <div className={styles.cutFillRow}>
      <div>
        <span className={styles.figureKey}>Cut</span>
        <span className={styles.figureValue}>{formatNumber(cut)} m³</span>
      </div>
      <div>
        <span className={styles.figureKey}>Fill</span>
        <span className={styles.figureValue}>{formatNumber(fill)} m³</span>
      </div>
      <div>
        <span className={styles.figureKey}>Net</span>
        <span className={styles.figureValue}>{formatSigned(cut - fill)} m³</span>
      </div>
      {legend && (
        <div aria-hidden="true" className={styles.cutFillLegend}>
          <span>Cut 3 m</span>
          <i />
          <span>Fill 3 m</span>
        </div>
      )}
    </div>
  );
}

/** Ground added and removed between the two surveys, from the capture's preview grid. */
function ChangeFigures({ figures }: { figures: Media["figures"] }) {
  const change = figures.change;
  return (
    <div className={styles.cutFillRow}>
      <div>
        <span className={styles.figureKey}>Added</span>
        <span className={styles.figureValue}>{change ? `${formatNumber(change.added)} m³` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Removed</span>
        <span className={styles.figureValue}>{change ? `${formatNumber(change.removed)} m³` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Net</span>
        <span className={styles.figureValue}>{change ? `${formatSigned(change.added - change.removed)} m³` : "–"}</span>
      </div>
      <p className={styles.small}>
        Estimated on this page&apos;s {formatNumber(figures.cell, 1)} m preview grid; Orblode computes on 0.2 m.{" "}
        {change ? `Colour saturates at ±${formatNumber(change.range, 1)} m.` : ""}
      </p>
    </div>
  );
}

function ReliefFigures({ figures }: { figures: Media["figures"] }) {
  return (
    <div className={styles.cutFillRow}>
      <div>
        <span className={styles.figureKey}>Lowest</span>
        <span className={styles.figureValue}>{formatNumber(figures.zmin, 1)} m</span>
      </div>
      <div>
        <span className={styles.figureKey}>Highest</span>
        <span className={styles.figureValue}>{formatNumber(figures.zmax, 1)} m</span>
      </div>
      <div>
        <span className={styles.figureKey}>Contours</span>
        <span className={styles.figureValue}>{formatNumber(figures.interval, figures.interval < 1 ? 2 : 0)} m</span>
      </div>
    </div>
  );
}

function WideTile({ site, media }: { site: SiteInfo; media: Media }) {
  const measured = site.cutFill ? (
    <>
      <p className={styles.small}>{site.cutFill.label}, computed in Orblode:</p>
      <CutFillRow cut={site.cutFill.cut} fill={site.cutFill.fill} legend={false} />
    </>
  ) : null;
  const change = media.stills.change;
  if (site.earlierDate && change) {
    return (
      <>
        <div className={styles.tileTop}>
          <h3>Change between surveys</h3>
          <p>
            Where ground was added (copper) and removed (blue) between {site.earlierDate} and {site.surveyDate}.
          </p>
        </div>
        <div className={styles.mapFrame}>
          <LandingPicture
            picture={change}
            alt={`Height change across ${site.name} between ${site.earlierDate} and ${site.surveyDate}`}
            sizes="(max-width: 760px) 100vw, 60vw"
            className={`${styles.mapImage} ${styles.fitImage}`}
            style={{ aspectRatio: "16 / 10" }}
          />
        </div>
        {measured ?? <ChangeFigures figures={media.figures} />}
      </>
    );
  }
  const relief = media.stills.relief!;
  return (
    <>
      <div className={styles.tileTop}>
        <h3>The surface, in relief</h3>
        <p>
          Elevation and hillshade from the {site.surveyDate} DSM{site.featured ? `, with ${site.featured.name} outlined` : ""}.
        </p>
      </div>
      <div className={styles.mapFrame}>
        <LandingPicture
          picture={relief}
          alt={`Elevation of ${site.name} from the ${site.surveyDate} survey`}
          sizes="(max-width: 760px) 100vw, 60vw"
          className={`${styles.mapImage} ${styles.fitImage}`}
          style={{ aspectRatio: "16 / 10" }}
        />
      </div>
      {measured ?? <ReliefFigures figures={media.figures} />}
    </>
  );
}

function CompareTile({ site, media }: { site: SiteInfo; media: Media }) {
  const before = media.stills.swipeBefore!, after = media.stills.swipeAfter!;
  return site.earlierDate ? (
    <>
      <div className={styles.tileTop}>
        <h3>Two flights, one ground</h3>
        <p>
          Drag across the image to compare {site.earlierDate} with {site.surveyDate}.
        </p>
      </div>
      <SurveySwipe before={shortDate(site.earlierDate)} after={shortDate(site.surveyDate)} beforePicture={before} afterPicture={after} />
    </>
  ) : (
    <>
      <div className={styles.tileTop}>
        <h3>Photo and elevation</h3>
        <p>Drag across the image to swap the orthophoto for the surface model.</p>
      </div>
      <SurveySwipe before="Elevation" after="Photo" beforePicture={before} afterPicture={after} />
    </>
  );
}

function Receipt({ site }: { site: SiteInfo }) {
  const f = site.featured;
  const rows: [string, string][] = f
    ? [
        ["Measurement", f.name],
        ["Volume", f.volume !== null ? `${formatNumber(f.volume)} m³` : "–"],
        ...(f.area !== null ? ([["Footprint", `${formatNumber(f.area)} m²`]] as [string, string][]) : []),
        ...(f.base ? ([["Base", f.base]] as [string, string][]) : []),
        ...(f.computedAt ? ([["Computed", f.computedAt]] as [string, string][]) : []),
        ["Survey", site.surveyDate],
        ["CRS", site.crs],
      ]
    : [
        ["Site", site.name],
        ["Survey", site.surveyDate],
        ["CRS", site.crs],
      ];
  return (
    <>
      <div className={styles.receiptHead}>
        <h3>A receipt on every number</h3>
        <span className={styles.status}>{f ? "Checked" : "Survey"}</span>
      </div>
      <dl className={styles.receipt}>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function Measure({ site, media }: { site: SiteInfo; media: Media }) {
  return (
    <section id="measure" aria-labelledby="measure-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Measure and compare</span>
        <h2 id="measure-title" className={styles.sectionTitle}>
          Answers your engineers can check.
        </h2>
        <p>Volumes, cut and fill, sections and change over time, computed on the twin and traceable back to the survey they came from.</p>
      </div>
      <div className={styles.bento}>
        <article className={`${styles.tile} ${styles.tileWide}`}>
          <WideTile site={site} media={media} />
        </article>
        <article className={styles.tile}>
          <CompareTile site={site} media={media} />
        </article>
        <article className={styles.tile}>
          <div className={styles.tileTop}>
            <h3>Sections through anything</h3>
            <p>Draw a line and read the profile. A to A′ runs west to east{site.featured ? ` through ${site.featured.name}` : " across the site"}.</p>
          </div>
          <LandingPicture
            picture={media.stills.profile!}
            alt={`Elevation section from A in the west to A prime in the east${site.featured ? ` through ${site.featured.name}` : ""}`}
            sizes="(max-width: 760px) 100vw, 30vw"
            className={styles.mapImage}
          />
        </article>
        <article className={styles.tile}>
          <Receipt site={site} />
        </article>
        <article className={styles.tile}>
          <div className={styles.tileTop}>
            <h3>Bring what your crews already produce</h3>
            <p>Processed surveys, LiDAR and designs from the tools you use today.</p>
          </div>
          <ul className={styles.formats}>
            {FORMATS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
