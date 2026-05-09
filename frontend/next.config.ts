import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server at .next/standalone/server.js so Plesk
  // can run it directly without copying node_modules. After `next build`,
  // the deploy hook copies public/ and .next/static/ into standalone/ —
  // those aren't traced in by default.
  output: "standalone",
};

export default nextConfig;
