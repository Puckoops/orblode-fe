import type { Metadata } from "next";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { DemoRequestProvider } from "@/components/landing/DemoRequest";
import { Descent } from "@/components/landing/Descent";
import { Hero } from "@/components/landing/Hero";
import { Industries } from "@/components/landing/Industries";
import styles from "@/components/landing/landing.module.css";
import { Measure } from "@/components/landing/Measure";
import { Pipeline } from "@/components/landing/Pipeline";
import { Proof } from "@/components/landing/Proof";
import { SiteProvider } from "@/components/landing/SiteContext";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { TryViewer } from "@/components/landing/TryViewer";
import { landingSite } from "@/lib/landing/showcase";

export const metadata: Metadata = {
  title: { absolute: "Orblode · See your site from decision altitude" },
  description: "Orblode turns drone surveys into measurable 3D digital twins of mines, construction sites and infrastructure. Measure, compare and decide in the browser.",
};

export default async function LandingPage() {
  const site = await landingSite();
  return (
    <div data-landing="" className={styles.landing}>
      <SiteProvider site={site}>
        <DemoRequestProvider>
          <a href="#main" className={styles.skipLink}>
            Skip to content
          </a>
          <div className={styles.announce}>
            <span className={styles.announceTag}>New</span>
            <span className={styles.announceLong}>Cut and fill against your design surface, on a 0.2 m grid.</span>
            <span className={styles.announceShort}>Cut and fill against design.</span>
            <a href="#measure">See it</a>
          </div>
          <SiteHeader />
          <main id="main">
            <Hero />
            <Proof />
            <Descent />
            <Measure site={site} />
            <Pipeline />
            <Industries site={site} />
            <TryViewer />
            <ClosingCta />
          </main>
          <SiteFooter site={site} />
        </DemoRequestProvider>
      </SiteProvider>
    </div>
  );
}
