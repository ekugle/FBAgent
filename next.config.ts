import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.fbcdn.net",
      },
      {
        protocol: "https",
        hostname: "**.facebook.com",
      },
    ],
  },
};

export default nextConfig;
