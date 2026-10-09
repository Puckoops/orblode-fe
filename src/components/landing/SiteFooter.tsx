import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { RequestDemoButton } from "./DemoRequest";
import styles from "./landing.module.css";

/** A link without an href opens the demo request instead. */
const COLUMNS: { head: string; links: { href?: string; label: string }[] }[] = [
  {
    head: "Product",
    links: [
      { href: "#platform", label: "Platform" },
      { href: "#industries", label: "Industries" },
      { href: "#viewer", label: "Viewer" },
      { href: "#", label: "Documentation" },
    ],
  },
  {
    head: "Company",
    links: [
      { href: "#", label: "About" },
      { label: "Contact" },
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
    ],
  },
];

const STACK = ["CesiumJS", "Next.js", "Go", "PostgreSQL + PostGIS", "Cloud GPUs", "India Data Residency"];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <div className={styles.footerBrand}>
          <span className={styles.brand}>
            <OrblodeLogo size={20} />
          </span>
          <p className={styles.footerBlurb}>The digital twin platform for mines, construction sites and infrastructure.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.head} className={styles.footerCol}>
            <h4 className={styles.footerHead}>{col.head}</h4>
            <div className={styles.footerLinks}>
              {col.links.map((l) =>
                l.href === undefined ? (
                  <RequestDemoButton key={l.label} className={`${styles.footerLink} ${styles.linkButton}`}>
                    {l.label}
                  </RequestDemoButton>
                ) : (
                  <a key={l.label} href={l.href} className={styles.footerLink}>
                    {l.label}
                  </a>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={`${styles.chips} ${styles.stack}`}>
        {STACK.map((s) => (
          <span key={s} className={styles.chip}>
            {s}
          </span>
        ))}
      </div>
      <div className={styles.crs}>WGS 84 · UTM · GDA2020 / MGA</div>
      <div className={styles.footerBottom}>
        <span>© 2026 ORBLODE. All rights reserved.</span>
        <span>Bhubaneswar, India</span>
      </div>
    </footer>
  );
}
