import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Each "*" matches one dot-separated label: the private LAN ranges, for testing the dev server from a phone.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  webpack: (config) => {
    // Cesium loads at runtime from /cesium/Cesium.js (lib/viewer/loadCesium.ts); bundling its source tree
    // breaks webpack, so `import ... from "cesium"` resolves to the window.Cesium global instead.
    config.externals = [...(config.externals || []), { cesium: "Cesium" }];
    return config;
  },
};

export default nextConfig;
