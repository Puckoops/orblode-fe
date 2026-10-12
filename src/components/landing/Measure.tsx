import { formatNumber, formatSigned } from "@/lib/landing/format";
import type { SiteInfo } from "@/lib/landing/site";
import { EARLIER_PILE_SCALE } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { CutFillMap, ProfileChart, SurveyCompare } from "./MeasureTiles";
import { ChangeFigures, ReliefFigures, SurveyPicture, SurveyProfile, SurveySwipe } from "./SurveyMaps";

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

function WideTile({ site }: { site: SiteInfo }) {
  if (site.mode === "sample") {
    return (
      <>
        <div className={styles.tileTop}>
          <h3>Cut and fill against the design</h3>
          <p>Load the design surface, pick the area, and get cut, fill and net on a 0.2 m grid.</p>
        </div>
        <CutFillMap />
        {site.cutFill && <CutFillRow cut={site.cutFill.cut} fill={site.cutFill.fill} legend />}
      </>
    );
  }
  const measured = site.cutFill ? <CutFillRow cut={site.cutFill.cut} fill={site.cutFill.fill} legend={false} /> : null;
  if (site.earlierDate) {
    return (
      <>
        <div className={styles.tileTop}>
          <h3>Change between surveys</h3>
          <p>
            Where ground was added (copper) and removed (blue) between {site.earlierDate} and {site.surveyDate}.
          </p>
        </div>
        <div className={styles.mapFrame}>
          <SurveyPicture kind="change" label={`Height change across ${site.name} between ${site.earlierDate} and ${site.surveyDate}`} />
        </div>
        {site.cutFill ? (
          <>
            <p className={styles.small}>{site.cutFill.label}, computed in Orblode:</p>
            {measured}
          </>
        ) : (
          <ChangeFigures />
        )}
      </>
    );
  }
  return (
    <>
      <div className={styles.tileTop}>
        <h3>The surface, in relief</h3>
        <p>
          Elevation and hillshade from the {site.surveyDate} DSM{site.featured ? `, with ${site.featured.name} outlined` : ""}.
        </p>
      </div>
      <div className={styles.mapFrame}>
        <SurveyPicture kind="relief" label={`Elevation of ${site.name} from the ${site.surveyDate} survey`} />
      </div>
      {site.cutFill ? (
        <>
          <p className={styles.small}>{site.cutFill.label}, computed in Orblode:</p>
          {measured}
        </>
      ) : (
        <ReliefFigures />
      )}
    </>
  );
}

function CompareTile({ site }: { site: SiteInfo }) {
  if (site.mode === "sample") {
    return (
      <>
        <div className={styles.tileTop}>
          <h3>Change between surveys</h3>
          <p>
            Drag across the image to compare {site.earlierDate} with {site.surveyDate}.
          </p>
        </div>
        <SurveyCompare before={shortDate(site.earlierDate ?? "")} after={shortDate(site.surveyDate)} />
        <p className={styles.small}>
          {site.featured?.name} grew by {formatNumber((site.featured?.volume ?? 0) * (1 - EARLIER_PILE_SCALE))} m³ between flights.
        </p>
      </>
    );
  }
  return site.earlierDate ? (
    <>
      <div className={styles.tileTop}>
        <h3>Two flights, one ground</h3>
        <p>
          Drag across the image to compare {site.earlierDate} with {site.surveyDate}.
        </p>
      </div>
      <SurveySwipe before={shortDate(site.earlierDate)} after={shortDate(site.surveyDate)} />
    </>
  ) : (
    <>
      <div className={styles.tileTop}>
        <h3>Photo and elevation</h3>
        <p>Drag across the image to swap the orthophoto for the surface model.</p>
      </div>
      <SurveySwipe before="Elevation" after="Photo" />
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
        ...(site.mode === "sample" ? ([["Grid", "0.2 m"]] as [string, string][]) : []),
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
      {site.mode === "sample" && (
        <p className={styles.share}>
          <code>orblode.com/s/kr14-stockpile-1</code>
          <span>Opens this exact view</span>
        </p>
      )}
    </>
  );
}

export function Measure({ site }: { site: SiteInfo }) {
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
          <WideTile site={site} />
        </article>
        <article className={styles.tile}>
          <CompareTile site={site} />
        </article>
        <article className={styles.tile}>
          <div className={styles.tileTop}>
            <h3>Sections through anything</h3>
            <p>
              {site.mode === "sample"
                ? "Draw a line and read the profile. A to A′ crosses the pit and its eight benches."
                : `Draw a line and read the profile. A to A′ runs west to east${site.featured ? ` through ${site.featured.name}` : " across the site"}.`}
            </p>
          </div>
          {site.mode === "sample" ? <ProfileChart /> : <SurveyProfile />}
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
