#!/usr/bin/env node
// Imprime un token de instalación (válido ~1 h) de la GitHub App de una sesión.
//
//   GH_TOKEN=$(node scripts/gh-app-token.mjs frontend) gh pr create ...
//
// Sesiones: integradora | backend | frontend (ver scripts/gh-apps.json).
// La clave privada vive FUERA del repo: ~/.viajapro-keys/<sesion>.pem
// (o VIAJAPRO_KEYS_DIR). Nunca se imprime ni se commitea. Sin dependencias.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const sesion = process.argv[2];
const cfg = JSON.parse(readFileSync(new URL('./gh-apps.json', import.meta.url), 'utf8'));
if (!cfg.apps[sesion]) {
  console.error(`Uso: gh-app-token.mjs <${Object.keys(cfg.apps).join('|')}>`);
  process.exit(2);
}

const keysDir =
  process.env.VIAJAPRO_KEYS_DIR || join(homedir(), cfg.carpetaClaves ?? '.viajapro-keys');
const pem = readFileSync(join(keysDir, `${cfg.claves?.[sesion] ?? sesion}.pem`));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'RS256', typ: 'JWT' });
const body = b64({ iat: now - 60, exp: now + 540, iss: String(cfg.apps[sesion]) });
const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(pem, 'base64url');
const jwt = `${head}.${body}.${sig}`;

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'viajapro-gh-app-token',
    },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${j.message}`);
  return j;
};

try {
  const { id } = await api(`/repos/${cfg.repo}/installation`);
  const { token } = await api(`/app/installations/${id}/access_tokens`, { method: 'POST' });
  process.stdout.write(token);
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (/404/.test(e.message))
    console.error(`  ¿Está instalada la app "${sesion}" sobre ${cfg.repo}?`);
  process.exit(1);
}
