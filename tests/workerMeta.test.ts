import assert from "node:assert/strict";
import { it } from "node:test";
import { passarWorkerMeta, INTERVALO_VARREDURA_META_MS, LEASE_WORKER_META_MS, type DependenciasWorkerMeta } from "@/lib/workerMeta";

const agora = Date.parse("2026-10-24T12:00:00Z");

function ambiente(total = 25) {
  let valor: string | null = null;
  const processados: string[] = [];
  const deps: DependenciasWorkerMeta = {
    ler: async () => valor,
    trocar: async (anterior, novo) => {
      if (anterior !== valor) return false;
      valor = novo;
      return true;
    },
    ultimoId: async () => total ? String(total).padStart(6, "0") : null,
    executar: async (cursor, _ate, ultimoId) => {
      const inicio = Number(cursor ?? 0) + 1;
      const fim = Math.min(inicio + 9, Number(ultimoId));
      for (let i = inicio; i <= fim; i++) processados.push(String(i).padStart(6, "0"));
      return { examinadas: fim - inicio + 1, renovadas: fim - inicio + 1, vencidas: 0, falhas: 0, ignoradas: 0,
        proximoCursor: fim < Number(ultimoId) ? String(fim).padStart(6, "0") : null };
    },
  };
  return { deps, processados, estado: () => valor };
}

it("continua após 100 páginas sem reiniciar nem exigir cursor do n8n", async () => {
  const a = ambiente(1105);
  for (let i = 0; i < 111; i++) {
    const r = await passarWorkerMeta(a.deps, agora);
    assert.equal(r.proximoCursor, null);
    assert.equal(r.continuacaoPendente, i < 110);
  }
  assert.equal(a.processados.length, 1105);
  assert.equal(new Set(a.processados).size, 1105);
  const espera = await passarWorkerMeta(a.deps, agora + 1);
  assert.equal(espera.examinadas, 0);
  assert.equal(espera.proximaEm, agora + INTERVALO_VARREDURA_META_MS);
});

it("retoma o checkpoint em outro processo e após resposta perdida", async () => {
  const a = ambiente();
  await passarWorkerMeta(a.deps, agora);
  const outroProcesso = { ...a.deps };
  await passarWorkerMeta(outroProcesso, agora + 1000);
  assert.equal(a.processados.length, 20);
  assert.equal(a.processados[10], "000011");
});

it("reserva atômica impede dois lotes simultâneos", async () => {
  const a = ambiente();
  const resultados = await Promise.all([passarWorkerMeta(a.deps, agora), passarWorkerMeta(a.deps, agora)]);
  assert.equal(a.processados.length, 10);
  assert.equal(resultados.filter((r) => r.ocupada).length, 1);
});

it("falha de um lote mantém o cursor e permite reexecução", async () => {
  const a = ambiente();
  const executar = a.deps.executar;
  a.deps.executar = async () => { throw new Error("banco indisponível"); };
  await assert.rejects(passarWorkerMeta(a.deps, agora), /banco indisponível/);
  a.deps.executar = executar;
  await passarWorkerMeta(a.deps, agora + 1000);
  assert.equal(a.processados[0], "000001");
});

it("queda após reservar é recuperada quando a reserva vence", async () => {
  const a = ambiente();
  const trocar = a.deps.trocar;
  a.deps.executar = async () => { throw new Error("processo caiu"); };
  let alteracoes = 0;
  a.deps.trocar = async (antes, depois) => {
    alteracoes++;
    if (alteracoes > 2) throw new Error("banco caiu");
    return trocar(antes, depois);
  };
  await assert.rejects(passarWorkerMeta(a.deps, agora));
  a.deps.trocar = trocar;
  assert.equal((await passarWorkerMeta(a.deps, agora + 1000)).ocupada, true);
  const b = ambiente();
  a.deps.executar = b.deps.executar;
  assert.equal((await passarWorkerMeta(a.deps, agora + LEASE_WORKER_META_MS + 1)).examinadas, 10);
});

it("novas conexões não alteram o teto de uma rodada em andamento", async () => {
  const a = ambiente(12);
  await passarWorkerMeta(a.deps, agora);
  a.deps.ultimoId = async () => "999999";
  await passarWorkerMeta(a.deps, agora + 1000);
  assert.equal(a.processados.length, 12);
  assert.equal(a.processados.at(-1), "000012");
});

it("falha parcial avança a rodada para não bloquear as conexões seguintes", async () => {
  const a = ambiente();
  const executar = a.deps.executar;
  a.deps.executar = async (...args) => ({ ...await executar(...args), falhas: 1 });
  assert.equal((await passarWorkerMeta(a.deps, agora)).falhas, 1);
  await passarWorkerMeta(a.deps, agora + 1000);
  assert.equal(a.processados[10], "000011");
});

it("cursor parado e estado corrompido falham visivelmente", async () => {
  const a = ambiente();
  await passarWorkerMeta(a.deps, agora);
  a.deps.executar = async (cursor) => ({ examinadas: 0, renovadas: 0, vencidas: 0, falhas: 0, ignoradas: 0, proximoCursor: cursor });
  await assert.rejects(passarWorkerMeta(a.deps, agora), /não avançou/);
  a.deps.ler = async () => "{}";
  await assert.rejects(passarWorkerMeta(a.deps, agora), /inválido/);
});

it("sem conexões respeita intervalo e tenta de novo após o horário salvo", async () => {
  const a = ambiente(0);
  let chamadas = 0;
  a.deps.ultimoId = async () => { chamadas++; return null; };
  await passarWorkerMeta(a.deps, agora);
  await passarWorkerMeta(a.deps, agora + 1000);
  assert.equal(chamadas, 1);
  await passarWorkerMeta(a.deps, agora + INTERVALO_VARREDURA_META_MS);
  assert.equal(chamadas, 2);
});
