import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow resume PDF uploads (default server action limit is 1mb).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
