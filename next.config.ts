import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // this repo is nested under a parent that also has a lockfile
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
