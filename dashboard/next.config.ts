import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  experimental: { useLightningcss: true, lightningCssFeatures: { exclude: ["light-dark"] } },
};

export default nextConfig;
