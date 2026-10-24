import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone) for the Docker image: investigations run for minutes, so this is not a serverless app.
  output: 'standalone',
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
