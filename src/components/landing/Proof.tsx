import styles from "./landing.module.css";

const ROLES = [
  ["Mine surveyors", "Volumes, reconciliation"],
  ["Project and site managers", "Progress, claims"],
  ["Earthworks engineers", "Cut, fill, as-built"],
  ["Asset owners", "Every site in one view"],
];

const STATS = [
  { value: "57M", unit: "points", label: "streaming in the browser less than 10 minutes after upload" },
  { value: "6.5", unit: "s", label: "for cut and fill across 10 ha on a 0.2 m grid" },
  { value: "0.05", unit: "%", label: "volume difference from the full-resolution surface" },
  { value: "Any", unit: "CRS", label: "MGA, UTM and local grids, read from your files" },
];

export function Proof() {
  return (
    <section aria-labelledby="proof-title" className={styles.proof}>
      <div>
        <h2 id="proof-title" className={styles.proofTitle}>
          Built for the people who sign off on the ground.
        </h2>
        <ul className={styles.roles}>
          {ROLES.map(([role, focus]) => (
            <li key={role}>
              <span>{role}</span>
              <span className={styles.mono}>{focus}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.stats}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.stat}>
            <div className={styles.statValue}>
              {s.value}
              <small>{s.unit}</small>
            </div>
            <p className={styles.statLabel}>{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
