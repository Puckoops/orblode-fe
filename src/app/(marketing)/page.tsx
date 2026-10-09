import type { Metadata } from "next";
import { DemoRequestProvider } from "@/components/landing/DemoRequest";
import { Hero } from "@/components/landing/Hero";
import { LandingMotion } from "@/components/landing/LandingMotion";
import styles from "@/components/landing/landing.module.css";
import { MeshBackground } from "@/components/landing/MeshBackground";
import { Metrics } from "@/components/landing/Metrics";
import { Particles } from "@/components/landing/Particles";
import { Capabilities, MeasureFeatures, ViewerPreview, Problem, Platform, Separator, TrustMarquee, Industries, Workflow } from "@/components/landing/Sections";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SplashScreen } from "@/components/landing/SplashScreen";

export const metadata: Metadata = {
  title: { absolute: "Orblode · See your site from decision altitude" },
  description: "Orblode turns drone surveys into measurable 3D digital twins of mines, construction sites and infrastructure. Measure, compare and decide in the browser.",
};

export default function LandingPage() {
  return (
    <div data-landing="" className={styles.landing}>
      <DemoRequestProvider>
        <SplashScreen />
        <MeshBackground />
        <Particles />
        <SiteHeader />
        <main>
          <Hero />
          <TrustMarquee />
          <Separator />
          <Problem />
          <Separator />
          <Platform />
          <Separator />
          <MeasureFeatures />
          <Separator />
          <Industries />
          <Separator />
          <ViewerPreview />
          <Separator />
          <Workflow />
          <Separator />
          <Capabilities />
          <Separator />
          <Metrics />
        </main>
        <SiteFooter />
        <LandingMotion />
      </DemoRequestProvider>
    </div>
  );
}
