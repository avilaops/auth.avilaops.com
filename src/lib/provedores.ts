/**
 * Catálogo de conectores de login.
 *
 * Todos falam OAuth 2.0 / OpenID Connect; o que muda é endpoint, escopo e o
 * formato do perfil. Cada entrada descreve isso e um `perfil()` que traduz a
 * resposta do provedor para o formato único usado pelo auth. Ligar/desligar e
 * credenciais ficam no banco (`conectores`), não aqui.
 */

export type PerfilExterno = {
  /** id estável no provedor (sub, id numérico…) */
  id: string;
  email: string | null;
  /** o provedor garante que o e-mail é da pessoa */
  emailVerificado: boolean;
  nome: string | null;
  foto: string | null;
};

export type CampoExtra = {
  chave: string;
  rotulo: string;
  dica?: string;
  obrigatorio?: boolean;
  multilinha?: boolean;
  padrao?: string;
};

export type Provedor = {
  id: string;
  nome: string;
  descricao: string;
  /** cor da marca para o botão */
  cor: string;
  authorizeUrl: string | ((extras: Record<string, string>) => string);
  tokenUrl: string | ((extras: Record<string, string>) => string);
  userinfoUrl?: string;
  escopos: string[];
  /** usa PKCE (S256) além do state */
  pkce?: boolean;
  /** o provedor devolve o perfil dentro do id_token (OIDC) */
  perfilNoIdToken?: boolean;
  /** Apple: resposta vem por POST (form_post) e o secret é um JWT assinado */
  formPost?: boolean;
  /** parâmetros extras no authorize */
  parametrosAuthorize?: Record<string, string>;
  /** manda client_id/secret no body (padrão) ou em Basic auth */
  authNoHeader?: boolean;
  /** campos extras exigidos além de client id/secret */
  extras?: CampoExtra[];
  /** onde criar as credenciais */
  docs: string;
  /** o que precisa marcar no console do provedor */
  instrucoes: string;
  /** monta o perfil a partir do userinfo/id_token (+ chamadas extras) */
  perfil: (dados: Record<string, unknown>, accessToken: string) => Promise<PerfilExterno>;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): string | null => (typeof v === "number" ? String(v) : str(v));

export const PROVEDORES: readonly Provedor[] = [
  {
    id: "google",
    nome: "Google",
    descricao: "Conta Google pessoal ou Workspace. O mais comum entre clientes.",
    cor: "#4285F4",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    escopos: ["openid", "email", "profile"],
    pkce: true,
    parametrosAuthorize: { prompt: "select_account" },
    docs: "https://console.cloud.google.com/auth/clients",
    instrucoes:
      "Google Auth Platform → Clients → criar 'Web application'. Origem JavaScript: https://auth.avilaops.com. Redirect URI: a mostrada abaixo. Tela de consentimento publicada (External), escopos openid/email/profile.",
    perfil: async (d) => ({
      id: str(d.sub) ?? "",
      email: str(d.email),
      emailVerificado: d.email_verified === true,
      nome: str(d.name),
      foto: str(d.picture),
    }),
  },
  {
    id: "apple",
    nome: "Apple",
    descricao: "Sign in with Apple. Exigido pela Apple em apps iOS que ofereçam outro login social.",
    cor: "#000000",
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    escopos: ["name", "email"],
    perfilNoIdToken: true,
    formPost: true,
    parametrosAuthorize: { response_mode: "form_post" },
    extras: [
      { chave: "teamId", rotulo: "Team ID", dica: "10 caracteres, no canto superior direito do developer.apple.com", obrigatorio: true },
      { chave: "keyId", rotulo: "Key ID", dica: "Da chave 'Sign in with Apple' criada em Certificates, Identifiers & Profiles → Keys", obrigatorio: true },
      { chave: "privateKey", rotulo: "Chave privada (.p8)", dica: "Conteúdo do arquivo AuthKey_XXXX.p8, incluindo BEGIN/END PRIVATE KEY", obrigatorio: true, multilinha: true },
    ],
    docs: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    instrucoes:
      "Criar um Services ID (é o Client ID), habilitar Sign in with Apple, domínio auth.avilaops.com e a Return URL abaixo. Criar uma Key com Sign in with Apple e baixar o .p8. Não há client secret fixo: o auth gera um JWT a cada login com a chave privada.",
    perfil: async (d) => ({
      id: str(d.sub) ?? "",
      email: str(d.email),
      emailVerificado: d.email_verified === true || d.email_verified === "true",
      nome: str(d.name),
      foto: null,
    }),
  },
  {
    id: "microsoft",
    nome: "Microsoft",
    descricao: "Contas Microsoft 365 / Entra ID e pessoais (Outlook). Perfil B2B.",
    cor: "#5E5E5E",
    authorizeUrl: (x) => `https://login.microsoftonline.com/${x.tenant || "common"}/oauth2/v2.0/authorize`,
    tokenUrl: (x) => `https://login.microsoftonline.com/${x.tenant || "common"}/oauth2/v2.0/token`,
    userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    escopos: ["openid", "email", "profile"],
    pkce: true,
    extras: [{ chave: "tenant", rotulo: "Tenant", dica: "common (qualquer conta), organizations (só empresas), consumers (só pessoais) ou o ID do tenant", padrao: "common" }],
    docs: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    instrucoes:
      "Entra → App registrations → New. Tipos de conta: 'Any Microsoft Entra ID tenant + personal accounts' para aceitar todo mundo. Plataforma Web com a Redirect URI abaixo. Em Certificates & secrets, criar um client secret.",
    perfil: async (d) => ({
      id: str(d.sub) ?? "",
      email: str(d.email),
      // A Microsoft só devolve e-mail de conta cuja posse foi verificada.
      emailVerificado: Boolean(str(d.email)),
      nome: str(d.name),
      foto: null,
    }),
  },
  {
    id: "github",
    nome: "GitHub",
    descricao: "Desenvolvedores. Bom para docs e vagas.",
    cor: "#24292F",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userinfoUrl: "https://api.github.com/user",
    escopos: ["read:user", "user:email"],
    docs: "https://github.com/settings/developers",
    instrucoes: "Settings → Developer settings → OAuth Apps → New. Homepage: https://avilaops.com. Authorization callback URL: a mostrada abaixo.",
    perfil: async (d, token) => {
      // O e-mail principal pode ser privado; a lista de e-mails diz qual é o
      // primário e se está verificado.
      let email = str(d.email);
      let verificado = false;
      try {
        const r = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "auth.avilaops.com" },
        });
        if (r.ok) {
          const lista = (await r.json()) as { email: string; primary: boolean; verified: boolean }[];
          const primario = lista.find((e) => e.primary) ?? lista[0];
          if (primario) {
            email = primario.email;
            verificado = primario.verified;
          }
        }
      } catch {
        /* fica com o e-mail público, não verificado */
      }
      return { id: num(d.id) ?? "", email, emailVerificado: verificado, nome: str(d.name) ?? str(d.login), foto: str(d.avatar_url) };
    },
  },
  {
    id: "linkedin",
    nome: "LinkedIn",
    descricao: "Profissionais e vagas. Usa OpenID Connect.",
    cor: "#0A66C2",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfoUrl: "https://api.linkedin.com/v2/userinfo",
    escopos: ["openid", "profile", "email"],
    docs: "https://www.linkedin.com/developers/apps",
    instrucoes: "Criar app (precisa de uma Company Page). Em Products, adicionar 'Sign In with LinkedIn using OpenID Connect'. Em Auth, colocar a Redirect URL abaixo.",
    perfil: async (d) => ({
      id: str(d.sub) ?? "",
      email: str(d.email),
      emailVerificado: d.email_verified === true,
      nome: str(d.name),
      foto: str(d.picture),
    }),
  },
  {
    id: "govbr",
    nome: "gov.br",
    descricao: "Login oficial do cidadão brasileiro (CPF). Setor público e licitações.",
    cor: "#1351B4",
    authorizeUrl: (x) => `https://sso.${x.ambiente === "staging" ? "staging." : ""}acesso.gov.br/authorize`,
    tokenUrl: (x) => `https://sso.${x.ambiente === "staging" ? "staging." : ""}acesso.gov.br/token`,
    userinfoUrl: "https://sso.acesso.gov.br/userinfo",
    escopos: ["openid", "email", "profile"],
    authNoHeader: false,
    extras: [{ chave: "ambiente", rotulo: "Ambiente", dica: "producao ou staging", padrao: "producao" }],
    docs: "https://acesso.gov.br/roteiro-tecnico/",
    instrucoes:
      "Exige credenciamento formal (Termo de Adesão via SEI/gov.br). Depois, informar a Redirect URI abaixo. Em staging o endpoint é sso.staging.acesso.gov.br.",
    perfil: async (d) => ({
      // O `sub` do gov.br é o CPF.
      id: str(d.sub) ?? "",
      email: str(d.email),
      emailVerificado: d.email_verified === true || d.email_verified === "true",
      nome: str(d.name),
      foto: str(d.picture),
    }),
  },
  {
    id: "facebook",
    nome: "Facebook",
    descricao: "Consumidor final. Sair do modo dev exige revisão do app e verificação de empresa na Meta.",
    cor: "#1877F2",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    userinfoUrl: "https://graph.facebook.com/v21.0/me?fields=id,name,email,picture.type(large)",
    escopos: ["email", "public_profile"],
    // Nada disto entra no login: é a conexão de ativos (`/conta/meta`), que usa
    // o mesmo app da Meta com um pedido de permissões próprio.
    extras: [
      {
        chave: "escoposConexao",
        rotulo: "Permissões da conexão de ativos",
        dica: "Separadas por espaço. Pedir só o que já tem acesso avançado aprovado na Meta; fora isso, só quem tem função no app consegue conceder. Vazio = lista padrão.",
      },
      {
        chave: "configId",
        rotulo: "Configuration ID (Login do Facebook para Empresas)",
        dica: "Opcional. Quando preenchido, a configuração criada no painel da Meta substitui a lista de permissões acima.",
      },
    ],
    docs: "https://developers.facebook.com/apps/",
    instrucoes: "Criar app tipo 'Consumer', adicionar o produto Facebook Login e cadastrar a Redirect URI abaixo em 'Valid OAuth Redirect URIs'. Publicar o app (Live) para aceitar usuários fora da equipe.",
    perfil: async (d) => {
      const pic = d.picture as { data?: { url?: string } } | undefined;
      return {
        id: str(d.id) ?? "",
        email: str(d.email),
        // O Facebook só devolve e-mail confirmado na conta.
        emailVerificado: Boolean(str(d.email)),
        nome: str(d.name),
        foto: pic?.data?.url ?? null,
      };
    },
  },
  {
    id: "discord",
    nome: "Discord",
    descricao: "Comunidades e jogos (IRL Quest).",
    cor: "#5865F2",
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userinfoUrl: "https://discord.com/api/users/@me",
    escopos: ["identify", "email"],
    docs: "https://discord.com/developers/applications",
    instrucoes: "New Application → OAuth2 → adicionar a Redirect abaixo. O Client Secret está na mesma tela.",
    perfil: async (d) => ({
      id: str(d.id) ?? "",
      email: str(d.email),
      emailVerificado: d.verified === true,
      nome: str(d.global_name) ?? str(d.username),
      foto: d.avatar && d.id ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png` : null,
    }),
  },
] as const;

/** Nome para exibição, cobrindo os pseudo-provedores que não estão no catálogo. */
export function nomeProvedor(id: string): string {
  if (id === "mail") return "Senha da caixa de e-mail";
  return buscarProvedor(id)?.nome ?? id;
}

export function buscarProvedor(id: string | null | undefined): Provedor | null {
  if (!id) return null;
  return PROVEDORES.find((p) => p.id === id) ?? null;
}

export function resolverUrl(u: Provedor["authorizeUrl"], extras: Record<string, string>): string {
  return typeof u === "function" ? u(extras) : u;
}
