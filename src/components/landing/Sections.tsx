import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./landing.module.css";
import { MeasureShowcase } from "./MeasureShowcase";
import { rv } from "./reveal";
import { IndustryDeck } from "./IndustryDeck";
import viewerShot from "./viewer-shot.jpg";

const MARQUEE = ["MINES & QUARRIES", "CONSTRUCTION", "ROADS & RAIL", "PIPELINES", "POWER & UTILITIES", "SOLAR & WIND", "PORTS & TERMINALS", "SURVEY-GRADE", "CESIUMJS"];

export function TrustMarquee() {
  const run = (
    <span className={styles.marqueeRun}>
      {MARQUEE.map((item) => (
        <span key={item}>
          {item}
          <span className={styles.marqueeGem}>◆</span>
        </span>
      ))}
    </span>
  );
  return (
    <div {...rv("up")} className={styles.marquee}>
      <div className={styles.marqueeTrack}>
        {run}
        <span aria-hidden="true">{run}</span>
      </div>
    </div>
  );
}

export function Separator() {
  return <div {...rv("clip")} aria-hidden="true" className={styles.separator} />;
}

function SectionHead({ eyebrow, title, eyebrowClass, titleClass }: { eyebrow: string; title: ReactNode; eyebrowClass?: string; titleClass?: string }) {
  return (
    <div className={styles.sectionHead}>
      <span {...rv("up")} className={[styles.eyebrow, eyebrowClass].filter(Boolean).join(" ")}>
        {eyebrow}
      </span>
      <h2 {...rv("up", 0.12)} className={[styles.title, titleClass].filter(Boolean).join(" ")}>
        {title}
      </h2>
    </div>
  );
}

export function Problem() {
  return (
    <section data-section="" className={styles.section}>
      <div {...rv("scale")} className={`${styles.glass} ${styles.problemCard}`}>
        <div className={styles.centered}>
          <span {...rv("up")} className={styles.eyebrow}>
            THE GAP
          </span>
          <h2 {...rv("up", 0.12)} className={`${styles.title} ${styles.problemTitle}`}>
            Survey data drowns in spreadsheets. Decisions drown in delay.
          </h2>
        </div>
        <div {...rv("up", 0.24)} className={styles.problemBody}>
          <p>
            Drones fly every week. The data lands in folders. Volumes, progress and as-builts get measured by hand, and reports take days. By
            the time they reach the people who decide, the site has already moved.
          </p>
          <p>
            Every team keeps its own version of the site: the surveyor&apos;s point cloud, the engineer&apos;s design, the manager&apos;s
            spreadsheet. Nobody looks at the same ground, so every question starts with another site visit.
          </p>
          <p>The gap between data and decision costs real money, real compliance risk, and real time.</p>
        </div>
        <div {...rv("clip", 0.4)} aria-hidden="true" className={styles.problemRule} />
      </div>
    </section>
  );
}

export function Platform() {
  return (
    <section id="platform" data-section="" className={styles.section}>
      <SectionHead eyebrow="ONE PLATFORM · EVERY SITE" title="One platform. Every site." titleClass={styles.titleLoose} />
      <div {...rv("up")} data-glass-card="" className={`${styles.glass} ${styles.product}`}>
        <div className={styles.productIcon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#8A7E68" strokeWidth="1.2" aria-hidden="true">
            <path d="M10 2L17 6V14L10 18L3 14V6Z" />
            <path d="M3 6L10 10L17 6" />
            <path d="M10 10V18" />
          </svg>
        </div>
        <h3 className={styles.productName}>ORBLODE</h3>
        <p className={styles.productTag}>The digital twin for physical sites</p>
        <p className={styles.productDesc}>
          Bring drone surveys, point clouds, terrain models and designs into one georeferenced 3D twin. Measure it, compare it over time, and
          give every team the same view of the ground.
        </p>
        <div className={`${styles.chips} ${styles.productChips}`}>
          <span className={styles.chip}>Mines &amp; Quarries</span>
          <span className={styles.chip}>Construction</span>
          <span className={styles.chip}>Infrastructure</span>
          <span className={styles.chip}>Utilities &amp; Energy</span>
        </div>
        <a href="#measure" className={`${styles.arrowLink} ${styles.productLink}`}>
          Explore the platform →
        </a>
      </div>
    </section>
  );
}

export function MeasureFeatures() {
  return (
    <MeasureShowcase
      head={
        <SectionHead
          eyebrow="Measure & Compare"
          title={
            <>
              From raw survey to measured <span className={styles.accent}>truth.</span>
            </>
          }
        />
      }
    />
  );
}

export function Industries() {
  return (
    <IndustryDeck
      head={
        <SectionHead
          eyebrow="Industries"
          eyebrowClass={styles.eyebrowCool}
          title={
            <>
              From pit to pipeline, one <span className={styles.accent}>twin.</span>
            </>
          }
        />
      }
    />
  );
}

export function ViewerPreview() {
  return (
    <section id="viewer" data-section="" className={`${styles.section} ${styles.centered}`}>
      <span {...rv("up")} className={styles.eyebrow}>
        The Viewer
      </span>
      <h2 {...rv("up", 0.12)} className={`${styles.title} ${styles.platformTitle}`}>
        Your site, navigable in the browser.
      </h2>
      <div {...rv("tilt")} className={`${styles.glass} ${styles.browser}`}>
        <div className={styles.browserBar}>
          <div className={styles.browserDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className={styles.browserUrl}>app.orblode.com/viewer/bandalkop-pit</div>
        </div>
        <Image src={viewerShot} alt="ORBLODE viewer interface" placeholder="blur" sizes="(max-width: 1260px) 100vw, 1100px" className={styles.shot} />
      </div>
      <div {...rv("up", 0.3)} className={`${styles.chips} ${styles.platformChips}`}>
        <span className={styles.chip}>3D Globe</span>
        <span className={styles.chip}>Point Clouds</span>
        <span className={styles.chip}>Measurement Tools</span>
        <span className={styles.chip}>Layer Control</span>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Capture",
    text: "Fly a drone, scan with LiDAR or bring the survey data you already have.",
    icon: (
      <>
        <path d="M11 2L14 8L11 6L8 8Z" />
        <path d="M6 12C6 12 4 16 11 20C18 16 16 12 16 12" />
      </>
    ),
  },
  {
    n: "02",
    title: "Upload",
    text: "Orthomosaics, point clouds, terrain and designs, into encrypted cloud storage.",
    icon: (
      <>
        <path d="M11 2V14" />
        <path d="M7 6L11 2L15 6" />
        <rect x="4" y="14" width="14" height="6" rx="1" />
      </>
    ),
  },
  {
    n: "03",
    title: "Process",
    text: "Cloud GPUs turn it into a streamable 3D twin. 4.2M points, 23 minutes.",
    icon: (
      <>
        <circle cx="11" cy="11" r="4" />
        <path d="M11 2V5" />
        <path d="M11 17V20" />
        <path d="M2 11H5" />
        <path d="M17 11H20" />
      </>
    ),
  },
  { n: "04", title: "Decide", text: "Measure, compare, comply, export. Every decision backed by proof.", icon: <path d="M6 11L10 15L17 7" /> },
];

export function Workflow() {
  return (
    <section id="how" data-section="" className={`${styles.section} ${styles.centered}`}>
      <span {...rv("up")} className={styles.eyebrow}>
        How It Works
      </span>
      <h2 {...rv("up", 0.12)} className={`${styles.title} ${styles.workflowTitle}`}>
        Four steps from sky to decision.
      </h2>
      <div {...rv("scale")} className={`${styles.glass} ${styles.workflowCard}`}>
        <div className={`${styles.workflowTrack} ${styles.deskOnly}`} aria-hidden="true">
          <div data-workflow-line="" className={styles.workflowLine} />
        </div>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.n} className={styles.step}>
              <div className={styles.stepIcon}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#D88050" strokeWidth="1.2" aria-hidden="true">
                  {s.icon}
                </svg>
              </div>
              <span className={styles.stepNum}>{s.n}</span>
              <h4 className={styles.stepTitle}>{s.title}</h4>
              <p className={styles.stepText}>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: "Measurement Suite",
    text: "Points, distances, areas, elevations, slopes and volumes, measured on the model. Every result carries a receipt of how it was made.",
    wide: true,
    icon: (
      <>
        <path d="M8 32L20 8L32 32" strokeOpacity="0.5" />
        <line x1="12" y1="24" x2="28" y2="24" strokeOpacity="0.3" />
        <circle cx="20" cy="16" r="2" strokeOpacity="0.6" />
      </>
    ),
  },
  {
    title: "Volume Calculation",
    text: "Stockpiles, pits and earthworks against a base surface or a fixed level. Cut, fill, net.",
    icon: (
      <>
        <path d="M10 30Q15 28 20 18Q25 12 28 10" strokeOpacity="0.5" />
        <line x1="10" y1="30" x2="30" y2="30" strokeOpacity="0.2" strokeDasharray="3 3" />
        <rect x="16" y="6" width="18" height="10" rx="3" strokeOpacity="0.3" />
      </>
    ),
  },
  {
    title: "Temporal Comparison",
    text: "Compare surveys across dates. Track progress, detect change.",
    icon: (
      <>
        <circle cx="14" cy="20" r="8" strokeOpacity="0.4" />
        <circle cx="26" cy="20" r="8" strokeOpacity="0.4" />
      </>
    ),
  },
  {
    title: "Layer Management",
    text: "Orthomosaics, point clouds, DSMs, DTMs. Toggle, blend, query.",
    icon: (
      <>
        <rect x="8" y="8" width="24" height="24" rx="3" strokeOpacity="0.3" />
        <line x1="8" y1="16" x2="32" y2="16" strokeOpacity="0.2" />
        <line x1="8" y1="24" x2="32" y2="24" strokeOpacity="0.2" />
      </>
    ),
  },
  {
    title: "Design Overlay",
    text: "Bring in design surfaces and linework. Check as-built against plan.",
    icon: (
      <>
        <path d="M8 30L15 11L31 16L28 32Z" strokeOpacity="0.5" />
        <path d="M11 27L18 8L34 13L31 29Z" strokeOpacity="0.3" strokeDasharray="3 3" />
      </>
    ),
  },
  {
    title: "Every Site, One Globe",
    text: "All your sites on one globe, each with its full survey history, its team and who can see what.",
    wide: true,
    icon: (
      <>
        <circle cx="20" cy="20" r="12" strokeOpacity="0.4" />
        <ellipse cx="20" cy="20" rx="5" ry="12" strokeOpacity="0.3" />
        <path d="M8 20H32" strokeOpacity="0.3" />
        <circle cx="14" cy="15" r="1.5" strokeOpacity="0.6" />
        <circle cx="26" cy="25" r="1.5" strokeOpacity="0.6" />
      </>
    ),
  },
  {
    title: "Share & Download",
    text: "Download source data and share links that open the exact view.",
    icon: (
      <>
        <path d="M20 8V24" strokeOpacity="0.4" />
        <path d="M16 20L20 24L24 20" strokeOpacity="0.4" />
        <rect x="10" y="28" width="20" height="4" rx="2" strokeOpacity="0.3" />
      </>
    ),
  },
  {
    title: "Attribute Query",
    text: "Click any feature. See properties, measurements, linked records.",
    wide: true,
    icon: (
      <>
        <circle cx="20" cy="18" r="6" strokeOpacity="0.4" />
        <path d="M20 24V32" strokeOpacity="0.3" />
        <path d="M14 32H26" strokeOpacity="0.3" />
      </>
    ),
  },
  {
    title: "3D Navigation",
    text: "Orbit, pan, zoom, fly-to. CesiumJS-powered globe with terrain.",
    icon: (
      <>
        <circle cx="20" cy="20" r="12" strokeOpacity="0.3" />
        <path d="M20 8V12" strokeOpacity="0.3" />
        <path d="M20 28V32" strokeOpacity="0.3" />
        <path d="M8 20H12" strokeOpacity="0.3" />
        <path d="M28 20H32" strokeOpacity="0.3" />
        <circle cx="20" cy="20" r="3" strokeOpacity="0.5" />
      </>
    ),
  },
];

export function Capabilities() {
  return (
    <section data-section="" className={`${styles.section} ${styles.centered}`}>
      <span {...rv("up")} className={styles.eyebrow}>
        Capabilities
      </span>
      <h2 {...rv("up", 0.12)} className={`${styles.title} ${styles.capTitle}`}>
        Everything you need, nothing you don&apos;t.
      </h2>
      <span {...rv("up", 0.18)} className={styles.capCount}>
        {CAPABILITIES.length} capabilities
      </span>
      <div className={styles.capGrid}>
        {CAPABILITIES.map((c, i) => (
          <div key={c.title} {...rv("up", Math.round(i * 6) / 100)} className={c.wide ? `${styles.cap} ${styles.capWide}` : styles.cap}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="#F2E6D6" strokeWidth="1" aria-hidden="true">
              {c.icon}
            </svg>
            <h4 className={styles.capTitleText}>{c.title}</h4>
            <p className={styles.capText}>{c.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
