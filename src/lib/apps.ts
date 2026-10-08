/**
 * Regras dos aplicativos que usam o SSO.
 *
 * A lista em si é dado: mora na tabela `aplicacoes` e se edita em
 * `/admin/apps` (ver `cadastro.ts`). Aqui fica o que não depende do banco — os
 * tipos, a validação do que entra no cadastro e a conferência do destino
 * pós-login — para que continue testável sem subir Postgres.
 *
 * Um app que não está no cadastro simplesmente não consegue iniciar login.
 */

export type Papel = "ADMIN" | "CLIENTE";

export type AppRegistrado = {
  /** Identificador usado no parâmetro `?app=` */
  id: string;
  /** Host exato. É o que valida o returnTo — não é prefixo, é igualdade. */
  host: string;
  nome: string;
  /**
   * Se preenchido, só esse papel entra. `null` = qualquer sessão válida.
   */
  papelExigido: Papel | null;
  /**
   * App fechado: cliente só entra com permissão explícita concedida no painel
   * (`/admin`). ADMIN entra sempre. Sem isto, qualquer conta válida entra.
   */
  restrito?: boolean;
  /**
   * Exige verificação em duas etapas de **qualquer** conta que entre por aqui,
   * cliente inclusive. A equipe já é obrigada por política em
   * `segundoFator.ts`; isto é para o app que trata dado de terceiro e não quer
   * depender só da senha do cliente.
   *
   * Quem chega com sessão aberta sem o fator não é recusado: o `/login` manda
   * elevar a sessão (`/api/auth/mfa/elevar`) e volta ao destino.
   */
  exigeSegundoFator?: boolean;
  /**
   * `hd` mandado ao Google para pré-filtrar o seletor de contas.
   *
   * **Só preencher se o domínio for Google Workspace.** O `hd` faz o Google
   * mostrar apenas contas Workspace daquele domínio; num domínio que não é
   * Workspace — como `avilaops.com` hoje — o seletor não encontra conta
   * nenhuma e o login trava pedindo uma conta que não pode existir.
   *
   * Mesmo quando preenchido é só dica de interface: o usuário pode apagar o
   * parâmetro da URL. O bloqueio real é o `papelExigido` acima, conferido no
   * callback contra o token verificado.
   */
  dicaDominioGoogle?: string;
  /**
   * Deep link de app nativo. Quando presente, a sessão não é entregue por
   * cookie (o navegador do sistema não compartilha cookie com o app) e sim por
   * um código de uso único trocado em `POST /api/auth/exchange`.
   */
  deepLink?: string;
};

/**
 * A lista como era quando ficava fixa aqui (até 06/10/2026).
 *
 * Não é mais a fonte: a migração `cadastro_de_aplicacoes` carregou estas mesmas
 * 13 entradas na tabela. Continua no código por um motivo só — se a imagem nova
 * subir antes de a migração rodar, a tabela não existe e, sem isto, ninguém
 * faria login em nada. `cadastro.ts` recorre a ela apenas nesse caso (tabela
 * ausente), nunca em outro erro de banco.
 */
export const APPS_INICIAIS: readonly AppRegistrado[] = [
  {
    id: "app",
    host: "app.avilaops.com",
    nome: "Avila Ops — Operação",
    papelExigido: "ADMIN",
    // Sem `dicaDominioGoogle`: avilaops.com não é Workspace, e mandar
    // `hd=avilaops.com` deixava o seletor de contas do Google sem nenhuma opção.
  },
  { id: "agricola", host: "agricola.avilaops.com", nome: "Avila Agrícola", papelExigido: null },
  { id: "crm", host: "crm.avilaops.com", nome: "CRM", papelExigido: null },
  { id: "docs", host: "docs.avilaops.com", nome: "Documentação", papelExigido: null },
  /*
    EngOps: demandas Caixa (SIMIL, RAE, SIOPI). Qualquer sessão válida entra
    aqui; quem pode operar é decidido lá dentro, por empresa e papel
    (tabela `membros`). Sem linha lá, a pessoa vê "sem empresa" e para.
  */
  { id: "engops", host: "engops.avilaops.com", nome: "EngOps", papelExigido: null },
  { id: "erp", host: "erp.avilaops.com", nome: "ERP", papelExigido: null },
  {
    id: "irlquest",
    host: "irlquest.avilaops.com",
    nome: "IRL Quest",
    papelExigido: null,
    deepLink: "irlquest://auth/callback",
  },
  { id: "jobs", host: "jobs.avilaops.com", nome: "Jobs", papelExigido: null },
  { id: "mail", host: "mail.avilaops.com", nome: "Webmail", papelExigido: null },
  {
    id: "n8n",
    host: "n8n.avilaops.com",
    nome: "n8n — Automações Ávila Ops",
    papelExigido: "ADMIN",
  },
  /*
    O Comandeiro entra por UM host, o de app, e não pelo hostname de cada
    restaurante: `returnTo` é validado por igualdade de host, e um produto
    multi-tenant tem um hostname por casa. Quem administra entra em
    `app.comandeiro.com.br` e escolhe a casa depois.
  */
  { id: "comandeiro", host: "app.comandeiro.com.br", nome: "Comandeiro", papelExigido: null },
  /* Host antigo do mesmo produto, de quando ele se chamava Minas e morava em
     `.avilaops.com`. Não responde mais; fica até alguém conferir que nenhum
     atalho salvo ainda aponta para cá. */
  { id: "minas", host: "minas.avilaops.com", nome: "Minas", papelExigido: null },
  {
    id: "notas",
    host: "notas.avilaops.com",
    nome: "Notas",
    // Base de conhecimento interna: equipe. Não entra por cookie como os
    // demais — o Outline é software de terceiro e fala OIDC, então chega
    // pelo `/oauth/authorize`. O registro aqui continua valendo: é ele que
    // `podeEntrar` consulta antes de emitir o código.
    papelExigido: "ADMIN",
  },
] as const;

/**
 * Valida o destino pós-login.
 *
 * Sem isto o `?returnTo=` vira open redirect: qualquer um manda a vítima para
 * `auth.avilaops.com/login?returnTo=https://sitemalicioso/` e usa a credibilidade
 * do domínio de login para o phishing. Por isso a checagem é por **igualdade de
 * host** contra o app pedido, não por sufixo — `avilaops.com.evil.io` termina em
 * nada que interesse, mas `endsWith("avilaops.com")` deixaria passar
 * `evil-avilaops.com`.
 */
export function returnToSeguro(returnTo: string | null | undefined, app: AppRegistrado): string {
  const padrao = `https://${app.host}/`;
  if (!returnTo) return padrao;

  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return padrao;
  }

  if (url.protocol !== "https:") return padrao;
  if (url.host !== app.host) return padrao;

  return url.toString();
}

/**
 * Deriva o papel a partir do ID token já verificado.
 *
 * **`avilaops.com` não é um domínio Google Workspace.** O MX aponta para o
 * encaminhamento da Porkbun (`fwd1.porkbun.com`), não para o Google. Isso
 * significa que o claim `hd` — que o Google só preenche para conta Workspace —
 * **nunca** aparece para `@avilaops.com`. A primeira versão desta função olhava
 * só o `hd`, e o efeito era que ninguém jamais virava ADMIN e o
 * `app.avilaops.com` ficava impossível de acessar.
 *
 * O que sobra como sinal confiável é o e-mail do token, e só vale porque quem
 * chama já exigiu `email_verified`: o Google confirma a posse da caixa quando a
 * conta é criada com endereço fora do Gmail. Criar um Google Account
 * `qualquer@avilaops.com` exigiria receber o e-mail de confirmação, que o
 * encaminhamento entrega a quem administra o domínio.
 *
 * O `hd` continua aceito para o dia em que o domínio virar Workspace — aí ele
 * passa a valer sozinho, sem mudar código.
 */
export function papelDoDominio(hd: string | undefined, email: string): Papel {
  if (hd === DOMINIO_ADMIN) return "ADMIN";
  const dominio = email.toLowerCase().trim().split("@")[1];
  return dominio === DOMINIO_ADMIN ? "ADMIN" : "CLIENTE";
}

export const DOMINIO_ADMIN = "avilaops.com";

/** Por que uma conta entra num app. Nulo = não entra. */
export type MotivoAcesso = "equipe" | "aberto" | "liberado";

/**
 * A regra de "quem pode entrar onde", sem banco.
 *
 * `liberado` é se existe permissão explícita para a conta naquele app. É uma
 * função só, usada pelo login (`podeEntrar`) e pela lista de usuários do
 * painel, para a tela nunca mostrar como liberado quem o login recusaria.
 */
export function motivoDoAcesso(app: AppRegistrado, papel: Papel, liberado: boolean): MotivoAcesso | null {
  if (app.papelExigido && app.papelExigido !== papel) return null;
  if (papel === "ADMIN") return "equipe";
  if (!app.restrito) return "aberto";
  return liberado ? "liberado" : null;
}

export const TIPOS = ["app", "site"] as const;
export type Tipo = (typeof TIPOS)[number];

export const PUBLICACOES = ["estatico", "container", "systemd", "externo"] as const;
export type Publicacao = (typeof PUBLICACOES)[number];

export const SITUACOES = ["no_ar", "fora_do_ar", "planejado", "desativado"] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Uma linha do cadastro: o que existe, onde roda e se recebe sessão. */
export type Cadastro = {
  id: string;
  host: string;
  nome: string;
  tipo: Tipo;
  /** Recebe sessão do login único. Site estático nunca. */
  login: boolean;
  /** Só `ADMIN` ou nulo: não existe app "só para cliente". */
  papelExigido: "ADMIN" | null;
  restrito: boolean;
  exigeSegundoFator: boolean;
  dicaDominioGoogle: string | null;
  deepLink: string | null;
  repositorio: string | null;
  servidor: string | null;
  publicacao: Publicacao | null;
  situacao: Situacao;
  observacao: string | null;
};

/**
 * Quem o login enxerga. `desativado` tira o app do login sem apagar a linha —
 * e com ela as permissões já concedidas, que voltam a valer se ele for religado.
 */
export function recebeLogin(c: Cadastro): boolean {
  return c.login && c.tipo === "app" && c.situacao !== "desativado";
}

export function paraApp(c: Cadastro): AppRegistrado {
  return {
    id: c.id,
    host: c.host,
    nome: c.nome,
    papelExigido: c.papelExigido,
    restrito: c.restrito,
    exigeSegundoFator: c.exigeSegundoFator,
    dicaDominioGoogle: c.dicaDominioGoogle ?? undefined,
    deepLink: c.deepLink ?? undefined,
  };
}

/** O que o formulário do painel manda, antes de qualquer conferência. */
export type EntradaCadastro = {
  id: string;
  host: string;
  nome: string;
  tipo: string;
  login: boolean;
  papelExigido: string;
  restrito: boolean;
  exigeSegundoFator: boolean;
  dicaDominioGoogle: string;
  deepLink: string;
  repositorio: string;
  servidor: string;
  publicacao: string;
  situacao: string;
  observacao: string;
};

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,62}$/;
// Rótulos de DNS: letras, dígitos e hífen, sem começar nem terminar em hífen,
// e pelo menos um ponto. Sem porta, sem caminho, sem curinga.
const HOST_VALIDO = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REPOSITORIO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
const ESQUEMA_DEEP_LINK = /^([a-z][a-z0-9+.-]{1,31}):\/\/\S+$/;
// Um deep link é entregue ao navegador como destino. Esquema de web aqui
// transformaria o campo num `returnTo` sem conferência de host.
const ESQUEMAS_RECUSADOS = new Set(["http", "https", "javascript", "data", "file", "vbscript", "blob", "about"]);

function incluiEm<T extends string>(lista: readonly T[], valor: string): valor is T {
  return (lista as readonly string[]).includes(valor);
}

/**
 * Confere o que veio do painel antes de virar linha.
 *
 * É aqui, e não no formulário, porque o `host` é o que `returnToSeguro` usa
 * para decidir para onde uma sessão pode ser mandada: aceitar
 * `https://x.com/` ou `x.com:8443` neste campo seria gravar um destino que a
 * comparação de host nunca reconhece — ou, pior, reconhece errado.
 */
export function validarCadastro(e: EntradaCadastro): { ok: true; dados: Cadastro } | { ok: false; erro: string } {
  const id = e.id.trim().toLowerCase();
  if (!ID_VALIDO.test(id)) return { ok: false, erro: "Identificador: só minúsculas, dígitos e hífen, começando por letra ou dígito." };

  const host = e.host.trim().toLowerCase();
  if (!HOST_VALIDO.test(host)) return { ok: false, erro: "Endereço: só o domínio, sem https://, porta ou caminho (ex.: loja.exemplo.com.br)." };

  const nome = e.nome.trim();
  if (!nome || nome.length > 80) return { ok: false, erro: "Nome é obrigatório (até 80 caracteres)." };

  if (!incluiEm(TIPOS, e.tipo)) return { ok: false, erro: "Tipo desconhecido." };
  if (!incluiEm(SITUACOES, e.situacao)) return { ok: false, erro: "Situação desconhecida." };
  if (e.publicacao && !incluiEm(PUBLICACOES, e.publicacao)) return { ok: false, erro: "Forma de publicação desconhecida." };
  if (e.papelExigido && e.papelExigido !== "ADMIN") return { ok: false, erro: "Papel exigido desconhecido." };

  const login = e.tipo === "app" && e.login;
  if (e.login && e.tipo === "site") return { ok: false, erro: "Site não recebe sessão do login único. Cadastre como aplicação." };

  const repositorio = e.repositorio.trim();
  if (repositorio && !REPOSITORIO_VALIDO.test(repositorio)) return { ok: false, erro: "Repositório no formato dono/nome (ex.: avilaops/lojas.avilaops.com)." };

  const deepLink = e.deepLink.trim();
  if (deepLink) {
    const m = ESQUEMA_DEEP_LINK.exec(deepLink);
    if (!m || ESQUEMAS_RECUSADOS.has(m[1])) return { ok: false, erro: "Deep link precisa de esquema próprio do aplicativo (ex.: meuapp://auth/callback)." };
  }

  const dica = e.dicaDominioGoogle.trim().toLowerCase();
  if (dica && !HOST_VALIDO.test(dica)) return { ok: false, erro: "Domínio do Google Workspace inválido." };

  const servidor = e.servidor.trim();
  const observacao = e.observacao.trim();
  if (servidor.length > 80) return { ok: false, erro: "Servidor: até 80 caracteres." };
  if (observacao.length > 500) return { ok: false, erro: "Observação: até 500 caracteres." };

  return {
    ok: true,
    dados: {
      id,
      host,
      nome,
      tipo: e.tipo,
      login,
      // Sem login não há sessão a restringir: os campos de acesso ficam no
      // valor neutro, para a linha não carregar regra que ninguém aplica.
      papelExigido: login && e.papelExigido === "ADMIN" ? "ADMIN" : null,
      restrito: login ? e.restrito : true,
      exigeSegundoFator: login && e.exigeSegundoFator,
      dicaDominioGoogle: login && dica ? dica : null,
      deepLink: login && deepLink ? deepLink : null,
      repositorio: repositorio || null,
      servidor: servidor || null,
      publicacao: e.publicacao && incluiEm(PUBLICACOES, e.publicacao) ? e.publicacao : null,
      situacao: e.situacao,
      observacao: observacao || null,
    },
  };
}

/**
 * Lê uma linha do banco como `Cadastro`.
 *
 * As colunas são texto livre no Postgres. Um valor que o código não conhece
 * (digitado por SQL, ou de uma versão mais nova) cai sempre para o lado
 * fechado: tipo estranho vira `site`, que não recebe sessão; papel estranho
 * vira `ADMIN`, que só deixa a equipe entrar.
 */
export function lerCadastro(l: {
  id: string;
  host: string;
  nome: string;
  tipo: string;
  login: boolean;
  papelExigido: string | null;
  restrito: boolean;
  exigeSegundoFator: boolean;
  dicaDominioGoogle: string | null;
  deepLink: string | null;
  repositorio: string | null;
  servidor: string | null;
  publicacao: string | null;
  situacao: string;
  observacao: string | null;
}): Cadastro {
  return {
    id: l.id,
    host: l.host,
    nome: l.nome,
    tipo: incluiEm(TIPOS, l.tipo) ? l.tipo : "site",
    login: l.login,
    papelExigido: l.papelExigido === null ? null : "ADMIN",
    restrito: l.restrito,
    exigeSegundoFator: l.exigeSegundoFator,
    dicaDominioGoogle: l.dicaDominioGoogle,
    deepLink: l.deepLink,
    repositorio: l.repositorio,
    servidor: l.servidor,
    publicacao: l.publicacao && incluiEm(PUBLICACOES, l.publicacao) ? l.publicacao : null,
    situacao: incluiEm(SITUACOES, l.situacao) ? l.situacao : "fora_do_ar",
    observacao: l.observacao,
  };
}
