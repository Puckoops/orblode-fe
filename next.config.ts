import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
