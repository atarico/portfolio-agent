import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP server package ships TypeScript sources; let Next compile it.
  transpilePackages: ["@portfolio-agent/mcp-server"],
  // The demo runs on the dev server, where the floating route indicator sits on
  // top of the composer on narrow screens. Compile and runtime errors still show.
  devIndicators: false,
};

export default nextConfig;
