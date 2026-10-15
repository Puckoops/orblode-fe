import type { Metadata } from "next";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { DemoRequestProvider } from "@/components/landing/DemoRequest";
import { Descent } from "@/components/landing/Descent";
import { Hero } from "@/components/landing/Hero";
import { Industries } from "@/components/landing/Industries";
import styles from "@/components/landing/landing.module.css";
import { Measure } from "@/components/landing/Measure";
import { Proof } from "@/components/landing/Proof";
import { SiteProvider } from "@/components/landing/SiteContext";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { TryViewer } from "@/components/landing/TryViewer";
import { validateMedia } from "@/lib/landing/media";
import capture from "@/lib/landing/media.json";

export const metadata: Metadata = {
  title: { absolute: "Orblode · See your site from decision altitude" },
  description: "Orblode turns drone surveys into measurable 3D digital twins of mines, construction sites and infrastructure. Measure, compare and decide in the browser.",
};

// Rendered ahead of time from the showcase survey by `npm run landing:capture`; a bad manifest fails the build.
const media = validateMedia(capture);

export default function LandingPage() {
  const site = media.site;
  return (
    <div data-landing="" className={styles.landing}>
      <SiteProvider site={site}>
        <DemoRequestProvider>
          <a href="#main" className={styles.skipLink}>
            Skip to content
          </a>
          <SiteHeader />
          <main id="main">
            <Hero media={media} />
            <Proof />
            <Descent descent={media.descent} frame={media.frame} />
            <Measure site={site} media={media} />
            <Industries site={site} stills={media.stills} />
            <TryViewer turntable={media.turntable} />
            <ClosingCta backdrop={media.stills.closing!} />
          </main>
          <SiteFooter site={site} />
        </DemoRequestProvider>
      </SiteProvider>
    </div>
  );
}
