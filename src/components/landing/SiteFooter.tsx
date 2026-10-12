import Link from "next/link";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import type { SiteInfo } from "@/lib/landing/site";
import styles from "./landing.module.css";

const COLUMNS = [
  {
    head: "Product",
    links: [
      { href: "#descent", label: "Platform" },
      { href: "#measure", label: "Measurements" },
      { href: "#try", label: "Sample site" },
    ],
  },
  {
    head: "Industries",
    links: [
      { href: "#industries", label: "Mining and quarries" },
      { href: "#industries", label: "Construction" },
      { href: "#industries", label: "Infrastructure" },
    ],
  },
  {
    head: "Company",
    links: [
      { href: "#demo", label: "Request a demo" },
      { href: "mailto:contact@orblode.com", label: "contact@orblode.com" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
];

export function SiteFooter({ site }: { site: SiteInfo }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerCard}>
        <div className={styles.footerBrand}>
          <OrblodeLogo size={18} />
          <p>The digital twin for physical sites.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.head}>
            <h2 className={styles.footerHead}>{col.head}</h2>
            <ul className={styles.footerLinks}>
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/") ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className={styles.footerBottom}>
          <span>© 2026 Orblode</span>
          <span>
            {site.mode === "sample"
              ? "The sample site on this page is illustrative."
              : `Site pictures come from the ${site.surveyDate} survey of ${site.name}. Construction and corridor pictures are schematic.`}
          </span>
        </div>
      </div>
    </footer>
  );
}
