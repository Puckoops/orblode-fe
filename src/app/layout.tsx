import "./globals.css";
import { themeScriptFor } from "@puckoops/camelot/helpers";
import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, Space_Mono } from "next/font/google";
import localFont from "next/font/local";
import { InlineScript } from "@/components/InlineScript";
import { DEFAULT_THEME } from "@/lib/theme";
import { Providers } from "./providers";

const sans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--pk-sans", display: "swap" });
// The display face only titles the auth pages, so it is not preloaded on every route.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--pk-serif", display: "swap", preload: false });
const mono = localFont({ src: "./fonts/GeistMono-Variable.woff2", weight: "100 900", variable: "--pk-mono", display: "swap" });
const logotype = Space_Mono({ subsets: ["latin"], weight: "700", variable: "--pk-logotype", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Orblode", template: "%s · Orblode" },
  description: "Living 3D replicas of every site: measure, compare and track change over time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      data-theme={DEFAULT_THEME}
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${logotype.variable}`}
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
