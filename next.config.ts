import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
    domains: ["aviation.wv.gov"],
  },
};

export default nextConfig;
