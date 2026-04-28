import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/mes-commandes",
        destination: "/panier",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
