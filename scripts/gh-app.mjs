#!/usr/bin/env node
// Acceso a GitHub con la identidad de la app de una sesión, SIN exponer el token.
// Sirve igual en PowerShell y en bash: el token se pide y se usa dentro de este proceso;
// no se imprime, no pasa por el modelo y no queda en el entorno de la sesión.
//
//   node scripts/gh-app.mjs <sesion> gh <argumentos de gh…>   p. ej.: … frontend gh pr create --draft --title "…" --body "…"
//   node scripts/gh-app.mjs <sesion> push                     sube la rama actual (sin force; solo ramas de tu carril)
//
// Sesiones: integradora | backend | frontend (scripts/gh-apps.json). Ver docs/FLUJO.md.
// Si no puede obtener el token de la app, FALLA: nunca cae a la cuenta del Owner.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(aqui, 'gh-apps.json'), 'utf8'));
const PREFIJO = { integradora: 'i', backend: 'a', frontend: 'b' };

const [sesion, modo, ...resto] = process.argv.slice(2);
const fallo = (m) => { console.error(`✗ ${m}`); process.exit(1); };
if (!PREFIJO[sesion] || !['gh', 'push'].includes(modo)) {
  console.error('Uso: node scripts/gh-app.mjs <integradora|backend|frontend> gh <args…>\n     node scripts/gh-app.mjs <sesion> push');
  process.exit(2);
}

// 1) Token de la app (proceso hijo; stdout capturado, nunca reenviado).
const t = spawnSync(process.execPath, [join(aqui, 'gh-app-token.mjs'), sesion], { encoding: 'utf8' });
const token = (t.stdout || '').trim();
if (t.status !== 0 || !/^ghs_[A-Za-z0-9_.-]+$/.test(token)) {
  fallo(`no se pudo obtener el token de la app «${sesion}» (¿existe ~/.viajapro-keys/${sesion}.pem y está instalada la app?). No se usa la cuenta del Owner.`);
}
const limpia = (txt) => (txt || '').split(token).join('***');

// 2) gh con el token solo para ese proceso, con un recorte de lo que una sesión puede hacer.
if (modo === 'gh') {
  const [cmd, sub] = resto;
  const BLOQUEADOS = ['auth', 'secret', 'variable', 'ssh-key', 'gpg-key', 'extension', 'alias', 'config', 'codespace'];
  if (!cmd) fallo('falta el comando de gh');
  if (BLOQUEADOS.includes(cmd)) fallo(`«gh ${cmd}» no está permitido desde una sesión`);
  if (cmd === 'repo' && ['delete', 'edit', 'transfer', 'archive', 'rename', 'deploy-key'].includes(sub)) fallo(`«gh repo ${sub}» no está permitido desde una sesión`);
  if (cmd === 'pr' && sub === 'merge' && sesion !== 'integradora') {
    // Frontend y Backend solo pueden ACTIVAR el auto-merge (GitHub espera checks y revisión del Owner); nunca mergear a mano.
    if (!resto.includes('--auto') || resto.includes('--admin')) fallo('solo la Integradora mergea PRs; tú solo puedes activar el auto-merge con --auto');
  }
  if (cmd === 'api') {
    const metodo = resto.findIndex((a) => a === '-X' || a === '--method');
    const m = metodo >= 0 ? String(resto[metodo + 1]).toUpperCase() : (resto.some((a) => a === '-f' || a === '-F' || a === '--field' || a === '--raw-field' || a === '--input') ? 'POST' : 'GET');
    if (m !== 'GET' && /branches\/[^/]+\/protection|\/actions\/secrets|\/rulesets|\/hooks|\/collaborators|\/transfer|\/keys/.test(resto.join(' '))) fallo('esa llamada de la API no está permitida desde una sesión');
  }
  const r = spawnSync('gh', resto, { encoding: 'utf8', env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token } });
  process.stdout.write(limpia(r.stdout));
  process.stderr.write(limpia(r.stderr));
  process.exit(r.status ?? 1);
}

// 3) push: solo la rama actual, solo de tu carril, nunca main, nunca con force.
const git = (...a) => spawnSync('git', a, { encoding: 'utf8' });
const rama = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
const re = new RegExp(`^${PREFIJO[sesion]}/T-\\d{3}-[a-z0-9-]+$`);
if (!re.test(rama)) fallo(`la rama «${rama}» no es de tu carril (se espera ${PREFIJO[sesion]}/T-123-slug). No se empuja.`);
if (resto.length) fallo('«push» no admite argumentos (ni --force): empuja la rama actual y nada más');
const origen = git('remote', 'get-url', 'origin').stdout.trim();
if (!origen.includes(cfg.repo)) fallo(`el remoto origin (${origen}) no es ${cfg.repo}`);
// El token va por variables de entorno de git (no por argv), y se oculta de cualquier salida.
const cabecera = 'AUTHORIZATION: basic ' + Buffer.from(`x-access-token:${token}`).toString('base64');
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: cabecera };
const p = spawnSync('git', ['push', `https://github.com/${cfg.repo}.git`, `HEAD:refs/heads/${rama}`], { encoding: 'utf8', env });
process.stdout.write(limpia(p.stdout).split(Buffer.from(`x-access-token:${token}`).toString('base64')).join('***'));
process.stderr.write(limpia(p.stderr).split(Buffer.from(`x-access-token:${token}`).toString('base64')).join('***'));
process.exit(p.status ?? 1);
