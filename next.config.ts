import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone) for the Docker image: investigations run for minutes, so this is not a serverless app.
  output: 'standalone',
  /* config options here */
  cacheComponents: true,
  // Recording the demo (`npm run dev:demo`): no development badge on screen.
  ...(process.env.NEXT_PUBLIC_DEMO_TOUR === '1' ? { devIndicators: false as const } : {}),
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
