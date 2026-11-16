/** Fluxo real no DEV isolado • PostgreSQL, Next, navegador e e-mail local. */
const { chromium } = require(process.env.AUTH_DEV_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, '.local/auth');
const results = [];
const ok = text => { results.push(text); console.log('OK • ' + text); };
async function main() {
  const env = { ...parseEnv(await fs.readFile(path.join(root, '.env.development.local'), 'utf8')), NODE_ENV: 'development' };
  const { validarAmbienteLocal } = await import(pathToFileURL(path.join(__dirname, 'dev-local-config.mjs')).href);
  validarAmbienteLocal(env);
  const base = env.SSO_BASE_URL;
  const portal = new Client({ connectionString: env.PORTAL_DATABASE_URL });
  const auth = new Client({ connectionString: env.DATABASE_URL });
  await portal.connect(); await auth.connect();
  const id = randomUUID(), email = `recovery.${Date.now()}@example.test`;
  const oldPassword = randomBytes(24).toString('hex'), newPassword = randomBytes(24).toString('hex');
  const passwordHash = await require('bcryptjs').hash(oldPassword, 10);
  await portal.query(`INSERT INTO portal_clients(id,nome,email,senha_hash,senha_provisoria,role)
    VALUES($1,$2,$3,$4,false,'CLIENT')`, [id,'Pessoa Recuperação DEV',email,passwordHash]);
  const browser = await chromium.launch({ headless: true });
  const contexts = [], errors = [];
  const context = async () => {
    const ctx = await browser.newContext({ viewport: {width:390,height:844}, extraHTTPHeaders:{'X-Forwarded-For':'192.0.2.56'} });
    contexts.push(ctx); ctx.setDefaultTimeout(20000); ctx.setDefaultNavigationTimeout(45000);
    ctx.on('page', p => p.on('pageerror', e => errors.push(e.name)));
    return ctx;
  };
  async function emails() {
    const names = await fs.readdir(path.join(folder,'emails'));
    const messages = await Promise.all(names.map(async name => JSON.parse(await fs.readFile(path.join(folder,'emails',name),'utf8'))));
    return messages.filter(m=>m.email.para===email).sort((a,b)=>a.criadoEm.localeCompare(b.criadoEm));
  }
  async function waitEmails(expected) {
    for(let i=0;i<100;i++) { const found=await emails(); if(found.length>=expected)return found; await new Promise(r=>setTimeout(r,100)); }
    throw Error('Mensagem não capturada no DEV');
  }
  function link(message) { return message.email.texto.match(/http:\/\/127\.0\.0\.1:3010\/recuperar\/[a-f0-9]+/)[0]; }
  async function pedir(page) {
    await page.goto(base+'/recuperar'); await page.getByLabel('E-mail da sua conta').fill(email);
    await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
    await page.getByText('Confira seu e-mail',{exact:true}).waitFor();
    return page.getByRole('status').innerText();
  }
  try {
    const requestContext=await context(), page=await requestContext.newPage();
    await page.goto(base+'/login'); await page.getByRole('link',{name:'Esqueci minha senha'}).click();
    await page.getByRole('heading',{name:'Recuperar senha',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(folder,'recuperacao-mobile.png'),fullPage:true});
    const publicResponse=await pedir(page);
    const first=link((await waitEmails(1))[0]);
    await pedir(page); const second=link((await waitEmails(2))[1]);
    assert.notEqual(first,second); ok('Pedido público e dois links reais entregues no e-mail DEV');

    const resetContext=await context(), reset=await resetContext.newPage();
    await reset.goto(first);
    assert.equal(await reset.locator('meta[name="referrer"]').getAttribute('content'),'no-referrer');
    await reset.getByLabel('Nova senha (mín. 8)',{exact:true}).fill(newPassword);
    await reset.getByLabel('Confirmar',{exact:true}).fill('nao-confere');
    await reset.getByRole('button',{name:'Salvar senha'}).click();
    await reset.getByRole('alert').filter({hasText:'As senhas não conferem.'}).waitFor();
    await reset.getByLabel('Confirmar',{exact:true}).fill(newPassword);
    await reset.getByRole('button',{name:'Salvar senha'}).click();
    await reset.waitForURL(base+'/conta');
    assert.ok((await resetContext.cookies(base)).some(c=>c.name==='avila_sso'));
    ok('Link aberto em outro navegador, confirmação de senha e sessão reais');

    const replayContext=await context(), replay=await replayContext.newPage();
    for(const url of [first,second]) {
      await replay.goto(url); await replay.getByText('Este link não é mais válido.',{exact:true}).waitFor();
      await replay.getByRole('link',{name:'Pedir novo link de recuperação'}).waitFor();
    }
    ok('Uso único e invalidação dos outros links após a redefinição');

    const loginContext=await context(), login=await loginContext.newPage();
    await login.goto(base+'/login'); await login.getByLabel('E-mail ou CPF').fill(email);
    await login.getByLabel('Senha',{exact:true}).fill(oldPassword);
    await login.getByRole('button',{name:'Entrar',exact:true}).click(); await login.getByRole('alert').waitFor();
    assert.equal(new URL(login.url()).pathname,'/login');
    await login.getByLabel('Senha',{exact:true}).fill(newPassword);
    await login.getByRole('button',{name:'Entrar',exact:true}).click(); await login.waitForURL(base+'/conta');
    ok('Senha anterior recusada e nova senha aceita em login independente');

    await pedir(page); const third=link((await waitEmails(3))[2]);
    const hash=createHash('sha256').update(third.split('/').at(-1)).digest('hex');
    await auth.query("UPDATE tokens_recuperacao SET expira_em=now()-interval '1 second' WHERE token_hash=$1 AND email=$2",[hash,email]);
    await replay.goto(third); await replay.getByText('Este link não é mais válido.',{exact:true}).waitFor();
    ok('Expiração real no PostgreSQL e ação para pedir novo link');

    assert.equal(await pedir(page),publicResponse);
    await new Promise(r=>setTimeout(r,700)); assert.equal((await emails()).length,3);
    await page.goto(base+'/recuperar'); await page.getByLabel('E-mail da sua conta').fill(`unknown.${Date.now()}@example.test`);
    await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
    await page.getByText('Confira seu e-mail',{exact:true}).waitFor();
    assert.equal(await page.getByRole('status').innerText(),publicResponse);
    assert.deepEqual(errors,[]); ok('Limite real por endereço, resposta uniforme e zero erros de JavaScript');
    await fs.writeFile(path.join(folder,'recuperacao-browser-resultados.json'),JSON.stringify({results,errors},null,2));
  } finally {
    for(const ctx of contexts) await ctx.close(); await browser.close();
    await auth.query('DELETE FROM tokens_recuperacao WHERE email=$1',[email]);
    await portal.query('DELETE FROM portal_clients WHERE id=$1 AND email=$2',[id,email]);
    await auth.end(); await portal.end();
  }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
