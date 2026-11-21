/**
 * Las fronteras de `payments`, fijadas leyendo el código fuente (ADR-0034 §1, ADR-0004):
 *
 *   · R4: `payments` no importa a ningún otro módulo y ningún otro módulo lo importa; lo que necesita
 *     del archivo lo pide por `PuertoArchivoParaCobro` de `shared/puertos`.
 *   · `payments` no toca las tablas ni los modelos de `booking` (el puerto es el único camino).
 *   · Nada de vías «de plataforma»: todo bajo RLS y dentro del contexto de una agencia.
 *   · El dominio no importa framework, Prisma ni otras capas.
 *   · Solo la API lo carga (`AppModule`), nunca el trabajador.
 *   · Ningún `console.*` ni log con los textos libres del libro (`nota`, `referencia`, `motivo`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function fuentes(dir: string): string[] {
  const encontrados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) encontrados.push(...fuentes(ruta));
    else if (
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.spec.ts') &&
      !e.name.endsWith('.e2e-spec.ts')
    ) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

const importaciones = (archivo: string): string[] =>
  [...readFileSync(archivo, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

const sinComentarios = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('fronteras de payments', () => {
  const payments = fuentes(join(SRC, 'modules/payments'));
  const otros = fuentes(join(SRC, 'modules')).filter((f) => !f.includes('/modules/payments/'));

  it('hay código que revisar (la prueba no es vacua)', () => {
    expect(payments.length).toBeGreaterThan(8);
  });

  it('payments no importa ningún otro módulo, ni ninguno importa a payments (R4)', () => {
    const deMiModulo = payments
      .flatMap(importaciones)
      .filter((i) => /modules\/(?!payments)|\/(booking|quoting|crm|inbox|identity)\//.test(i));
    const haciaMiModulo = otros
      .flatMap(importaciones)
      .filter((i) => /modules\/payments|\/payments\//.test(i));
    expect(deMiModulo).toEqual([]);
    // El único que lo nombra es `app.module.ts`, que no está bajo `modules/`.
    expect(haciaMiModulo).toEqual([]);
  });

  it('payments no toca los modelos ni las tablas de booking', () => {
    const culpables = payments.filter((f) =>
      /\b(?:tx|prisma)\.(travelFile|booking|passenger)\.|\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:public\.)?"?(travel_files|bookings|pasajeros)\b/i.test(
        sinComentarios(readFileSync(f, 'utf8')),
      ),
    );
    expect(culpables).toEqual([]);
  });

  it('payments no usa vías de plataforma ni el pool del webhook', () => {
    const prohibidos =
      /sinTenantPorqueEsPlataforma|sinTenantDeclarado|PrismaWebhookService|conTenantResuelto/;
    expect(payments.filter((f) => prohibidos.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('el dominio no importa framework, Prisma ni otras capas', () => {
    const dominio = payments.filter((f) => f.includes('/domain/'));
    expect(dominio.length).toBeGreaterThan(0);
    const malos = dominio
      .flatMap(importaciones)
      .filter(
        (i) => /^(@nestjs|@prisma)/.test(i) || /\/(application|infrastructure|interface)\//.test(i),
      );
    expect(malos).toEqual([]);
  });

  it('el módulo solo lo carga la API (AppModule), nunca el trabajador', () => {
    const cargan = fuentes(SRC).filter((f) =>
      importaciones(f).some((i) => /payments\.module/.test(i)),
    );
    expect(cargan.map((f) => f.slice(SRC.length + 1))).toEqual(['app.module.ts']);
  });

  it('ningún log ni console recibe nota, referencia ni motivo', () => {
    const culpables = payments.filter((f) => {
      const t = sinComentarios(readFileSync(f, 'utf8'));
      return /(console\.\w+|log\.\w+|logger\.\w+)\([^)]*\b(nota|referencia|motivo)\b/i.test(t);
    });
    expect(culpables).toEqual([]);
  });

  it('el candado usa el mismo espacio que el disparador pagos_validar_alta', () => {
    const migracion = readFileSync(
      join(
        process.cwd(),
        '../../packages/database/prisma/migrations/20261121140000_pagos_del_viajero_libro_de_cobro/migration.sql',
      ),
      'utf8',
    );
    const delDisparador = /c_espacio_del_cobro constant pg_catalog\.int4 := (\d+)/.exec(migracion);
    const delRepositorio = /ESPACIO_DE_CANDADO_DEL_COBRO = ([\d_]+)/.exec(
      readFileSync(join(SRC, 'modules/payments/infrastructure/cobros.prisma.ts'), 'utf8'),
    );
    expect(delDisparador?.[1]).toBeDefined();
    expect(delRepositorio?.[1]?.replaceAll('_', '')).toBe(delDisparador?.[1]);
    // Y la misma forma de la clave: hash de «tenant:archivo».
    expect(migracion).toMatch(
      /hashtext\(NEW\.tenant_id::text \|\| ':' \|\| NEW\.travel_file_id::text\)/,
    );
  });

  it('el lock_timeout se fija dentro de la transacción y ANTES del candado', () => {
    const t = readFileSync(join(SRC, 'modules/payments/infrastructure/cobros.prisma.ts'), 'utf8');
    const timeout = t.indexOf("set_config('lock_timeout', ${ESPERA_MAXIMA_DEL_BLOQUEO}, true)");
    const candado = t.indexOf('SELECT pg_advisory_xact_lock(');
    expect(timeout).toBeGreaterThan(-1);
    expect(candado).toBeGreaterThan(timeout);
  });
});
