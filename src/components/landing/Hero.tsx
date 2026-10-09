import { RequestDemoButton } from "./DemoRequest";
import styles from "./landing.module.css";
import { rv } from "./reveal";
import { Typewriter } from "./Typewriter";

const STATS = [
  { value: "< 2cm Accuracy", label: "Survey-grade precision" },
  { value: "4.2M pts / 23 min", label: "Cloud GPU processing" },
  { value: "Zero install", label: "Runs in your browser" },
];

export function Hero() {
  return (
    <section data-section="" className={styles.hero}>
      <div className={styles.heroInner}>
        <Typewriter
          label="See your site from decision altitude."
          reveal={rv("up", 0.52)}
          className={styles.heroTitle}
          segments={[{ text: "See your site from" }, "br", { text: "decision", className: styles.accent }, { text: " altitude." }]}
        />
        <p {...rv("up", 0.64)} className={styles.lede}>
          Turn drone surveys into a measurable 3D twin of any site, from open-pit mines to highways and substations. Measure it. Compare it.
          Decide with proof.
        </p>
        <div {...rv("up", 0.76)} className={styles.ctaRow}>
          <RequestDemoButton className={styles.pill} />
          <a href="#viewer" className={`${styles.arrowLink} ${styles.ctaSecondary}`}>
            See it live →
          </a>
        </div>
        <div {...rv("up", 0.88)} className={styles.stats}>
          {STATS.map((s) => (
            <div key={s.value} className={styles.stat}>
              <div className={styles.statRule} />
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
