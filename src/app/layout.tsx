import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { scriptInicial } from "@/lib/tema-noturno";
import "./globals.css";

/* Manrope é a fonte da identidade; `variable` deixa o CSS decidir onde aplica. */
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });

export const metadata: Metadata = {
  // Cada página dá o próprio nome; antes toda aba se chamava "Entrar", inclusive
  // o painel, e quem tinha três abertas não sabia qual era qual.
  title: { default: "Entrar — Avila Ops", template: "%s — Avila Ops" },
  description: "Autenticação única dos sistemas Avila Ops.",
  robots: { index: false, follow: false },
  // Sem estas entradas os arquivos existem em /public mas nada os referencia,
  // e o navegador cai no /favicon.ico implícito, que aqui não existia.
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/*
 * `themeColor` pinta a barra de status do celular da mesma cor do fundo, por
 * tema. Um valor só deixava a barra escura numa tela clara.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      data-theme="light"
      className={manrope.variable}
      style={{ colorScheme: "light" }}
    >
      <head>
        {/*
          Modo noturno da casa: 18h escurece, 6h clareia, igual ao painel.
          Precisa rodar antes do CSS, senão a tela pinta clara e escurece
          depois, e o flash branco às 22h é pior do que não ter tema escuro.
        */}
        <script dangerouslySetInnerHTML={{ __html: scriptInicial() }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
