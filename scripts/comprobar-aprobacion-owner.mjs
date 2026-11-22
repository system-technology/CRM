#!/usr/bin/env node
// Compuerta de R11: un PR que toque una ruta protegida (`humanRequired` de ownership.json) necesita
// una revisión APROBADA del Owner sobre el commit actual. Un PR que no toque ninguna pasa sin más.
//
//   node scripts/comprobar-aprobacion-owner.mjs --repo o/r --pr 123 [--owner Alfavear]
//
// Existe porque la protección de rama no puede hacerlo sola: con `required_approving_review_count: 0`
// GitHub ignora `require_code_owner_reviews`, y con 1 exige aprobación en TODOS los PR.
// Debe ejecutarse desde el código de la RAMA BASE, nunca del PR (ver rutas-protegidas.yml).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { toRegex, cargarOwnership } from './lib/globs-ownership.mjs';

/** Pura: devuelve { ok, protegidos, motivo }. `reviews` es la lista cruda de la API. */
export function evaluar({ ficheros, reviews, headSha, autor, owner, humanRequired }) {
  const ms = humanRequired.map(toRegex);
  const protegidos = ficheros.filter((f) => ms.some((m) => m.test(f)));
  if (protegidos.length === 0) return { ok: true, protegidos, motivo: 'no toca rutas protegidas' };

  const me = owner.toLowerCase();
  if ((autor || '').toLowerCase() === me)
    return {
      ok: false,
      protegidos,
      motivo: `el PR lo abrió @${owner}: GitHub no deja aprobar el propio PR. Ábrelo con otra identidad (la App integradora).`,
    };

  // Última revisión decisiva de @owner: COMMENTED no cambia nada; DISMISSED anula.
  let ultima = null;
  for (const r of reviews) {
    if ((r.user?.login || '').toLowerCase() !== me) continue;
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || r.state === 'DISMISSED')
      ultima = r;
  }
  if (!ultima || ultima.state !== 'APPROVED')
    return {
      ok: false,
      protegidos,
      motivo: `falta la aprobación de @${owner}${ultima ? ` (última revisión: ${ultima.state})` : ''}.`,
    };
  if (ultima.commit_id !== headSha)
    return {
      ok: false,
      protegidos,
      motivo: `la aprobación de @${owner} es de un commit anterior (${String(ultima.commit_id).slice(0, 7)}); hay que aprobar de nuevo.`,
    };
  return { ok: true, protegidos, motivo: `aprobado por @${owner}` };
}

function main() {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const repo = arg('--repo', process.env.GITHUB_REPOSITORY);
  const pr = arg('--pr');
  const owner = arg('--owner', process.env.OWNER_LOGIN || 'Alfavear');
  if (!repo || !pr) {
    console.error('Faltan --repo y --pr');
    process.exit(2);
  }
  const gh = (ruta) =>
    JSON.parse(
      execFileSync(
        'gh',
        ['api', '--paginate', '--slurp', `repos/${repo}/${ruta}?per_page=100`],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      ),
    ).flat();
  const info = JSON.parse(
    execFileSync('gh', ['api', `repos/${repo}/pulls/${pr}`], { encoding: 'utf8' }),
  );
  // Renombrados: también cuenta la ruta de origen (sacar un fichero de una ruta protegida es tocarla).
  const ficheros = gh(`pulls/${pr}/files`).flatMap((f) =>
    f.previous_filename ? [f.filename, f.previous_filename] : [f.filename],
  );
  if (info.changed_files > 3000) {
    console.error('El PR supera el límite de 3000 ficheros de la API: no se puede evaluar.');
    process.exit(1);
  }
  const r = evaluar({
    ficheros,
    reviews: gh(`pulls/${pr}/reviews`),
    headSha: info.head.sha,
    autor: info.user.login,
    owner,
    humanRequired: cargarOwnership().humanRequired,
  });
  console.log(`ficheros: ${ficheros.length}  protegidos: ${r.protegidos.length}`);
  if (r.protegidos.length) console.log(`  ${r.protegidos.join('\n  ')}`);
  if (r.ok) {
    console.log(`✔ ${r.motivo}`);
    return;
  }
  console.log(`✗ ${r.motivo}`);
  console.log(`::error::Rutas protegidas sin aprobación del Owner: ${r.motivo}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
