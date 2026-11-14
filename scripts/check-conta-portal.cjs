/** Smoke test com contas sintéticas e servidor DEV real. Requer Playwright opcional. */
const { chromium } = require(process.env.AUTH_DEV_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const pg = require('pg');
const bcrypt = require('bcryptjs');
const resultados = [], erros = [];
const pasta = path.resolve('.local/auth/conta-portal');
const registrar = (cenario, extra = {}) => { resultados.push({ cenario, resultado: 'aprovado', ...extra }); console.log('OK:', cenario); };

(async () => {
  const env = { ...parseEnv(await fs.readFile('.env.development.local', 'utf8')), NODE_ENV: 'development' };
  const { validarAmbienteLocal } = await import('./dev-local-config.mjs'); validarAmbienteLocal(env);
  Object.assign(process.env, env);
  const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient();
  const portal = new pg.Client({ connectionString: env.PORTAL_DATABASE_URL }); await portal.connect();
  const { senha } = JSON.parse(await fs.readFile('.local/auth/access.json', 'utf8'));
  const id = randomUUID(), outra = randomUUID(), email = `portal.${Date.now()}@example.test`;
  await fs.mkdir(pasta, { recursive: true });
  const auth = env.SSO_BASE_URL;
  const browser = await chromium.launch({ headless: true });
  const contextos = [];
  const contexto = async () => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    c.setDefaultTimeout(20000); c.setDefaultNavigationTimeout(45000);
    c.on('page', p => p.on('pageerror', e => erros.push(e.name))); contextos.push(c); return c;
  };
  const confirmado = async () => (await portal.query('SELECT email_verificado,mfa_email_ativo,role FROM portal_clients WHERE id=$1', [id])).rows[0];
  try {
    const hash = await bcrypt.hash(senha, 10);
    for (const [sub, endereco] of [[id, email], [outra, `outra.${Date.now()}@example.test`]]) {
      await portal.query(`INSERT INTO portal_clients(id,nome,email,role,senha_hash,ativo,email_verificado)
        VALUES ($1,'Pessoa Portal DEV',$2,'CLIENT',$3,true,false)`, [sub, endereco, hash]);
    }
    const empresas = await prisma.organizacaoCorporativa.findMany({ where: { clienteId: 'dev-local', referenciaExterna: { in: ['dev-a', 'dev-b'] } }, orderBy: { nome: 'asc' } });
    assert.equal(empresas.length, 2, 'Prepare o ambiente com npm run dev:setup');
    for (const empresa of empresas) await prisma.vinculoCorporativo.create({ data: { organizacaoId: empresa.id, contaId: id, autorizacoes: { create: { papel: 'COMPRADOR' } } } });
    const criarConexao = sub => prisma.mcpConexao.create({ data: { clienteId: 'dev-local', sub, organizacaoId: empresas[0].id, operacoes: ['read','write'], pedidoHash: 'fixture-local-controlada', usadoEm: new Date() } });
    const conexao = await criarConexao(id), alheia = await criarConexao(outra);
    const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
    await prisma.refreshOAuth.create({ data: { tokenHash, familia: randomUUID(), clienteId: 'dev-local', sub: id, email,
      expiraEm: new Date(Date.now()+600000), mcpConexaoId: conexao.id } });
    const ctx = await contexto(), page = await ctx.newPage();
    await page.goto(auth+'/login?returnTo=%2Fconta');
    await page.getByLabel('E-mail ou CPF').fill(email); await page.getByLabel('Senha', { exact: true }).fill(senha);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await page.waitForURL(auth+'/conta');
    for (const nome of ['Meus dados','Segurança','Empresas','Conexões']) await page.getByRole('navigation', { name: 'Seções da conta' }).getByRole('link', { name: nome, exact: true }).waitFor();
    registrar('Login real e navegação das quatro áreas');
    await page.goto(auth+'/conta?secao=dados');
    await page.getByLabel('Nome completo').fill('Pessoa Portal Atualizada'); await page.getByLabel('Telefone', { exact: false }).fill('11999990000');
    await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await page.waitForURL(/salvo=1/);
    assert.equal(await page.locator('.conta-identidade strong').innerText(), 'Pessoa Portal Atualizada');
    await page.reload(); assert.equal(await page.getByLabel('Nome completo').inputValue(), 'Pessoa Portal Atualizada');
    assert.equal(await page.getByLabel('Telefone', { exact: false }).inputValue(), '11999990000');
    // O seletor de arquivo usa handlers do cliente; aguardar a hidratação após reload.
    await page.waitForLoadState('networkidle');
    registrar('Nome e telefone persistidos e identidade atualizada');
    await page.getByLabel('Escolher foto').setInputFiles({ name: 'perfil.png', mimeType: 'image/png', buffer: await fs.readFile('public/marca/simbolo-128.png') });
    await page.getByRole('button', { name: 'Salvar foto', exact: true }).click(); await page.waitForURL(/salvo=foto/);
    assert.equal((await ctx.request.get(auth+'/api/conta/foto')).status(), 200);
    await page.getByRole('button', { name: 'Remover foto', exact: true }).click(); await page.waitForURL(/salvo=foto/);
    await page.getByRole('button', { name: 'Remover foto', exact: true }).waitFor({ state: 'detached' });
    assert.equal((await ctx.request.get(auth+'/api/conta/foto')).status(), 404);
    registrar('Upload, leitura privada e remoção real da foto');
    await page.goto(auth+'/conta?secao=seguranca');
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal((await ctx.request.post(auth+'/api/conta/email/solicitar', { headers: { Origin: 'https://fora.example.test' } })).status(), 403);
    const anonimo = await contexto();
    assert.equal((await anonimo.request.post(auth+'/api/conta/email/solicitar', { headers: { Origin: auth } })).status(), 401);
    registrar('Emissão exige conta ativa e recusa origem externa');
    await page.getByRole('button', { name: 'Enviar link de confirmação', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Enviamos o link' }).waitFor();
    await page.getByRole('button', { name: 'Reenviar link de confirmação', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Aguarde' }).waitFor();
    assert.equal((await confirmado()).email_verificado, false);
    const mensagens = await Promise.all((await fs.readdir('.local/auth/emails')).map(async n => JSON.parse(await fs.readFile(path.join('.local/auth/emails', n), 'utf8'))));
    const mensagem = mensagens.filter(m => m.email.para === email).sort((a,b) => b.criadoEm.localeCompare(a.criadoEm))[0];
    assert.ok(mensagem, 'Mensagem capturada no transporte local');
    const link = mensagem.email.texto.match(/http:\/\/127\.0\.0\.1:3010\/conta\/confirmar-email\/[a-f0-9]{64}/)[0];
    const token = link.split('/').at(-1), outro = await contexto(), confirmacao = await outro.newPage();
    assert.equal((await outro.request.post(auth+'/api/conta/email/confirmar', { headers: { Origin: 'https://fora.example.test' }, data: { token } })).status(), 403);
    assert.equal((await outro.request.post(auth+'/api/conta/email/confirmar', { headers: { Origin: auth }, data: { token: [] } })).status(), 400);
    assert.equal((await outro.request.post(auth+'/api/conta/email/confirmar', { headers: { Origin: auth }, data: { token: 'a'.repeat(2000) } })).status(), 400);
    await confirmacao.goto(link); assert.equal((await confirmado()).email_verificado, false);
    await confirmacao.getByRole('button', { name: 'Confirmar meu e-mail', exact: true }).click();
    await confirmacao.getByRole('status').filter({ hasText: 'E-mail confirmado' }).waitFor();
    assert.deepEqual(await confirmado(), { email_verificado: true, mfa_email_ativo: false, role: 'CLIENT' });
    assert.equal((await outro.request.get(auth+'/api/session')).status(), 401);
    assert.equal((await outro.request.post(auth+'/api/conta/email/confirmar', { headers: { Origin: auth }, data: { token } })).status(), 409);
    registrar('Mensagem real local, GET sem efeitos, confirmação em outro navegador e reuso recusado');
    await page.reload(); await page.getByText('E-mail confirmado', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Enviar link de confirmação', exact: true }).count(), 0);
    await confirmacao.goto(auth+'/conta/confirmar-email/'+'0'.repeat(64));
    assert.equal(await confirmacao.getByRole('button', { name: 'Confirmar meu e-mail', exact: true }).count(), 0);
    registrar('Estado confirmado persistido e link inválido com próximo passo');
    await page.goto(auth+'/conta?secao=empresas');
    for (const empresa of empresas) await page.getByText(empresa.nome, { exact: true }).waitFor();
    await page.goto(auth+'/conexoes'); await page.waitForURL(auth+'/conta?secao=conexoes');
    await page.getByRole('button', { name: 'Revogar conexão', exact: true }).waitFor();
    await page.screenshot({ path: path.join(pasta, 'conexao-ativa.png'), fullPage: true });
    page.on('dialog', d => d.accept());
    await page.locator('form input[name="id"]').evaluate((el, valor) => { el.value = valor; }, alheia.id);
    await page.getByRole('button', { name: 'Revogar conexão', exact: true }).click(); await page.waitForURL(/erro=conexao/);
    assert.equal((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: alheia.id } })).revogadoEm, null);
    assert.equal((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: conexao.id } })).revogadoEm, null);
    registrar('Conexões integradas, alias legado e revogação cruzada recusada');
    await page.goto(auth+'/conta?secao=conexoes');
    await page.getByRole('button', { name: 'Revogar conexão', exact: true }).click(); await page.waitForURL(/salvo=conexao/);
    assert.ok((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: conexao.id } })).revogadoEm);
    assert.ok((await prisma.refreshOAuth.findUniqueOrThrow({ where: { tokenHash } })).revogadoEm);
    await page.getByText('Nenhuma conexão autorizada nesta página', { exact: true }).waitFor();
    registrar('Revogação própria persiste conexão e refresh sem deslogar a conta');
    for (const largura of [1440,390,320]) for (const tema of ['light','dark']) for (const secao of ['inicio','dados','seguranca','empresas','conexoes']) {
      await page.setViewportSize({ width: largura, height: 1000 }); await page.emulateMedia({ colorScheme: tema });
      await page.goto(auth+'/conta'+(secao==='inicio'?'':'?secao='+secao));
      await page.getByLabel('Tema de aparência').selectOption('system');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Sem overflow horizontal');
      if (largura <= 390) {
        for (const nome of ['Início','Meus dados','Segurança','Empresas','Conexões']) {
          const alvo = await page.getByRole('navigation', { name:'Seções da conta' }).getByRole('link', { name:nome,exact:true }).boundingBox();
          assert.ok(alvo && alvo.x >= 0 && alvo.x + alvo.width <= largura && alvo.height >= 44, 'Seções acessíveis sem rolagem lateral');
        }
      }
      await page.screenshot({ path: path.join(pasta, `${secao}-${largura}-${tema}.png`), fullPage: true });
      registrar('Área responsiva', { secao, largura, tema });
    }
    await portal.query('UPDATE portal_clients SET ativo=false WHERE id=$1', [id]);
    await page.goto(auth+'/conta?secao=dados'); await page.waitForURL(auth+'/sair');
    assert.equal((await ctx.request.post(auth+'/api/conta/email/solicitar', { headers: { Origin: auth } })).status(), 401);
    await portal.query('UPDATE portal_clients SET ativo=true,role=\'OWNER\' WHERE id=$1', [id]);
    await page.goto(auth+'/conta'); await page.waitForURL(auth+'/sair');
    registrar('Conta bloqueada ou com papel alterado exige nova autenticação');
    assert.deepEqual(erros, []);
    await fs.writeFile(path.join(pasta, 'resultados.json'), JSON.stringify({ executadoEm: new Date().toISOString(), resultados, erros }, null, 2));
    console.log(`${resultados.length} cenários aprovados; zero pageerrors.`);
  } finally {
    await portal.query('UPDATE portal_clients SET ativo=true,role=\'CLIENT\' WHERE id=$1', [id]).catch(()=>{});
    for (const c of contextos) await c.close(); await browser.close(); await portal.end(); await prisma.$disconnect();
  }
})().catch(async erro => {
  await fs.mkdir(pasta,{ recursive:true }); await fs.writeFile(path.join(pasta,'resultados.json'),JSON.stringify({ resultado:'falhou',resultados,erro:erro.name },null,2));
  console.error(erro.name,erro.message.replace(/https?:\/\/[^\s"<>]+/g,'[URL omitida]')); process.exitCode=1;
});
