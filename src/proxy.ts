import { NextResponse, type NextRequest } from "next/server";
import { decidirNoHostDaConta, ehHostDaConta } from "@/lib/hostDaConta";

/**
 * Só age quando o pedido chega por conta.avilaops.com; no host do Auth tudo
 * segue como sempre. A regra está em `lib/hostDaConta.ts`.
 */
export function proxy(request: NextRequest) {
  if (!ehHostDaConta(request.headers.get("host"))) return NextResponse.next();

  const base = (process.env.SSO_BASE_URL || "https://auth.avilaops.com").replace(/\/$/, "");
  const decisao = decidirNoHostDaConta(request.nextUrl.pathname, request.nextUrl.search, base);
  if (decisao.tipo === "seguir") return NextResponse.next();
  if (decisao.tipo === "redirecionar") return NextResponse.redirect(decisao.url, 307);

  const destino = request.nextUrl.clone();
  destino.pathname = decisao.caminho;
  return NextResponse.rewrite(destino);
}

export const config = {
  // Os arquivos do build não mudam com o host: não passam por aqui.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
