import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    domains: ["aviation.wv.gov"],
  },
};

export default nextConfig;
