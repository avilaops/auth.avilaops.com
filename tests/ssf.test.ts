import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { gerarPar, paraJwks } from "@/lib/chaveOidc";
import { validarIntegracao } from "@/lib/clientesOidc";
import { assinarAccessToken, assinarIdTokenCom, documentoDescoberta, escopoConcedido, nomePartido, verificarAccessToken } from "@/lib/oidc";
import { hostInterno, ipInterno } from "@/lib/enderecoDeSaida";
import { MAXIMO_DE_TENTATIVAS, proximaTentativa, recemDesligadas } from "@/lib/ssfFila";
import {
  canalParaOReceptor,
  configuracaoSsf,
  ENTREGA_PUSH,
  EVENTO_CONTA_DESLIGADA,
  EVENTO_CREDENCIAL_MUDOU,
  EVENTO_SESSAO_REVOGADA,
  EVENTO_VERIFICACAO,
  eventosEntregues,
  montarSet,
  sinalDoEvento,
  sujeitoDaConta,
  validarCanal,
} from "@/lib/ssf";

process.env.SSO_JWT_SECRET = "segredo-de-teste";
const pessoa = { sub: "c1", email: "ana@avilaops.com", nome: "Ana Maria Souza", foto: null, papel: "ADMIN" as const };

describe("escopos do OIDC", () => {
  it("o padrão vai sempre, mesmo sem o cliente pedir", () => {
    assert.equal(escopoConcedido(null, { clienteSsf: false, papel: "CLIENTE" }), "openid profile email");
    assert.equal(escopoConcedido("openid", { clienteSsf: false, papel: "CLIENTE" }), "openid profile email");
    assert.equal(escopoConcedido("openid corporate_context", { clienteSsf: false, papel: "CLIENTE" }), "openid profile email corporate_context");
  });

  it("offline_access entra quando pedido", () => {
    assert.equal(escopoConcedido("openid offline_access", { clienteSsf: false, papel: "CLIENTE" }), "openid profile email offline_access");
  });

  it("os escopos do SSF pedem as três condições: pedido, integração marcada e equipe da casa", () => {
    const pedido = "openid profile email offline_access ssf.manage ssf.read";
    assert.equal(escopoConcedido(pedido, { clienteSsf: true, papel: "ADMIN" }), "openid profile email offline_access ssf.manage ssf.read");
    assert.equal(escopoConcedido(pedido, { clienteSsf: false, papel: "ADMIN" }), "openid profile email offline_access");
    assert.equal(escopoConcedido(pedido, { clienteSsf: true, papel: "CLIENTE" }), "openid profile email offline_access");
    assert.equal(escopoConcedido("openid", { clienteSsf: true, papel: "ADMIN" }), "openid profile email");
  });

  it("escopo desconhecido é ignorado, não concedido", () => {
    assert.equal(escopoConcedido("openid admin ssf.tudo", { clienteSsf: true, papel: "ADMIN" }), "openid profile email");
  });

  it("o access token carrega o escopo, e token antigo vale o padrão", () => {
    assert.deepEqual(verificarAccessToken(assinarAccessToken(pessoa, "apple", "openid profile email ssf.manage"))?.escopos, ["openid", "profile", "email", "ssf.manage"]);
    assert.deepEqual(verificarAccessToken(jwt.sign({ sub: "c1", email: "a@b.c" }, "segredo-de-teste", { issuer: "https://auth.avilaops.com", audience: "x" }))?.escopos, ["openid", "profile", "email"]);
  });

  it("id_token assinado com o segredo da sessão não passa por access token", () => {
    assert.equal(verificarAccessToken(assinarIdTokenCom(null, pessoa, "apple", null)), null);
    assert.equal(verificarAccessToken(jwt.sign({ sub: "c1", email: "a@b.c", token_use: "outro" }, "segredo-de-teste", { issuer: "https://auth.avilaops.com", audience: "x" })), null);
  });

  it("nome partido em primeiro nome e o resto", () => {
    assert.deepEqual(nomePartido("Ana Maria Souza"), { given_name: "Ana", family_name: "Maria Souza" });
    assert.deepEqual(nomePartido("  Ana "), { given_name: "Ana" });
  });

  it("a descoberta anuncia os escopos e as claims novas", () => {
    const d = documentoDescoberta(true);
    for (const e of ["offline_access", "ssf.manage", "ssf.read"]) assert.ok(d.scopes_supported.includes(e), e);
    for (const c of ["given_name", "family_name"]) assert.ok(d.claims_supported.includes(c), c);
    assert.equal(d.corporate_context_endpoint, "https://auth.avilaops.com/api/corporativo/contextos");
    assert.ok(d.scopes_supported.includes("corporate_context"));
  });

  it("integração só de API não pode receber sinais", () => {
    const base = { id: "apple", appId: "apple", nome: "Apple", ativo: true };
    assert.equal(validarIntegracao({ ...base, redirectUris: "", acessoMeta: true, ssf: true }, { exigeRetorno: false }).ok, false);
    const ok = validarIntegracao({ ...base, redirectUris: "https://gsa-ws.apple.com/grandslam/GsService2/acs", acessoMeta: false, ssf: true }, { exigeRetorno: true });
    assert.ok(ok.ok);
    assert.equal(ok.dados.ssf, true);
  });
});

describe("transmissor de sinais (SSF)", () => {
  const par = gerarPar();
  const chave = { kid: par.kid, privadaPem: par.privadaPem };
  const publica = createPublicKey({ key: paraJwks(par.kid, par.publicaJwk), format: "jwk" });

  it("a descoberta do SSF aponta emissor, chaves e os endereços da API", () => {
    const c = configuracaoSsf();
    assert.equal(c.issuer, "https://auth.avilaops.com");
    assert.deepEqual(c.delivery_methods_supported, [ENTREGA_PUSH]);
    assert.match(c.jwks_uri, /\/oauth\/jwks$/);
    assert.match(c.configuration_endpoint, /\/ssf\/stream$/);
    assert.match(c.status_endpoint, /\/ssf\/status$/);
    assert.match(c.verification_endpoint, /\/ssf\/verify$/);
    assert.equal(c.default_subjects, "ALL");
  });

  it("canal: só push, só https, e o cabeçalho de autorização é guardado à parte", () => {
    const v = validarCanal({ delivery: { method: ENTREGA_PUSH, endpoint_url: "https://receptor.exemplo.com/eventos", authorization_header: "Bearer abc" }, events_requested: [EVENTO_SESSAO_REVOGADA, "urn:outro"], description: "Apple" });
    assert.ok(v.ok);
    assert.deepEqual(v.dados, { endpointUrl: "https://receptor.exemplo.com/eventos", autorizacao: "Bearer abc", eventosPedidos: [EVENTO_SESSAO_REVOGADA, "urn:outro"], descricao: "Apple" });
    for (const ruim of [
      null,
      {},
      { delivery: { method: "urn:ietf:rfc:8936", endpoint_url: "https://x.exemplo.com/" } },
      { delivery: { method: ENTREGA_PUSH, endpoint_url: "http://x.exemplo.com/" } },
      { delivery: { method: ENTREGA_PUSH, endpoint_url: "nao-e-url" } },
      { delivery: { method: ENTREGA_PUSH, endpoint_url: "https://x.exemplo.com/", authorization_header: "a\r\nX-Injetado: 1" } },
      { delivery: { method: ENTREGA_PUSH, endpoint_url: "https://x.exemplo.com/" }, events_requested: "tudo" },
    ]) assert.equal(validarCanal(ruim).ok, false, JSON.stringify(ruim));
  });

  it("entrega só o que sabe emitir, e o canal volta para o receptor sem o cabeçalho de autorização", () => {
    assert.deepEqual(eventosEntregues([EVENTO_CREDENCIAL_MUDOU, "urn:outro"]), [EVENTO_CREDENCIAL_MUDOU]);
    const visto = canalParaOReceptor({ id: "s1", clienteId: "apple", endpointUrl: "https://r.exemplo.com/e", autorizacaoEnc: "v1:x:y:z", eventosPedidos: JSON.stringify([EVENTO_SESSAO_REVOGADA, "urn:outro"]), descricao: null, status: "enabled", motivo: null });
    assert.deepEqual(visto, {
      stream_id: "s1",
      iss: "https://auth.avilaops.com",
      aud: "apple",
      delivery: { method: ENTREGA_PUSH, endpoint_url: "https://r.exemplo.com/e" },
      events_supported: [EVENTO_SESSAO_REVOGADA, EVENTO_CREDENCIAL_MUDOU, EVENTO_CONTA_DESLIGADA],
      events_requested: [EVENTO_SESSAO_REVOGADA, "urn:outro"],
      events_delivered: [EVENTO_SESSAO_REVOGADA],
    });
    assert.equal(JSON.stringify(visto).includes("v1:x"), false);
  });

  it("o SET é secevent+jwt em RS256, conferível pelo JWKS, sem sub nem exp", () => {
    const set = montarSet(chave, { aud: "apple", subId: sujeitoDaConta("Ana@AvilaOps.com"), tipo: EVENTO_SESSAO_REVOGADA, conteudo: { event_timestamp: 1 } });
    const cab = jwt.decode(set, { complete: true })?.header;
    assert.equal(cab?.typ, "secevent+jwt");
    assert.equal(cab?.alg, "RS256");
    assert.equal(cab?.kid, par.kid);
    const p = jwt.verify(set, publica, { algorithms: ["RS256"], issuer: "https://auth.avilaops.com", audience: "apple" }) as jwt.JwtPayload;
    assert.deepEqual(p.sub_id, { format: "complex", user: { format: "email", email: "ana@avilaops.com" } });
    assert.deepEqual(p.events, { [EVENTO_SESSAO_REVOGADA]: { event_timestamp: 1 } });
    assert.ok(p.jti && p.iat);
    assert.equal("sub" in p, false);
    assert.equal("exp" in p, false);
  });

  it("a verificação tem o canal como sujeito e devolve o state", () => {
    const p = jwt.decode(montarSet(chave, { aud: "apple", subId: { format: "opaque", id: "s1" }, tipo: EVENTO_VERIFICACAO, conteudo: { state: "abc" } })) as jwt.JwtPayload;
    assert.deepEqual(p.sub_id, { format: "opaque", id: "s1" });
    assert.deepEqual(p.events, { [EVENTO_VERIFICACAO]: { state: "abc" } });
  });

  it("sair e remover conta revogam a sessão; senha e segundo fator mudam a credencial", () => {
    const agora = 1_700_000_000_000;
    assert.deepEqual(sinalDoEvento("logout", agora), { tipo: EVENTO_SESSAO_REVOGADA, conteudo: { event_timestamp: 1_700_000_000 } });
    assert.equal(sinalDoEvento("conta_removida", agora)?.tipo, EVENTO_SESSAO_REVOGADA);
    for (const t of ["senha_trocada", "senha_redefinida", "recuperacao_usada"]) {
      assert.deepEqual(sinalDoEvento(t, agora)?.conteudo, { credential_type: "password", change_type: "update", event_timestamp: 1_700_000_000 }, t);
    }
    assert.deepEqual(sinalDoEvento("mfa_ativado", agora)?.conteudo, { credential_type: "app", change_type: "create", event_timestamp: 1_700_000_000 });
    assert.equal(sinalDoEvento("mfa_resetado", agora)?.conteudo.change_type, "delete");
  });

  it("login, falha de login e o resto da auditoria não viram sinal", () => {
    for (const t of ["login_ok", "login_falhou", "conta_criada", "conta_editada", "permissao_concedida", "ssf_canal_criado"]) assert.equal(sinalDoEvento(t), null, t);
  });

  it("conta desligada vira o sinal próprio do RISC", () => {
    assert.deepEqual(sinalDoEvento("conta_desligada", 1_700_000_000_000), { tipo: EVENTO_CONTA_DESLIGADA, conteudo: { event_timestamp: 1_700_000_000 } });
    assert.deepEqual(eventosEntregues([EVENTO_CONTA_DESLIGADA]), [EVENTO_CONTA_DESLIGADA]);
  });

  it("reenvio: a espera dobra a cada tentativa", () => {
    const nasceu = new Date(1_700_000_000_000);
    const agora = nasceu.getTime();
    const minutos = (t: number) => ((proximaTentativa(t, nasceu, agora) as Date).getTime() - agora) / 60000;
    assert.deepEqual([1, 2, 3, 4].map(minutos), [5, 10, 20, 40]);
  });

  it("reenvio: desiste depois do máximo de tentativas ou quando o evento passaria de um dia", () => {
    const nasceu = new Date(1_700_000_000_000);
    assert.equal(proximaTentativa(MAXIMO_DE_TENTATIVAS, nasceu, nasceu.getTime()), null);
    const quaseUmDia = nasceu.getTime() + 23.9 * 60 * 60 * 1000;
    assert.equal(proximaTentativa(2, nasceu, quaseUmDia), null);
    assert.ok(proximaTentativa(2, nasceu, nasceu.getTime() + 60 * 60 * 1000));
  });

  it("o endereço de entrega não pode apontar para a rede interna nem levar usuário e senha", () => {
    const com = (endpoint_url: string) => validarCanal({ delivery: { method: ENTREGA_PUSH, endpoint_url } }).ok;
    for (const interno of ["https://localhost/e", "https://127.0.0.1/e", "https://10.1.2.3:8443/e", "https://172.31.0.10/e", "https://192.168.0.1/e", "https://169.254.169.254/e", "https://[::1]/e", "https://[fd00::1]/e", "https://banco.internal/e", "https://u:s@receptor.exemplo/e"]) {
      assert.equal(com(interno), false, interno);
    }
    assert.equal(com("https://receptor.exemplo/e"), true);
    assert.equal(com("https://8.8.8.8/e"), true);
    assert.equal(ipInterno("::ffff:10.0.0.1"), true);
    assert.equal(ipInterno("172.32.0.1"), false);
    assert.equal(hostInterno("LOCALHOST."), true);
  });

  it("conta desligada: avisa só a que não estava desligada na passada anterior", () => {
    const agora = [{ id: "1" }, { id: "2" }, { id: "3" }];
    assert.deepEqual(recemDesligadas(agora, ["1", "3"]), [{ id: "2" }]);
    assert.deepEqual(recemDesligadas(agora, ["1", "2", "3", "9"]), []);
    // Religada e desligada de novo: saiu da lista no meio, então volta a avisar.
    assert.deepEqual(recemDesligadas([{ id: "1" }], []), [{ id: "1" }]);
  });
});
