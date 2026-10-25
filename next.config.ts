import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone) for the Docker image: investigations run for minutes, so this is not a serverless app.
  output: 'standalone',
  /* config options here */
  cacheComponents: true,
  // Recording the demo (`npm run dev:demo`): no development badge on screen.
  // The tour also starts again from its first step every time the server starts (the id keys its saved position).
  ...(process.env.NEXT_PUBLIC_DEMO_TOUR === '1' ? { devIndicators: false as const, env: { NEXT_PUBLIC_TOUR_RUN: String(Date.now()) } } : {}),
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
