import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empacota so o que o build provou necessario. Sem isto a imagem
  // carrega o node_modules inteiro: 1,2 GB em vez de ~200 MB.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // O auth server nunca deve ser embutido em iframe: um clickjack aqui
          // vale por todos os subdomínios de uma vez.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
