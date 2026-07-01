import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Turbopack doesn't infer a parent
  // directory from a stray lockfile elsewhere (e.g. C:\Users\loyal).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
