import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

type Token = { tokenHash: string; email: string; appId: string | null; destino: string | null; expiraEm: Date; usadoEm?: Date };
const f = {
  existe: true, ativa: true, emailAtivo: true, falhaEmail: false, permite: true,
  limiteIp: true, limiteEmail: true,
  emails: [] as { para: string; assunto: string; texto: string; html: string }[],
  limites: [] as string[], tokens: new Map<string, Token>(),
  tarefas: [] as (() => Promise<void>)[],
  conta: { id: "conta-recovery", email: "pessoa@example.test", nome: "Pessoa", role: "CLIENT" },
  app: { id: "mail", host: "mail.avilaops.com", nome: "Mail", tipo: "app", login: true, papelExigido: null, restrito: false, exigeSegundoFator: false },
};
Object.assign(globalThis, { __recuperacaoPropria: f });
const data = (code: string) => "data:text/javascript," + encodeURIComponent(code);
const substitutes = {
  "@/lib/prisma": `const f=globalThis.__recuperacaoPropria; export const prisma={tokenRecuperacao:{
    create:async({data})=>{f.tokens.set(data.tokenHash,data);return data},
    findUnique:async({where})=>f.tokens.get(where.tokenHash)??null,
    updateMany:async({where,data})=>{let count=0;for(const t of f.tokens.values()){
      if((where.tokenHash&&t.tokenHash!==where.tokenHash)||(where.email&&t.email!==where.email)||t.usadoEm||
         (where.expiraEm&&t.expiraEm<=where.expiraEm.gt))continue;t.usadoEm=data.usadoEm;count++}return {count}}
  },clienteOidc:{findUnique:async()=>null}};`,
  "@/lib/contas": "const f=globalThis.__recuperacaoPropria;export const buscarContaPorEmail=async()=>f.existe?{...f.conta,ativa:f.ativa}:null;",
  "@/lib/cadastro": "const f=globalThis.__recuperacaoPropria;export const buscarApp=async(id)=>id==='mail'?f.app:null;export const politicaDaAplicacao=async()=>({permiteRecuperacao:f.permite});",
  "@/lib/email": "const f=globalThis.__recuperacaoPropria;export const emailConfigurado=()=>f.emailAtivo;export const enviarEmail=async(msg)=>{if(f.falhaEmail)throw new Error('SMTP indisponível');f.emails.push(msg);return {messageId:'dev'}};",
  "@/lib/rateLimit": "const f=globalThis.__recuperacaoPropria;export const limitar=async(key)=>{f.limites.push(key);return key.startsWith('recuperacao-email:')?f.limiteEmail:f.limiteIp};",
  "@/lib/eventos": "export const registrar=async()=>{};",
  "next/server": `export {NextRequest,NextResponse} from ${JSON.stringify(new URL("../node_modules/next/server.js", import.meta.url).href)};export const after=task=>globalThis.__recuperacaoPropria.tarefas.push(task);`,
};
register(data(`const overrides=${JSON.stringify(Object.fromEntries(Object.entries(substitutes).map(([key,value])=>[key,data(value)])))};
  export function resolve(specifier,context,next){if(overrides[specifier])return {url:overrides[specifier],shortCircuit:true};return next(specifier,context);}`), import.meta.url);
process.env.SSO_BASE_URL = "https://auth.avilaops.com";
process.env.SSO_JWT_SECRET = randomBytes(32).toString("hex");
const { NextRequest } = await import("next/server.js");
const { POST: solicitar } = await import("@/app/api/auth/recuperar/solicitar/route");
async function POST(req: InstanceType<typeof NextRequest>) {
  const response = await solicitar(req);
  while(f.tarefas.length) await f.tarefas.shift()!();
  return response;
}
const { validarTokenRecuperacao, consumirTokenRecuperacao, invalidarLinksRecuperacao } = await import("@/lib/recuperacao");
const request = (body: unknown, origin = "https://auth.avilaops.com") => new NextRequest("https://auth.avilaops.com/api/auth/recuperar/solicitar", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Forwarded-For": "192.0.2.5" }, body: JSON.stringify(body),
});
const tokenEnviado = () => new URL(f.emails.at(-1)!.texto.match(/https:\/\/auth\.avilaops\.com\/recuperar\/\w+/)![0]).pathname.split("/").at(-1)!;
beforeEach(() => {
  f.existe=true; f.ativa=true; f.emailAtivo=true; f.falhaEmail=false; f.permite=true;
  f.limiteIp=true; f.limiteEmail=true; f.emails=[]; f.limites=[]; f.tokens.clear();f.tarefas=[];
});

describe("recuperação pedida pela própria pessoa", () => {
  it("responde antes da consulta de identidade e do envio de e-mail", async () => {
    const response=await solicitar(request({email:f.conta.email}));
    assert.equal(response.status,200);assert.equal(f.tokens.size,0);assert.equal(f.emails.length,0);
    assert.equal(f.tarefas.length,1);await f.tarefas.shift()!();assert.equal(f.emails.length,1);
  });
  it("envia link de uma hora, guarda só hash e não devolve segredo", async () => {
    const res=await POST(request({email:" Pessoa@Example.Test "}));
    assert.equal(res.status,200); assert.equal(res.headers.get("cache-control"),"no-store");
    assert.equal(f.emails.length,1); assert.equal(f.emails[0].para,"pessoa@example.test");
    const token=tokenEnviado(); assert.match(token,/^[a-f0-9]{64}$/);
    const row=[...f.tokens.values()][0];
    assert.equal(row.tokenHash,createHash("sha256").update(token).digest("hex"));
    assert.ok(row.expiraEm.getTime()>Date.now()+59*60*1000);
    assert.ok(row.expiraEm.getTime()<=Date.now()+60*60*1000);
    assert.match(f.emails[0].texto,/1 hora/); assert.match(f.emails[0].html,/Redefinir/);
    assert.doesNotMatch(JSON.stringify(await res.json()),new RegExp(token+"|pessoa@example"));
    assert.ok(f.limites.some(key=>key.includes(createHash("sha256").update(f.conta.email).digest("hex"))));
    assert.ok(f.limites.every(key=>!key.includes(f.conta.email)));
  });
  it("não revela se a conta existe, está inativa ou atingiu o limite do endereço", async () => {
    const normal=await (await POST(request({email:f.conta.email}))).json();
    for (const state of ["unknown","inactive","limited"]){
      f.emails=[]; f.tokens.clear(); f.existe=state!=="unknown"; f.ativa=state!=="inactive";f.limiteEmail=state!=="limited";
      const res=await POST(request({email:f.conta.email}));
      assert.equal(res.status,200,state);assert.deepEqual(await res.json(),normal,state);
      assert.equal(f.emails.length,0,state);assert.equal(f.tokens.size,0,state);
    }
  });
  it("não concede acesso nem envia quando a política do produto proíbe recuperação", async () => {
    f.permite=false;
    assert.equal((await POST(request({email:f.conta.email,app:"mail"}))).status,200);
    assert.equal(f.emails.length,0);assert.equal(f.tokens.size,0);
  });
  it("preserva somente o retorno registrado do produto", async () => {
    await POST(request({email:f.conta.email,app:"mail",returnTo:"https://evil.test/"}));
    assert.deepEqual(await validarTokenRecuperacao(tokenEnviado()),{email:f.conta.email,appId:"mail",destino:"https://mail.avilaops.com/"});
  });
  it("mantém resposta pública uniforme quando o transporte falha", async () => {
    f.existe=false;const unknown=await (await POST(request({email:f.conta.email}))).json();
    f.existe=true;f.falhaEmail=true;
    const res=await POST(request({email:f.conta.email}));
    assert.equal(res.status,200);assert.deepEqual(await res.json(),unknown);
  });
  it("recusa origem externa, e-mail inválido, corpo nulo e excesso por IP", async () => {
    assert.equal((await POST(request({email:f.conta.email},"https://evil.test"))).status,403);
    for(const body of [null,{email:"sem-email"},{email:42}])assert.equal((await POST(request(body))).status,400);
    f.limiteIp=false;assert.equal((await POST(request({email:f.conta.email}))).status,429);
    assert.equal(f.tokens.size,0);
  });
  it("informa indisponibilidade global sem revelar contas", async () => {
    f.emailAtivo=false;assert.equal((await POST(request({email:f.conta.email}))).status,503);
    assert.equal(f.tokens.size,0);
  });
  it("consome uma vez e invalida os outros links da mesma pessoa", async () => {
    await POST(request({email:f.conta.email}));const first=tokenEnviado();
    await POST(request({email:f.conta.email}));const second=tokenEnviado();
    assert.ok(await consumirTokenRecuperacao(first));assert.equal(await consumirTokenRecuperacao(first),null);
    await invalidarLinksRecuperacao(f.conta.email);
    assert.equal(await validarTokenRecuperacao(second),null);
  });
});
