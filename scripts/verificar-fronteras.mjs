#!/usr/bin/env node
/**
 * Verifica las fronteras entre módulos de `apps/api/src/modules/` (R4, ADR-0004).
 *
 * Tres cosas, porque la regla se puede romper de tres maneras y la comprobación original de CI
 * (un `grep` de `modules/`) solo veía la primera, y mal:
 *
 *   1. **Importación directa de otro módulo.** Se resuelve cada ruta RELATIVA contra el sistema de
 *      archivos: `../crm/algo.js` no contiene la palabra `modules/` y el `grep` la dejaba pasar.
 *   2. **Acceso a un modelo de Prisma de otro módulo** (`tx.contacto.upsert(...)`). No hay
 *      importación que ver: el cliente de la transacción da acceso a todo, y así `inbox` escribía
 *      en los contactos de `crm` y `quoting` leía sus oportunidades sin que nada lo notara.
 *   3. **SQL crudo contra una tabla de otro módulo** (`FROM contactos`), por la misma razón.
 *
 * Lo que un módulo necesite de otro lo pide por un puerto de `shared/puertos/`, que el dueño
 * implementa. Quedan exentas las pruebas (`*.spec.ts`, `*.e2e-spec.ts`): ensamblan procesos
 * reales y necesitan los adaptadores de verdad. `shared/` y `infrastructure` compartida
 * (`outbox`, `tenants`, `usuarios`, auditoría) no pertenecen a ningún módulo.
 *
 * Sale con 1 si hay violaciones. Solo usa la biblioteca estándar: corre en CI sin instalar nada.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Quién es dueño de qué. Lo que no aparece aquí es compartido y no se restringe. */
export const DUENOS = {
  // ADR-0011: las tablas globales de identidad solo las toca `identity`, y con SU pool
  // (`viajapro_identidad`). Cualquier otro módulo que las nombrara estaría leyendo hashes de
  // contraseña y sesiones de todas las agencias.
  identity: {
    modelos: ['identidad', 'credencial', 'sesion', 'verificacion', 'accesoIdentidad'],
    tablas: ['identidades', 'credenciales', 'sesiones', 'verificaciones', 'accesos_identidad'],
  },
  crm: {
    modelos: [
      'contacto',
      'oportunidad',
      'etapaPipeline',
      'definicionCampoPersonalizado',
      'consentimientoContacto',
      'notaInterna',
    ],
    tablas: [
      'contactos',
      'oportunidades',
      'etapas_pipeline',
      'definiciones_campo_personalizado',
      'consentimientos_contacto',
      'notas_internas',
    ],
  },
  inbox: {
    modelos: [
      'conversacion',
      'mensaje',
      'adjunto',
      'plantillaWhatsapp',
      'canal',
      'cuentaWhatsapp',
      'recepcionWebhook',
      'recepcionWebhookChange',
      'enrutamientoCanal',
      'enrutamientoHistorial',
    ],
    tablas: [
      'conversaciones',
      'mensajes',
      'adjuntos',
      'plantillas_whatsapp',
      'canales',
      'cuentas_whatsapp',
      'recepciones_webhook',
      'recepciones_webhook_changes',
      'enrutamiento_canales',
      'enrutamiento_historial',
    ],
  },
  quoting: {
    modelos: [
      'paquete',
      'temporada',
      'precio',
      'vigencia',
      'tarifa',
      'politicaDePrecio',
      'mayorista',
      'cotizacion',
      'versionCotizacion',
    ],
    tablas: [
      'paquetes',
      'temporadas',
      'precios',
      'vigencias',
      'tarifas',
      'politicas_de_precio',
      'mayoristas',
      'cotizaciones',
      'versiones_cotizacion',
    ],
  },
};

const ES_PRUEBA = /\.(e2e-)?spec\.ts$/;

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== 'node_modules' && nombre !== 'dist') salida.push(...archivos(ruta));
    } else if (nombre.endsWith('.ts') && !ES_PRUEBA.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Quita los comentarios: una cita del ejemplo `tx.contacto.upsert` en un comentario no es un acceso. */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

/**
 * @param {string} raizDeModulos  `apps/api/src/modules`
 * @returns {string[]} una línea por violación
 */
export function verificar(raizDeModulos) {
  const violaciones = [];
  const modulos = readdirSync(raizDeModulos).filter((n) =>
    statSync(join(raizDeModulos, n)).isDirectory(),
  );

  for (const modulo of modulos) {
    const ajenos = Object.entries(DUENOS).filter(([dueno]) => dueno !== modulo);

    for (const archivo of archivos(join(raizDeModulos, modulo))) {
      const texto = sinComentarios(readFileSync(archivo, 'utf8'));
      const donde = (indice) =>
        `${relative(raizDeModulos, archivo).split(sep).join('/')}:${texto.slice(0, indice).split('\n').length}`;

      // 1. Importaciones que caen en otro módulo.
      for (const m of texto.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        let destino = null;
        if (spec.startsWith('.')) destino = resolve(dirname(archivo), spec);
        else if (/(^|\/)modules\//.test(spec))
          destino = resolve(raizDeModulos, spec.split('modules/')[1]);
        if (destino === null) continue;
        const rel = relative(raizDeModulos, destino).split(sep);
        if (rel[0] && !rel[0].startsWith('..') && rel[0] !== modulo && modulos.includes(rel[0])) {
          violaciones.push(
            `${donde(m.index ?? 0)}: el módulo '${modulo}' importa de '${rel[0]}' (${spec})`,
          );
        }
      }

      for (const [dueno, { modelos, tablas }] of ajenos) {
        // 2. Modelos de Prisma ajenos.
        for (const modelo of modelos) {
          const re = new RegExp(`\\b(?:tx|prisma|cliente|this\\.prisma)\\.${modelo}\\.`, 'g');
          for (const m of texto.matchAll(re)) {
            violaciones.push(
              `${donde(m.index ?? 0)}: '${modulo}' accede al modelo '${modelo}' de '${dueno}'`,
            );
          }
        }
        // 3. SQL crudo contra tablas ajenas.
        for (const tabla of tablas) {
          const re = new RegExp(
            `\\b(?:FROM|JOIN|INTO|UPDATE)\\s+(?:public\\.)?"?${tabla}\\b`,
            'gi',
          );
          for (const m of texto.matchAll(re)) {
            violaciones.push(
              `${donde(m.index ?? 0)}: '${modulo}' usa SQL contra la tabla '${tabla}' de '${dueno}'`,
            );
          }
        }
      }
    }
  }
  return violaciones;
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const raiz = resolve(process.argv[2] ?? 'apps/api/src/modules');
  const violaciones = verificar(raiz);
  if (violaciones.length > 0) {
    for (const v of violaciones) console.error(`::error::${v}`);
    console.error(
      '\nRegla R4 (ADR-0004): un módulo no importa a otro ni toca sus tablas. Lo que necesite lo pide ' +
        'por un puerto de apps/api/src/shared/puertos/, que el dueño implementa.',
    );
    process.exit(1);
  }
  console.log('Sin importaciones ni accesos a datos cruzados entre módulos.');
}
