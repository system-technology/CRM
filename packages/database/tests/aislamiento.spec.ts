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

const TENANT_A = '01932000-0000-7000-8000-00000000000a';
const TENANT_B = '01932000-0000-7000-8000-00000000000b';
/** Un POST de Meta puede traer `changes` de tres agencias distintas. Para la aserción 16. */
const TENANT_C = '01932000-0000-7000-8000-00000000000c';

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
    [TENANT_A, 'agencia-a'],
    [TENANT_B, 'agencia-b'],
    [TENANT_C, 'agencia-c'],
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
  await admin.query('DELETE FROM tenants WHERE id = ANY($1)', [[TENANT_A, TENANT_B, TENANT_C]]);
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
};

const PROPIETARIO_ESPERADO: Readonly<Record<string, string>> = {
  resolver_enrutamiento: 'viajapro_enrutador',
  registrar_enrutamiento: 'viajapro_enrutador',
  registrar_recepcion: 'viajapro_staging',
  tomar_recepcion: 'viajapro_staging',
  anular_payload: 'viajapro_staging',
  purgar_recepciones: 'viajapro_staging',
  purgar_payloads: 'viajapro_staging',
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
      [claveA, claveB, claveC, claveWabaA],
    ]);
    await admin.query('RESET ROLE');
    await admin.query('SET ROLE "viajapro_staging"');
    await admin.query('DELETE FROM recepciones_webhook');
    await admin.query('RESET ROLE');
    await admin.query('DELETE FROM canales WHERE id = ANY($1)', [[canalA, canalB, canalC]]);
    await admin.query('DELETE FROM cuentas_whatsapp WHERE id = ANY($1)', [
      [cuentaA, cuentaB, cuentaC],
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
      'faltan funciones de ADR-0008: eran seis y la auditoría de implementación añadió purgar_payloads',
    ).toBe(7);
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
    expect(rows.length).toBe(7);

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
    const recepcionId = randomBytes(32);
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

  it('17 — ninguna tabla global tiene columna tenant_id, y todas están declaradas', async () => {
    // Si alguna la tuviera, el aplicador dirigido por datos les pondría RLS y volverían a
    // ser ilegibles sin contexto: el ciclo huevo-gallina de vuelta, en producción y sin
    // error. `excepciones_rls` entra en la cuenta: son CUATRO, y la regla de parada de
    // Consecuencias se apoya en ese número.
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

  it('18 — la purga no borra una recepción con algún change sin resolver', async () => {
    // Borrar un evento no procesado es destruir la evidencia del fallo.
    const recepcionId = randomBytes(32);
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

    const futuro = new Date(Date.now() + 86_400_000);
    await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [futuro]);

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
    await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [futuro]);
    const despues = await admin.query('SELECT 1 FROM recepciones_webhook WHERE recepcion_id = $1', [
      recepcionId,
    ]);
    expect(despues.rowCount).toBe(0);
  });

  it('19 — un evento desconocido o revocado deja el payload en NULL y la fila intacta', async () => {
    // Un mensaje con nombre, teléfono y a veces pasaporte, almacenado sin aislamiento y
    // sin responsable del tratamiento identificable, no puede quedarse siete días.
    const recepcionId = randomBytes(32);
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
    for (const archivo of ['001-aislamiento-tenant.sql', '002-rol-aplicacion.sql']) {
      const sql = readFileSync(`${rutaPolicies}${archivo}`, 'utf8');
      await admin.query(sql);
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
    const recepcionId = randomBytes(32);
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

    const atascado = await admin.query(
      'SELECT payload_cifrado FROM recepciones_webhook WHERE recepcion_id = $1',
      [recepcionId],
    );
    expect(
      atascado.rows[0]?.payload_cifrado,
      'con un change pendiente el contenido sigue ahí',
    ).not.toBeNull();

    const futuro = new Date(Date.now() + 86_400_000);
    const anulados = await conRol('viajapro_webhook', 'SELECT purgar_payloads($1) AS n', [futuro]);
    expect(Number(anulados.rows[0]?.n)).toBeGreaterThan(0);

    const { rows } = await admin.query(
      `SELECT r.payload_cifrado,
              (SELECT count(*) FROM recepciones_webhook_changes c
                WHERE c.recepcion_id = r.recepcion_id AND c.estado = 'PENDIENTE') AS pendientes
       FROM recepciones_webhook r WHERE r.recepcion_id = $1`,
      [recepcionId],
    );
    expect(rows.length, 'la fila y su recepcion_id se conservan: la evidencia no se destruye').toBe(
      1,
    );
    expect(rows[0]?.payload_cifrado).toBeNull();
    expect(Number(rows[0]?.pendientes), 'el change sin resolver sigue marcado como pendiente').toBe(
      1,
    );

    // Y la purga de filas sigue respetando lo no resuelto (invariante de la 18 intacto).
    await conRol('viajapro_webhook', 'SELECT purgar_recepciones($1)', [futuro]);
    const sigue = await admin.query('SELECT 1 FROM recepciones_webhook WHERE recepcion_id = $1', [
      recepcionId,
    ]);
    expect(sigue.rowCount).toBe(1);
  }, 60_000);

  it('extra — dos trabajadores que terminan a la vez SÍ anulan el contenido', async () => {
    // La carrera que C-3 pedía cerrar es entre dos TRANSACCIONES, no entre dos sentencias.
    // Sin el `FOR UPDATE` sobre la fila padre, bajo READ COMMITTED cada trabajador ve el
    // change del otro como PENDIENTE —su instantánea no ve lo no confirmado—, el UPDATE no
    // toca filas, no toma bloqueo, y NINGUNO anula: el contenido sobrevive hasta la purga,
    // treinta días en vez de minutos. Es el único plazo que decide la legalidad del
    // apartado, así que no puede depender de una carrera.
    const recepcionId = randomBytes(32);
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
});
