import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer uses dynamic requires that webpack can't bundle.
  // Keep it as an external require() at runtime (Node.js route handlers only).
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "amautainversiones.com",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
};

export default nextConfig;
