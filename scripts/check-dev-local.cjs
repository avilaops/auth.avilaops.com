const { chromium } = require(process.env.AUTH_DEV_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const auth = 'http://127.0.0.1:3010', app = 'http://127.0.0.1:3011';
const dir = path.resolve('.local/auth');
const resultados = [];
const registrar = (cenario, extra = {}) => { resultados.push({ cenario, resultado: 'aprovado', ...extra }); console.log('OK:', cenario); };
const mensagem = async (email) => {
  const arquivos = await fs.readdir(path.join(dir, 'emails'));
  const mensagens = await Promise.all(arquivos.map(async n => JSON.parse(await fs.readFile(path.join(dir, 'emails', n), 'utf8'))));
  const m = mensagens.filter(m => m.email.para === email).sort((a,b)=> b.criadoEm.localeCompare(a.criadoEm))[0];
  assert.ok(m, 'mensagem local recebida');
  const link = m.email.texto.match(/http:\/\/127\.0\.0\.1:3010\/[^\s]+/)[0];
  return link;
};

(async()=>{
  const { senha } = JSON.parse(await fs.readFile(path.join(dir, 'access.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const erros = [];
  const contexto = async () => { const c = await browser.newContext({ viewport: {width:1440,height:1000} }); c.setDefaultTimeout(20000); c.setDefaultNavigationTimeout(45000); c.on('page', p => p.on('pageerror', e => erros.push(e.name))); return c; };
  try {
    const ctx = await contexto(), p = await ctx.newPage();
    await p.goto(app+'/entrar');
    console.log('Etapa: formulário de login');
    await p.getByLabel('E-mail ou CPF').fill('dev@example.test');
    await p.getByLabel('Senha', {exact:true}).fill(senha);
    await p.getByRole('button', { name:'Entrar', exact:true }).click();
    console.log('Etapa: credencial enviada');
    await p.waitForURL(app+'/', {timeout:30000});
    await p.getByText('Empresa Alfa DEV', {exact:false}).waitFor();
    await p.getByText('Empresa Beta DEV', {exact:false}).waitFor();
    registrar('Login OIDC real com state, nonce, PKCE, assinatura RS256 e duas empresas');
    await p.goto(auth+'/conta');
    await p.getByRole('heading', {name:'Sua identidade e suas empresas'}).waitFor();
    for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:812}]) {
      await p.setViewportSize(viewport);
      for(const tema of ['light','dark']) {
        await p.emulateMedia({colorScheme:tema});
        await p.getByLabel('Tema de aparência').selectOption('system');
        const overflow = await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        assert.equal(overflow,false,'sem rolagem horizontal');
        await p.screenshot({path:path.join(dir,`conta-${viewport.width}-${tema}.png`),fullPage:true});
        registrar('Conta responsiva', {largura:viewport.width,tema});
      }
    }
    await p.setViewportSize({width:1440,height:1000});
    const target = await p.getByRole('link', {name:'Abrir Consumidor DEV'}).getAttribute('href');
    assert.equal(target, app+'/');
    await p.goto(app+'/');
    await p.getByRole('button',{name:'Sair somente deste consumidor'}).click();
    await p.getByText('Sem sessão neste consumidor.',{exact:false}).waitFor();
    assert.ok((await ctx.cookies(auth)).some(c=>c.name==='avila_sso'));
    await p.getByRole('link',{name:'Entrar com Auth'}).click();
    await p.waitForURL(app+'/');
    await p.getByText('Conta: dev@example.test').waitFor();
    registrar('Saída local preserva SSO e permite reentrada OIDC sem nova credencial');
    await p.getByRole('link',{name:'Encerrar sessão da conta Ávila Ops'}).click();
    await p.getByRole('button',{name:'Encerrar sessão da conta',exact:true}).waitFor();
    await p.screenshot({path:path.join(dir,'confirmacao-logout.png'),fullPage:true});
    await p.getByRole('button',{name:'Encerrar sessão da conta',exact:true}).click();
    await p.waitForURL(app+'/saiu');
    assert.ok(!(await ctx.cookies(auth)).some(c=>c.name==='avila_sso'));
    assert.ok(!(await ctx.cookies(app)).some(c=>c.name==='auth_dev_consumer'));
    await p.goto(auth+'/api/session');
    assert.equal(JSON.parse(await p.locator('body').innerText()).autenticado, false);
    registrar('Logout central confirmado remove sessão Auth e consumidor com state de retorno');
    await ctx.close();
    for (const [email,texto] of [['dev.zero@example.test','Nenhum vínculo de empresa registrado'],['dev.blocked@example.test','Vínculo suspenso']]) {
      const c = await contexto(), page = await c.newPage();
      await page.goto(auth+'/login?returnTo=/conta');
      await page.getByLabel('E-mail ou CPF').fill(email); await page.getByLabel('Senha',{exact:true}).fill(senha);
      await page.getByRole('button',{name:'Entrar',exact:true}).click(); await page.waitForURL(auth+'/conta');
      await page.getByText(texto,{exact:false}).waitFor();
      registrar(email.startsWith('dev.zero')?'Conta sem empresas':'Vínculo suspenso sem papéis ativos'); await c.close();
    }
    const novoEmail = `browser.${Date.now()}@example.test`;
    const novo = await contexto(), n = await novo.newPage();
    await n.goto(app+'/entrar'); await n.getByRole('link',{name:'Criar conta',exact:true}).click();
    await n.getByLabel('Nome',{exact:true}).fill('Pessoa Navegador DEV'); await n.getByLabel('E-mail',{exact:true}).fill(novoEmail);
    await n.getByRole('button',{name:'Enviar link de confirmação'}).click(); await n.getByText('Confira seu e-mail',{exact:true}).waitFor();
    const link = await mensagem(novoEmail);
    const outro = await contexto(), conf = await outro.newPage();
    await conf.goto(link);
    const novaSenha = senha + 'Browser!';
    await conf.getByLabel('Senha (mín. 8)',{exact:true}).fill(novaSenha);
    await conf.getByLabel('Confirmar',{exact:true}).fill(novaSenha);
    await conf.getByRole('button',{name:'Criar conta',exact:true}).click();
    await conf.waitForURL(app+'/',{timeout:30000});
    await conf.getByRole('link',{name:'Entrar com Auth'}).click(); await conf.waitForURL(app+'/',{timeout:30000});
    await conf.getByText('Conta: '+novoEmail).waitFor();
    registrar('Cadastro novo com confirmação real local em outro navegador e retorno seguro ao consumidor');
    await conf.goto(link); await conf.getByText('Este e-mail já tem conta.',{exact:false}).waitFor();
    registrar('Link de cadastro já usado não cria outra conta');
    await outro.close();
    const recoveryContext = await contexto(), rec = await recoveryContext.newPage();
    await rec.goto(app+'/entrar'); await rec.getByRole('link',{name:'Criar conta',exact:true}).click();
    await rec.getByLabel('Nome',{exact:true}).fill('Pessoa Navegador DEV'); await rec.getByLabel('E-mail',{exact:true}).fill(novoEmail);
    await rec.getByRole('button',{name:'Enviar link de confirmação'}).click(); await rec.getByText('Confira seu e-mail',{exact:true}).waitFor();
    const recoveryLink = await mensagem(novoEmail);
    const recoveryBrowser = await contexto(), rc = await recoveryBrowser.newPage();
    await rc.goto(recoveryLink); await rc.getByLabel('Nova senha (mín. 8)',{exact:true}).fill(novaSenha+'2');
    await rc.getByLabel('Confirmar',{exact:true}).fill(novaSenha+'2');
    await rc.getByRole('button',{name:/Salvar e entrar/}).click(); await rc.waitForURL(app+'/',{timeout:30000});
    await rc.getByRole('link',{name:'Entrar com Auth'}).click(); await rc.waitForURL(app+'/',{timeout:30000});
    await rc.getByText('Conta: '+novoEmail).waitFor();
    registrar('Recuperação de conta existente com consumo real local em outro navegador e origem preservada');
    await rc.goto(recoveryLink); await rc.getByText('O link expirou ou já foi usado.',{exact:false}).waitFor();
    registrar('Link de recuperação usado é rejeitado');
    await recoveryContext.close(); await recoveryBrowser.close();
    await fs.writeFile(path.join(dir,'browser-results.json'),JSON.stringify({resultados,erros},null,2));
    await novo.close();
    assert.deepEqual(erros,[]);
  } finally { await browser.close(); }
})().catch(async e=>{console.error('Falha no navegador:', e.name, e.message.replace(/https?:\/\/[^\s"<>]+/g,'[URL omitida]'));process.exitCode=1;});
