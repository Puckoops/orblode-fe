import { RequestDemoButton } from "./DemoRequest";
import { HeroScene } from "./HeroScene";
import styles from "./landing.module.css";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <div className={`${styles.window} ${styles.heroWindow}`}>
        <HeroScene />
        <div className={styles.heroCopy}>
          <h1 id="hero-title" className={styles.heroTitle}>
            See your site from <em>decision altitude.</em>
          </h1>
          <p className={styles.lede}>
            Orblode turns drone surveys into a measurable 3D twin of your mine, quarry or build. Measure volumes, compare surveys and check
            as-built against design, in the browser.
          </p>
          <div className={styles.ctaRow}>
            <RequestDemoButton className={`${styles.btn} ${styles.btnSolid} ${styles.btnLarge}`} />
            <a href="#try" className={`${styles.btn} ${styles.btnGhost} ${styles.btnLarge}`}>
              Explore the sample site
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
