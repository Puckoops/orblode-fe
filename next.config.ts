import type { NextConfig } from "next";

// scripts/landing/capture.ts runs next with LANDING_CAPTURE=1, which turns app/(capture)/landing-capture/page.capture.tsx
// into a route, in a build directory of its own; every other build leaves it out.
const capture = process.env.LANDING_CAPTURE === "1";

const nextConfig: NextConfig = {
  ...(capture ? { pageExtensions: ["capture.tsx", "tsx", "ts", "jsx", "js"], distDir: ".next-capture" } : {}),
  // Each "*" matches one dot-separated label: the private LAN ranges, for testing the dev server from a phone.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // The push service worker (public/orblode-sw.js) must never be served stale, or a fixed worker
  // would wait on the browser's HTTP cache before it takes over.
  async headers() {
    return [
      {
        source: "/orblode-sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Each capture lands in a folder named by its content hash, so its files never change.
        source: "/landing/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  webpack: (config) => {
    // Cesium loads at runtime from /cesium/Cesium.js (lib/viewer/loadCesium.ts); bundling its source tree
    // breaks webpack, so `import ... from "cesium"` resolves to the window.Cesium global instead.
    config.externals = [...(config.externals || []), { cesium: "Cesium" }];
    return config;
  },
};

export default nextConfig;
