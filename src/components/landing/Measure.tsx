import { formatNumber, formatSigned } from "@/lib/landing/format";
import { CRS, EARLIER_PILE_SCALE, EARLIER_SURVEY_DATE, SURVEY_DATE } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { CutFillMap, ProfileChart, SurveyCompare } from "./MeasureTiles";

const FORMATS = ["GeoTIFF", "LAS / LAZ", "LandXML", "DXF", "IFC", "OBJ", "OSGB / 3MX", "SHP / GeoJSON"];

type Props = { cut: number; fill: number; volume: number; footprint: number };

export function Measure({ cut, fill, volume, footprint }: Props) {
  const receipt = [
    ["Measurement", "Stockpile 1, volume"],
    ["Volume", `${formatNumber(volume)} m³`],
    ["Footprint", `${formatNumber(footprint)} m²`],
    ["Base", "Lowest perimeter point"],
    ["Grid", "0.2 m"],
    ["Survey", SURVEY_DATE],
    ["CRS", CRS],
  ];
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
          <div className={styles.tileTop}>
            <h3>Cut and fill against the design</h3>
            <p>Load the design surface, pick the area, and get cut, fill and net on a 0.2 m grid.</p>
          </div>
          <CutFillMap />
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
            <div aria-hidden="true" className={styles.cutFillLegend}>
              <span>Cut 3 m</span>
              <i />
              <span>Fill 3 m</span>
            </div>
          </div>
        </article>
        <article className={styles.tile}>
          <div className={styles.tileTop}>
            <h3>Change between surveys</h3>
            <p>
              Drag across the image to compare {EARLIER_SURVEY_DATE} with {SURVEY_DATE}.
            </p>
          </div>
          <SurveyCompare before={EARLIER_SURVEY_DATE.slice(0, 6)} after={SURVEY_DATE.slice(0, 6)} />
          <p className={styles.small}>Stockpile 1 grew by {formatNumber(volume * (1 - EARLIER_PILE_SCALE))} m³ between flights.</p>
        </article>
        <article className={styles.tile}>
          <div className={styles.tileTop}>
            <h3>Sections through anything</h3>
            <p>Draw a line and read the profile. A to A′ crosses the pit and its eight benches.</p>
          </div>
          <ProfileChart />
        </article>
        <article className={styles.tile}>
          <div className={styles.receiptHead}>
            <h3>A receipt on every number</h3>
            <span className={styles.status}>Checked</span>
          </div>
          <dl className={styles.receipt}>
            {receipt.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.share}>
            <code>orblode.com/s/kr14-stockpile-1</code>
            <span>Opens this exact view</span>
          </p>
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
