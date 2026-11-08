/** Visual fixture only. Renders the real components without authentication or database access. */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import ContaShell from '../src/app/conta/ContaShell.tsx';
import SistemasDaConta from '../src/app/conta/SistemasDaConta.tsx';
import PerfilForm from '../src/app/conta/PerfilForm.tsx';

const output = 'reports/conta-preview';
await mkdir(output + '/marca', { recursive: true });
await build({ entryPoints: ['scripts/preview-conta-client.mjs'], outfile: output + '/preview.js', bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', minify: true, alias: { '@': path.resolve('src') }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
const globalPath = 'src/app/globals.css';
const compiled = await postcss([tailwind()]).process(await readFile(globalPath, 'utf8'), { from: globalPath });
let fonts = '';
// Reuse exactly the fonts downloaded by a successful Next build when available.
try {
  for (const chunk of await readdir('.next/static/chunks')) {
    if (!chunk.endsWith('.css')) continue;
    const css = await readFile('.next/static/chunks/' + chunk, 'utf8');
    for (const rule of css.match(/@font-face\s*\{[^}]+\}/g) ?? []) {
      if (!rule.includes('font-family:Manrope;')) continue;
      const filename = rule.match(/url\(\.\.\/media\/([^)]*)\)/)?.[1];
      if (!filename || path.basename(filename) !== filename) continue;
      await copyFile('.next/static/media/' + filename, output + '/' + filename);
      fonts += rule.replace('../media/', '') + '\n';
    }
  }
} catch { /* Before the first build, the visual fixture uses the system font. */ }
await writeFile(output + '/style.css', fonts + compiled.css + '\n' + await readFile('src/app/conta/conta.css', 'utf8') + '\n:root { --font-manrope: Manrope, system-ui; }');
await copyFile('public/marca/simbolo-128.png', output + '/marca/simbolo-128.png');
const sistemas = [
  ['arxis', 'Arxis', 'app.arxisbim.com.br'], ['experiments', 'Experiments', 'ml.avilaops.com'],
  ['app', 'Avila Ops, Operação', 'app.avilaops.com'], ['cms', 'CMS', 'cms.avilaops.com'],
  ['crm', 'CRM', 'crm.avilaops.com'], ['erp', 'ERP', 'erp.avilaops.com'],
  ['lojas', 'E-Commerce', 'lojas.avilaops.com'], ['n8n', 'n8n', 'n8n.avilaops.com'],
  ['mcp', 'Servidores MCP', 'mcp.avilaops.com'], ['tms', 'TMS', 'tms.avilaops.com'],
].map(([id, nome, host]) => ({ id, nome, url: `https://${host}/` }));
for (const empty of [false, true]) {
  const content = renderToString(h(ContaShell, {
    nome: 'Pessoa Exemplo', email: 'pessoa@example.com', equipe: !empty, painel: !empty, secao: 'inicio',
    children: h('div', { id: 'conta-preview-sistemas' }, h(SistemasDaConta, { sistemas: empty ? [] : sistemas })),
  }));
  await writeFile(`${output}/${empty ? 'vazio' : 'index'}.html`, `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia visual de Minha conta</title><link rel="stylesheet" href="style.css"></head><body>${content}<p style="padding:16px;text-align:center;font:12px system-ui">Prévia visual com dados fictícios. Login e ações não estão conectados nesta prévia.</p><script id="conta-preview-dados" type="application/json">${JSON.stringify(empty ? [] : sistemas).replaceAll('<', '\\u003c')}</script><script type="module" src="preview.js"></script></body></html>`);
}
const perfil = { nome: 'Pessoa Exemplo', email: 'pessoa@example.com', telefone: '', foto: null, demonstracao: true };
const perfilHtml = renderToString(h(ContaShell, { ...perfil, equipe: false, painel: false, secao: 'dados', children: h('div', { id: 'conta-preview-perfil' }, h(PerfilForm, { ...perfil, salvarDados: async () => {}, salvarFoto: async () => {} })) }));
await writeFile(output + '/perfil.html', `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prévia do perfil</title><link rel="stylesheet" href="style.css"></head><body>${perfilHtml}<script id="conta-preview-perfil-dados" type="application/json">${JSON.stringify(perfil)}</script><script type="module" src="preview.js"></script></body></html>`);
console.log(`Visual preview generated in ${output}. No authentication or database was accessed.`);
