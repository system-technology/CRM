import assert from 'node:assert/strict';
import { evaluar } from './comprobar-aprobacion-owner.mjs';
import { cargarOwnership } from './lib/globs-ownership.mjs';

const humanRequired = cargarOwnership().humanRequired;
const base = { headSha: 'h2', autor: 'bot', owner: 'Alfavear', humanRequired, reviews: [] };
const rev = (state, commit_id = 'h2', login = 'Alfavear') => ({ state, commit_id, user: { login } });
const ev = (o) => evaluar({ ...base, ...o });

// Sin rutas protegidas pasa sin revisión
assert.equal(ev({ ficheros: ['apps/web/src/app/page.tsx', 'docs/x.md'] }).ok, true);
// Cada familia de rutas protegidas exige aprobación
for (const f of ['CLAUDE.md', '.github/workflows/ci.yml', 'scripts/a.mjs', 'packages/database/prisma/migrations/1/m.sql',
  'apps/api/package.json', 'package.json', 'docs/03-adr/0001-x.md', 'apps/api/src/cifrado/x.ts', '.claude/agents/a.md', 'render.yaml'])
  assert.equal(ev({ ficheros: ['otro.ts', f] }).ok, false, f);
// Aprobación válida
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED')] }).ok, true);
// Aprobación de otra persona no vale
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED', 'h2', 'otro')] }).ok, false);
// Aprobación de un commit anterior no vale
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED', 'h1')] }).ok, false);
// Un comentario posterior no anula la aprobación
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED'), rev('COMMENTED')] }).ok, true);
// Cambios pedidos o descartada después de aprobar: falla
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED'), rev('CHANGES_REQUESTED')] }).ok, false);
assert.equal(ev({ ficheros: ['CLAUDE.md'], reviews: [rev('APPROVED'), rev('DISMISSED')] }).ok, false);
// Sin revisión: falla
assert.equal(ev({ ficheros: ['CLAUDE.md'] }).ok, false);
// El autor es el Owner: no puede aprobarse, falla con motivo claro (no se exime)
const propio = ev({ ficheros: ['CLAUDE.md'], autor: 'alfavear', reviews: [rev('APPROVED')] });
assert.equal(propio.ok, false);
assert.match(propio.motivo, /abrió/);
// Si no toca nada protegido da igual quién sea el autor
assert.equal(ev({ ficheros: ['docs/x.md'], autor: 'Alfavear' }).ok, true);
console.log('comprobar-aprobacion-owner: ok');
