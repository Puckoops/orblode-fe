import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaptureStage } from "@/components/landing/capture/CaptureStage";
import styles from "@/components/landing/landing.module.css";
import { SiteProvider } from "@/components/landing/SiteContext";
import { showcaseForCapture } from "@/lib/landing/showcase";

export const metadata: Metadata = { title: "Landing capture", robots: { index: false } };

export const dynamic = "force-dynamic";

/** Only a route when next runs with LANDING_CAPTURE=1 (see next.config.ts); scripts/landing/capture.ts drives it. */
export default async function LandingCapture({ searchParams }: { searchParams: Promise<{ stills?: string }> }) {
  if (process.env.LANDING_CAPTURE !== "1") notFound();
  const [{ site, surveyId }, { stills }] = await Promise.all([showcaseForCapture(), searchParams]);
  return (
    <div data-landing="" className={styles.landing}>
      <SiteProvider site={site}>
        <CaptureStage surveyId={surveyId} stills={stills === "1"} />
      </SiteProvider>
    </div>
  );
}
