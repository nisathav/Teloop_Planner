import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
      // Allow form posts through forwarded preview URLs (GitHub Codespaces, dev tunnels).
      allowedOrigins: ["localhost:3000", "*.app.github.dev", "*.preview.app.github.dev"],
    },
  },
};

export default nextConfig;
