import type { NextConfig } from "next";

const nextConfig: NextConfig = { turbopack: { root: __dirname }, experimental: { useLightningcss: true, lightningCssFeatures: { exclude: ["light-dark"] } } };

export default nextConfig;
