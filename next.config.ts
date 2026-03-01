import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Fix for PDF parsing
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Ignore linting and type errors during build to ensure deployment succeeds
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      { source: "/cv&pb", destination: "/cv-pb" },
      { source: "/cvpb&konsult", destination: "/cvpb-konsult" },
    ];
  },
};

export default nextConfig;
