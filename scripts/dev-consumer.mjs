/** Consumidor OIDC local real. Não é distribuído como rota da aplicação. */
import { createServer } from "node:http";
import { randomBytes, createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import jwt from "jsonwebtoken";
import { validarAmbienteLocal } from "./dev-local-config.mjs";

const env = { ...process.env, ...parseEnv(await readFile(new URL("../.env.development.local", import.meta.url), "utf8")), NODE_ENV: "development" };
validarAmbienteLocal(env);
const { clientSecret } = JSON.parse(await readFile(new URL("../.local/auth/access.json", import.meta.url), "utf8"));
const base = env.SSO_BASE_URL;
const origem = "http://127.0.0.1:3011";
const callback = `${origem}/callback`;
const pendentes = new Map();
const sessoes = new Map();
const aleatorio = () => randomBytes(32).toString("base64url");
const cookie = (req, nome) => (req.headers.cookie || "").split(/;\s*/).find((p) => p.startsWith(`${nome}=`))?.slice(nome.length + 1);
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const redirect = (res, destino, cookies) => { res.writeHead(303, { Location: destino, ...(cookies ? { "Set-Cookie": cookies } : {}) }); res.end(); };
const marcar = (nome, valor, ttl) => `${nome}=${valor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ttl}`;
const post = async (rota, corpo) => fetch(`${base}${rota}`, { method: "POST", headers: {
  Authorization: `Basic ${Buffer.from(`dev-local:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded",
}, body: new URLSearchParams(corpo), signal: AbortSignal.timeout(15_000) });

const servidor = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const url = new URL(req.url, origem);
  // Rejeitar Host diferente impede reutilização do serviço por DNS rebinding.
  if (req.headers.host !== "127.0.0.1:3011") { res.writeHead(400); res.end(); return; }
  try {
    if (url.pathname === "/entrar" && req.method === "GET") {
      const state = aleatorio(), nonce = aleatorio(), verifier = aleatorio();
      const id = aleatorio();
      pendentes.set(id, { state, nonce, verifier, expira: Date.now() + 300_000 });
      const q = new URLSearchParams({ client_id: "dev-local", redirect_uri: callback, response_type: "code", scope: "openid profile email corporate_context",
        state, nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
      redirect(res, `${base}/oauth/authorize?${q}`, marcar("auth_dev_flow", id, 300)); return;
    }
    if (url.pathname === "/callback" && req.method === "GET") {
      res.setHeader("Referrer-Policy", "no-referrer");
      const id = cookie(req, "auth_dev_flow"); const fluxo = pendentes.get(id); pendentes.delete(id);
      if (!fluxo || fluxo.expira < Date.now() || url.searchParams.get("state") !== fluxo.state || !url.searchParams.get("code") || url.searchParams.has("error")) throw new Error("Callback inválido");
      const resposta = await post("/oauth/token", { grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: callback, code_verifier: fluxo.verifier });
      if (!resposta.ok) throw new Error("Troca recusada");
      const tokens = await resposta.json();
      const jwksResposta = await fetch(`${base}/oauth/jwks`, { signal: AbortSignal.timeout(15_000) });
      if (!jwksResposta.ok) throw new Error("JWKS indisponível");
      const jwks = await jwksResposta.json(); const decodificado = jwt.decode(tokens.id_token, { complete: true });
      const jwk = jwks.keys.find((k) => k.kid === decodificado?.header.kid && k.kty === "RSA");
      if (!jwk) throw new Error("Chave desconhecida");
      const descobertaResposta = await fetch(`${base}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) });
      if (!descobertaResposta.ok) throw new Error("Descoberta indisponível");
      const descoberta = await descobertaResposta.json();
      const identidade = jwt.verify(tokens.id_token, createPublicKey({ key: jwk, format: "jwk" }), { algorithms: ["RS256"], audience: "dev-local", issuer: descoberta.issuer });
      if (identidade.nonce !== fluxo.nonce) throw new Error("Nonce inválido");
      const sessaoId = aleatorio(); sessoes.set(sessaoId, { identidade, tokens, expira: Number(identidade.exp) * 1000 });
      redirect(res, "/", [marcar("auth_dev_consumer", sessaoId, 28_800), marcar("auth_dev_flow", "", 0)]); return;
    }
    const sessaoId = cookie(req, "auth_dev_consumer"); const sessao = sessoes.get(sessaoId);
    if (url.pathname === "/encerrar" && req.method === "GET" && sessao) {
      sessao.logoutState = aleatorio();
      redirect(res, `${base}/sair?${new URLSearchParams({ client_id: "dev-local", post_logout_redirect_uri: origem + "/saiu", state: sessao.logoutState })}`); return;
    }
    if (url.pathname === "/saiu" && sessao?.logoutState && url.searchParams.get("state") === sessao.logoutState) {
      sessoes.delete(sessaoId); redirect(res, "/saiu", marcar("auth_dev_consumer", "", 0)); return;
    }
    if (url.pathname === "/sair" && req.method === "POST") {
      if (req.headers.origin !== origem) { res.writeHead(403); res.end(); return; }
      sessoes.delete(sessaoId); redirect(res, "/saiu", marcar("auth_dev_consumer", "", 0)); return;
    }
    if (!["/", "/saiu"].includes(url.pathname) || req.method !== "GET") { res.writeHead(404); res.end(); return; }
    let conteudo;
    if (!sessao || sessao.expira < Date.now()) {
      sessoes.delete(sessaoId);
      conteudo = `<p>Sem sessão neste consumidor. A sessão central pode continuar ativa.</p><a href="/entrar">Entrar com Auth</a>`;
    } else {
      const resposta = await fetch(`${base}/api/corporativo/contextos`, { headers: { Authorization: `Bearer ${sessao.tokens.access_token}` }, signal: AbortSignal.timeout(15_000) });
      if (!resposta.ok) throw new Error("Contexto recusado");
      const { contextos } = await resposta.json();
      conteudo = `<p>Conta: ${escapar(sessao.identidade.email)}</p><h2>Empresas autorizadas</h2>${contextos.length
        ? `<ul>${contextos.map((c) => `<li>${escapar(c.nome)} — ${c.autorizacoesOrganizacao.map((a) => escapar(a.papel)).join(", ")}</li>`).join("")}</ul>`
        : "<p>Nenhuma empresa autorizada para esta identidade.</p>"}
        <form action="/sair" method="post"><button>Sair somente deste consumidor</button></form>
        <p><a href="/encerrar">Encerrar sessão da conta Ávila Ops</a></p>`;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Consumidor DEV</title><style>body{font:16px system-ui;max-width:640px;margin:40px auto;padding:20px}a,button{display:inline-block;padding:12px;min-height:44px}li{margin:12px 0;overflow-wrap:anywhere}</style><h1>Consumidor OIDC local</h1><p>Ambiente DEV com dados sintéticos.</p>${conteudo}</html>`);
  } catch {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<p>Não foi possível concluir o acesso. A sessão ou o fluxo expirou.</p><a href="/entrar">Reiniciar acesso</a>');
  }
});
servidor.listen(3011, "127.0.0.1", () => console.log(`Consumidor OIDC: ${origem}`));
servidor.on("error", () => { console.error("Não foi possível abrir a porta local 3011."); process.exitCode = 1; });
const limpeza = setInterval(() => {
  for (const mapa of [pendentes, sessoes]) for (const [id, valor] of mapa) if (valor.expira < Date.now()) mapa.delete(id);
}, 60_000);
limpeza.unref();
