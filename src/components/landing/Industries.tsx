import type { LandingMedia } from "@/lib/landing/media";
import type { SiteInfo } from "@/lib/landing/site";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";

const SIZES = "(max-width: 620px) 100vw, (max-width: 1100px) 50vw, 33vw";

export function Industries({ site, stills }: { site: SiteInfo; stills: LandingMedia["stills"] }) {
  return (
    <section id="industries" aria-labelledby="industries-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Industries</span>
        <h2 id="industries-title" className={styles.sectionTitle}>
          One twin, three kinds of ground.
        </h2>
      </div>
      <div className={styles.industries}>
        <article className={styles.industry}>
          <LandingPicture picture={stills.contoursMining!} alt={`Contour map of ${site.name}`} sizes={SIZES} className={styles.mapImage} />
          <div className={styles.industryBody}>
            <h3>Mining and quarries</h3>
            <p>Stockpile inventories, pit progress and reconciliation against the mine plan, from every flight.</p>
            <span className={styles.meta}>
              Contours of {site.name} · {site.surveyDate}
            </span>
          </div>
        </article>
        <article className={styles.industry}>
          <LandingPicture picture={stills.construction!} alt="Cut and fill of a construction pad in 10 metre cells, with Lot 4 outlined" sizes={SIZES} className={styles.mapImage} />
          <div className={styles.industryBody}>
            <h3>Construction and earthworks</h3>
            <p>As-built against design, cut and fill by cell, and progress claims backed by survey evidence.</p>
            <span className={styles.meta}>10 m cells · design rev C · cut and fill</span>
          </div>
        </article>
        <article className={styles.industry}>
          <LandingPicture
            picture={stills.corridor!}
            alt="Corridor plan with chainage every 50 metres and asset markers, over contours"
            sizes={SIZES}
            className={styles.mapImage}
          />
          <div className={styles.industryBody}>
            <h3>Infrastructure and utilities</h3>
            <p>Roads, rail, pipelines and lines by chainage, with clearances and asset records on the map.</p>
            <span className={styles.meta}>Chainage 0+000 to 0+400 · 30 m corridor</span>
          </div>
        </article>
      </div>
    </section>
  );
}
