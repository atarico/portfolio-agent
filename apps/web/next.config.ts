import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP server package ships TypeScript sources; let Next compile it.
  transpilePackages: ["@portfolio-agent/mcp-server"],
};

export default nextConfig;
