import assert from "node:assert/strict";
import { it } from "node:test";
import { autenticarRotinaMeta, renovarLoteMeta, type ConexaoParaRenovar, type DependenciasRenovacao } from "@/lib/renovacaoMeta";

const agora = new Date("2026-10-18T11:00:00Z");
const conexao = (id = "1", dias = 5): ConexaoParaRenovar => ({
  id, email: `${id}@exemplo.com`, tokenEnc: "cifrado-antigo",
  expiraEm: new Date(agora.getTime() + dias * 86400000),
});

function ambiente(linhas: ConexaoParaRenovar[]) {
  const feitas = new Set<string>();
  const pendentes = new Set<string>();
  const gravadas: string[] = [];
  const eventos: { tipo: string; detalhe: string }[] = [];
  const deps: DependenciasRenovacao = {
    listar: async (cursor, limite) => linhas.filter((c) => !cursor || c.id > cursor).slice(0, limite),
    reservar: async (id) => {
      if (feitas.has(id) || pendentes.has(id)) return null;
      pendentes.add(id);
      return id;
    },
    concluir: async (id, _reserva, _dia, feita) => {
      pendentes.delete(id);
      if (feita) feitas.add(id);
    },
    renovar: async () => ({ tokenEnc: "cifrado-novo", expiraEm: new Date("2026-12-17T11:00:00Z") }),
    gravar: async (c) => { gravadas.push(c.id); return true; },
    registrar: async (tipo, _email, detalhe) => { eventos.push({ tipo, detalhe }); },
  };
  return { deps, gravadas, eventos, pendentes };
}

it("nega segredo ausente, incorreto e aceita somente correspondência exata", () => {
  assert.equal(autenticarRotinaMeta(null, undefined), false);
  assert.equal(autenticarRotinaMeta("", ""), false);
  assert.equal(autenticarRotinaMeta("errado", "segredo"), false);
  assert.equal(autenticarRotinaMeta("segredO", "segredo"), false);
  assert.equal(autenticarRotinaMeta("segredo", "segredo"), true);
});

it("renova e não repete a conexão ao reexecutar no mesmo dia", async () => {
  const a = ambiente([conexao()]);
  assert.equal((await renovarLoteMeta(a.deps, null, agora)).renovadas, 1);
  assert.equal((await renovarLoteMeta(a.deps, null, agora)).ignoradas, 1);
  assert.deepEqual(a.gravadas, ["1"]);
  assert.equal(a.eventos[0].tipo, "meta_token_renovado");
});

it("não tenta renovar conexões vencidas, sem validade ou longe do vencimento", async () => {
  const semPrazo = { ...conexao("3"), expiraEm: null };
  const a = ambiente([conexao("1", 0), conexao("2", 30), semPrazo]);
  a.deps.renovar = async () => { throw new Error("não pode chamar"); };
  const r = await renovarLoteMeta(a.deps, null, agora);
  assert.equal(r.vencidas, 1);
  assert.equal(r.ignoradas, 2);
  assert.equal(r.falhas, 0);
  assert.deepEqual(a.gravadas, []);
});

it("isola falha temporária, omite segredo do erro e permite recuperação", async () => {
  const a = ambiente([conexao("1"), conexao("2")]);
  const renovar = a.deps.renovar;
  a.deps.renovar = async (c) => {
    if (c.id === "1") throw new Error("access_token=segredo");
    return renovar(c);
  };
  const r = await renovarLoteMeta(a.deps, null, agora);
  assert.equal(r.renovadas, 1);
  assert.equal(r.falhas, 1);
  assert.equal(JSON.stringify(a.eventos).includes("segredo"), false);
  assert.equal(a.pendentes.size, 0);
  a.deps.renovar = renovar;
  assert.equal((await renovarLoteMeta(a.deps, null, agora)).renovadas, 1);
});

it("resposta sem validade não substitui token nem transforma conexão em eterna", async () => {
  const a = ambiente([conexao()]);
  a.deps.renovar = async () => ({ tokenEnc: "novo", expiraEm: null });
  assert.equal((await renovarLoteMeta(a.deps, null, agora)).falhas, 1);
  assert.deepEqual(a.gravadas, []);
});

it("não sobrescreve conexão alterada ou excluída durante a renovação", async () => {
  const a = ambiente([conexao()]);
  a.deps.gravar = async () => false;
  const r = await renovarLoteMeta(a.deps, null, agora);
  assert.equal(r.renovadas, 0);
  assert.equal(r.ignoradas, 1);
  assert.deepEqual(a.eventos, []);
});

it("execuções concorrentes compartilham a reserva", async () => {
  const a = ambiente([conexao()]);
  const resultados = await Promise.all([renovarLoteMeta(a.deps, null, agora), renovarLoteMeta(a.deps, null, agora)]);
  assert.equal(resultados.reduce((n, r) => n + r.renovadas, 0), 1);
  assert.deepEqual(a.gravadas, ["1"]);
});

it("pagina sem perder a linha extra e termina com cursor nulo", async () => {
  const a = ambiente(Array.from({ length: 12 }, (_, i) => conexao(String(i).padStart(2, "0"))));
  const primeira = await renovarLoteMeta(a.deps, null, agora);
  assert.equal(primeira.examinadas, 10);
  assert.equal(primeira.proximoCursor, "09");
  const segunda = await renovarLoteMeta(a.deps, primeira.proximoCursor, agora);
  assert.equal(segunda.examinadas, 2);
  assert.equal(segunda.proximoCursor, null);
  assert.equal(a.gravadas.length, 12);
});

it("não converte indisponibilidade do banco em sucesso vazio", async () => {
  const a = ambiente([]);
  a.deps.listar = async () => { throw new Error("banco indisponível"); };
  await assert.rejects(renovarLoteMeta(a.deps, null, agora), /banco indisponível/);
});
