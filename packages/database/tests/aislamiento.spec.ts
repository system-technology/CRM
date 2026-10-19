/**
 * Prueba de aislamiento entre tenants.
 *
 * Es la prueba más importante del repositorio. Si falla, no se integra nada: una fuga entre
 * agencias no es un bug, es el fin del producto.
 *
 * Corre en CI como job propio (`aislamiento-tenants`) y es compuerta obligatoria de la
 * integración a `main`. Ver ADR-0003 y docs/07-ingenieria/03-git.md.
 *
 * Se conecta con el rol de aplicación (`viajapro_app`), NO con el propietario: probar el
 * aislamiento con un rol que puede saltárselo no prueba nada.
 *
 * ---------------------------------------------------------------------------------------
 * ADR-0008 añade las aserciones 8 a 25. No son decoración: por el propio texto del ADR,
 * **una protección que no se pueda poner en rojo automáticamente no cuenta como
 * protección**, y la aprobación de seguridad del diseño CADUCA si alguna de ellas se
 * desactiva o se marca como omitida. Si una estorba, se arregla el sistema, no la prueba.
 * ---------------------------------------------------------------------------------------
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo JS sin tipos, compartido con `scripts/limpiar-fixtures.mjs`.
import { borrarTenants } from '../scripts/borrar-tenants.mjs';

// SIN `??` hacia DATABASE_URL, y eso es media compuerta.
//
// Con el respaldo, un entorno que no definiera DATABASE_APP_URL —exactamente lo que
// pasaba en CI— conectaba la supuesta «conexión de aplicación» al rol propietario. En el
// contenedor de CI ese rol es SUPERUSUARIO, y la única comprobación que lo vigilaba
// miraba `rolbypassrls`, que en un superusuario es `false`. Las 25 aserciones pasaban sin
// probar absolutamente nada. Si falta la variable, esto tiene que reventar.
const URL_APP = process.env['DATABASE_APP_URL'] ?? '';
const URL_ADMIN = process.env['DATABASE_URL'] ?? '';

if (!URL_APP) {
  throw new Error(
    'Falta DATABASE_APP_URL. La prueba de aislamiento NO cae al rol propietario: ' +
      'probar el aislamiento con un rol que puede saltárselo no prueba nada. ' +
      'En local: pnpm --filter @viajapro/database run roles:dev',
  );
}
if (!URL_ADMIN) {
  throw new Error('Falta DATABASE_URL (rol propietario, para las comprobaciones de catálogo).');
}

/**
 * **Los tenants de fixture son de ESTA corrida, no constantes compartidas.**
 *
 * Lo eran —tres UUID fijos—, y el agente `datos` midió esta noche lo que eso significa: los
 * cuatro árboles de trabajo del proyecto comparten la misma base de Neon y el mismo literal en
 * el mismo archivo. Dos corridas a la vez **se borran los fixtures mutuamente**. Lo vio con un
 * vigilante sobre `pg_stat_activity`: los tres tenants desapareciendo a las 04:43:02 y
 * reapareciendo a las 04:43:44, con una conexión de propietario que esta sesión no había abierto.
 *
 * El efecto es peor que un fallo: **un «50/50» solo significaba algo si nadie más estaba
 * corriendo**, y no hay forma de saberlo desde dentro. Una compuerta cuyo verde depende de quién
 * más esté trabajando no es una compuerta.
 *
 * El prefijo `fixture-aislamiento-` **es contrato** con `scripts/limpiar-fixtures.mjs`: así la
 * limpieza puede reconocer residuo de cualquier corrida sin tener los identificadores escritos,
 * y sigue sin poder borrar una agencia de verdad.
 */
const MARCA = `${process.pid.toString(16)}${Date.now().toString(16)}`.slice(-10).padStart(10, '0');
const tenantDeCorrida = (letra: string): string =>
  `01932000-0000-7000-8000-${letra}${MARCA}f`.slice(0, 36);

const TENANT_A = tenantDeCorrida('a');
const TENANT_B = tenantDeCorrida('b');
/** Un POST de Meta puede traer `changes` de tres agencias distintas. Para la aserción 16. */
const TENANT_C = tenantDeCorrida('c');

let admin: Client;
let app: Client;

/** Ejecuta en el contexto de un tenant, como lo hace el interceptor de la API. */
async function comoTenant<T>(tenantId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  await app.query('BEGIN');
  try {
    // SET LOCAL, no SET: el valor debe morir con la transacción. Si no, contamina la
    // siguiente conexión del pool y produce fugas intermitentes imposibles de reproducir.
    await app.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const resultado = await fn(app);
    await app.query('COMMIT');
    return resultado;
  } catch (error) {
    await app.query('ROLLBACK');
    throw error;
  }
}

beforeAll(async () => {
  admin = new Client({ connectionString: URL_ADMIN });
  app = new Client({ connectionString: URL_APP });
  await admin.connect();
  await app.connect();

  // Afirmar QUÉ rol es la conexión de aplicación, no solo qué atributos tiene.
  //
  // Los tres roles de login se distinguen únicamente en qué funciones ejecutan, así que
  // «no tiene BYPASSRLS» no identifica a ninguno: apuntar DATABASE_APP_URL a
  // `viajapro_altas` —un copiar y pegar entre dos líneas contiguas de .env— pasaría
  // desapercibido y devolvería a toda la API la capacidad de repuntar un número.
  const identidad = await app.query(
    `SELECT current_user AS usuario, r.rolsuper, r.rolbypassrls
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const quien = identidad.rows[0] as { usuario: string; rolsuper: boolean; rolbypassrls: boolean };
  if (quien.usuario !== 'viajapro_app' || quien.rolsuper || quien.rolbypassrls) {
    throw new Error(
      `DATABASE_APP_URL conecta como "${quien.usuario}" (rolsuper=${quien.rolsuper}, ` +
        `rolbypassrls=${quien.rolbypassrls}). Tiene que ser viajapro_app, sin ninguno de los dos.`,
    );
  }

  for (const [id, slug] of [
    [TENANT_A, `fixture-aislamiento-${MARCA}-a`],
    [TENANT_B, `fixture-aislamiento-${MARCA}-b`],
    [TENANT_C, `fixture-aislamiento-${MARCA}-c`],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [id, slug, `Agencia ${slug}`],
    );
  }
});

afterAll(async () => {
  // **No es un `DELETE FROM tenants` y no puede serlo.** Lo era, y fallaba en silencio contra el
  // `RESTRICT` de `enrutamiento_canales` hacia `cuentas_whatsapp`: los tres tenants de fixture
  // sobrevivían y la corrida siguiente reventaba con `duplicate key` en DIECISIETE aserciones
  // que no tenían nada que ver con el aislamiento. Un rojo que parece una fuga y es higiene.
  //
  // `borrarTenants` descubre el orden de borrado en vez de codificarlo, así que una migración
  // nueva no vuelve a romperlo.
  await admin.query('BEGIN');
  await borrarTenants(admin, [TENANT_A, TENANT_B, TENANT_C]);
  await admin.query('COMMIT');
  await admin.end();
  await app.end();
});

describe('aislamiento entre tenants', () => {
  it('ninguna tabla de negocio queda desprotegida', async () => {
    // La vista lista tablas sin tenant_id, sin RLS, sin RLS forzada, sin política,
    // o con política sin WITH CHECK. Cualquiera de esas es un defecto bloqueante.
    const { rows } = await admin.query(
      'SELECT tabla, problema FROM tablas_sin_aislamiento WHERE problema IS NOT NULL',
    );
    expect(rows, `Tablas desprotegidas: ${JSON.stringify(rows)}`).toEqual([]);
  });

  it('el rol de aplicación NO puede saltarse RLS', async () => {
    // Si este rol tuviera BYPASSRLS, todas las demás pruebas pasarían sin probar nada.
    const { rows } = await app.query(
      'SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('un tenant no ve los contactos de otro', async () => {
    await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, '+573001110001', 'Cliente de A', now(), now())`,
        [TENANT_A],
      ),
    );

    const vistosPorB = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM contactos WHERE telefono_e164 = $1', ['+573001110001']),
    );

    expect(vistosPorB.rowCount).toBe(0);

    const vistosPorA = await comoTenant(TENANT_A, (c) =>
      c.query('SELECT id FROM contactos WHERE telefono_e164 = $1', ['+573001110001']),
    );
    expect(vistosPorA.rowCount).toBe(1);
  });

  it('un tenant NO puede escribir una fila con el tenant_id de otro', async () => {
    // Esto es lo que verifica WITH CHECK. Sin él, la inserción pasaría: el tenant A
    // no podría leer la fila, pero la habría creado dentro de los datos de B.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO contactos (id, tenant_id, telefono_e164, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, '+573002220002', now(), now())`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un tenant no puede modificar ni borrar filas de otro', async () => {
    const actualizados = await comoTenant(TENANT_B, (c) =>
      c.query("UPDATE contactos SET nombre = 'Secuestrado' WHERE telefono_e164 = $1", [
        '+573001110001',
      ]),
    );
    expect(actualizados.rowCount).toBe(0);

    const borrados = await comoTenant(TENANT_B, (c) =>
      c.query('DELETE FROM contactos WHERE telefono_e164 = $1', ['+573001110001']),
    );
    expect(borrados.rowCount).toBe(0);

    const sigueIntacto = await comoTenant(TENANT_A, (c) =>
      c.query('SELECT nombre FROM contactos WHERE telefono_e164 = $1', ['+573001110001']),
    );
    expect(sigueIntacto.rows[0]?.nombre).toBe('Cliente de A');
  });

  it('dos agencias pueden tener el mismo teléfono de cliente', async () => {
    // La unicidad del teléfono es POR TENANT, nunca global. Dos agencias distintas
    // atienden al mismo viajero y ninguna debe enterarse de la otra.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, '+573001110001', 'Mismo viajero, otra agencia', now(), now())`,
          [TENANT_B],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('sin contexto de tenant no se ve absolutamente nada', async () => {
    // Si el interceptor falla en fijar app.current_tenant, el sistema debe quedarse
    // ciego, no abrirse. Es un fallo ruidoso y por eso preferible.
    const { rowCount } = await app.query('SELECT id FROM contactos');
    expect(rowCount).toBe(0);
  });
});

// =============================================================================
// ADR-0008 — aserciones 8 a 25
// =============================================================================

/**
 * Los tres roles de aplicación, declarados en el repositorio.
 *
 * El literal existe por la misma razón que el de `excepciones_rls`: la vista
 * `roles_de_login_vigilados` gobierna seis aserciones, y un rol que desaparece de la vista
 * desaparecía también del lado esperado de la 20, que recalculaba su expectativa
 * filtrándola por el conjunto que audita. **25/25 en verde con el aislamiento perdido.**
 * Con el literal, que un rol salga de la vigilancia es rojo.
 */
const ROLES_DE_APLICACION = ['viajapro_app', 'viajapro_altas', 'viajapro_webhook'] as const;

/** Las cuatro tablas globales del ADR. `recepciones_webhook_changes` es la tabla hija. */
const TABLAS_GLOBALES_ADR_0008 = [
  'enrutamiento_canales',
  'enrutamiento_historial',
  'recepciones_webhook',
  'recepciones_webhook_changes',
] as const;

/**
 * El literal de la aserción 11.
 *
 * Vive AQUÍ, en el repositorio, y no en la base, y esa es toda su razón de ser: la
 * aserción 10 compara los privilegios reales contra lo que declara `excepciones_rls`, y
 * esa declaración es una tabla. Quien pudiera escribirla haría que la 10 aprobara
 * cualquier configuración — y además el siguiente despliegue concedería esos privilegios
 * por sí solo, porque `001` aplica lo que esa tabla diga. Con firma de legitimidad.
 *
 * **Añadir una excepción tiene que poner esta prueba en rojo.** Es la mitad del valor del
 * mecanismo: la otra mitad es que, una vez revisada, editar esta lista sea un cambio
 * visible en un diff que alguien aprueba.
 */
const EXCEPCIONES_DECLARADAS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['_prisma_migrations', 'viajapro_altas', []],
  ['_prisma_migrations', 'viajapro_app', []],
  ['_prisma_migrations', 'viajapro_webhook', []],
  ['enrutamiento_canales', 'viajapro_altas', []],
  ['enrutamiento_canales', 'viajapro_app', []],
  ['enrutamiento_canales', 'viajapro_webhook', []],
  ['enrutamiento_historial', 'viajapro_altas', []],
  ['enrutamiento_historial', 'viajapro_app', []],
  ['enrutamiento_historial', 'viajapro_webhook', []],
  ['excepciones_rls', 'viajapro_altas', []],
  ['excepciones_rls', 'viajapro_app', []],
  ['excepciones_rls', 'viajapro_webhook', []],
  ['monedas', 'viajapro_altas', ['SELECT']],
  ['monedas', 'viajapro_app', ['SELECT']],
  ['monedas', 'viajapro_webhook', ['SELECT']],
  ['recepciones_webhook', 'viajapro_altas', []],
  ['recepciones_webhook', 'viajapro_app', []],
  ['recepciones_webhook', 'viajapro_webhook', []],
  ['recepciones_webhook_changes', 'viajapro_altas', []],
  ['recepciones_webhook_changes', 'viajapro_app', []],
  ['recepciones_webhook_changes', 'viajapro_webhook', []],
  ['tenants', 'viajapro_altas', ['SELECT']],
  ['tenants', 'viajapro_app', ['SELECT']],
  ['tenants', 'viajapro_webhook', ['SELECT']],
];

/**
 * El detector de la aserción 17: tablas con datos de agencia que nadie aísla.
 *
 * «Datos de agencia» por el DATO y no por el nombre: una columna que es foránea hacia
 * `tenants`, o que se llama `tenant%`. Las particiones se juzgan por su raíz, igual que en
 * `tablas_sin_aislamiento`: es la raíz la que está —o no— en `excepciones_rls`.
 */
async function tablasConDatosDeAgenciaSinRlsForzada(
  cliente: Client,
): Promise<Array<{ tabla: string; columnas: string[] }>> {
  const { rows } = await cliente.query(
    `WITH RECURSIVE raices AS (
       SELECT c.oid, c.relname AS raiz
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
       UNION ALL
       SELECT h.inhrelid, r.raiz FROM pg_inherits h JOIN raices r ON r.oid = h.inhparent
     )
     SELECT c.relname AS tabla, array_agg(a.attname::text ORDER BY a.attname) AS columnas
       FROM raices r
       JOIN pg_class c ON c.oid = r.oid
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE (a.attname LIKE 'tenant%'
             OR EXISTS (SELECT 1 FROM pg_constraint k
                         WHERE k.contype = 'f' AND k.conrelid = c.oid
                           AND k.confrelid = 'public.tenants'::regclass
                           AND a.attnum = ANY (k.conkey)))
        AND NOT EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = r.raiz)
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
      GROUP BY c.relname
      ORDER BY 1`,
  );
  return rows as Array<{ tabla: string; columnas: string[] }>;
}

/**
 * El barrido de la aserción 54: foráneas entre dos tablas que tienen `tenant_id` en las que
 * el `tenant_id` de la hija no se empareja, en la misma posición, con el `tenant_id` del padre.
 */
const FORANEAS_SIN_TENANT_SQL = `
  SELECT DISTINCT t.relname AS hija, c.conname, p.relname AS padre
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class p ON p.oid = c.confrelid
    JOIN pg_attribute ta ON ta.attrelid = c.conrelid AND ta.attname = 'tenant_id'
                        AND ta.attnum > 0 AND NOT ta.attisdropped
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attname = 'tenant_id'
                        AND pa.attnum > 0 AND NOT pa.attisdropped
   WHERE c.contype = 'f' AND n.nspname = 'public'
     AND NOT EXISTS (
       SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
        WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
     )
   ORDER BY 1, 2`;

/**
 * La tabla de §1.3 del ADR, que es normativa. La aserción 20 la compara entrada por
 * entrada y **en ambos sentidos**: ni falta ni sobra un EXECUTE.
 *
 * Los dos propietarios quedan fuera a propósito: tienen EXECUTE por propiedad.
 */
const MATRIZ_FUNCIONES: Readonly<Record<string, readonly string[]>> = {
  resolver_enrutamiento: ['viajapro_webhook'],
  registrar_enrutamiento: ['viajapro_altas'],
  registrar_recepcion: ['viajapro_app'],
  tomar_recepcion: ['viajapro_webhook'],
  anular_payload: ['viajapro_webhook'],
  purgar_recepciones: ['viajapro_webhook'],
  // Séptima. La añadió la auditoría de implementación: sin ella, un `change` que agota
  // sus reintentos conservaba el contenido para siempre.
  purgar_payloads: ['viajapro_webhook'],
  // Octava, y SIN ningún EXECUTE: es la función del disparador que lleva la baja de un canal
  // al directorio (tarea 4f). Es SECURITY DEFINER y escribe el directorio, así que entra en
  // la matriz como las demás: un GRANT sobre ella sería un camino nuevo hacia la peor tabla.
  propagar_estado_canal: [],
  // Novena: el relay de barrido (ADR-0010, punto 9). Solo identificadores y antigüedad; la
  // ejecuta el trabajador, que es quien vuelve a encolar.
  listar_changes_pendientes: ['viajapro_webhook'],
};

const PROPIETARIO_ESPERADO: Readonly<Record<string, string>> = {
  resolver_enrutamiento: 'viajapro_enrutador',
  registrar_enrutamiento: 'viajapro_enrutador',
  registrar_recepcion: 'viajapro_staging',
  tomar_recepcion: 'viajapro_staging',
  anular_payload: 'viajapro_staging',
  purgar_recepciones: 'viajapro_staging',
  purgar_payloads: 'viajapro_staging',
  propagar_estado_canal: 'viajapro_enrutador',
  listar_changes_pendientes: 'viajapro_staging',
};

/**
 * Cómo se escribe en cada tabla global. Las aserciones 8 y 9 son las únicas de
 * COMPORTAMIENTO, y cubrían una sola de las cuatro: `recepciones_webhook`, que contiene
 * PII de viajeros de varias agencias, estaba cubierta solo por comparación de catálogo.
 */
const ESCRITURAS_POR_TABLA: Readonly<Record<string, readonly string[]>> = {
  enrutamiento_canales: [
    "INSERT INTO enrutamiento_canales (clave_canal_hmac, tenant_resuelto_id, estado, pimienta_version) VALUES ('\\x00'::bytea, '00000000-0000-7000-8000-000000000000', 'ACTIVO', 1)",
    "UPDATE enrutamiento_canales SET tenant_resuelto_id = '00000000-0000-7000-8000-000000000000'",
    'DELETE FROM enrutamiento_canales',
  ],
  enrutamiento_historial: [
    "INSERT INTO enrutamiento_historial (canal_id, clave_canal_hmac, pimienta_version, tenant_nuevo, estado_nuevo, motivo) VALUES ('00000000-0000-7000-8000-000000000000', '\\x00'::bytea, 1, '00000000-0000-7000-8000-000000000000', 'ACTIVO', 'x')",
    "UPDATE enrutamiento_historial SET motivo = 'alterado'",
    'DELETE FROM enrutamiento_historial',
  ],
  recepciones_webhook: [
    "INSERT INTO recepciones_webhook (recepcion_id, clave_version) VALUES ('\\x00'::bytea, 1)",
    'UPDATE recepciones_webhook SET payload_cifrado = NULL',
    'DELETE FROM recepciones_webhook',
  ],
  recepciones_webhook_changes: [
    "INSERT INTO recepciones_webhook_changes (recepcion_id, indice) VALUES ('\\x00'::bytea, 0)",
    "UPDATE recepciones_webhook_changes SET estado = 'PROCESADO'",
    'DELETE FROM recepciones_webhook_changes',
  ],
};

/**
 * Las recepciones que creó ESTA corrida. `recepciones_webhook` es global (sin tenant), así que
 * el único acotado posible del desmontaje es por identificador: se registra aquí cada una.
 */
const RECEPCIONES_DE_LA_CORRIDA: Buffer[] = [];
function nuevaRecepcion(): Buffer {
  const id = randomBytes(32);
  RECEPCIONES_DE_LA_CORRIDA.push(id);
  return id;
}

/**
 * `purgar_recepciones` y `purgar_payloads` son GLOBALES por diseño: actúan sobre toda fila con
 * `recibido_en` anterior al plazo, sea de quien sea. Con un plazo en el futuro —lo que hacían las
 * aserciones 18 y «extra»— barren las recepciones de cualquier otra corrida (y las de la e2e de
 * inbox) a mitad de su prueba. Por eso estas dos aserciones: (1) envejecen SU recepción dos días
 * y purgan con un plazo de un día, de modo que solo tocan filas viejas; y (2) corren bajo un
 * bloqueo consultivo de sesión, porque dos corridas que a la vez barren «lo viejo» se robarían
 * una la fila de la otra. El bloqueo cubre solo estos dos bloques.
 */
const CLAVE_BLOQUEO_PURGA = 7_410_023;
async function conPurgaExclusiva(cliente: Client, fn: () => Promise<void>): Promise<void> {
  await cliente.query('SELECT pg_advisory_lock($1)', [CLAVE_BLOQUEO_PURGA]);
  try {
    await fn();
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [CLAVE_BLOQUEO_PURGA]);
  }
}
const plazoDePurga = () => new Date(Date.now() - 86_400_000);
async function envejecer(cliente: Client, recepcionId: Buffer): Promise<void> {
  const { rowCount } = await cliente.query(
    "UPDATE recepciones_webhook SET recibido_en = now() - interval '2 days' WHERE recepcion_id = $1",
    [recepcionId],
  );
  expect(rowCount, 'no se pudo envejecer la recepción de la prueba').toBe(1);
}

/** Clave fija del bloqueo que serializa entre corridas el único bloque que reescribe grants. */
const CLAVE_BLOQUEO_REAPLICACION = 7_410_022;

const ident = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;

const rutaPolicies = fileURLToPath(new URL('../prisma/policies/', import.meta.url));
const rutaMigraciones = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));

/** Los roles de login que el mecanismo vigila. Enumerados, nunca listados. */
async function rolesVigilados(cliente: Client): Promise<string[]> {
  const { rows } = await cliente.query('SELECT rolname FROM roles_de_login_vigilados ORDER BY 1');
  return rows.map((r) => r.rolname as string);
}

/**
 * Lo vigilado MÁS lo declarado.
 *
 * Las aserciones de comportamiento se hacen sobre esta unión y no sobre la vista: si un
 * rol declarado se cayera de la vigilancia, seguiría probándose su comportamiento y la
 * prueba se pondría en rojo en vez de encogerse hasta coincidir con el daño.
 */
async function rolesAVigilar(cliente: Client): Promise<string[]> {
  const vigilados = await rolesVigilados(cliente);
  const existentes = await cliente.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [
    [...ROLES_DE_APLICACION],
  ]);
  const declarados = existentes.rows.map((r) => r.rolname as string);
  return [...new Set([...vigilados, ...declarados])].sort();
}

/** Ejecuta con el rol puesto. Es la única forma de probar COMPORTAMIENTO y no catálogo. */
async function comoRol<T>(cliente: Client, rol: string, fn: () => Promise<T>): Promise<T> {
  await cliente.query('BEGIN');
  try {
    await cliente.query(`SET LOCAL ROLE ${ident(rol)}`);
    return await fn();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

/**
 * Espera 42501 (permiso denegado). Cualquier otro resultado —incluido el éxito— es rojo.
 *
 * Va con punto de guardado porque un error deja la transacción abortada y la siguiente
 * sentencia devolvería 25P02 en vez del 42501 que se busca: la prueba pasaría a comprobar
 * otra cosa sin avisar.
 */
async function esperarPermisoDenegado(
  cliente: Client,
  accion: () => Promise<unknown>,
  contexto: string,
) {
  let codigo: string | undefined;
  await cliente.query('SAVEPOINT intento');
  try {
    await accion();
    await cliente.query('RELEASE SAVEPOINT intento');
  } catch (error) {
    codigo = (error as { code?: string }).code;
    await cliente.query('ROLLBACK TO SAVEPOINT intento');
  }
  expect(codigo, `${contexto}: se esperaba 42501 y se obtuvo ${codigo ?? 'ningún error'}`).toBe(
    '42501',
  );
}

/**
 * Ejecuta una sentencia con el rol puesto y confirma. Las seis funciones de ADR-0008 NO
 * son ejecutables por el rol de migraciones —ni siquiera por él—, así que la prueba tiene
 * que ponerse el rol de cada camino, igual que harán los tres procesos.
 */
async function conRol(rol: string, sql: string, params: unknown[] = []) {
  await admin.query('BEGIN');
  try {
    await admin.query(`SET LOCAL ROLE ${ident(rol)}`);
    const resultado = await admin.query(sql, params as never[]);
    await admin.query('COMMIT');
    return resultado;
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

// --- Las cuatro comprobaciones reutilizables ---------------------------------
//
// Viven en funciones porque las aserciones 22 y 23 las vuelven a ejecutar: la 22 tras
// reaplicar `001` y `002`, la 23 tras levantar la cadena completa de migraciones en una
// base nueva. La 22 atrapa la regresión que ya sabemos que existe; la 23 atrapa la que
// todavía no se ha escrito. No se sustituyen.

/** 8 — leer las tablas globales está prohibido para todo rol de login. */
async function comprobarLecturaDenegada(cliente: Client) {
  const roles = await rolesAVigilar(cliente);
  expect(roles.length, 'la enumeración de roles no puede quedar vacía').toBeGreaterThan(0);
  for (const rol of roles) {
    await comoRol(cliente, rol, async () => {
      for (const tabla of TABLAS_GLOBALES_ADR_0008) {
        await esperarPermisoDenegado(
          cliente,
          () => cliente.query(`SELECT * FROM ${tabla}`),
          `SELECT sobre ${tabla} como ${rol}`,
        );
      }
    });
  }
}

/** 9 — escribir las tablas globales está prohibido para todo rol de login. */
async function comprobarEscrituraDenegada(cliente: Client) {
  const roles = await rolesAVigilar(cliente);
  for (const rol of roles) {
    await comoRol(cliente, rol, async () => {
      for (const [tabla, sentencias] of Object.entries(ESCRITURAS_POR_TABLA)) {
        for (const sentencia of sentencias) {
          await esperarPermisoDenegado(
            cliente,
            () => cliente.query(sentencia),
            `${sentencia.split(' ')[0]} sobre ${tabla} como ${rol}`,
          );
        }
      }
    });
  }
}

/** 10 — los privilegios reales coinciden EXACTAMENTE con lo declarado. */
async function comprobarPrivilegiosDeclarados(cliente: Client) {
  const { rows } = await cliente.query(`
    WITH RECURSIVE arbol AS (
      SELECT c.oid, c.relname AS raiz
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
        AND c.relname IN (SELECT DISTINCT tabla FROM excepciones_rls)
      UNION ALL
      SELECT h.inhrelid, a.raiz FROM pg_inherits h JOIN arbol a ON a.oid = h.inhparent
    )
    SELECT a.raiz,
           a.oid::regclass::text AS objetivo,
           v.rolname,
           COALESCE(e.privilegios, '{}'::text[]) AS declarados,
           (SELECT array_agg(p ORDER BY p)
              FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
             WHERE has_table_privilege(v.rolname, a.oid, p)) AS reales
    FROM arbol a
    CROSS JOIN roles_de_login_vigilados v
    LEFT JOIN excepciones_rls e ON e.tabla = a.raiz AND e.rol = v.rolname
    ORDER BY 2, 3
  `);

  expect(rows.length, 'no se comprobó ningún par (tabla, rol)').toBeGreaterThan(0);

  const desviaciones = rows
    .map((r) => ({
      objetivo: r.objetivo as string,
      rol: r.rolname as string,
      declarados: [...((r.declarados as string[]) ?? [])].sort(),
      reales: [...((r.reales as string[] | null) ?? [])].sort(),
    }))
    .filter((r) => JSON.stringify(r.declarados) !== JSON.stringify(r.reales));

  expect(
    desviaciones,
    `Privilegios que no coinciden con lo declarado: ${JSON.stringify(desviaciones)}`,
  ).toEqual([]);
}

/** 20 — la matriz rol × función, exacta en ambos sentidos. */
async function comprobarMatrizDeFunciones(cliente: Client) {
  const roles = await rolesAVigilar(cliente);
  const { rows } = await cliente.query(
    `SELECT p.proname, p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY($1)`,
    [Object.keys(MATRIZ_FUNCIONES)],
  );
  expect(rows.map((r) => r.proname as string).sort()).toEqual(Object.keys(MATRIZ_FUNCIONES).sort());

  const real: Record<string, string[]> = {};
  for (const fila of rows) {
    const concedidos: string[] = [];
    for (const rol of roles) {
      const { rows: r } = await cliente.query(
        'SELECT has_function_privilege($1, $2::oid, $3) AS puede',
        [rol, fila.oid, 'EXECUTE'],
      );
      if (r[0]?.puede) concedidos.push(rol);
    }
    real[fila.proname as string] = concedidos.sort();
  }

  // La expectativa es el literal, SIN filtrar por los roles que se acaban de enumerar.
  // Filtrarla era el defecto: si `viajapro_altas` desaparecía de la vigilancia, lo
  // esperado para `registrar_enrutamiento` pasaba a `[]` y lo real también.
  const esperada = Object.fromEntries(
    Object.entries(MATRIZ_FUNCIONES).map(([f, r]) => [f, [...r].sort()]),
  );

  expect(
    real,
    'la matriz rol × función no coincide con la tabla normativa de ADR-0008 §1.3',
  ).toEqual(esperada);
}

describe('ADR-0008 — directorio de enrutamiento, staging y separación de roles', () => {
  // Identificadores nuevos en cada corrida: el historial del directorio NO se puede
  // borrar —ese es justamente su valor probatorio— así que una prueba que reutilizara
  // claves acabaría chocando con sus propios asientos.
  const cuentaA = randomUUID();
  const cuentaB = randomUUID();
  const cuentaC = randomUUID();
  const canalA = randomUUID();
  const canalB = randomUUID();
  const canalC = randomUUID();
  const claveA = randomBytes(32);
  const claveB = randomBytes(32);
  const claveC = randomBytes(32);
  /** Fila de tipo WABA: `canal_id` nulo, `cuenta_id` relleno. */
  const claveWabaA = randomBytes(32);
  /** Para la aserción 46: un canal que se da de baja a mitad de la prueba. */
  const cuentaRevocada = randomUUID();
  const canalRevocado = randomUUID();
  const claveRevocada = randomBytes(32);

  /** Lo que haría el camino de alta tras el canje del `code`: escribir en el directorio. */
  async function registrar(
    tenant: string,
    clave: Buffer,
    canal: string | null,
    cuenta: string,
    estado = 'ACTIVO',
  ) {
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_altas"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
      await admin.query(
        'SELECT registrar_enrutamiento($1, $2::smallint, $3, $4, $5, $6::estado_enrutamiento, NULL, $7)',
        [clave, 1, tenant, canal, cuenta, estado, 'alta de prueba'],
      );
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
  }

  beforeAll(async () => {
    for (const [tenant, cuenta, canal, sufijo] of [
      [TENANT_A, cuentaA, canalA, '1'],
      [TENANT_B, cuentaB, canalB, '2'],
      [TENANT_C, cuentaC, canalC, '3'],
    ] as const) {
      await admin.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
         VALUES ($1, $2, $3, $4, now())`,
        [cuenta, tenant, `waba-prueba-${sufijo}-${cuenta.slice(0, 8)}`, 'WABA de prueba'],
      );
      await admin.query(
        `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [canal, tenant, cuenta, `pn-${canal.slice(0, 8)}`, `+5730011100${sufijo}`],
      );
    }

    await registrar(TENANT_A, claveA, canalA, cuentaA);
    await registrar(TENANT_B, claveB, canalB, cuentaB);
    await registrar(TENANT_C, claveC, canalC, cuentaC);
    // La fila de gestión: sin canal, con cuenta. Ejercita la restricción de exclusividad
    // y la clave foránea compuesta nueva por el camino bueno.
    await registrar(TENANT_A, claveWabaA, null, cuentaA);
  }, 60_000);

  afterAll(async () => {
    // El directorio se limpia con el rol de su dueño: nadie más tiene DELETE sobre él.
    // El historial NO se limpia, y no es un olvido: ningún rol puede borrarlo. Es el
    // invariante que lo hace probatorio, y la prueba lo paga dejando sus asientos.
    await admin.query('SET ROLE "viajapro_enrutador"');
    await admin.query('DELETE FROM enrutamiento_canales WHERE clave_canal_hmac = ANY($1)', [
      [claveA, claveB, claveC, claveWabaA, claveRevocada],
    ]);
    await admin.query('RESET ROLE');
    await admin.query('SET ROLE "viajapro_staging"');
    // Acotado a las recepciones de ESTA corrida: la tabla es global y otras corridas (de la
    // suite o de la e2e de inbox) tienen filas en ella a la vez. Un DELETE sin WHERE les
    // borraba las suyas a mitad de prueba.
    await admin.query('DELETE FROM recepciones_webhook WHERE recepcion_id = ANY($1)', [
      [...RECEPCIONES_DE_LA_CORRIDA],
    ]);
    await admin.query('RESET ROLE');
    await admin.query('DELETE FROM canales WHERE id = ANY($1)', [
      [canalA, canalB, canalC, canalRevocado],
    ]);
    await admin.query('DELETE FROM cuentas_whatsapp WHERE id = ANY($1)', [
      [cuentaA, cuentaB, cuentaC, cuentaRevocada],
    ]);
  }, 60_000);

  it('extra — los tres roles de aplicación declarados están realmente vigilados', async () => {
    // El contrapeso del literal. La vista gobierna seis aserciones, así que un rol que
    // se cae de ella las vacía de contenido sin dejarlas en rojo: basta un
    // `ALTER ROLE viajapro_app CREATEDB` con el predicado anterior. Esto lo pone rojo.
    const vigilados = await rolesVigilados(admin);
    const existentes = (
      await admin.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1) ORDER BY 1', [
        [...ROLES_DE_APLICACION],
      ])
    ).rows.map((r) => r.rolname as string);

    expect(existentes, 'faltan roles de aplicación en la base').toEqual(
      [...ROLES_DE_APLICACION].sort(),
    );
    const fuera = existentes.filter((rol) => !vigilados.includes(rol));
    expect(
      fuera,
      `Roles de aplicación fuera de roles_de_login_vigilados: ${JSON.stringify(fuera)}. ` +
        'Reciben privilegios que nadie revoca y seis aserciones dejan de preguntar por ellos.',
    ).toEqual([]);
  });

  // Va PRIMERA a propósito: la aserción 22 reaplica `001` y `002`, lo que **repara** la
  // vista de roles. Puesta después, una degradación real del predicado quedaba curada
  // antes de que nadie preguntara por ella, y la prueba pasaba en verde.
  it('8 — ningún rol de login puede LEER el directorio', async () => {
    // Es la prueba clave: es de COMPORTAMIENTO, no de catálogo, así que falla sin
    // importar cómo se concedió el privilegio. Y al enumerar los roles desde pg_roles
    // atrapa también al que se cree mañana y que nadie declaró.
    await comprobarLecturaDenegada(admin);
  }, 60_000);

  it('9 — ningún rol de login puede ESCRIBIR el directorio', async () => {
    // Repuntar un número hacia otro tenant es la peor primitiva del sistema después de
    // BYPASSRLS. Solo se llega por registrar_enrutamiento, y solo con viajapro_altas.
    await comprobarEscrituraDenegada(admin);
  }, 60_000);

  it('10 — los privilegios reales coinciden exactamente con lo declarado', async () => {
    // No enumera tablas: compara contra una declaración. Por eso sobrevive al paso del
    // tiempo y no hay que acordarse de actualizarla cuando aparezca una tabla global.
    // Incluye las particiones: son tablas con su propia lista de permisos, y revocar
    // sobre la tabla particionada sin tocarlas deja la partición abierta de par en par.
    await comprobarPrivilegiosDeclarados(admin);
  }, 60_000);

  it('11 — la declaración de excepciones es exactamente la del repositorio', async () => {
    const { rows } = await admin.query(
      'SELECT tabla, rol, privilegios FROM excepciones_rls ORDER BY tabla, rol',
    );
    const real = rows.map((r) => [
      r.tabla as string,
      r.rol as string,
      [...(r.privilegios as string[])].sort(),
    ]);
    const esperado = EXCEPCIONES_DECLARADAS.map(([t, r, p]) => [t, r, [...p].sort()]);

    expect(
      real,
      'excepciones_rls no coincide con el literal del archivo de prueba. Si la diferencia ' +
        'es legítima, hay que editar EXCEPCIONES_DECLARADAS a mano: que eso sea un cambio ' +
        'visible en un diff es el punto.',
    ).toEqual(esperado);
  });

  it('12 — PUBLIC no puede ejecutar ninguna de las seis funciones', async () => {
    // PostgreSQL concede EXECUTE a PUBLIC en toda función nueva sin que nadie escriba un
    // GRANT. Con PUBLIC reteniéndolo sobre purgar_recepciones o anular_payload, cualquier
    // rol borra evidencia y mensajes sin procesar.
    const { rows } = await admin.query(
      `SELECT p.proname, has_function_privilege('public', p.oid, 'EXECUTE') AS publico
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1) ORDER BY 1`,
      [Object.keys(MATRIZ_FUNCIONES)],
    );
    expect(
      rows.length,
      'faltan funciones de ADR-0008: eran seis, la auditoría de implementación añadió purgar_payloads, la tarea 4f propagar_estado_canal y el relay de barrido listar_changes_pendientes',
    ).toBe(9);
    expect(rows.filter((r) => r.publico)).toEqual([]);
  });

  it('13 — las seis tienen search_path VACÍO y el propietario que les toca', async () => {
    // Comprobar la PRESENCIA de search_path aprobaría `SET search_path = public`, que es
    // justo la implementación que §1.4 rechaza por insegura. Se comprueba el VALOR.
    const { rows } = await admin.query(
      `SELECT p.proname, p.proconfig, pg_get_userbyid(p.proowner) AS dueno, p.prosecdef
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1) ORDER BY 1`,
      [Object.keys(MATRIZ_FUNCIONES)],
    );
    expect(rows.length).toBe(9);

    for (const fila of rows) {
      const config = (fila.proconfig as string[] | null) ?? [];
      const entrada = config.find((c) => c.startsWith('search_path='));
      expect(entrada, `${fila.proname} no fija search_path`).toBeDefined();
      // PostgreSQL guarda la cadena vacía como search_path="" .
      const valor = (entrada ?? '').slice('search_path='.length).replace(/"/g, '');
      expect(valor, `${fila.proname} tiene search_path no vacío`).toBe('');
      expect(fila.prosecdef, `${fila.proname} no es SECURITY DEFINER`).toBe(true);
      expect(fila.dueno, `${fila.proname} tiene el propietario equivocado`).toBe(
        PROPIETARIO_ESPERADO[fila.proname as string],
      );
    }
  });

  it('14 — los dos propietarios no son credenciales ni se saltan RLS', async () => {
    const { rows } = await admin.query(
      `SELECT rolname, rolcanlogin, rolbypassrls, rolsuper,
              EXISTS (SELECT 1 FROM pg_roles s WHERE s.rolname = 'neon_superuser')
                AND pg_has_role(rolname, 'neon_superuser', 'MEMBER') AS hereda_neon
       FROM pg_roles WHERE rolname IN ('viajapro_enrutador','viajapro_staging') ORDER BY 1`,
    );
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.rolcanlogin, `${r.rolname} puede iniciar sesión`).toBe(false);
      expect(r.rolbypassrls, `${r.rolname} tiene BYPASSRLS`).toBe(false);
      expect(r.rolsuper, `${r.rolname} es superusuario`).toBe(false);
      expect(r.hereda_neon, `${r.rolname} hereda neon_superuser`).toBe(false);
    }
  });

  it('15 — reclamar la clave de otro tenant se rechaza y la fila no se mueve', async () => {
    // La comprobación de app.current_tenant dentro de la función es de CONSISTENCIA, no
    // una frontera: el GUC lo fija el propio rol. Que esté, importa igual — sin ella, el
    // camino legítimo del alta podría cruzar tenants por un error de programación.
    await expect(registrar(TENANT_A, claveB, canalA, cuentaA)).rejects.toThrow(
      /pertenece a otro tenant|la cuenta ya está asignada/i,
    );

    const { rows } = await admin.query(
      'SELECT tenant_resuelto_id FROM enrutamiento_canales WHERE clave_canal_hmac = $1',
      [claveB],
    );
    expect(rows[0]?.tenant_resuelto_id).toBe(TENANT_B);
  });

  it('16 (mitad de base de datos) — un POST con tres changes de tres tenants no cruza ni un mensaje', async () => {
    // AVISO EXPLÍCITO, para que nadie lo dé por hecho: esta es la MITAD de base de datos
    // de la aserción 16. El ADR la exige "a través de la cola real", porque el defecto
    // que nombra —BullMQ descartando en silencio dos de tres trabajos con el mismo
    // identificador— vive en el deduplicador de la cola, no aquí. Esa mitad depende del
    // relay y del trabajador, que son la tarea 4b, y NO está cubierta todavía.
    //
    // Lo que sí queda probado aquí es lo que el esquema puede sostener: que el grano del
    // estado de proceso es el `change` y no el POST, que los tres identificadores de
    // trabajo son distintos, que el payload NO se anula hasta que los tres están
    // resueltos, y que cada escritura aterriza bajo su tenant sin ver a los otros dos.
    const recepcionId = nuevaRecepcion();
    const nuevo = await conRol(
      'viajapro_app',
      `SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 3::smallint) AS nueva`,
      [recepcionId, randomBytes(64), randomBytes(12), randomBytes(16)],
    );
    expect(nuevo.rows[0]?.nueva, 'la recepción debería ser nueva').toBe(true);

    // Reintento de Meta con el mismo cuerpo: la misma recepción, sin duplicar hijos.
    const repetido = await conRol(
      'viajapro_app',
      `SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 3::smallint) AS nueva`,
      [recepcionId, randomBytes(64), randomBytes(12), randomBytes(16)],
    );
    expect(repetido.rows[0]?.nueva).toBe(false);

    const { rows: hijos } = await admin.query(
      'SELECT indice, estado FROM recepciones_webhook_changes WHERE recepcion_id = $1 ORDER BY indice',
      [recepcionId],
    );
    expect(hijos.map((h) => h.indice as number)).toEqual([0, 1, 2]);

    // El identificador del trabajo es `recepcion_id:indice`. Distinto por change: ese es
    // el punto de RV-1, y con un identificador por POST serían tres iguales.
    const jobIds = hijos.map((h) => `${recepcionId.toString('hex')}:${h.indice}`);
    expect(new Set(jobIds).size).toBe(3);

    const reparto = [
      { indice: 0, tenant: TENANT_A, clave: claveA, telefono: '+573009990001' },
      { indice: 1, tenant: TENANT_B, clave: claveB, telefono: '+573009990002' },
      { indice: 2, tenant: TENANT_C, clave: claveC, telefono: '+573009990003' },
    ];

    for (const paso of reparto) {
      // 1. El trabajador toma SU change, por su identificador exacto.
      const tomado = await conRol(
        'viajapro_webhook',
        'SELECT * FROM tomar_recepcion($1, $2::smallint)',
        [recepcionId, paso.indice],
      );
      expect(tomado.rows[0]?.payload_cifrado, 'el contenido debe seguir ahí').not.toBeNull();

      // 2. Resuelve el tenant de ESE change. Nunca uno por petición.
      const resuelto = await conRol('viajapro_webhook', 'SELECT * FROM resolver_enrutamiento($1)', [
        paso.clave,
      ]);
      expect(resuelto.rows[0]?.tenant_resuelto_id).toBe(paso.tenant);

      // 3. Escribe bajo RLS, con el tenant resuelto y con el rol del trabajador.
      await admin.query('BEGIN');
      await admin.query('SET LOCAL ROLE "viajapro_webhook"');
      await admin.query("SELECT set_config('app.current_tenant', $1, true)", [paso.tenant]);
      await admin.query(
        `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, $2, 'Entrante de WhatsApp', now(), now())`,
        [paso.tenant, paso.telefono],
      );
      await admin.query('COMMIT');

      // 4. Anula incondicionalmente: la condición "¿era el último?" se resuelve dentro de
      //    una sola sentencia, nunca comprobando y decidiendo fuera.
      await conRol(
        'viajapro_webhook',
        'SELECT anular_payload($1, $2::smallint, $3::estado_change_recepcion)',
        [recepcionId, paso.indice, 'PROCESADO'],
      );

      const { rows: estado } = await admin.query(
        'SELECT payload_cifrado FROM recepciones_webhook WHERE recepcion_id = $1',
        [recepcionId],
      );
      const esElUltimo = paso.indice === 2;
      if (esElUltimo) {
        expect(
          estado[0]?.payload_cifrado,
          'el contenido debe borrarse al resolver el último',
        ).toBeNull();
      } else {
        expect(
          estado[0]?.payload_cifrado,
          'anular con changes pendientes habría borrado mensajes de otras agencias',
        ).not.toBeNull();
      }
    }

    // Y ninguno ve los de los otros.
    for (const paso of reparto) {
      const visibles = await comoTenant(paso.tenant, (c) =>
        c.query('SELECT telefono_e164 FROM contactos WHERE telefono_e164 LIKE $1', ['+57300999%']),
      );
      expect(visibles.rows.map((r) => r.telefono_e164 as string)).toEqual([paso.telefono]);
    }
  }, 60_000);

  it('17 — toda tabla con datos de agencia fuera de excepciones_rls tiene RLS forzada, y toda excepción tiene motivo', async () => {
    // Contraprueba primero: el detector tiene que ver una tabla que guarda datos de agencia
    // bajo otro nombre, sin RLS y sin excepción —lo que la versión anterior dejaba pasar—.
    // Se planta dentro de una transacción que se deshace: no queda nada en la base.
    await admin.query('BEGIN');
    try {
      await admin.query(
        'CREATE TABLE contraprueba_17 (id uuid PRIMARY KEY, tenant_x uuid REFERENCES tenants (id))',
      );
      const plantada = await tablasConDatosDeAgenciaSinRlsForzada(admin);
      expect(plantada, 'el detector de la 17 no ve una tabla con tenant_x sin RLS').toContainEqual({
        tabla: 'contraprueba_17',
        columnas: ['tenant_x'],
      });
    } finally {
      await admin.query('ROLLBACK');
    }

    // **Por el dato, no por el nombre.** La versión anterior solo preguntaba si una tabla
    // global tenía una columna llamada `tenant_id`, y una tabla que guardase datos de agencia
    // bajo otro nombre —`tenant_resuelto_id`, `tenant_acceso_id`— la pasaba sin más. Ahora:
    // toda tabla (y toda partición, juzgada por su raíz) que NO esté en `excepciones_rls` y
    // tenga una columna que referencie `tenants` o se llame `tenant%` tiene RLS habilitada y
    // forzada. La 1 no lo cubre: mira solo la columna `tenant_id`.
    const sinRls = await tablasConDatosDeAgenciaSinRlsForzada(admin);
    expect(
      sinRls,
      `Tablas con datos de agencia, fuera de excepciones_rls y sin RLS forzada: ${JSON.stringify(sinRls)}`,
    ).toEqual([]);

    // Una excepción sin razón escrita no es una excepción, es un agujero con nombre.
    const sinMotivo = await admin.query(
      `SELECT tabla, rol FROM excepciones_rls
        WHERE motivo IS NULL OR btrim(motivo) = '' ORDER BY 1, 2`,
    );
    expect(sinMotivo.rows, 'excepciones_rls con motivo vacío').toEqual([]);

    // Lo de antes sigue valiendo: si una tabla global tuviera `tenant_id`, el aplicador
    // dirigido por datos le pondría RLS y volvería a ser ilegible sin contexto —el ciclo
    // huevo-gallina de vuelta, en producción y sin error—. `excepciones_rls` entra en la
    // cuenta: son CUATRO, y la regla de parada de Consecuencias se apoya en ese número.
    const tablas = [...TABLAS_GLOBALES_ADR_0008, 'excepciones_rls'];
    const { rows } = await admin.query(
      `SELECT c.relname,
              EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                        AND a.attnum > 0 AND NOT a.attisdropped) AS tiene_tenant_id,
              EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = c.relname) AS declarada
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1) ORDER BY 1`,
      [tablas],
    );
    expect(rows.length, 'falta alguna de las tablas globales').toBe(tablas.length);
    for (const r of rows) {
      expect(r.tiene_tenant_id, `${r.relname} tiene una columna tenant_id`).toBe(false);
      expect(r.declarada, `${r.relname} no está declarada en excepciones_rls`).toBe(true);
    }
  });

  it('54 — ninguna foránea entre dos tablas con tenant_id deja fuera el tenant', async () => {
    // La integridad referencial se evalúa POR ENCIMA de RLS: el `WITH CHECK` valida el
    // `tenant_id` de la fila nueva y nadie valida el del padre. Una foránea simple deja
    // colgar una fila de una agencia de la fila de otra si alguien escribe el id cruzado.
    // Barrido del catálogo entero, no lista de tablas: la que se cree mañana entra sola.
    const { rows } = await admin.query(FORANEAS_SIN_TENANT_SQL);
    expect(
      rows.map((r) => `${r.hija}.${r.conname} -> ${r.padre}`),
      'Foráneas entre tablas de tenant que no incluyen tenant_id',
    ).toEqual([]);
  });

  it('18 — la purga no borra una recepción con algún change sin resolver', async () => {
    // Borrar un evento no procesado es destruir la evidencia del fallo.
    const recepcionId = nuevaRecepcion();
    await conRol(
      'viajapro_app',
      'SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 2::smallint)',
      [recepcionId, randomBytes(32), randomBytes(12), randomBytes(16)],
    );
    await conRol(
      'viajapro_webhook',
      'SELECT anular_payload($1, 0::smallint, $2::estado_change_recepcion)',
      [recepcionId, 'PROCESADO'],
    );

    await envejecer(admin, recepcionId);
    await conPurgaExclusiva(admin, async () => {
      const plazo = plazoDePurga();
      await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [plazo]);

      const { rowCount } = await admin.query(
        'SELECT 1 FROM recepciones_webhook WHERE recepcion_id = $1',
        [recepcionId],
      );
      expect(rowCount, 'se purgó una recepción con un change pendiente').toBe(1);

      // Resuelto el segundo, ya es purgable.
      await conRol(
        'viajapro_webhook',
        'SELECT anular_payload($1, 1::smallint, $2::estado_change_recepcion)',
        [recepcionId, 'CLASIFICADO'],
      );
      await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [plazo]);
      const despues = await admin.query(
        'SELECT 1 FROM recepciones_webhook WHERE recepcion_id = $1',
        [recepcionId],
      );
      expect(despues.rowCount).toBe(0);
    });
  });

  it('19 — un evento desconocido o revocado deja el payload en NULL y la fila intacta', async () => {
    // Un mensaje con nombre, teléfono y a veces pasaporte, almacenado sin aislamiento y
    // sin responsable del tratamiento identificable, no puede quedarse siete días.
    const recepcionId = nuevaRecepcion();
    await conRol(
      'viajapro_app',
      'SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 1::smallint)',
      [recepcionId, randomBytes(32), randomBytes(12), randomBytes(16)],
    );
    await conRol(
      'viajapro_webhook',
      'SELECT anular_payload($1, 0::smallint, $2::estado_change_recepcion)',
      [recepcionId, 'CLASIFICADO'],
    );

    const { rows } = await admin.query(
      'SELECT recepcion_id, payload_cifrado, payload_nonce, payload_tag, anulado_en FROM recepciones_webhook WHERE recepcion_id = $1',
      [recepcionId],
    );
    expect(rows.length, 'el recepcion_id debe permanecer: sostiene la idempotencia').toBe(1);
    expect(rows[0]?.payload_cifrado).toBeNull();
    expect(rows[0]?.payload_nonce).toBeNull();
    expect(rows[0]?.payload_tag).toBeNull();
    expect(rows[0]?.anulado_en).not.toBeNull();
  });

  it('20 — la matriz rol × función es exacta en ambos sentidos', async () => {
    // Sin esto, un `GRANT EXECUTE ON ALL FUNCTIONS ... TO viajapro_app` añadido para
    // desatascar un despliegue reabre el crítico 2 entero y las demás siguen en verde.
    await comprobarMatrizDeFunciones(admin);
  }, 60_000);

  it('21 — ningún rol de login puede crear objetos en el esquema public', async () => {
    // Es la mitad complementaria del search_path vacío: con el vacío nadie secuestra una
    // referencia, y sin CREATE nadie siembra el objeto con el que intentarlo.
    const roles = await rolesVigilados(admin);
    const { rows } = await admin.query(
      `SELECT rolname, has_schema_privilege(rolname, 'public', 'CREATE') AS puede
       FROM unnest($1::text[]) AS rolname`,
      [roles],
    );
    expect(rows.filter((r) => r.puede)).toEqual([]);
  });

  it('22 — reaplicar 001 y 002 completos no reconcede nada', async () => {
    // La regresión concreta que YA existió dos veces en este repositorio: el aplicador de
    // políticas volviendo a conceder lo que otra migración había revocado, sin error.
    // Reaplicar es DDL global sobre roles, funciones y tablas (GRANT/REVOKE/CREATE POLICY): dos
    // corridas a la vez toman las mismas filas del catálogo en distinto orden y Postgres
    // aborta a una por bloqueo mutuo (40P01). No es una fuga ni una carrera de datos: es
    // exclusión mutua que faltaba. Se serializa con un bloqueo consultivo de transacción,
    // fijo y SOLO aquí; se suelta solo en COMMIT/ROLLBACK. Sin reintentos.
    await admin.query('BEGIN');
    try {
      await admin.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_BLOQUEO_REAPLICACION]);
      for (const archivo of ['001-aislamiento-tenant.sql', '002-rol-aplicacion.sql']) {
        const sql = readFileSync(`${rutaPolicies}${archivo}`, 'utf8');
        await admin.query(sql);
      }
      await admin.query('COMMIT');
    } catch (e) {
      await admin.query('ROLLBACK');
      throw e;
    }

    await comprobarLecturaDenegada(admin);
    await comprobarEscrituraDenegada(admin);
    await comprobarPrivilegiosDeclarados(admin);
    await comprobarMatrizDeFunciones(admin);
  }, 180_000);

  it('23 — la cadena completa de migraciones desde cero deja el mismo resultado', async () => {
    // La 22 atrapa la regresión que ya sabemos que existe; esta atrapa la CLASE: una
    // tercera migración que escriba su propio `GRANT ... ON ALL TABLES` o
    // `ON ALL FUNCTIONS` —que es el idioma de este repositorio— y que la 22 no vería.
    const base = `viajapro_cadena_${randomBytes(6).toString('hex')}`;
    const destino = new URL(URL_ADMIN);
    destino.pathname = `/${base}`;

    await admin.query(`CREATE DATABASE ${ident(base)}`);
    const nueva = new Client({ connectionString: destino.toString() });
    try {
      await nueva.connect();
      // Prisma la crea sola; aquí los archivos se aplican directamente, así que hay que
      // ponerla a mano: `excepciones_rls` la declara y la aserción 10 la comprueba.
      await nueva.query(`
        CREATE TABLE "_prisma_migrations" (
          id varchar(36) PRIMARY KEY,
          checksum varchar(64) NOT NULL,
          finished_at timestamptz,
          migration_name varchar(255) NOT NULL,
          logs text,
          rolled_back_at timestamptz,
          started_at timestamptz NOT NULL DEFAULT now(),
          applied_steps_count integer NOT NULL DEFAULT 0
        )`);

      const migraciones = readdirSync(rutaMigraciones)
        .filter((d) => !d.endsWith('.toml'))
        .sort();
      expect(migraciones.length, 'no se encontró ninguna migración').toBeGreaterThan(0);
      for (const m of migraciones) {
        await nueva.query(readFileSync(`${rutaMigraciones}${m}/migration.sql`, 'utf8'));
      }

      await comprobarLecturaDenegada(nueva);
      await comprobarEscrituraDenegada(nueva);
      await comprobarPrivilegiosDeclarados(nueva);
      await comprobarMatrizDeFunciones(nueva);
    } finally {
      await nueva.end().catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS ${ident(base)} WITH (FORCE)`);
    }
  }, 300_000);

  it('24 — nadie puede modificar ni borrar el historial, ni su propietario, ni por partición', async () => {
    // Un GRANT sobrante lo haría editable y el valor probatorio desaparecería sin ninguna
    // señal. La retención a cinco años no necesita DELETE: suelta particiones anuales.
    //
    // **Y se enumeran las particiones.** Preguntar solo por el padre no bastaba:
    // PostgreSQL comprueba los privilegios de la tabla particionada cuando se accede a
    // través de ella y NUNCA los de la partición, así que una partición nueva —que nace
    // con UPDATE y DELETE para los tres roles por las default privileges— habría dejado
    // `UPDATE enrutamiento_historial_2028 SET tenant_nuevo = '<atacante>'` abierto con la
    // aserción en verde.
    const { rows: objetivos } = await admin.query(`
      WITH RECURSIVE arbol AS (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'enrutamiento_historial'
        UNION ALL
        SELECT h.inhrelid FROM pg_inherits h JOIN arbol a ON a.oid = h.inhparent
      )
      SELECT a.oid::regclass::text AS nombre FROM arbol a ORDER BY 1
    `);
    expect(
      objetivos.length,
      'el historial debe estar particionado: si no hay particiones, la retención por años no existe',
    ).toBeGreaterThan(1);

    const roles = [...(await rolesAVigilar(admin)), 'viajapro_enrutador', 'viajapro_staging'];
    for (const rol of roles) {
      await comoRol(admin, rol, async () => {
        for (const objetivo of objetivos) {
          const tabla = objetivo.nombre as string;
          await esperarPermisoDenegado(
            admin,
            () => admin.query(`UPDATE ${tabla} SET motivo = 'alterado'`),
            `UPDATE sobre ${tabla} como ${rol}`,
          );
          await esperarPermisoDenegado(
            admin,
            () => admin.query(`DELETE FROM ${tabla}`),
            `DELETE sobre ${tabla} como ${rol}`,
          );
        }
      });
    }
  }, 120_000);

  it('extra — un change sin resolver no condena el contenido a quedarse para siempre', async () => {
    // El contenido se anula cuando no queda ningún change pendiente, y la purga se niega
    // —con razón— a borrar una recepción con alguno pendiente. Las dos juntas producían un
    // tercer comportamiento que nadie decidió: un change que agota sus reintentos dejaba
    // datos personales de viajeros de varias agencias en una tabla sin RLS, indefinidamente.
    const recepcionId = nuevaRecepcion();
    await conRol(
      'viajapro_app',
      'SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 2::smallint)',
      [recepcionId, randomBytes(32), randomBytes(12), randomBytes(16)],
    );
    await conRol(
      'viajapro_webhook',
      'SELECT anular_payload($1, 0::smallint, $2::estado_change_recepcion)',
      [recepcionId, 'PROCESADO'],
    );

    await envejecer(admin, recepcionId);
    await conPurgaExclusiva(admin, async () => {
      const atascado = await admin.query(
        'SELECT payload_cifrado FROM recepciones_webhook WHERE recepcion_id = $1',
        [recepcionId],
      );
      expect(
        atascado.rows[0]?.payload_cifrado,
        'con un change pendiente el contenido sigue ahí',
      ).not.toBeNull();

      const plazo = plazoDePurga();
      const anulados = await conRol('viajapro_webhook', 'SELECT purgar_payloads($1) AS n', [plazo]);
      expect(Number(anulados.rows[0]?.n)).toBeGreaterThan(0);

      const { rows } = await admin.query(
        `SELECT r.payload_cifrado,
              (SELECT count(*) FROM recepciones_webhook_changes c
                WHERE c.recepcion_id = r.recepcion_id AND c.estado = 'PENDIENTE') AS pendientes
       FROM recepciones_webhook r WHERE r.recepcion_id = $1`,
        [recepcionId],
      );
      expect(
        rows.length,
        'la fila y su recepcion_id se conservan: la evidencia no se destruye',
      ).toBe(1);
      expect(rows[0]?.payload_cifrado).toBeNull();
      expect(
        Number(rows[0]?.pendientes),
        'el change sin resolver sigue marcado como pendiente',
      ).toBe(1);

      // Y la purga de filas sigue respetando lo no resuelto (invariante de la 18 intacto).
      await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [plazo]);
      const sigue = await admin.query('SELECT 1 FROM recepciones_webhook WHERE recepcion_id = $1', [
        recepcionId,
      ]);
      expect(sigue.rowCount).toBe(1);
    });
  }, 60_000);

  it('extra — dos trabajadores que terminan a la vez SÍ anulan el contenido', async () => {
    // La carrera que C-3 pedía cerrar es entre dos TRANSACCIONES, no entre dos sentencias.
    // Sin el `FOR UPDATE` sobre la fila padre, bajo READ COMMITTED cada trabajador ve el
    // change del otro como PENDIENTE —su instantánea no ve lo no confirmado—, el UPDATE no
    // toca filas, no toma bloqueo, y NINGUNO anula: el contenido sobrevive hasta la purga,
    // treinta días en vez de minutos. Es el único plazo que decide la legalidad del
    // apartado, así que no puede depender de una carrera.
    const recepcionId = nuevaRecepcion();
    await conRol(
      'viajapro_app',
      'SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, 2::smallint)',
      [recepcionId, randomBytes(32), randomBytes(12), randomBytes(16)],
    );

    const w1 = new Client({ connectionString: URL_ADMIN });
    const w2 = new Client({ connectionString: URL_ADMIN });
    await w1.connect();
    await w2.connect();
    try {
      await w1.query('BEGIN');
      await w1.query('SET LOCAL ROLE "viajapro_webhook"');
      await w1.query('SELECT anular_payload($1, 0::smallint, $2::estado_change_recepcion)', [
        recepcionId,
        'PROCESADO',
      ]);

      await w2.query('BEGIN');
      await w2.query('SET LOCAL ROLE "viajapro_webhook"');
      // No se espera todavía: con el bloqueo sobre la fila padre esta llamada se queda
      // esperando a que W1 confirme. Sin él, devolvería en el acto y sin anular nada.
      const enEspera = w2.query(
        'SELECT anular_payload($1, 1::smallint, $2::estado_change_recepcion)',
        [recepcionId, 'PROCESADO'],
      );

      await w1.query('COMMIT');
      await enEspera;
      await w2.query('COMMIT');

      const { rows } = await admin.query(
        'SELECT payload_cifrado, anulado_en FROM recepciones_webhook WHERE recepcion_id = $1',
        [recepcionId],
      );
      expect(
        rows[0]?.payload_cifrado,
        'ninguno de los dos trabajadores anuló el contenido: la carrera sigue abierta',
      ).toBeNull();
      expect(rows[0]?.anulado_en).not.toBeNull();
    } finally {
      await w1.end().catch(() => undefined);
      await w2.end().catch(() => undefined);
    }
  }, 60_000);

  it('extra — un token cifrado a medias no es representable', async () => {
    // Nada distinguía un BYTEA cifrado de uno con el token en claro: un atajo de
    // depuración incumplía R6 sin romper ninguna restricción.
    const cuenta = randomUUID();
    await expect(
      admin.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, token_cifrado, actualizado_en)
         VALUES ($1, $2, $3, '\\xdeadbeef'::bytea, now())`,
        [cuenta, TENANT_A, `waba-medias-${cuenta.slice(0, 8)}`],
      ),
    ).rejects.toThrow(/cuentas_whatsapp_token_completo/);

    await expect(
      admin.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, token_cifrado, token_nonce, token_tag, clave_version, actualizado_en)
         VALUES ($1, $2, $3, '\\xdeadbeef'::bytea, '\\x0102'::bytea, '\\xaa'::bytea, 1, now())`,
        [cuenta, TENANT_A, `waba-nonce-${cuenta.slice(0, 8)}`],
      ),
    ).rejects.toThrow(/cuentas_whatsapp_nonce_96_bits/);
  });

  it('25 — el motor rechaza emparejar un tenant con el canal de otro', async () => {
    // Una clave foránea escrita simple en vez de compuesta sigue funcionando y nadie lo
    // nota hasta que una fila cruza tenants.
    let codigo: string | undefined;
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_enrutador"');
      await admin.query(
        `INSERT INTO enrutamiento_canales (clave_canal_hmac, tenant_resuelto_id, canal_id, estado, pimienta_version)
         VALUES ($1, $2, $3, 'ACTIVO', 1)`,
        [randomBytes(32), TENANT_A, canalB],
      );
    } catch (error) {
      codigo = (error as { code?: string }).code;
    } finally {
      await admin.query('ROLLBACK');
    }
    expect(codigo, 'se esperaba una violación de clave foránea (23503)').toBe('23503');
  });

  it('25bis — el motor rechaza emparejar un tenant con la CUENTA de otro', async () => {
    // Simétrica de la 25, y la que faltaba. Las filas WABA son las que gobiernan todos
    // los eventos de gestión, y eran las únicas sin respaldo del motor: su única defensa
    // era una comprobación contra el último asiento del historial, que no existe la
    // primera vez. Un defecto en el camino de alta bastaba para quedarse con los eventos
    // de plantillas y de cuenta de una agencia ajena.
    let codigo: string | undefined;
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_enrutador"');
      await admin.query(
        `INSERT INTO enrutamiento_canales (clave_canal_hmac, tenant_resuelto_id, cuenta_id, estado, pimienta_version)
         VALUES ($1, $2, $3, 'ACTIVO', 1)`,
        [randomBytes(32), TENANT_A, cuentaB],
      );
    } catch (error) {
      codigo = (error as { code?: string }).code;
    } finally {
      await admin.query('ROLLBACK');
    }
    expect(codigo, 'se esperaba una violación de clave foránea (23503)').toBe('23503');

    // Y una fila no puede ser de las dos clases a la vez ni de ninguna.
    let codigoCheck: string | undefined;
    await admin.query('BEGIN');
    try {
      await admin.query('SET LOCAL ROLE "viajapro_enrutador"');
      await admin.query(
        `INSERT INTO enrutamiento_canales (clave_canal_hmac, tenant_resuelto_id, canal_id, cuenta_id, estado, pimienta_version)
         VALUES ($1, $2, $3, $4, 'ACTIVO', 1)`,
        [randomBytes(32), TENANT_A, canalA, cuentaA],
      );
    } catch (error) {
      codigoCheck = (error as { code?: string }).code;
    } finally {
      await admin.query('ROLLBACK');
    }
    expect(codigoCheck, 'se esperaba una violación de CHECK (23514)').toBe('23514');
  });

  it('46 — un canal REVOCADO en canales se resuelve como REVOCADO, y la agencia no lo reactiva', async () => {
    // Tarea 4f. Dar de baja un canal es un UPDATE sobre `canales` hecho por la API; si no
    // llega al directorio, el trabajador sigue viendo ACTIVO y persiste mensajes de una
    // agencia sin contrato. Fixture propio: el canal revocado no puede contaminar al resto.
    await admin.query(
      `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, actualizado_en)
       VALUES ($1, $2, $3, 'WABA revocable', now())`,
      [cuentaRevocada, TENANT_A, `waba-prueba-r-${cuentaRevocada.slice(0, 8)}`],
    );
    await admin.query(
      `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, actualizado_en)
       VALUES ($1, $2, $3, $4, '+573001110009', now())`,
      [canalRevocado, TENANT_A, cuentaRevocada, `pn-${canalRevocado.slice(0, 8)}`],
    );
    await registrar(TENANT_A, claveRevocada, canalRevocado, cuentaRevocada);

    const resolver = async () =>
      (
        await conRol('viajapro_webhook', 'SELECT estado FROM resolver_enrutamiento($1)', [
          claveRevocada,
        ])
      ).rows.map((r) => r.estado as string);
    expect(await resolver(), 'el alta de prueba debía resolver ACTIVO').toEqual(['ACTIVO']);

    // La baja, por el camino real: la API, con su rol y su contexto de tenant.
    const baja = await comoTenant(TENANT_A, (c) =>
      c.query("UPDATE canales SET estado = 'REVOCADO', revocado_en = now() WHERE id = $1", [
        canalRevocado,
      ]),
    );
    expect(baja.rowCount).toBe(1);
    expect(await resolver(), 'un canal revocado no puede resolverse como ACTIVO').toEqual([
      'REVOCADO',
    ]);

    // Y la propagación es monótona: devolver el canal a ACTIVO desde la API no reactiva el
    // ruteo. Reactivar es repuntar, y eso solo lo hace registrar_enrutamiento.
    await comoTenant(TENANT_A, (c) =>
      c.query("UPDATE canales SET estado = 'ACTIVO', revocado_en = NULL WHERE id = $1", [
        canalRevocado,
      ]),
    );
    expect(await resolver(), 'la API no puede reactivar el ruteo de un número').toEqual([
      'REVOCADO',
    ]);

    // El cambio dejó su asiento: un cambio del directorio sin historial es indemostrable.
    const asientos = await conRol(
      'viajapro_enrutador',
      `SELECT estado_anterior, estado_nuevo, tenant_nuevo FROM enrutamiento_historial
       WHERE canal_id = $1 ORDER BY ocurrido_en`,
      [canalRevocado],
    );
    const filas = asientos.rows as {
      estado_anterior: string | null;
      estado_nuevo: string;
      tenant_nuevo: string;
    }[];
    expect(filas.map((r) => [r.estado_anterior, r.estado_nuevo, r.tenant_nuevo])).toEqual([
      [null, 'ACTIVO', TENANT_A],
      ['ACTIVO', 'REVOCADO', TENANT_A],
    ]);
  });

  it('53 — el barrido lista solo identificadores, solo para el trabajador y con límite', async () => {
    // ADR-0010, punto 9. La tabla es global y guarda contenido de varias agencias: lo que
    // devuelva esta función lo ve cualquiera que tenga la cadena del trabajador, así que la
    // forma del resultado es la frontera. Ni payload ni tenant: solo lo que hace falta para
    // reconstruir el `jobId` y decidir si toca reencolar.
    const firma = await admin.query(
      `SELECT pg_get_function_result(p.oid) AS resultado,
              pg_get_function_identity_arguments(p.oid) AS argumentos
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'listar_changes_pendientes'`,
    );
    expect(firma.rows.length, 'listar_changes_pendientes no existe o está sobrecargada').toBe(1);
    expect(firma.rows[0]?.resultado).toBe(
      'TABLE(recepcion_id bytea, indice smallint, antiguedad_s integer)',
    );
    expect(firma.rows[0]?.argumentos).toBe('p_antiguedad_minima_s integer, p_limite integer');

    // Solo el trabajador. La 20 lo mira en el catálogo; esto lo mira en el comportamiento.
    for (const rol of ['viajapro_app', 'viajapro_altas']) {
      await expect(
        conRol(rol, 'SELECT * FROM listar_changes_pendientes(30, 10)'),
        `${rol} pudo listar los changes pendientes`,
      ).rejects.toThrow(/permission denied/i);
    }

    // Tres recepciones de esta corrida, envejecidas diez minutos y no dos días: así ninguna
    // purga de otra corrida (plazo de un día) las alcanza a mitad de la prueba.
    const vieja = nuevaRecepcion(); // dos changes: el 0 se procesa, el 1 queda pendiente
    const fresca = nuevaRecepcion(); // pendiente, pero recién llegada
    const anulada = nuevaRecepcion(); // pendiente y vieja, pero sin contenido que procesar
    for (const [id, total] of [
      [vieja, 2],
      [fresca, 1],
      [anulada, 1],
    ] as const) {
      await conRol(
        'viajapro_app',
        'SELECT registrar_recepcion($1, $2, $3, $4, 1::smallint, $5::smallint)',
        [id, randomBytes(32), randomBytes(12), randomBytes(16), total],
      );
    }
    await conRol(
      'viajapro_webhook',
      'SELECT anular_payload($1, 0::smallint, $2::estado_change_recepcion)',
      [vieja, 'PROCESADO'],
    );
    await admin.query(
      "UPDATE recepciones_webhook SET recibido_en = now() - interval '10 minutes' WHERE recepcion_id = ANY($1)",
      [[vieja, anulada]],
    );
    await admin.query(
      `UPDATE recepciones_webhook
          SET payload_cifrado = NULL, payload_nonce = NULL, payload_tag = NULL, anulado_en = now()
        WHERE recepcion_id = $1`,
      [anulada],
    );

    const { rows } = await conRol(
      'viajapro_webhook',
      'SELECT * FROM listar_changes_pendientes(30, 1000)',
    );
    for (const fila of rows as Record<string, unknown>[]) {
      expect(Object.keys(fila).sort(), 'el barrido devuelve algo más que identificadores').toEqual([
        'antiguedad_s',
        'indice',
        'recepcion_id',
      ]);
      expect(Number(fila.antiguedad_s)).toBeGreaterThanOrEqual(30);
    }
    const nuestras = rows
      .filter((f) => [vieja, fresca, anulada].some((id) => id.equals(f.recepcion_id as Buffer)))
      .map((f) => [(f.recepcion_id as Buffer).equals(vieja) ? 'vieja' : 'otra', Number(f.indice)]);
    expect(
      nuestras,
      'solo el change 1 de la vieja: ni el procesado, ni la fresca, ni la que ya no tiene contenido',
    ).toEqual([['vieja', 1]]);

    // El límite se respeta: hay al menos dos pendientes de esta corrida con antigüedad >= 0.
    const uno = await conRol('viajapro_webhook', 'SELECT * FROM listar_changes_pendientes(0, 1)');
    expect(uno.rows.length, 'el barrido no respeta el límite').toBe(1);

    // Y el límite es obligatorio y acotado: sin él, el barrido es un volcado.
    for (const [antiguedad, limite] of [
      [30, 0],
      [30, 1001],
      [30, null],
      [null, 10],
      [-1, 10],
    ] as const) {
      await expect(
        conRol('viajapro_webhook', 'SELECT * FROM listar_changes_pendientes($1, $2)', [
          antiguedad,
          limite,
        ]),
        `aceptó antigüedad ${antiguedad} y límite ${limite}`,
      ).rejects.toThrow(/listar_changes_pendientes/);
    }
  });
});
// =============================================================================
// CRM — aserciones 26 a 33
//
// Las cinco primeras son de AISLAMIENTO y son la parte donde no se recorta (§3.1 de
// CLAUDE.md): dos agencias, un intento de cruce, cero filas o error del motor. Las tres
// últimas son de integridad de la fila, y están aquí porque son la mitad de la regla de
// pérdida que la base puede sostener por sí sola.
//
// Cada una de estas aserciones se ha verificado POR MUTACIÓN: se rompe a propósito la
// política o la restricción que la sostiene y se comprueba que se pone en rojo. El
// procedimiento está automatizado en `scripts/verificar-por-mutacion.mjs`; una aserción
// que nadie ha visto fallar no está verificada.
// =============================================================================
describe('CRM — contactos, oportunidades y la ficha del panel lateral', () => {
  const etapaDe: Record<string, string> = {};
  const contactoDe: Record<string, string> = {};
  const oportunidadDe: Record<string, string> = {};

  beforeAll(async () => {
    for (const tenant of [TENANT_A, TENANT_B]) {
      await comoTenant(tenant, async (c) => {
        const etapa = await c.query(
          `INSERT INTO etapas_pipeline (id, tenant_id, nombre, clave, orden, creado_en)
           VALUES (gen_random_uuid(), $1, 'Nuevo lead', 'NUEVO_LEAD', 1, now())
           ON CONFLICT (tenant_id, orden) DO UPDATE SET nombre = EXCLUDED.nombre
           RETURNING id`,
          [tenant],
        );
        etapaDe[tenant] = (etapa.rows[0] as { id: string }).id;

        const contacto = await c.query(
          `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, etiquetas, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Cliente CRM', ARRAY['VIP'], now(), now())
           ON CONFLICT (tenant_id, telefono_e164) DO UPDATE SET nombre = EXCLUDED.nombre
           RETURNING id`,
          [tenant, tenant === TENANT_A ? '+573777000001' : '+573777000002'],
        );
        contactoDe[tenant] = (contacto.rows[0] as { id: string }).id;

        const oportunidad = await c.query(
          `INSERT INTO oportunidades
             (id, tenant_id, contacto_id, etapa_id, titulo, valor_estimado_unidades, moneda_iso,
              creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, 'Paquete San Andres Dic 2026', 910000000, 'COP',
                   now(), now())
           RETURNING id`,
          [tenant, contactoDe[tenant], etapaDe[tenant]],
        );
        oportunidadDe[tenant] = (oportunidad.rows[0] as { id: string }).id;
      });
    }
  });

  afterAll(async () => {
    // Antes que el `DELETE FROM tenants` del afterAll global: la clave foránea de
    // `oportunidades` hacia `etapas_pipeline` es RESTRICT, y el orden en que PostgreSQL
    // propaga dos cascadas hermanas no está definido.
    for (const tenant of [TENANT_A, TENANT_B]) {
      await comoTenant(tenant, async (c) => {
        await c.query('DELETE FROM oportunidades WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM notas_internas WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM consentimientos_contacto WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM contactos WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM etapas_pipeline WHERE tenant_id = $1', [tenant]);
      });
    }
  });

  it('26 — un tenant no ve ni puede escribir las oportunidades de otro', async () => {
    const vistas = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM oportunidades WHERE id = $1', [oportunidadDe[TENANT_A]]),
    );
    expect(vistas.rowCount).toBe(0);

    // Lo que verifica WITH CHECK: sin él, B crea una oportunidad DENTRO de los datos de A.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO oportunidades (id, tenant_id, contacto_id, etapa_id, titulo, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, 'Secuestro', now(), now())`,
          [TENANT_A, contactoDe[TENANT_A], etapaDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);

    const movidas = await comoTenant(TENANT_B, (c) =>
      c.query("UPDATE oportunidades SET titulo = 'Robada' WHERE id = $1", [
        oportunidadDe[TENANT_A],
      ]),
    );
    expect(movidas.rowCount).toBe(0);
  });

  it('27 — las notas internas de una agencia no existen para la otra', async () => {
    await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO notas_internas (id, tenant_id, contacto_id, texto, escrita_en)
         VALUES (gen_random_uuid(), $1, $2, 'Margen del 22%, no bajar de ahi', now())`,
        [TENANT_A, contactoDe[TENANT_A]],
      ),
    );

    const leidas = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT texto FROM notas_internas WHERE tenant_id = $1', [TENANT_A]),
    );
    expect(leidas.rowCount).toBe(0);

    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO notas_internas (id, tenant_id, contacto_id, texto, escrita_en)
           VALUES (gen_random_uuid(), $1, $2, 'Nota plantada', now())`,
          [TENANT_A, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);
  });

  it('28 — el consentimiento de una agencia no se lee ni se falsifica desde otra', async () => {
    await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO consentimientos_contacto
           (id, tenant_id, contacto_id, finalidad, prueba, canal, otorgado_en)
         VALUES (gen_random_uuid(), $1, $2, 'PROMOCIONAL', 'whatsapp:wamid.prueba', 'whatsapp', now())`,
        [TENANT_A, contactoDe[TENANT_A]],
      ),
    );

    const leidos = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT finalidad FROM consentimientos_contacto WHERE tenant_id = $1', [TENANT_A]),
    );
    expect(leidos.rowCount).toBe(0);

    // Falsificar un consentimiento promocional ajeno es, además de una fuga, la vía para
    // que a un número lo bloquee Meta por una campaña que su dueño nunca autorizó.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO consentimientos_contacto
             (id, tenant_id, contacto_id, finalidad, prueba, otorgado_en)
           VALUES (gen_random_uuid(), $1, $2, 'PROMOCIONAL', 'falsificado', now())`,
          [TENANT_A, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);
  });

  it('29 — el motor rechaza colgar una oportunidad del CONTACTO de otra agencia', async () => {
    // Esto NO lo impide RLS: la integridad referencial se comprueba por encima de las
    // políticas. Lo impide la clave foránea COMPUESTA (contacto_id, tenant_id).
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO oportunidades (id, tenant_id, contacto_id, etapa_id, titulo, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, 'Ficha ajena', now(), now())`,
          [TENANT_B, contactoDe[TENANT_A], etapaDe[TENANT_B]],
        ),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('30 — el motor rechaza mover una oportunidad a la ETAPA de otra agencia', async () => {
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query('UPDATE oportunidades SET etapa_id = $1 WHERE id = $2', [
          etapaDe[TENANT_A],
          oportunidadDe[TENANT_B],
        ]),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('31 — «OTRO» sin explicación no es un motivo, y lo rechaza la base', async () => {
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query("UPDATE oportunidades SET motivo_perdida = 'OTRO' WHERE id = $1", [
          oportunidadDe[TENANT_A],
        ]),
      ),
    ).rejects.toThrow(/oportunidades_motivo_otro_exige_nota/);

    // Con explicación, pasa.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `UPDATE oportunidades SET motivo_perdida = 'OTRO', nota_perdida = 'Se caso y aplazo el viaje'
           WHERE id = $1`,
          [oportunidadDe[TENANT_A]],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('32 — media próxima tarea no es representable', async () => {
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query("UPDATE oportunidades SET proxima_tarea_descripcion = 'Llamar' WHERE id = $1", [
          oportunidadDe[TENANT_A],
        ]),
      ),
    ).rejects.toThrow(/oportunidades_proxima_tarea_completa/);
  });

  it('33 — un importe sin moneda no es dinero', async () => {
    // R8: entero + ISO-4217, los dos o ninguno. El valor entra como BIGINT y vuelve intacto:
    // 9.100.000.000 centavos no caben en el entero seguro de JavaScript, y por eso el
    // contrato lo serializa como cadena.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query('UPDATE oportunidades SET moneda_iso = NULL WHERE id = $1', [
          oportunidadDe[TENANT_A],
        ]),
      ),
    ).rejects.toThrow(/oportunidades_valor_con_moneda/);

    const { rows } = await comoTenant(TENANT_A, (c) =>
      c.query('SELECT valor_estimado_unidades::text AS v FROM oportunidades WHERE id = $1', [
        oportunidadDe[TENANT_A],
      ]),
    );
    expect((rows[0] as { v: string }).v).toBe('910000000');
  });

  it('34 — las tres tablas del CRM tienen RLS forzada y política con WITH CHECK', async () => {
    const { rows } = await admin.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*) FROM pg_policy p
                WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
                  AND p.polwithcheck IS NOT NULL) AS con_check
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('contactos', 'oportunidades', 'notas_internas', 'consentimientos_contacto')`,
    );
    expect(rows).toHaveLength(4);
    for (const fila of rows as Array<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      con_check: string;
    }>) {
      expect(`${fila.relname}:${fila.relrowsecurity}`).toBe(`${fila.relname}:true`);
      expect(`${fila.relname}:${fila.relforcerowsecurity}`).toBe(`${fila.relname}:true`);
      expect(`${fila.relname}:${fila.con_check}`).toBe(`${fila.relname}:1`);
    }
  });
});
// =============================================================================
// INBOX — conversaciones, mensajes, adjuntos y el espejo de plantillas
//
// Aserciones 35 a 45. Las cuatro tablas nuevas son de negocio: una fuga aquí es una
// agencia leyendo las conversaciones privadas de otra, que es el peor escenario del
// producto porque es donde el viajero escribe su pasaporte.
//
// Todas estas aserciones se han verificado POR MUTACIÓN con
// `scripts/mutaciones-aislamiento.mjs`: se rompe la política a propósito y se comprueba
// que la prueba se pone roja. Una protección que no se puede poner en rojo no cuenta
// como protección.
// =============================================================================

/**
 * La expresión de aislamiento, LETRA POR LETRA, tal como la escribe
 * `aplicar_aislamiento_tenant`.
 *
 * Vive aquí, en el repositorio, por la misma razón que el literal de `excepciones_rls`
 * de la aserción 11: la vista `tablas_sin_aislamiento` deduce la forma canónica del
 * catálogo, de modo que si alguien rompiera la política de la tabla de referencia, la
 * «canónica» pasaría a ser la rota y la vista se quedaría muda. Este literal es el ancla
 * que impide que la referencia se mueva sin que nadie se entere.
 */
const EXPRESION_AISLAMIENTO_CANONICA =
  "(tenant_id = (NULLIF(current_setting('app.current_tenant'::text, true), ''::text))::uuid)";

const TABLAS_DEL_INBOX = ['conversaciones', 'mensajes', 'adjuntos', 'plantillas_whatsapp'] as const;

describe('Inbox — conversaciones, mensajes y el espejo de plantillas de Meta', () => {
  const cuentaDe: Record<string, string> = {};
  const canalDe: Record<string, string> = {};
  const contactoDe: Record<string, string> = {};
  const conversacionDe: Record<string, string> = {};
  const mensajeDe: Record<string, string> = {};
  const plantillaDe: Record<string, string> = {};

  beforeAll(async () => {
    for (const [i, tenant] of [TENANT_A, TENANT_B].entries()) {
      await comoTenant(tenant, async (c) => {
        const cuenta = await c.query(
          `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'WABA de prueba', now(), now())
           ON CONFLICT (tenant_id, waba_id) DO UPDATE SET nombre = EXCLUDED.nombre
           RETURNING id`,
          [tenant, `9000000000000${i}`],
        );
        cuentaDe[tenant] = (cuenta.rows[0] as { id: string }).id;

        const canal = await c.query(
          `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())
           ON CONFLICT (tenant_id, phone_number_id) DO UPDATE SET numero_e164 = EXCLUDED.numero_e164
           RETURNING id`,
          [tenant, cuentaDe[tenant], `8000000000000${i}`, `+5760000000${i}`],
        );
        canalDe[tenant] = (canal.rows[0] as { id: string }).id;

        const contacto = await c.query(
          `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Viajero del inbox', now(), now())
           ON CONFLICT (tenant_id, telefono_e164) DO UPDATE SET nombre = EXCLUDED.nombre
           RETURNING id`,
          [tenant, `+57366600000${i}`],
        );
        contactoDe[tenant] = (contacto.rows[0] as { id: string }).id;

        const conversacion = await c.query(
          `INSERT INTO conversaciones
             (id, tenant_id, contacto_id, canal_id, ultimo_mensaje_cliente_en,
              ultimo_mensaje_texto, ultimo_mensaje_en, ultimo_mensaje_direccion,
              creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, now(), 'Hola, quiero San Andres',
                   now(), 'ENTRANTE', now(), now())
           RETURNING id`,
          [tenant, contactoDe[tenant], canalDe[tenant]],
        );
        conversacionDe[tenant] = (conversacion.rows[0] as { id: string }).id;

        const mensaje = await c.query(
          `INSERT INTO mensajes
             (id, tenant_id, conversacion_id, direccion, tipo, estado, texto, wamid,
              ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'ENTREGADO',
                   $4, $3,
                   now(), now(), now())
           RETURNING id`,
          [
            tenant,
            conversacionDe[tenant],
            `wamid.COMPARTIDO.${i}`,
            `Mi pasaporte es AQ12345${i} y nazco el 1990-03-04`,
          ],
        );
        mensajeDe[tenant] = (mensaje.rows[0] as { id: string }).id;

        const plantilla = await c.query(
          `INSERT INTO plantillas_whatsapp
             (id, tenant_id, cuenta_id, nombre, idioma, categoria, estado, cuerpo,
              actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'recordatorio_pago', 'es_CO', 'UTILIDAD',
                   'APROBADA', 'Hola {{1}}, su anticipo vence el {{2}}.', now(), now(), now())
           RETURNING id`,
          [tenant, cuentaDe[tenant]],
        );
        plantillaDe[tenant] = (plantilla.rows[0] as { id: string }).id;
      });
    }
  });

  afterAll(async () => {
    // Orden explícito: `conversaciones -> canales` es RESTRICT, y el orden en que
    // PostgreSQL propaga dos cascadas hermanas no está definido.
    for (const tenant of [TENANT_A, TENANT_B]) {
      await comoTenant(tenant, async (c) => {
        await c.query('DELETE FROM adjuntos WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM mensajes WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM notas_internas WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM plantillas_whatsapp WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM conversaciones WHERE tenant_id = $1', [tenant]);
      });
      // `enrutamiento_canales` apunta a `canales` y a `cuentas_whatsapp` con RESTRICT, y es
      // tabla GLOBAL: el rol del tenant no la ve, asi que borrarla desde `comoTenant` no es
      // que falle — es que no encuentra nada y despues el `DELETE FROM canales` revienta.
      // Este es el fallo exacto por el que la rama volvio de la compuerta.
      await admin.query('BEGIN');
      await admin.query('SET LOCAL ROLE "viajapro_enrutador"');
      await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = $1', [tenant]);
      await admin.query('COMMIT');
      await comoTenant(tenant, async (c) => {
        await c.query('DELETE FROM canales WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM cuentas_whatsapp WHERE tenant_id = $1', [tenant]);
        await c.query('DELETE FROM contactos WHERE tenant_id = $1', [tenant]);
      });
    }
  });

  it('35 — las cuatro tablas del inbox tienen RLS habilitada, FORZADA y con WITH CHECK', async () => {
    const { rows } = await admin.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*) FROM pg_policy p
                WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
                  AND p.polwithcheck IS NOT NULL) AS con_check
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [TABLAS_DEL_INBOX],
    );
    expect(rows).toHaveLength(TABLAS_DEL_INBOX.length);
    for (const fila of rows as Array<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      con_check: string;
    }>) {
      expect(`${fila.relname}:${fila.relrowsecurity}`).toBe(`${fila.relname}:true`);
      expect(`${fila.relname}:${fila.relforcerowsecurity}`).toBe(`${fila.relname}:true`);
      expect(`${fila.relname}:${fila.con_check}`).toBe(`${fila.relname}:1`);
    }
  });

  it('36 — USING y WITH CHECK son la MISMA expresión canónica en TODA tabla de negocio', async () => {
    // EL PUNTO CIEGO QUE QUEDÓ SEÑALADO.
    //
    // Quitar `WITH CHECK` dejando `USING` no rompe nada: PostgreSQL reutiliza la
    // expresión. Lo que sí es una brecha —y pasaba todas las comprobaciones anteriores—
    // es un `WITH CHECK` PRESENTE pero DISTINTO: con `WITH CHECK (true)`, `polwithcheck`
    // no es NULL, la política existe, RLS está forzada, el catálogo está en verde, y
    // cualquier agencia puede INSERTAR filas dentro de los datos de otra.
    const { rows } = await admin.query(
      `SELECT c.relname AS tabla,
              pg_get_expr(p.polqual, p.polrelid)      AS usando,
              pg_get_expr(p.polwithcheck, p.polrelid) AS con_check,
              p.polcmd, p.polpermissive
         FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND p.polname = 'tenant_isolation'
        ORDER BY 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const f of rows as Array<{
      tabla: string;
      usando: string;
      con_check: string | null;
      polcmd: string;
      polpermissive: boolean;
    }>) {
      expect(`${f.tabla}:${f.usando}`).toBe(`${f.tabla}:${EXPRESION_AISLAMIENTO_CANONICA}`);
      expect(`${f.tabla}:${f.con_check}`).toBe(`${f.tabla}:${EXPRESION_AISLAMIENTO_CANONICA}`);
      // PERMISSIVE FOR ALL: una política FOR SELECT dejaría el INSERT sin filtrar.
      expect(`${f.tabla}:${f.polcmd}`).toBe(`${f.tabla}:*`);
      expect(`${f.tabla}:${f.polpermissive}`).toBe(`${f.tabla}:true`);
    }

    // Y la vista lo detecta, que es lo que mira la aserción 1 y lo que corre en CI.
    const defectos = await admin.query(
      'SELECT tabla, problema FROM tablas_sin_aislamiento WHERE problema IS NOT NULL',
    );
    expect(defectos.rows).toEqual([]);
  });

  it('37 — un tenant no ve ni puede escribir las conversaciones de otro', async () => {
    const vistas = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM conversaciones WHERE id = $1', [conversacionDe[TENANT_A]]),
    );
    expect(vistas.rowCount).toBe(0);

    // Lo que verifica WITH CHECK: sin él, B abre un hilo DENTRO de los datos de A.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
          [TENANT_A, contactoDe[TENANT_A], canalDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);

    const robadas = await comoTenant(TENANT_B, (c) =>
      c.query("UPDATE conversaciones SET estado = 'CERRADA' WHERE id = $1", [
        conversacionDe[TENANT_A],
      ]),
    );
    expect(robadas.rowCount).toBe(0);

    const borradas = await comoTenant(TENANT_B, (c) =>
      c.query('DELETE FROM conversaciones WHERE id = $1', [conversacionDe[TENANT_A]]),
    );
    expect(borradas.rowCount).toBe(0);
  });

  it('38 — el texto de un mensaje de otra agencia no existe, ni se puede plantar uno', async () => {
    // Aquí es donde el viajero escribe su pasaporte (R10). Es la fila más sensible.
    const leidos = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT texto FROM mensajes WHERE tenant_id = $1', [TENANT_A]),
    );
    expect(leidos.rowCount).toBe(0);

    // Ni siquiera por la búsqueda de la bandeja, que es la otra puerta a esa columna:
    // el número de pasaporte de un viajero de A no aparece buscándolo desde B. Se busca
    // el de A en concreto, no la palabra «pasaporte», porque B tiene el suyo y
    // encontrarlo sería el comportamiento correcto.
    const buscados = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM mensajes WHERE texto ILIKE $1', ['%AQ123450%']),
    );
    expect(buscados.rowCount).toBe(0);
    // Y desde A sí se encuentra: si no, la aserción anterior sería verde por vacío.
    const propios = await comoTenant(TENANT_A, (c) =>
      c.query('SELECT id FROM mensajes WHERE texto ILIKE $1', ['%AQ123450%']),
    );
    expect(propios.rowCount).toBe(1);

    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, wamid, ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'Mensaje plantado', 'wamid.PLANTADO', now(), now(), now())`,
          [TENANT_A, conversacionDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);

    // Y los adjuntos, que son la otra mitad del mensaje: la media de WhatsApp lleva
    // fotos de pasaporte con la misma frecuencia que el texto lleva su número.
    await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO adjuntos (id, tenant_id, mensaje_id, tipo, clave_objeto, descargado_en, creado_en)
         VALUES (gen_random_uuid(), $1, $2, 'DOCUMENTO', $3, now(), now())`,
        [TENANT_A, mensajeDe[TENANT_A], `${TENANT_A}/media/pasaporte.pdf`],
      ),
    );
    const adjuntosAjenos = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT clave_objeto FROM adjuntos WHERE tenant_id = $1', [TENANT_A]),
    );
    expect(adjuntosAjenos.rowCount).toBe(0);
  });

  it('39 — el motor rechaza colgar una conversación del CONTACTO o del CANAL de otra agencia', async () => {
    // Esto NO lo impide RLS: la integridad referencial se comprueba por encima de las
    // políticas. Lo impiden las claves foráneas COMPUESTAS. Es el mismo agujero que se
    // cerró en `oportunidades`, y aquí hay dos: el contacto y el canal.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
          [TENANT_B, contactoDe[TENANT_A], canalDe[TENANT_B]],
        ),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);

    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query('UPDATE conversaciones SET canal_id = $1 WHERE id = $2', [
          canalDe[TENANT_A],
          conversacionDe[TENANT_B],
        ]),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);

    // Y un mensaje no puede colgar del hilo de otra agencia.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, wamid, ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'wamid.HILO.AJENO', now(), now(), now())`,
          [TENANT_B, conversacionDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('40 — el mismo wamid no entra dos veces en la misma agencia, y sí en otra (R5)', async () => {
    // Meta reintenta hasta recibir 200, y también cuando el 200 se perdió de vuelta.
    // Sin esta unicidad el reintento duplica el mensaje en la pantalla del asesor.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, wamid, ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'Reintento de Meta', 'wamid.COMPARTIDO.0', now(), now(), now())`,
          [TENANT_A, conversacionDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/mensajes_tenant_id_wamid_key|duplicate key/i);

    // El `ON CONFLICT DO NOTHING` del trabajador se apoya exactamente en ese índice.
    const reintento = await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, wamid, ocurrido_en, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'Reintento de Meta', 'wamid.COMPARTIDO.0', now(), now(), now())
         ON CONFLICT (tenant_id, wamid) WHERE wamid IS NOT NULL DO NOTHING`,
        [TENANT_A, conversacionDe[TENANT_A]],
      ),
    );
    expect(reintento.rowCount).toBe(0);

    // Y la unicidad es POR TENANT y no global: global sería un oráculo que le confirma a
    // una agencia que otra ya recibió ese mensaje. B ya tiene `wamid.COMPARTIDO.1`; que
    // A pueda tener el suyo con el mismo sufijo lo demuestra sin cruzar ninguna fila.
    const enOtraAgencia = await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, wamid, ocurrido_en, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'Mismo wamid, otra agencia', 'wamid.COMPARTIDO.1', now(), now(), now())
         RETURNING id`,
        [TENANT_A, conversacionDe[TENANT_A]],
      ),
    );
    expect(enOtraAgencia.rowCount).toBe(1);
  });

  it('41 — una clave de idempotencia repetida no manda el mensaje dos veces (R5)', async () => {
    const clave = randomUUID();
    const enviar = (texto: string) =>
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, estado, texto, clave_idempotencia, ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'SALIENTE', 'TEXTO', 'PENDIENTE', $3, $4, now(), now(), now())`,
          [TENANT_A, conversacionDe[TENANT_A], texto, clave],
        ),
      );

    await expect(enviar('Le confirmo la reserva')).resolves.toBeDefined();
    // El doble clic del asesor. Sin esto, el viajero lo recibe dos veces — y si fuera
    // una plantilla, Meta lo cobraría dos veces.
    await expect(enviar('Le confirmo la reserva')).rejects.toThrow(
      /mensajes_tenant_id_clave_idempotencia_key|duplicate key/i,
    );
  });

  it('42 — un mensaje entrante no tiene autor, ni existe sin wamid, ni falla sin estar fallido', async () => {
    const insertar = (columnas: string, valores: unknown[]) =>
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, ocurrido_en, creado_en, actualizado_en, ${columnas})
           VALUES (gen_random_uuid(), $1, $2, now(), now(), now(), ${valores
             .map((_, i) => `$${i + 3}`)
             .join(', ')})`,
          [TENANT_A, conversacionDe[TENANT_A], ...valores],
        ),
      );

    // Un entrante con autor es un mensaje puesto en boca del viajero.
    await expect(
      insertar('direccion, tipo, wamid, autor_id', [
        'ENTRANTE',
        'TEXTO',
        `wamid.${randomUUID()}`,
        TENANT_A,
      ]),
    ).rejects.toThrow(/mensajes_entrante_sin_autor|violates foreign key/i);

    // Un entrante sin wamid se duplica en el siguiente reintento de Meta: el índice
    // único no protege un NULL.
    await expect(insertar('direccion, tipo', ['ENTRANTE', 'TEXTO'])).rejects.toThrow(
      /mensajes_entrante_exige_wamid/,
    );

    // «Entregado, pero con motivo de fallo» es una contradicción que la bandeja pintaría
    // como error sobre un mensaje que sí llegó.
    await expect(
      insertar('direccion, tipo, estado, motivo_fallo', [
        'SALIENTE',
        'TEXTO',
        'ENTREGADO',
        'El numero no tiene WhatsApp',
      ]),
    ).rejects.toThrow(/mensajes_fallo_explica_solo_el_fallo/);
  });

  it('43 — la identidad de una plantilla es (WABA, nombre, idioma), no (tenant, nombre)', async () => {
    // Las plantillas NO son nuestras: son de Meta, y allí el nombre es único por WABA y
    // por idioma. Una agencia con dos WABAs puede tener la misma registrada en los dos.
    const segundaCuenta = await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, '90000000000099', 'Segundo WABA', now(), now())
         RETURNING id`,
        [TENANT_A],
      ),
    );
    const otraCuenta = (segundaCuenta.rows[0] as { id: string }).id;

    // Mismo nombre, mismo idioma, OTRO WABA: son dos plantillas distintas.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO plantillas_whatsapp (id, tenant_id, cuenta_id, nombre, idioma, categoria, cuerpo, actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'recordatorio_pago', 'es_CO', 'UTILIDAD', 'Otro WABA', now(), now(), now())`,
          [TENANT_A, otraCuenta],
        ),
      ),
    ).resolves.toBeDefined();

    // Mismo nombre, mismo WABA, OTRO idioma: también son distintas, y cada una lleva su
    // propio estado — Meta puede aprobar el español y rechazar el inglés.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO plantillas_whatsapp (id, tenant_id, cuenta_id, nombre, idioma, categoria, cuerpo, actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'recordatorio_pago', 'en_US', 'UTILIDAD', 'Hi {{1}}', now(), now(), now())`,
          [TENANT_A, cuentaDe[TENANT_A]],
        ),
      ),
    ).resolves.toBeDefined();

    // Pero la misma terna, no.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO plantillas_whatsapp (id, tenant_id, cuenta_id, nombre, idioma, categoria, cuerpo, actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'recordatorio_pago', 'es_CO', 'UTILIDAD', 'Duplicada', now(), now(), now())`,
          [TENANT_A, cuentaDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/plantillas_whatsapp_tenant_id_cuenta_id_nombre_idioma_key|duplicate key/i);

    // Un nombre que Meta no admite no falla al guardarlo: falla al ENVIAR, en producción.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO plantillas_whatsapp (id, tenant_id, cuenta_id, nombre, idioma, categoria, cuerpo, actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Recordatorio Pago', 'es_CO', 'UTILIDAD', 'x', now(), now(), now())`,
          [TENANT_A, cuentaDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/plantillas_nombre_formato_meta/);
  });

  it('44 — Meta pausa sola una plantilla, y pausarla sin motivo no es representable', async () => {
    // El caso que más sorprende: Meta pausa una plantilla cuando los destinatarios la
    // marcan como spam, sin avisar. La que funcionaba el martes no funciona el jueves, y
    // el asesor necesita el motivo y DESDE CUÁNDO — por eso `estado_cambiado_en` existe.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query("UPDATE plantillas_whatsapp SET estado = 'PAUSADA' WHERE id = $1", [
          plantillaDe[TENANT_A],
        ]),
      ),
    ).rejects.toThrow(/plantillas_estado_malo_exige_motivo/);

    await comoTenant(TENANT_A, (c) =>
      c.query(
        `UPDATE plantillas_whatsapp
            SET estado = 'PAUSADA',
                motivo_estado = 'Los destinatarios la marcaron como spam',
                estado_cambiado_en = now(),
                sincronizada_en = now(),
                actualizado_por = NULL
          WHERE id = $1`,
        [plantillaDe[TENANT_A]],
      ),
    );

    // `actualizado_por` NULO es el dato, no un campo sin rellenar: significa que el
    // cambio lo hizo Meta y no una persona de la agencia.
    const { rows } = await comoTenant(TENANT_A, (c) =>
      c.query(
        'SELECT estado, motivo_estado, actualizado_por FROM plantillas_whatsapp WHERE id = $1',
        [plantillaDe[TENANT_A]],
      ),
    );
    expect((rows[0] as { estado: string }).estado).toBe('PAUSADA');
    expect((rows[0] as { actualizado_por: string | null }).actualizado_por).toBeNull();

    // Y nada de esto se ve desde la otra agencia.
    const ajenas = await comoTenant(TENANT_B, (c) =>
      c.query('SELECT id FROM plantillas_whatsapp WHERE tenant_id = $1', [TENANT_A]),
    );
    expect(ajenas.rowCount).toBe(0);

    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO plantillas_whatsapp (id, tenant_id, cuenta_id, nombre, idioma, categoria, cuerpo, actualizada_en_meta, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'plantilla_plantada', 'es_CO', 'MARKETING', 'x', now(), now(), now())`,
          [TENANT_A, cuentaDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates foreign key/i);
  });

  it('45 — el instante de Meta y el nuestro son dos columnas distintas, y el hilo ordena por el de Meta', async () => {
    // Los webhooks llegan DESORDENADOS: un reintento de Meta trae un mensaje de hace
    // horas después de uno recién recibido. Si el hilo ordenara por `creado_en`, ese
    // mensaje aparecería al final de la conversación, fuera de contexto.
    const viejo = `wamid.${randomUUID()}`;
    await comoTenant(TENANT_A, (c) =>
      c.query(
        `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, texto, wamid, ocurrido_en, creado_en, actualizado_en)
         VALUES (gen_random_uuid(), $1, $2, 'ENTRANTE', 'TEXTO', 'Llego tarde pero es de ayer', $3,
                 now() - interval '1 day', now(), now())`,
        [TENANT_A, conversacionDe[TENANT_A], viejo],
      ),
    );

    const { rows } = await comoTenant(TENANT_A, (c) =>
      c.query(
        `SELECT wamid, ocurrido_en < creado_en AS meta_antes_que_nosotros
           FROM mensajes
          WHERE tenant_id = $1 AND conversacion_id = $2
          ORDER BY ocurrido_en ASC, id ASC
          LIMIT 1`,
        [TENANT_A, conversacionDe[TENANT_A]],
      ),
    );
    expect((rows[0] as { wamid: string }).wamid).toBe(viejo);
    expect((rows[0] as { meta_antes_que_nosotros: boolean }).meta_antes_que_nosotros).toBe(true);

    // Las dos columnas son timestamptz (UTC). R9: nada de `timestamp` sin huso, que es
    // la forma silenciosa de que un mensaje cambie de día según quién lo lea.
    const tipos = await admin.query(
      `SELECT attname, format_type(atttypid, atttypmod) AS tipo
         FROM pg_attribute
        WHERE attrelid = 'mensajes'::regclass
          AND attname IN ('ocurrido_en', 'creado_en')`,
    );
    for (const f of tipos.rows as Array<{ attname: string; tipo: string }>) {
      expect(`${f.attname}:${f.tipo}`).toBe(`${f.attname}:timestamp(3) with time zone`);
    }
  });
});
// =============================================================================
// Cotizaciones — cabecera mutable y versiones inmutables (20261019200000)
//
// Dos propiedades distintas, y las dos se prueban en rojo con `scripts/mutaciones-aislamiento.mjs`:
//
//   · aislamiento: una agencia no lee ni escribe cotizaciones ni versiones de otra (47, 48, 51);
//   · inmutabilidad: una versión no se modifica ni se borra, ni por su propia agencia (49).
//
// Las sentencias que, con el sistema ROTO, borrarían filas ajenas —el TRUNCATE y el DELETE del
// propietario— van SIEMPRE dentro de BEGIN … ROLLBACK. La base es compartida entre árboles de
// trabajo: una mutación que quite el disparador no puede llevarse por delante las versiones de
// la corrida de al lado.
// =============================================================================

const TABLAS_DE_COTIZACION = ['cotizaciones', 'versiones_cotizacion'] as const;

/** Una línea con la forma de `OpcionDePrecio`. Solo `total` lo exige el disparador de alta. */
const linea = (nombre: string, veces: number, unitario: number, moneda = 'COP') => ({
  tarifaId: randomUUID(),
  nombre,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  veces,
  precioUnitario: { unidades: String(unitario), moneda },
  total: { unidades: String(unitario * veces), moneda },
  masBarata: false,
});

interface VersionDePrueba {
  venta: number;
  neto: number | null;
  margen: number | null;
  lineas: unknown[];
  moneda?: string;
}

/** Dos adultos a 350.000 y un niño a 280.000: 980.000, con neto 800.000. */
const VERSION_SANA: VersionDePrueba = {
  venta: 980_000,
  neto: 800_000,
  margen: 180_000,
  lineas: [linea('Adulto', 2, 350_000), linea('Menor de 2 a 11', 1, 280_000)],
};

function insertarVersion(
  c: Client,
  tenant: string,
  cotizacionId: string,
  paqueteId: string,
  numero: number,
  v: VersionDePrueba = VERSION_SANA,
  { conRetorno = true }: { conRetorno?: boolean } = {},
) {
  return c.query(
    `INSERT INTO versiones_cotizacion
       (id, tenant_id, cotizacion_id, numero, paquete_id, paquete_nombre, destino, noches,
        fecha_salida, vigencia_id, vigencia_desde, vigencia_hasta, de_salida_programada,
        adultos, ninos, infantes, politica_porcentaje, politica_base, politica_origen,
        politica_redondeo, lineas, venta_unidades, neto_unidades, margen_unidades, moneda_iso)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Parque del Café', 'Quindío', 1,
             '2026-12-05', gen_random_uuid(), '2026-12-01', '2026-12-15', false,
             2, 1, 0, 20, 'SOBRE_EL_NETO', 'DERIVADA_DEL_NETO',
             1000, $5::jsonb, $6, $7, $8, $9)
     ${conRetorno ? 'RETURNING id' : ''}`,
    [
      tenant,
      cotizacionId,
      numero,
      paqueteId,
      JSON.stringify(v.lineas),
      v.venta,
      v.neto,
      v.margen,
      v.moneda ?? 'COP',
    ],
  );
}

describe('Cotizaciones — cabecera mutable y versiones inmutables', () => {
  const contactoDe: Record<string, string> = {};
  const paqueteDe: Record<string, string> = {};
  const cotizacionDe: Record<string, string> = {};
  const versionDe: Record<string, string> = {};
  const mensajeDe: Record<string, string> = {};

  // Sin afterAll propio: el `borrarTenants` global se lleva todo, y al hacerlo ejerce la única
  // salida de purga del disparador. Si esa salida se rompe, el afterAll global se pone en rojo.
  beforeAll(async () => {
    for (const [i, tenant] of [TENANT_A, TENANT_B].entries()) {
      await comoTenant(tenant, async (c) => {
        const contacto = await c.query(
          `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Cliente que cotiza', now(), now())
           RETURNING id`,
          [tenant, `+57377700000${i}`],
        );
        contactoDe[tenant] = (contacto.rows[0] as { id: string }).id;

        const paquete = await c.query(
          `INSERT INTO paquetes (id, tenant_id, nombre, destino, dias, noches, plan_alimentacion,
                                 creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, 'Parque del Café', 'Quindío', 2, 1, 'DESAYUNO', now(), now())
           RETURNING id`,
          [tenant],
        );
        paqueteDe[tenant] = (paquete.rows[0] as { id: string }).id;

        const cotizacion = await c.query(
          `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Familia al Parque del Café', now(), now())
           RETURNING id`,
          [tenant, contactoDe[tenant]],
        );
        cotizacionDe[tenant] = (cotizacion.rows[0] as { id: string }).id;

        const version = await insertarVersion(
          c,
          tenant,
          cotizacionDe[tenant] ?? '',
          paqueteDe[tenant] ?? '',
          1,
        );
        versionDe[tenant] = (version.rows[0] as { id: string }).id;

        // Enviada: la versión 1 es la que vio el cliente.
        await c.query(
          `UPDATE cotizaciones SET estado = 'ENVIADA', version_enviada = 1, enviada_en = now()
            WHERE id = $1`,
          [cotizacionDe[tenant]],
        );

        // Un hilo mínimo para probar la foránea de `mensajes.cotizacion_id`.
        const cuenta = await c.query(
          `INSERT INTO cuentas_whatsapp (id, tenant_id, waba_id, nombre, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'WABA de cotizaciones', now(), now())
           RETURNING id`,
          [tenant, `9100000000000${i}`],
        );
        const canal = await c.query(
          `INSERT INTO canales (id, tenant_id, cuenta_id, phone_number_id, numero_e164, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())
           RETURNING id`,
          [tenant, (cuenta.rows[0] as { id: string }).id, `8100000000000${i}`, `+5761000000${i}`],
        );
        const conversacion = await c.query(
          `INSERT INTO conversaciones (id, tenant_id, contacto_id, canal_id, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, $3, now(), now())
           RETURNING id`,
          [tenant, contactoDe[tenant], (canal.rows[0] as { id: string }).id],
        );
        const mensaje = await c.query(
          `INSERT INTO mensajes (id, tenant_id, conversacion_id, direccion, tipo, estado, texto,
                                 ocurrido_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'SALIENTE', 'TEXTO', 'PENDIENTE',
                   'Le comparto la cotización', now(), now(), now())
           RETURNING id`,
          [tenant, (conversacion.rows[0] as { id: string }).id],
        );
        mensajeDe[tenant] = (mensaje.rows[0] as { id: string }).id;
      });
    }
  });

  it('47 — las dos tablas de cotización tienen RLS forzada con WITH CHECK, y la inmutabilidad está armada', async () => {
    const { rows } = await admin.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*) FROM pg_policy p
                WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
                  AND p.polwithcheck IS NOT NULL) AS con_check
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [TABLAS_DE_COTIZACION],
    );
    expect(rows).toHaveLength(TABLAS_DE_COTIZACION.length);
    for (const f of rows as Array<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      con_check: string;
    }>) {
      expect(`${f.relname}:${f.relrowsecurity}:${f.relforcerowsecurity}:${f.con_check}`).toBe(
        `${f.relname}:true:true:1`,
      );
    }

    // Los tres disparadores, HABILITADOS ('O' = origen). Uno deshabilitado existe en el catálogo
    // y no hace nada: contarlos sin mirar `tgenabled` sería verde con la puerta abierta.
    const disparadores = await admin.query(
      `SELECT t.tgname, t.tgenabled
         FROM pg_trigger t
        WHERE t.tgrelid = 'versiones_cotizacion'::regclass AND NOT t.tgisinternal
        ORDER BY 1`,
    );
    expect(disparadores.rows).toEqual([
      { tgname: 'versiones_cotizacion_inmutables', tgenabled: 'O' },
      { tgname: 'versiones_cotizacion_sin_truncate', tgenabled: 'O' },
      { tgname: 'versiones_cotizacion_validar_alta', tgenabled: 'O' },
    ]);
  });

  it('48 — un tenant no ve ni puede escribir las cotizaciones ni las versiones de otro', async () => {
    // Control: A ve lo suyo. Sin esto, «B ve cero» sería verde también con RLS sin política.
    const propias = await comoTenant(TENANT_A, async (c) => ({
      cabeceras: (await c.query('SELECT id FROM cotizaciones WHERE tenant_id = $1', [TENANT_A]))
        .rowCount,
      versiones: (
        await c.query('SELECT id FROM versiones_cotizacion WHERE tenant_id = $1', [TENANT_A])
      ).rowCount,
    }));
    expect(propias).toEqual({ cabeceras: 1, versiones: 1 });

    // Lectura cruzada, por tenant y por identificador.
    const ajenas = await comoTenant(TENANT_B, async (c) => ({
      cabeceras: (await c.query('SELECT id FROM cotizaciones WHERE tenant_id = $1', [TENANT_A]))
        .rowCount,
      porId: (await c.query('SELECT id FROM cotizaciones WHERE id = $1', [cotizacionDe[TENANT_A]]))
        .rowCount,
      // La versión lleva el NETO: es la fila que más daño hace si se filtra.
      versiones: (
        await c.query('SELECT neto_unidades FROM versiones_cotizacion WHERE tenant_id = $1', [
          TENANT_A,
        ])
      ).rowCount,
    }));
    expect(ajenas).toEqual({ cabeceras: 0, porId: 0, versiones: 0 });

    // Escritura con el tenant_id de otro: la rechaza el WITH CHECK.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Plantada', now(), now())`,
          [TENANT_A, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      comoTenant(TENANT_B, (c) =>
        // SIN `RETURNING`, y es la mitad de la prueba. Con él, PostgreSQL pasa la fila nueva
        // también por el USING de la política y la rechaza aunque el WITH CHECK sea `true`: la
        // mutación M9 salía VERDE por eso. Un INSERT sin RETURNING solo lo para el WITH CHECK.
        insertarVersion(
          c,
          TENANT_A,
          cotizacionDe[TENANT_A] ?? '',
          paqueteDe[TENANT_A] ?? '',
          2,
          VERSION_SANA,
          { conRetorno: false },
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    // Con SU tenant_id pero colgando de lo ajeno: lo rechazan las foráneas COMPUESTAS, no RLS.
    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query(
          `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Del contacto ajeno', now(), now())`,
          [TENANT_B, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
    await expect(
      comoTenant(TENANT_B, (c) =>
        insertarVersion(c, TENANT_B, cotizacionDe[TENANT_A] ?? '', paqueteDe[TENANT_B] ?? '', 2),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
    await expect(
      comoTenant(TENANT_B, (c) =>
        insertarVersion(c, TENANT_B, cotizacionDe[TENANT_B] ?? '', paqueteDe[TENANT_A] ?? '', 2),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);

    // Modificar o borrar lo ajeno: cero filas, sin error. RLS filtra antes de que el disparador
    // llegue a ver la fila.
    const tocadas = await comoTenant(TENANT_B, async (c) => ({
      actualizadas: (
        await c.query("UPDATE cotizaciones SET titulo = 'Secuestrada' WHERE id = $1", [
          cotizacionDe[TENANT_A],
        ])
      ).rowCount,
      borradas: (await c.query('DELETE FROM cotizaciones WHERE id = $1', [cotizacionDe[TENANT_A]]))
        .rowCount,
      versiones: (
        await c.query('UPDATE versiones_cotizacion SET venta_unidades = 1 WHERE tenant_id = $1', [
          TENANT_A,
        ])
      ).rowCount,
    }));
    expect(tocadas).toEqual({ actualizadas: 0, borradas: 0, versiones: 0 });
  });

  it('49 — una versión no se modifica ni se borra, ni siquiera por su propia agencia', async () => {
    const id = versionDe[TENANT_A];

    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query('UPDATE versiones_cotizacion SET venta_unidades = 1 WHERE id = $1', [id]),
      ),
    ).rejects.toThrow(/inmutable/i);
    await expect(
      comoTenant(TENANT_A, (c) => c.query('DELETE FROM versiones_cotizacion WHERE id = $1', [id])),
    ).rejects.toThrow(/inmutable/i);

    // Fijar la variable de purga desde la API no abre nada: le falta ser propietaria.
    await expect(
      comoTenant(TENANT_A, async (c) => {
        await c.query("SELECT set_config('viajapro.purga_de_tenants', $1, true)", [TENANT_A]);
        return c.query('DELETE FROM versiones_cotizacion WHERE id = $1', [id]);
      }),
    ).rejects.toThrow(/inmutable/i);

    // Ni borrando la cabecera: la versión no se va «de rebote».
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query('DELETE FROM cotizaciones WHERE id = $1', [cotizacionDe[TENANT_A]]),
      ),
    ).rejects.toThrow(/inmutable|RESTRICT|foreign key/i);

    // El propietario tampoco: ni UPDATE —con o sin declarar purga—, ni DELETE sin declararla,
    // ni TRUNCATE. Todo dentro de BEGIN … ROLLBACK: ver la cabecera de este bloque.
    const rechazoDelPropietario = async (sentencias: string[]) => {
      await admin.query('BEGIN');
      try {
        for (const s of sentencias) await admin.query(s, s.includes('$1') ? [id] : []);
        return 'aceptada';
      } catch (error) {
        return (error as Error).message;
      } finally {
        await admin.query('ROLLBACK');
      }
    };
    expect(
      await rechazoDelPropietario([
        'UPDATE versiones_cotizacion SET numero = numero WHERE id = $1',
      ]),
    ).toMatch(/inmutable/i);
    expect(
      await rechazoDelPropietario([
        `SELECT set_config('viajapro.purga_de_tenants', '${TENANT_A}', true)`,
        'UPDATE versiones_cotizacion SET venta_unidades = 1 WHERE id = $1',
      ]),
    ).toMatch(/inmutable/i);
    expect(await rechazoDelPropietario(['DELETE FROM versiones_cotizacion WHERE id = $1'])).toMatch(
      /inmutable/i,
    );
    // CASCADE porque `cotizaciones` la referencia: sin él el motor rechaza antes de llegar al
    // disparador, y la aserción no probaría el disparador. Dentro de ROLLBACK, siempre.
    expect(await rechazoDelPropietario(['TRUNCATE versiones_cotizacion CASCADE'])).toMatch(
      /inmutable/i,
    );

    // Y la fila sigue diciendo lo que dijo.
    const { rows } = await comoTenant(TENANT_A, (c) =>
      c.query('SELECT venta_unidades, neto_unidades FROM versiones_cotizacion WHERE id = $1', [id]),
    );
    expect(rows).toEqual([{ venta_unidades: '980000', neto_unidades: '800000' }]);

    // Corregir es crear la versión siguiente, y eso sí se puede.
    await comoTenant(TENANT_A, (c) =>
      insertarVersion(c, TENANT_A, cotizacionDe[TENANT_A] ?? '', paqueteDe[TENANT_A] ?? '', 2, {
        venta: 700_000,
        neto: null,
        margen: null,
        lineas: [linea('Adulto', 2, 350_000)],
      }),
    );
  });

  it('50 — el dinero de una versión cuadra o no entra', async () => {
    const intento = (v: VersionDePrueba) =>
      comoTenant(TENANT_A, (c) =>
        insertarVersion(c, TENANT_A, cotizacionDe[TENANT_A] ?? '', paqueteDe[TENANT_A] ?? '', 9, v),
      );

    // Las líneas suman 980.000 y la venta dice 900.000.
    await expect(intento({ ...VERSION_SANA, venta: 900_000, margen: 100_000 })).rejects.toThrow(
      /suman/i,
    );
    // Una línea en dólares dentro de una versión en pesos.
    await expect(
      intento({
        ...VERSION_SANA,
        lineas: [linea('Adulto', 2, 350_000), linea('Menor de 2 a 11', 1, 280_000, 'USD')],
      }),
    ).rejects.toThrow(/linea/i);
    // Margen que no es la resta, y «margen 0» con neto desconocido.
    await expect(intento({ ...VERSION_SANA, margen: 1 })).rejects.toThrow(/margen_es_la_resta/);
    await expect(intento({ ...VERSION_SANA, neto: null, margen: 0 })).rejects.toThrow(
      /margen_es_la_resta/,
    );
    // Una versión sin líneas no es una cotización.
    await expect(
      intento({
        ...VERSION_SANA,
        venta: 0,
        neto: null,
        margen: null,
        lineas: [],
      }),
    ).rejects.toThrow(/lineas_no_vacias|suman/i);
  });

  it('51 — mensajes.cotizacion_id es foránea COMPUESTA y VALIDADA: un mensaje no lleva la cotización de otra agencia', async () => {
    const { rows } = await admin.query(
      `SELECT c.convalidated,
              (SELECT array_agg(a.attname::text ORDER BY a.attname)
                 FROM unnest(c.conkey) k
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS columnas
         FROM pg_constraint c
        WHERE c.conname = 'mensajes_cotizacion_id_tenant_id_fkey'
          AND c.conrelid = 'mensajes'::regclass`,
    );
    expect(rows).toEqual([{ convalidated: true, columnas: ['cotizacion_id', 'tenant_id'] }]);

    await expect(
      comoTenant(TENANT_B, (c) =>
        c.query('UPDATE mensajes SET cotizacion_id = $1 WHERE id = $2', [
          cotizacionDe[TENANT_A],
          mensajeDe[TENANT_B],
        ]),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);

    // Control: con la suya, sí.
    const propia = await comoTenant(TENANT_B, (c) =>
      c.query('UPDATE mensajes SET cotizacion_id = $1 WHERE id = $2', [
        cotizacionDe[TENANT_B],
        mensajeDe[TENANT_B],
      ]),
    );
    expect(propia.rowCount).toBe(1);
  });

  it('52 — la versión que vio el cliente es una versión DE ESTA cotización', async () => {
    // Otra cotización de A sin versiones, que dice haber enviado la «versión 1»: la única versión 1
    // que existe es la de la otra cotización. La foránea es diferible, así que revienta al COMMIT.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, estado, version_enviada,
                                     enviada_en, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Enviada sin versión', 'ENVIADA', 1, now(), now(), now())`,
          [TENANT_A, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);

    // ENVIADA sin decir qué versión es una aceptación de nada.
    await expect(
      comoTenant(TENANT_A, (c) =>
        c.query(
          `INSERT INTO cotizaciones (id, tenant_id, contacto_id, titulo, estado, creado_en, actualizado_en)
           VALUES (gen_random_uuid(), $1, $2, 'Enviada sin envío', 'ACEPTADA', now(), now())`,
          [TENANT_A, contactoDe[TENANT_A]],
        ),
      ),
    ).rejects.toThrow(/estado_exige_envio/);
  });
});
