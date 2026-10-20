#!/usr/bin/env node
/**
 * Pone contraseña a los TRES roles de login y verifica que ninguno pueda saltarse RLS.
 *
 *   pnpm --filter @viajapro/database run rol:crear
 *
 * Los roles ya no los crea este script: los crea la migración
 * `..._roles_de_conexion_y_propietarios`, generada desde `policies/002-rol-aplicacion.sql`.
 * Aquí solo ocurre lo que NO puede vivir en el repositorio: las contraseñas. Se generan,
 * se imprimen **una sola vez** y no se guardan en ningún sitio.
 *
 * Por qué hay tres y no uno (ADR-0008 §1.3): los tres tienen privilegios idénticos sobre
 * las tablas de negocio y se diferencian ÚNICAMENTE en qué funciones pueden ejecutar.
 * `viajapro_altas` es el único que puede repuntar un número en el directorio, y por eso no
 * es el rol con el que corre toda la API. El rol de conexión es lo único que una inyección
 * SQL no puede falsear: ahí está la frontera.
 *
 * Y por qué este script ya NO concede privilegios sobre tablas: los concedía con su propio
 * `GRANT ... ON ALL TABLES IN SCHEMA public`, por fuera del mecanismo que los revoca. Eso
 * es exactamente el defecto crítico que corrige ADR-0008: la concesión y la revocación
 * tienen que ser el mismo mecanismo o acaban desincronizadas sin que nadie se entere. Aquí
 * se invoca `aplicar_privilegios_declarados()`, que es ese mecanismo.
 *
 * En PostgreSQL gestionado esto importa el doble: el rol que el proveedor crea por defecto
 * puede tener BYPASSRLS — en Neon, por herencia de `neon_superuser`. Una aplicación
 * conectada con ese rol se salta TODAS las políticas, sin error y sin aviso. Ver ADR-0007.
 */

import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}

if (url.includes('-pooler')) {
  console.error(
    'DATABASE_URL apunta al endpoint AGRUPADO (-pooler).\n' +
      'El DDL necesita el DIRECTO: el mismo host sin "-pooler".',
  );
  process.exit(1);
}

/** Los cuatro roles de login y la variable de entorno de cada proceso. */
const ROLES = [
  ['viajapro_app', 'DATABASE_APP_URL', 'apps/api — toda la API salvo el alta de canales'],
  ['viajapro_altas', 'DATABASE_ALTAS_URL', 'SOLO el caso de uso de Embedded Signup'],
  ['viajapro_webhook', 'DATABASE_WEBHOOK_URL', 'apps/worker — webhooks entrantes'],
  // ADR-0011. De login pero NO de aplicación: aplicar_privilegios_declarados no le concede
  // nada sobre tablas de negocio; solo las filas de excepciones_rls de identidad.
  ['viajapro_identidad', 'DATABASE_IDENTIDAD_URL', 'apps/api — SOLO el pool de Better Auth'],
];

const cliente = new Client({ connectionString: url });
await cliente.connect();

const lineas = [];

try {
  for (const [rol, variable, proposito] of ROLES) {
    const { rowCount } = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol]);
    if (rowCount === 0) {
      throw new Error(
        `El rol ${rol} no existe. Lo crea la migración de roles: ejecuta antes "pnpm db:migrate:deploy".`,
      );
    }

    // Hexadecimal y no base64: evita los caracteres que complican una cadena de conexión.
    const clave = randomBytes(24).toString('hex');

    // `ALTER ROLE ... PASSWORD` no admite parámetros vinculados: es DDL. Hay que interpolar,
    // y esta comprobación no es decorativa: si alguien cambiara la generación a algo que
    // pudiera contener comillas, el script se detiene antes de construir SQL inyectable.
    if (!/^[0-9a-f]{48}$/.test(clave)) {
      throw new Error('La contraseña generada no es hexadecimal pura; no se interpola en DDL.');
    }
    await cliente.query(`ALTER ROLE ${rol} WITH PASSWORD '${clave}'`);

    const u = new URL(url);
    // La aplicación sí usa el endpoint AGRUPADO: el directo es solo para DDL.
    const hostAgrupado = u.hostname.replace(/^(ep-[^.]+)/, '$1-pooler');
    const base = u.pathname.replace('/', '');
    lineas.push(
      `${variable}=postgresql://${rol}:${clave}@${hostAgrupado}/${base}?sslmode=require   # ${proposito}`,
    );
  }

  // El ÚNICO mecanismo de privilegios del proyecto. Concede a los roles de aplicación y
  // revoca lo que declara `excepciones_rls`, en el mismo bloque.
  await cliente.query('SELECT aplicar_privilegios_declarados()');

  // Verificación. Si algo de esto falla, la configuración NO es segura y es mejor
  // enterarse aquí que en producción. Comprobar es mejor que afirmar.
  const { rows } = await cliente.query(
    `SELECT rolname, rolbypassrls, rolsuper,
            has_table_privilege(rolname, 'enrutamiento_canales', 'SELECT') AS ve_directorio,
            rolname = 'viajapro_identidad' AND has_table_privilege(rolname, 'usuarios', 'SELECT') AS identidad_ve_negocio
     FROM pg_roles WHERE rolname = ANY($1)`,
    [ROLES.map(([rol]) => rol)],
  );
  for (const rol of rows) {
    if (rol.rolbypassrls)
      throw new Error(`${rol.rolname} tiene BYPASSRLS: el aislamiento sería ficticio.`);
    if (rol.rolsuper)
      throw new Error(`${rol.rolname} es superusuario: el aislamiento sería ficticio.`);
    if (rol.identidad_ve_negocio) {
      throw new Error(
        'viajapro_identidad puede LEER usuarios: no puede estar en roles_de_aplicacion (ADR-0011).',
      );
    }
    if (rol.ve_directorio) {
      throw new Error(
        `${rol.rolname} puede LEER enrutamiento_canales. Es el fallo que ADR-0008 existe para impedir.`,
      );
    }
  }

  console.log('');
  console.log('  Verificado: los cuatro roles de login no pueden saltarse RLS');
  console.log('  ni tocar el directorio de enrutamiento.');
  console.log('');
  console.log('  Reemplaza estas lineas en tu .env, tal cual:');
  console.log('');
  for (const linea of lineas) console.log('  ' + linea);
  console.log('');
  console.log('  Luego comprueba con:  pnpm preflight  y  pnpm db:aislamiento');
  console.log('  Las contrasenas no se guardan en ningun sitio. Si las pierdes, repite esto.');
} finally {
  await cliente.end();
}
