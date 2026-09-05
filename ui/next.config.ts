import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

const buildTarget = process.env.BUILD_TARGET === "export"
  ? { output: "export" as const, images: { unoptimized: true } }
  : { output: "standalone" as const };

export default { ...nextConfig, ...buildTarget } as NextConfig;
