import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // sharp uses platform-specific @img/* binaries; include them in standalone traces.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
