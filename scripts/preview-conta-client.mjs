import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import SistemasDaConta from '../src/app/conta/SistemasDaConta.tsx';
import PerfilForm from '../src/app/conta/PerfilForm.tsx';

const root = document.getElementById('conta-preview-sistemas');
const data = document.getElementById('conta-preview-dados');
if (root && data) hydrateRoot(root, createElement(SistemasDaConta, { sistemas: JSON.parse(data.textContent) }));
const perfil = document.getElementById('conta-preview-perfil');
const perfilData = document.getElementById('conta-preview-perfil-dados');
if (perfil && perfilData) hydrateRoot(perfil, createElement(PerfilForm, { ...JSON.parse(perfilData.textContent), salvarDados: async () => {}, salvarFoto: async () => {} }));
// Only the isolated fixture rewrites navigation; production keeps its real routes.
for (const link of document.querySelectorAll('a[href="/conta?secao=dados"]')) link.setAttribute('href', 'perfil.html');
for (const link of document.querySelectorAll('a[href="/conta"]')) link.setAttribute('href', 'index.html');
