import "./globals.css";
import { themeScriptFor } from "@puckoops/camelot/helpers";
import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { InlineScript } from "@/components/InlineScript";
import { DEFAULT_THEME } from "@/lib/theme";
import { Providers } from "./providers";

const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--pk-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--pk-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--pk-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Orblode", template: "%s · Orblode" },
  description: "Living 3D replicas of every site: measure, compare and track change over time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      data-theme={DEFAULT_THEME}
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <InlineScript html={themeScriptFor(DEFAULT_THEME)} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
