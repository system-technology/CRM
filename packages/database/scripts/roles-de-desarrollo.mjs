#!/usr/bin/env node
/**
 * Pone contraseñas DE DESARROLLO, deterministas, a los cuatro roles de login.
 *
 *   pnpm --filter @viajapro/database run roles:dev
 *
 * Existe por un hallazgo crítico de la auditoría de implementación de ADR-0008: **la
 * compuerta de aislamiento no se podía poner en verde.** Las migraciones crean los tres
 * roles sin contraseña —un `LOGIN` sin contraseña no se conecta, que es el estado seguro
 * por defecto— y `rol:crear` genera contraseñas aleatorias que imprime una sola vez. En
 * CI no hay nadie para copiarlas, así que el job caía al rol propietario por un `??` y
 * las 25 aserciones pasaban sin probar nada.
 *
 * Esto cierra ese hueco con la única forma que no inventa un secreto: contraseñas
 * deterministas que **solo funcionan donde no hay nada que proteger**.
 *
 * Tres guardias, porque un script que pone contraseñas conocidas es exactamente la clase
 * de herramienta que alguien acaba ejecutando en el sitio equivocado:
 *
 *   1. Solo contra `localhost` / `127.0.0.1`, o con `CI=true`. Contra un servidor remoto
 *      —Neon, por ejemplo— se niega. Y rotaría la contraseña de la aplicación, además.
 *   2. La contraseña no puede ser igual al nombre del rol. Eso era lo que el repositorio
 *      enseñaba a hacer, y `viajapro_altas` es el ÚNICO rol que puede repuntar el número
 *      de cualquier agencia: la peor primitiva del sistema después de BYPASSRLS.
 *   3. Se valida el formato antes de interpolarla, porque `ALTER ROLE ... PASSWORD` es
 *      DDL y no admite parámetros vinculados.
 *
 * El guardia de arranque de cada proceso (ADR-0008 §1.3, tarea 4b) debe negarse a
 * arrancar con estas credenciales si `APP_ENV` no es `local`.
 */

import pg from 'pg';

const { Client } = pg;

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('Falta DATABASE_URL (rol propietario).');
  process.exit(1);
}

const anfitrion = new URL(url).hostname;
const esLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(anfitrion);

// El anfitrión decide, y nada más. La versión anterior aceptaba `CI=true` como escape, y
// GitHub Actions define esa variable en TODO runner: cualquier workflow futuro que apuntara a
// una base real —un despliegue de staging, una prueba de humo de migraciones— habría rotado
// las contraseñas de los tres roles a una cadena publicada en este repositorio, y
// `viajapro_altas` es el único que puede repuntar el número de cualquier agencia. Es la misma
// forma que el `??` que esta tanda vino a quitar: el respaldo cómodo ES el agujero.
if (!esLocal) {
  console.error(
    `Negado: "${anfitrion}" no es un anfitrión local.\n` +
      'Este script pone contraseñas conocidas. Para un entorno real:\n' +
      '  pnpm --filter @viajapro/database run rol:crear',
  );
  process.exit(1);
}

// Sin valor por omisión: una variable ausente es un error, no una contraseña que cualquiera
// pueda adivinar leyendo el repositorio.
const CLAVE = process.env['DB_DEV_PASSWORD'];
if (!CLAVE) {
  console.error('Falta DB_DEV_PASSWORD. Este script no inventa contraseñas.');
  process.exit(1);
}
const ROLES = [
  ['viajapro_app', 'DATABASE_APP_URL'],
  ['viajapro_altas', 'DATABASE_ALTAS_URL'],
  ['viajapro_webhook', 'DATABASE_WEBHOOK_URL'],
  // ADR-0011: el pool de Better Auth. Cuarto rol de login; la API lo exige como suyo.
  ['viajapro_identidad', 'DATABASE_IDENTIDAD_URL'],
];

if (!/^[A-Za-z0-9_-]{12,}$/.test(CLAVE)) {
  console.error(
    'DB_DEV_PASSWORD debe tener 12+ caracteres de [A-Za-z0-9_-]: va dentro de DDL y de una URL.',
  );
  process.exit(1);
}
if (ROLES.some(([rol]) => CLAVE === rol)) {
  console.error('La contraseña no puede ser el nombre de un rol.');
  process.exit(1);
}

const cliente = new Client({ connectionString: url });
await cliente.connect();

const lineas = [];
try {
  for (const [rol, variable] of ROLES) {
    const { rowCount } = await cliente.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol]);
    if (rowCount === 0) {
      throw new Error(`El rol ${rol} no existe. Ejecuta antes las migraciones: pnpm db:migrate.`);
    }
    await cliente.query(`ALTER ROLE ${rol} WITH PASSWORD '${CLAVE}'`);

    const destino = new URL(url);
    destino.username = rol;
    destino.password = CLAVE;
    lineas.push(`${variable}=${destino.toString()}`);
  }

  // Los privilegios, por el único mecanismo que los gobierna. Nunca un GRANT suelto.
  await cliente.query('SELECT aplicar_privilegios_declarados()');

  const { rows } = await cliente.query(
    `SELECT rolname, rolsuper, rolbypassrls,
            has_table_privilege(rolname, 'enrutamiento_canales', 'SELECT') AS ve_directorio
     FROM pg_roles WHERE rolname = ANY($1)`,
    [ROLES.map(([rol]) => rol)],
  );
  for (const rol of rows) {
    if (rol.rolsuper || rol.rolbypassrls) {
      throw new Error(`${rol.rolname} puede saltarse RLS: el aislamiento sería ficticio.`);
    }
    if (rol.ve_directorio) {
      throw new Error(`${rol.rolname} puede leer el directorio de enrutamiento.`);
    }
  }
} finally {
  await cliente.end();
}

// En CI, GitHub lee las variables de este archivo para los pasos siguientes.
if (process.env['GITHUB_ENV']) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env['GITHUB_ENV'], lineas.join('\n') + '\n');
}

console.log('');
console.log('  Contrasenas de DESARROLLO puestas. Verificado: ningun rol ve el directorio.');
console.log('');
for (const linea of lineas) console.log('  ' + linea);
console.log('');
