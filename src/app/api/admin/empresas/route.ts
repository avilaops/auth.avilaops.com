import { NextRequest, NextResponse } from "next/server";
import { ehSuperadmin } from "@/lib/admin";
import { consultarEmpresas } from "@/lib/empresas";
import { executarConsultaEmpresas } from "@/lib/empresasConsultaApi";
import { limitar } from "@/lib/rateLimit";
import { desafioNecessario } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const r = await executarConsultaEmpresas(req.nextUrl.searchParams, {
    sessao: lerSessao,
    admin: ehSuperadmin,
    precisaFator: async (s) => await desafioNecessario({ email: s.email, papel: s.papel }) !== "nenhum",
    limitar: (email) => limitar(`admin-empresas:${email}`, 60, 60_000),
    consultar: consultarEmpresas,
  });
  return NextResponse.json(r.corpo, { status: r.status, headers: { "Cache-Control": "private, no-store" } });
}
