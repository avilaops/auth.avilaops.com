import { NextResponse, type NextRequest } from "next/server";
import { decidirNoHostDaConta, destinoDaContaNoAuth, ehHostDaConta, ehHostDoAuth } from "@/lib/hostDaConta";

/**
 * Dois hosts, um serviço. Em conta.avilaops.com só existe a página da conta;
 * em auth.avilaops.com a página da conta é mandada para lá e o resto segue
 * como sempre. A regra está em `lib/hostDaConta.ts`.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (ehHostDoAuth(host)) {
    const destino = destinoDaContaNoAuth(request.method, request.nextUrl.pathname, request.nextUrl.search);
    return destino ? NextResponse.redirect(destino, 307) : NextResponse.next();
  }
  if (!ehHostDaConta(host)) return NextResponse.next();

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
