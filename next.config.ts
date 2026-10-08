import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the local network load dev-server scripts; Next blocks non-localhost origins by default.
  allowedDevOrigins: ["192.168.*.*", "*.local"],
};

export default nextConfig;
