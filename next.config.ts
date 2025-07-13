import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  
  // Add these lines to disable image optimization
  images: {
    unoptimized: true,
  },
};

export default nextConfig;