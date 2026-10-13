import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/(marketing)/**", "src/components/landing/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/scene/*",
                "**/capture/*",
                "@/lib/landing/survey",
                "@/lib/landing/compute",
                "@/lib/landing/cloud",
                "@/lib/landing/terrain",
                "@/lib/landing/maps",
                "@/lib/landing/showcase",
                "@/lib/landing/showcaseSite",
                "@/lib/landing/noise",
                "@/lib/landing/raster",
                "geotiff",
                "proj4",
              ],
              allowTypeImports: true,
              message: "The landing plays captured media; the renderer and the survey code it reads only run in the capture route.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", ".next-capture/**", ".landing-capture/**", "out/**", "build/**", "next-env.d.ts", "public/cesium/**"]),
]);

export default eslintConfig;
