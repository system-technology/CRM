/**
 * Pruebas de `verificar-fronteras.mjs`. Cada caso reproduce el código que tuvo el proyecto antes
 * de los puertos hacia `crm`: si el verificador no lo atrapa, esta prueba cae.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verificar } from './verificar-fronteras.mjs';

function arbol(archivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'fronteras-'));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = join(raiz, ruta);
    mkdirSync(dirname(completa), { recursive: true });
    writeFileSync(completa, contenido);
  }
  return raiz;
}

const casos = [
  {
    nombre: 'inbox escribe en contactos con el cliente de la transacción (el código de antes)',
    archivos: {
      'crm/x.ts': 'export const a = 1;',
      'inbox/infrastructure/bandeja.prisma.ts':
        'const c = await tx.contacto.upsert({ where: {}, update: {}, create: {} });',
    },
    espera: /'inbox' accede al modelo 'contacto' de 'crm'/,
  },
  {
    nombre: 'quoting lee oportunidades de crm (el código de antes)',
    archivos: {
      'crm/x.ts': 'export const a = 1;',
      'quoting/application/cotizaciones.ts':
        'const o = await tx.oportunidad.findFirst({ where: { id } });',
    },
    espera: /'quoting' accede al modelo 'oportunidad' de 'crm'/,
  },
  {
    nombre: 'SQL crudo contra una tabla ajena',
    archivos: {
      'crm/x.ts': 'export const a = 1;',
      'quoting/a.ts': 'await tx.$queryRaw`SELECT id FROM public.contactos WHERE id = ${x}`;',
    },
    espera: /SQL contra la tabla 'contactos' de 'crm'/,
  },
  {
    nombre: 'importación RELATIVA a otro módulo, que el grep de `modules/` no veía',
    archivos: {
      'crm/infrastructure/c.ts': 'export class C {}',
      'inbox/a.ts': "import { C } from '../crm/infrastructure/c.js';",
    },
    espera: /'inbox' importa de 'crm'/,
  },
  {
    nombre: 'importación con la ruta completa `modules/`',
    archivos: {
      'crm/c.ts': 'export class C {}',
      'inbox/a.ts': "import { C } from 'src/modules/crm/c.js';",
    },
    espera: /'inbox' importa de 'crm'/,
  },
];

for (const c of casos) {
  const raiz = arbol(c.archivos);
  try {
    const v = verificar(raiz);
    assert.ok(v.length > 0, `no atrapó: ${c.nombre}`);
    assert.match(v.join('\n'), c.espera, c.nombre);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

// Lo que NO debe marcar.
const limpios = arbol({
  'crm/infrastructure/p.ts': 'await tx.contacto.upsert({}); // crm toca lo suyo',
  'inbox/a.ts':
    "import { PuertoContactos } from '../../shared/puertos/p.js';\n" +
    '// Antes esto era tx.contacto.upsert(...), ahora va por el puerto.\n' +
    'await tx.mensaje.createMany({});',
  'inbox/a.spec.ts': 'await tx.contacto.upsert({});',
  'quoting/q.ts': "import { x } from './domain/errors.js'; await tx.paquete.findFirst({});",
});
try {
  assert.deepEqual(verificar(limpios), []);
} finally {
  rmSync(limpios, { recursive: true, force: true });
}

console.log(`verificar-fronteras: ${casos.length + 1} casos en verde`);
