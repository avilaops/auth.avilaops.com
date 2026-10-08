import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPS_INICIAIS,
  DOMINIO_ADMIN,
  lerCadastro,
  motivoDoAcesso,
  papelDoDominio,
  paraApp,
  recebeLogin,
  returnToSeguro,
  validarCadastro,
  type EntradaCadastro,
} from "@/lib/apps";

const app = APPS_INICIAIS.find((a) => a.id === "erp")!;

/**
 * `returnTo` é a porta pela qual um open redirect entraria: quem manda a vítima
 * para `auth.avilaops.com/login?returnTo=https://sitemalicioso/` usa a
 * credibilidade do domínio de login no phishing.
 */
describe("destino pós-login", () => {
  it("aceita o host exato do app", () => {
    assert.equal(returnToSeguro("https://erp.avilaops.com/painel", app), "https://erp.avilaops.com/painel");
  });

  it("descarta host de fora, inclusive os parecidos", () => {
    const enganosos = [
      "https://evil-avilaops.com/",
      "https://avilaops.com.evil.io/",
      "https://erp.avilaops.com.evil.io/",
      "https://outro.avilaops.com/",
      "https://erp.avilaops.com@evil.io/",
    ];
    for (const destino of enganosos) {
      assert.equal(returnToSeguro(destino, app), "https://erp.avilaops.com/", destino);
    }
  });

  it("exige https", () => {
    assert.equal(returnToSeguro("http://erp.avilaops.com/", app), "https://erp.avilaops.com/");
    assert.equal(returnToSeguro("javascript:alert(1)", app), "https://erp.avilaops.com/");
  });

  it("cai no padrão do app quando o destino é vazio ou não é URL", () => {
    for (const destino of [null, undefined, "", "/caminho-interno", "nem url"]) {
      assert.equal(returnToSeguro(destino, app), "https://erp.avilaops.com/");
    }
  });
});

describe("lista de fábrica", () => {
  it("não há id nem host repetido", () => {
    assert.equal(new Set(APPS_INICIAIS.map((a) => a.id)).size, APPS_INICIAIS.length);
    assert.equal(new Set(APPS_INICIAIS.map((a) => a.host)).size, APPS_INICIAIS.length);
  });
});

/** Um cadastro válido, para cada teste trocar só o campo que interessa. */
function entrada(troca: Partial<EntradaCadastro> = {}): EntradaCadastro {
  return {
    id: "loja-exemplo",
    host: "loja.exemplo.com.br",
    nome: "Loja Exemplo",
    tipo: "app",
    login: true,
    papelExigido: "",
    restrito: true,
    exigeSegundoFator: false,
    dicaDominioGoogle: "",
    deepLink: "",
    repositorio: "avilaops/loja.exemplo.com.br",
    servidor: "applications",
    publicacao: "container",
    situacao: "no_ar",
    observacao: "",
    ...troca,
  };
}

function dados(troca: Partial<EntradaCadastro> = {}) {
  const v = validarCadastro(entrada(troca));
  assert.ok(v.ok, v.ok ? "" : v.erro);
  return v.dados;
}

/**
 * O `host` cadastrado é o que `returnToSeguro` compara. Qualquer coisa que não
 * seja um domínio puro neste campo vira um destino de sessão que ninguém
 * revisou.
 */
describe("validação do cadastro", () => {
  it("aceita o cadastro completo e normaliza caixa e espaços", () => {
    const d = dados({ id: " Loja-Exemplo ", host: " Loja.Exemplo.com.br " });
    assert.equal(d.id, "loja-exemplo");
    assert.equal(d.host, "loja.exemplo.com.br");
    assert.equal(d.restrito, true);
  });

  it("recusa endereço que não é só o domínio", () => {
    const ruins = [
      "https://loja.exemplo.com.br",
      "loja.exemplo.com.br/painel",
      "loja.exemplo.com.br:8443",
      "*.exemplo.com.br",
      "loja.exemplo.com.br@evil.io",
      "localhost",
      "-loja.exemplo.com.br",
      "loja..exemplo.com.br",
      "",
    ];
    for (const host of ruins) assert.equal(validarCadastro(entrada({ host })).ok, false, host);
  });

  it("recusa identificador com caractere fora de minúscula, dígito e hífen", () => {
    for (const id of ["", "-loja", "loja exemplo", "loja/exemplo", "loja.exemplo", "../x"]) {
      assert.equal(validarCadastro(entrada({ id })).ok, false, id);
    }
  });

  it("recusa valores de lista que não existem", () => {
    assert.equal(validarCadastro(entrada({ tipo: "api" })).ok, false);
    assert.equal(validarCadastro(entrada({ situacao: "talvez" })).ok, false);
    assert.equal(validarCadastro(entrada({ publicacao: "ftp" })).ok, false);
    assert.equal(validarCadastro(entrada({ papelExigido: "CLIENTE" })).ok, false);
  });

  it("deep link só com esquema próprio do aplicativo", () => {
    assert.equal(dados({ deepLink: "meuapp://auth/callback" }).deepLink, "meuapp://auth/callback");
    for (const deepLink of ["https://evil.io/", "http://x.com/", "javascript://x", "data://x", "file:///etc/passwd", "sem-esquema"]) {
      assert.equal(validarCadastro(entrada({ deepLink })).ok, false, deepLink);
    }
  });

  it("site não recebe sessão", () => {
    assert.equal(validarCadastro(entrada({ tipo: "site", login: true })).ok, false);
    const site = dados({ tipo: "site", login: false, papelExigido: "ADMIN", exigeSegundoFator: true, deepLink: "meuapp://x" });
    assert.equal(site.login, false);
    // Sem login, nenhuma regra de acesso fica gravada na linha.
    assert.equal(site.papelExigido, null);
    assert.equal(site.exigeSegundoFator, false);
    assert.equal(site.deepLink, null);
    assert.equal(recebeLogin(site), false);
  });
});

describe("quem o login enxerga", () => {
  it("aplicação com login entra; desativada some, sem perder a linha", () => {
    assert.equal(recebeLogin(dados()), true);
    assert.equal(recebeLogin(dados({ situacao: "fora_do_ar" })), true);
    assert.equal(recebeLogin(dados({ situacao: "desativado" })), false);
    assert.equal(recebeLogin(dados({ login: false })), false);
  });

  it("o destino pós-login sai do host cadastrado", () => {
    const a = paraApp(dados());
    assert.equal(returnToSeguro("https://loja.exemplo.com.br/pedidos", a), "https://loja.exemplo.com.br/pedidos");
    assert.equal(returnToSeguro("https://evil.io/", a), "https://loja.exemplo.com.br/");
  });
});

/** A mesma regra decide o login e a lista de usuários que o painel mostra. */
describe("motivo do acesso", () => {
  const aberto = paraApp(dados({ restrito: false }));
  const restrito = paraApp(dados({ restrito: true }));
  const soEquipe = paraApp(dados({ papelExigido: "ADMIN", restrito: false }));

  it("equipe entra em tudo, com ou sem liberação", () => {
    for (const a of [aberto, restrito, soEquipe]) {
      assert.equal(motivoDoAcesso(a, "ADMIN", false), "equipe");
      assert.equal(motivoDoAcesso(a, "ADMIN", true), "equipe");
    }
  });

  it("cliente entra em app aberto sem precisar de nada", () => {
    assert.equal(motivoDoAcesso(aberto, "CLIENTE", false), "aberto");
  });

  it("cliente só entra em app restrito se for liberado", () => {
    assert.equal(motivoDoAcesso(restrito, "CLIENTE", false), null);
    assert.equal(motivoDoAcesso(restrito, "CLIENTE", true), "liberado");
  });

  it("app só da equipe recusa cliente mesmo com liberação gravada", () => {
    assert.equal(motivoDoAcesso(soEquipe, "CLIENTE", false), null);
    assert.equal(motivoDoAcesso(soEquipe, "CLIENTE", true), null);
  });
});

/** A coluna é texto livre no Postgres; o que o código não conhece fecha. */
describe("leitura da linha do banco", () => {
  const linha = {
    id: "x", host: "x.exemplo.com", nome: "X", tipo: "app", login: true, papelExigido: null,
    restrito: false, exigeSegundoFator: false, dicaDominioGoogle: null, deepLink: null,
    repositorio: null, servidor: null, publicacao: null, situacao: "no_ar", observacao: null,
  };

  it("valor desconhecido cai para o lado fechado", () => {
    assert.equal(lerCadastro({ ...linha, tipo: "outro" }).tipo, "site");
    assert.equal(recebeLogin(lerCadastro({ ...linha, tipo: "outro" })), false);
    assert.equal(lerCadastro({ ...linha, papelExigido: "QUALQUER" }).papelExigido, "ADMIN");
    assert.equal(lerCadastro({ ...linha, situacao: "?" }).situacao, "fora_do_ar");
    assert.equal(lerCadastro({ ...linha, publicacao: "?" }).publicacao, null);
  });

  it("valor conhecido passa como está", () => {
    const c = lerCadastro({ ...linha, papelExigido: "ADMIN", publicacao: "systemd" });
    assert.equal(c.papelExigido, "ADMIN");
    assert.equal(c.publicacao, "systemd");
    assert.equal(recebeLogin(c), true);
  });
});

describe("papel derivado do e-mail verificado", () => {
  it("e-mail da casa é equipe", () => {
    assert.equal(papelDoDominio(undefined, "nicolas@avilaops.com"), "ADMIN");
    assert.equal(papelDoDominio(DOMINIO_ADMIN, "qualquer@outro.com"), "ADMIN");
  });

  it("qualquer outro domínio é cliente", () => {
    assert.equal(papelDoDominio(undefined, "pessoa@gmail.com"), "CLIENTE");
    // Sufixo parecido não entra: seria promover um estranho a equipe.
    assert.equal(papelDoDominio(undefined, "pessoa@nao-avilaops.com"), "CLIENTE");
    assert.equal(papelDoDominio(undefined, "pessoa@avilaops.com.br"), "CLIENTE");
  });
});
