import { PIT } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { ContourMap, CutFillCells } from "./MapCanvases";

export function Industries() {
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
          <ContourMap
            region={{ x0: -330, x1: 190, y0: -200, y1: 190 }}
            step={2.5}
            tint
            minorAlpha={0.16}
            majorAlpha={0.55}
            lineWidth={1.6}
            size={[1280, 960]}
            label={`Contour map of an open pit with ${PIT.benches} benches`}
          />
          <div className={styles.industryBody}>
            <h3>Mining and quarries</h3>
            <p>Stockpile inventories, pit progress and reconciliation against the mine plan, from every flight.</p>
            <span className={styles.meta}>
              2 m contours · {PIT.benches} benches · {PIT.depth} m deep
            </span>
          </div>
        </article>
        <article className={styles.industry}>
          <CutFillCells label="Cut and fill of a construction pad in 10 metre cells, with Lot 4 outlined" />
          <div className={styles.industryBody}>
            <h3>Construction and earthworks</h3>
            <p>As-built against design, cut and fill by cell, and progress claims backed by survey evidence.</p>
            <span className={styles.meta}>10 m cells · design rev C · cut and fill</span>
          </div>
        </article>
        <article className={styles.industry}>
          <ContourMap
            region={{ x0: -430, x1: -30, y0: -430, y1: -130 }}
            step={2.5}
            tint={false}
            minorAlpha={0.1}
            majorAlpha={0.28}
            lineWidth={1.6}
            size={[1280, 960]}
            corridor
            label="Corridor plan with chainage every 50 metres and asset markers, over contours"
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
