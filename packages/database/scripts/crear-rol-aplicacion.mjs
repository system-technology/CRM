#!/usr/bin/env node
/**
 * Crea el rol de aplicación `viajapro_app` y verifica que NO pueda saltarse RLS.
 *
 *   pnpm --filter @viajapro/database run rol:crear
 *
 * Equivale a ejecutar `policies/002-rol-aplicacion.sql` con psql, pero sin depender de tenerlo
 * instalado. Usa DATABASE_URL (rol propietario, endpoint directo).
 *
 * La contraseña se genera aquí y se imprime **una sola vez**. No se guarda en ningún sitio.
 *
 * Por qué esto importa: en PostgreSQL gestionado, el rol que el proveedor crea por defecto puede
 * tener BYPASSRLS — en Neon, por herencia de `neon_superuser`. Una aplicación conectada con ese
 * rol se salta TODAS las políticas de aislamiento, sin error y sin aviso. Ver ADR-0007.
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

// Hexadecimal y no base64: evita los caracteres que complican una cadena de conexión (+ / =).
const clave = randomBytes(24).toString('hex');

const cliente = new Client({ connectionString: url });
await cliente.connect();

try {
  // Se crea con lo mínimo: LOGIN y nada más.
  //
  // NO se declaran NOSUPERUSER ni NOBYPASSRLS a propósito. Son los valores por defecto de
  // PostgreSQL, y fijarlos explícitamente exige ser superusuario — algo que el rol propietario
  // de un PostgreSQL gestionado no es. Intentarlo falla con 42501.
  //
  // La garantía no viene de declararlo, viene de la VERIFICACIÓN del final: si el rol acabara
  // pudiendo saltarse RLS, este script aborta. Comprobar es mejor que afirmar.
  await cliente.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
        CREATE ROLE viajapro_app LOGIN;
        RAISE NOTICE 'Rol viajapro_app creado.';
      ELSE
        RAISE NOTICE 'El rol viajapro_app ya existe.';
      END IF;
    END;
    $$;
  `);

  // `ALTER ROLE ... PASSWORD` no admite parámetros vinculados: es DDL. Hay que interpolar.
  //
  // Es seguro aquí porque la contraseña la genera este mismo script y es hexadecimal pura.
  // La comprobación de abajo no es decorativa: si alguien cambiara la generación a algo que
  // pudiera contener comillas, esto detiene el script antes de construir SQL inyectable.
  if (!/^[0-9a-f]{48}$/.test(clave)) {
    throw new Error('La contraseña generada no es hexadecimal pura; no se interpola en DDL.');
  }
  await cliente.query(`ALTER ROLE viajapro_app WITH PASSWORD '${clave}'`);

  // En Neon el rol propietario hereda neon_superuser, que tiene BYPASSRLS.
  // Si viajapro_app lo heredara, el aislamiento se evapora.
  await cliente.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
         AND pg_has_role('viajapro_app', 'neon_superuser', 'MEMBER') THEN
        REVOKE neon_superuser FROM viajapro_app;
        RAISE NOTICE 'Revocada la membresia de neon_superuser.';
      END IF;
    END;
    $$;
  `);

  await cliente.query(`
    DO $$ BEGIN
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO viajapro_app', current_database());
    END; $$;
  `);
  await cliente.query('GRANT USAGE ON SCHEMA public TO viajapro_app');
  await cliente.query(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app',
  );
  await cliente.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO viajapro_app');
  await cliente.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO viajapro_app',
  );
  await cliente.query(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO viajapro_app',
  );

  // Verificación. Si falla, la configuración NO es segura y es mejor enterarse aquí.
  const { rows } = await cliente.query(
    'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = $1',
    ['viajapro_app'],
  );
  const rol = rows[0];
  if (!rol) throw new Error('El rol viajapro_app no existe tras crearlo.');
  if (rol.rolbypassrls) throw new Error('viajapro_app tiene BYPASSRLS: el aislamiento sería ficticio.');
  if (rol.rolsuper) throw new Error('viajapro_app es superusuario: el aislamiento sería ficticio.');

  const u = new URL(url);
  const hostAgrupado = u.hostname.replace(/^(ep-[^.]+)/, '$1-pooler');
  const base = u.pathname.replace('/', '');

  console.log('');
  console.log('  Verificado: viajapro_app NO puede saltarse RLS.');
  console.log('');
  console.log('  Arma DATABASE_APP_URL en tu .env con estas piezas:');
  console.log('');
  console.log('    usuario      viajapro_app');
  console.log('    contrasena   ' + clave);
  console.log('    host         ' + hostAgrupado + '   (AGRUPADO, con -pooler)');
  console.log('    base         ' + base);
  console.log('    parametros   sslmode=require');
  console.log('');
  console.log('  La contrasena no se guarda. Si la pierdes, vuelve a ejecutar este script.');
} finally {
  await cliente.end();
}
