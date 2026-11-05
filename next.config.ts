import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
