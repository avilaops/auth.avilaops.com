import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Conta } from "@/lib/contas";
import { agruparContas, consultarContas, defContas, montarContas } from "@/lib/contasLista";
import { autorEAlvo, descreverEvento, tiposDoResultado } from "@/lib/eventosCatalogo";
import {
  agrupar,
  casaBusca,
  filtrosAtivos,
  intervaloDoPeriodo,
  lerConsulta,
  ordenar,
  paginar,
  paraParams,
  pareceCpf,
  passaNosFiltros,
  type DefLista,
} from "@/lib/listagem";

const def: DefLista = {
  filtros: [
    { chave: "papel", rotulo: "Perfil", tipo: "multi", opcoes: [{ valor: "a", rotulo: "A" }, { valor: "b", rotulo: "B" }] },
    { chave: "estado", rotulo: "Estado", tipo: "unico", opcoes: [{ valor: "ativa", rotulo: "Ativa" }, { valor: "desligada", rotulo: "Desligada" }] },
  ],
  ordens: [{ campo: "nome", rotulo: "Nome" }, { campo: "acesso", rotulo: "Acesso", padrao: "desc" }],
  grupos: [{ valor: "empresa", rotulo: "Empresa" }],
  ordemInicial: { campo: "nome", dir: "asc" },
  periodo: true,
};

describe("consulta da URL", () => {
  it("só aceita filtro, opção, ordem e agrupamento que a seção declara", () => {
    const c = lerConsulta({ f_papel: "a,zzz,b,a", f_estado: "ativa,desligada", f_segredo: "x", ord: "senha_hash; drop table", dir: "desc", grupo: "cpf", por: "999", pag: "-3" }, def);
    assert.deepEqual(c.filtros, { papel: ["a", "b"], estado: ["ativa"] });
    assert.equal(c.ord, "nome");
    assert.equal(c.grupo, "");
    assert.equal(c.por, 25);
    assert.equal(c.pag, 1);
    assert.equal(filtrosAtivos(c), 2);
  });

  it("campo ordenável sem direção usa a direção própria dele", () => {
    assert.equal(lerConsulta({ ord: "acesso" }, def).dir, "desc");
    assert.equal(lerConsulta({ ord: "acesso", dir: "asc" }, def).dir, "asc");
    assert.equal(lerConsulta({}, def).dir, "asc");
  });

  it("período: atalho vence datas, e datas trocadas são postas em ordem", () => {
    assert.deepEqual([lerConsulta({ periodo: "7d", de: "2026-01-01" }, def).periodo, lerConsulta({ periodo: "7d", de: "2026-01-01" }, def).de], ["7d", ""]);
    const c = lerConsulta({ de: "2026-10-08", ate: "2026-10-01" }, def);
    assert.deepEqual([c.de, c.ate], ["2026-10-01", "2026-10-08"]);
    assert.equal(lerConsulta({ de: "ontem" }, def).de, "");
  });

  it("volta para a URL só com o que difere do padrão, e mudar filtro zera a página", () => {
    const c = lerConsulta({ q: "maria", f_papel: "b", ord: "acesso", pag: "3", por: "50" }, def);
    assert.equal(paraParams(c, def).toString(), "q=maria&f_papel=b&ord=acesso&dir=desc&por=50&pag=3");
    assert.equal(paraParams({ ...c, pag: 1, filtros: {} }, def).toString(), "q=maria&ord=acesso&dir=desc&por=50");
    assert.equal(paraParams(lerConsulta({}, def), def).toString(), "");
  });
});

describe("busca e filtros", () => {
  it("busca ignora acento e maiúscula e exige todos os termos", () => {
    assert.equal(casaBusca("joao SILVA", ["João da Silva", "j@x.com"]), true);
    assert.equal(casaBusca("joão souza", ["João da Silva"]), false);
    assert.equal(casaBusca("", ["qualquer"]), true);
  });

  it("CPF é reconhecido para não ir à URL; nome e e-mail não", () => {
    assert.equal(pareceCpf("123.456.789-09"), true);
    assert.equal(pareceCpf("12345678909"), true);
    assert.equal(pareceCpf("maria 123"), false);
    assert.equal(pareceCpf("2026"), false);
  });

  it("E entre filtros diferentes, OU dentro do mesmo filtro", () => {
    const item = { papel: "b", estado: "ativa" };
    const valores = (i: typeof item, chave: string) => [i[chave as keyof typeof item]];
    assert.equal(passaNosFiltros(item, { papel: ["a", "b"] }, valores), true);
    assert.equal(passaNosFiltros(item, { papel: ["a", "b"], estado: ["desligada"] }, valores), false);
    assert.equal(passaNosFiltros(item, {}, valores), true);
  });
});

describe("ordenação, paginação e agrupamento", () => {
  const nomes = ["Zeca", "ana", "Élcio", "Álvaro", "bruno", "Ana"].map((nome, i) => ({ id: `id${i}`, nome }));

  it("ordem alfabética em português, com desempate estável pelo identificador", () => {
    assert.deepEqual(ordenar(nomes, (n) => n.nome, "asc", (n) => n.id).map((n) => n.nome), ["Álvaro", "ana", "Ana", "bruno", "Élcio", "Zeca"]);
    assert.deepEqual(ordenar(nomes, (n) => n.nome, "desc", (n) => n.id).map((n) => n.nome), ["Zeca", "Élcio", "bruno", "ana", "Ana", "Álvaro"]);
  });

  it("valor ausente vai para o fim nas duas direções", () => {
    const itens = [{ id: "a", d: null }, { id: "b", d: new Date("2026-10-01") }, { id: "c", d: new Date("2026-10-05") }, { id: "d", d: null }];
    assert.deepEqual(ordenar(itens, (i) => i.d, "desc", (i) => i.id).map((i) => i.id), ["c", "b", "a", "d"]);
    assert.deepEqual(ordenar(itens, (i) => i.d, "asc", (i) => i.id).map((i) => i.id), ["b", "c", "a", "d"]);
  });

  it("a ordem atravessa as páginas: juntar as páginas devolve a lista ordenada inteira", () => {
    const muitos = Array.from({ length: 53 }, (_, i) => ({ id: String(i).padStart(3, "0"), nome: `Conta ${(i * 37) % 53}` }));
    const ordenados = ordenar(muitos, (m) => m.nome, "asc", (m) => m.id);
    const paginas = [1, 2, 3].flatMap((pag) => paginar(ordenados, pag, 25).itens);
    assert.deepEqual(paginas, ordenados);
    assert.deepEqual([paginar(ordenados, 3, 25).de, paginar(ordenados, 3, 25).ate, paginar(ordenados, 3, 25).total], [51, 53, 53]);
    assert.equal(paginar(ordenados, 99, 25).pag, 3);
    assert.deepEqual([paginar([], 1, 25).de, paginar([], 1, 25).paginas], [0, 1]);
  });

  it("grupos em ordem alfabética, sem chave por último, com a ordem dos itens preservada", () => {
    const itens = [{ e: "z", n: 1 }, { e: "", n: 2 }, { e: "a", n: 3 }, { e: "z", n: 4 }];
    const grupos = agrupar(itens, (i) => ({ chave: i.e, rotulo: i.e ? `Empresa ${i.e}` : "Sem empresa vinculada" }));
    assert.deepEqual(grupos.map((g) => [g.rotulo, g.itens.map((i) => i.n)]), [["Empresa a", [3]], ["Empresa z", [1, 4]], ["Sem empresa vinculada", [2]]]);
  });

  it("período em dias de São Paulo: 'últimos 7 dias' inclui hoje", () => {
    const agora = new Date("2026-10-08T02:30:00Z"); // ainda dia 7 em São Paulo
    const { desde, ate } = intervaloDoPeriodo({ periodo: "7d", de: "", ate: "" }, agora);
    assert.equal(desde?.toISOString(), "2026-10-01T03:00:00.000Z");
    assert.equal(ate?.toISOString(), "2026-10-08T03:00:00.000Z");
    const livre = intervaloDoPeriodo({ periodo: "", de: "2026-10-01", ate: "2026-10-01" }, agora);
    assert.equal((livre.ate!.getTime() - livre.desde!.getTime()) / 3_600_000, 24);
    assert.deepEqual(intervaloDoPeriodo({ periodo: "", de: "", ate: "" }, agora), { desde: undefined, ate: undefined });
  });
});

describe("contas", () => {
  const base: Omit<Conta, "id" | "nome" | "email" | "role"> = { cpf: null, telefone: null, senhaProvisoria: false, criadoEm: new Date("2026-01-01"), ativa: true, organizationId: null, ultimoAcessoEm: null };
  const contas: Conta[] = [
    { ...base, id: "1", nome: "Nicolas", email: "nicolas@avilaops.com", role: "OWNER", ultimoAcessoEm: new Date("2026-10-08T12:00:00Z") },
    { ...base, id: "2", nome: "Érica", email: "erica@loja.test", role: "ADMIN", organizationId: "org-b", cpf: "123.456.789-09" },
    { ...base, id: "3", nome: "Bruno", email: "bruno@loja.test", role: "CLIENT", organizationId: "org-b", senhaProvisoria: true },
    { ...base, id: "4", nome: "Carla", email: "carla@padaria.test", role: "CLIENT", organizationId: "org-a", ativa: false },
    { ...base, id: "5", nome: "Davi", email: "davi@gmail.com", role: "CLIENT", organizationId: "org-apagada" },
  ];
  const empresas = [{ id: "org-a", nome: "Padaria Aurora", situacao: "ACTIVE" }, { id: "org-b", nome: "Loja Brasil", situacao: "ACTIVE" }];
  const logins = new Map([["erica@loja.test", new Date("2026-09-01T10:00:00Z")], ["nicolas@avilaops.com", new Date("2026-10-01T10:00:00Z")]]);
  const todas = montarContas(contas, empresas, logins, new Set(["nicolas@avilaops.com"]));
  const def2 = defContas(empresas, todas);
  const agora = new Date("2026-10-08T15:00:00Z").getTime();
  const nomes = (params: Record<string, string>, busca = "") => consultarContas(todas, lerConsulta(params, def2), busca || (params.q ?? ""), agora).map((c) => c.nome);

  it("a empresa vem do vínculo gravado, nunca do domínio do e-mail", () => {
    assert.equal(todas.find((c) => c.id === "5")?.empresaNome, null);
    assert.equal(todas.find((c) => c.id === "1")?.empresaNome, null);
    assert.equal(todas.find((c) => c.id === "3")?.empresaNome, "Loja Brasil");
  });

  it("último acesso é o mais recente entre a conta e a auditoria", () => {
    assert.equal(todas.find((c) => c.id === "1")?.ultimoAcesso?.toISOString(), "2026-10-08T12:00:00.000Z");
    assert.equal(todas.find((c) => c.id === "2")?.ultimoAcesso?.toISOString(), "2026-09-01T10:00:00.000Z");
    assert.equal(todas.find((c) => c.id === "3")?.ultimoAcesso, null);
  });

  it("ordena de A a Z e de Z a A", () => {
    assert.deepEqual(nomes({}), ["Bruno", "Carla", "Davi", "Érica", "Nicolas"]);
    assert.deepEqual(nomes({ ord: "nome", dir: "desc" }), ["Nicolas", "Érica", "Davi", "Carla", "Bruno"]);
  });

  it("combina empresa e perfil; senha provisória não é conta desligada", () => {
    assert.deepEqual(nomes({ f_empresa: "org-b", f_papel: "CLIENT" }), ["Bruno"]);
    assert.deepEqual(nomes({ f_empresa: "org-b,org-a" }), ["Bruno", "Carla", "Érica"]);
    assert.deepEqual(nomes({ f_senha: "provisoria" }), ["Bruno"]);
    assert.deepEqual(nomes({ f_estado: "desligada" }), ["Carla"]);
    assert.deepEqual(nomes({ f_empresa: "sem" }), ["Nicolas"]);
    // Érica é dona do negócio (role ADMIN): cliente, não equipe.
    assert.deepEqual(nomes({ f_tipo: "equipe" }), ["Nicolas"]);
    assert.deepEqual(nomes({ f_tipo: "cliente" }), ["Bruno", "Carla", "Davi", "Érica"]);
  });

  it("acha quem nunca acessou e separa por período do último acesso", () => {
    assert.deepEqual(nomes({ f_acesso: "nunca" }), ["Bruno", "Carla", "Davi"]);
    assert.deepEqual(nomes({ f_acesso: "7d" }), ["Nicolas"]);
    assert.deepEqual(nomes({ f_acesso: "30d" }), ["Nicolas"]);
    assert.deepEqual(nomes({ f_acesso: "mais30" }), ["Érica"]);
    assert.deepEqual(nomes({ ord: "acesso" }), ["Nicolas", "Érica", "Bruno", "Carla", "Davi"]);
  });

  it("busca por nome sem acento e por CPF só com dígitos", () => {
    assert.deepEqual(nomes({ q: "erica" }), ["Érica"]);
    assert.deepEqual(nomes({}, "123.456.789-09"), ["Érica"]);
    assert.deepEqual(nomes({}, "45678909"), ["Érica"]);
    assert.deepEqual(nomes({}, "999999"), []);
  });

  it("agrupa por empresa com contagem do conjunto filtrado e 'sem empresa' no fim", () => {
    const grupos = agruparContas(consultarContas(todas, lerConsulta({}, def2), "", agora), "empresa");
    assert.deepEqual(grupos.map((g) => [g.rotulo, g.itens.map((c) => c.nome)]), [
      ["Empresa não encontrada", ["Davi"]],
      ["Loja Brasil", ["Bruno", "Érica"]],
      ["Padaria Aurora", ["Carla"]],
      ["Sem empresa vinculada", ["Nicolas"]],
    ]);
    const filtrados = agruparContas(consultarContas(todas, lerConsulta({ f_papel: "CLIENT" }, def2), "", agora), "empresa");
    assert.deepEqual(filtrados.map((g) => g.itens.length), [1, 1, 1]);
    assert.deepEqual(agruparContas(todas, "papel").map((g) => g.rotulo), ["Plataforma", "Dono do negócio", "Equipe do cliente"]);
  });
});

describe("auditoria", () => {
  it("autor e alvo não se confundem", () => {
    assert.deepEqual(autorEAlvo({ tipo: "login_ok", email: "a@x.com", autor: null }), { autor: "a@x.com", alvo: null, proprio: true });
    assert.deepEqual(autorEAlvo({ tipo: "senha_redefinida", email: "a@x.com", autor: "admin@avilaops.com" }), { autor: "admin@avilaops.com", alvo: "a@x.com", proprio: false });
    // Sem autor registrado e sem ser ação da própria conta: o autor fica em branco.
    assert.deepEqual(autorEAlvo({ tipo: "conta_criada", email: "a@x.com", autor: null }), { autor: null, alvo: "a@x.com", proprio: false });
    assert.deepEqual(autorEAlvo({ tipo: "app_alterado", email: null, autor: "admin@avilaops.com" }), { autor: "admin@avilaops.com", alvo: null, proprio: false });
  });

  it("tipo desconhecido aparece com o próprio código, e o resultado vira lista de tipos", () => {
    assert.deepEqual(descreverEvento("evento_novo"), { rotulo: "evento_novo", resultado: "informativo" });
    assert.ok(tiposDoResultado(["falha"]).includes("login_falhou"));
    assert.ok(!tiposDoResultado(["falha"]).includes("login_ok"));
  });
});
