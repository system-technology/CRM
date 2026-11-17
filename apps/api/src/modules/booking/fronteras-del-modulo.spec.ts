/**
 * Las fronteras de `booking` y del despachador, fijadas leyendo el código fuente (ADR-0024 §3.6.4):
 *
 *   · R4: `quoting` y `booking` no se importan entre sí; hablan por el evento y por el puerto de
 *     `shared/puertos`.
 *   · Ni `booking` ni `shared/eventos` usan una vía «de plataforma» (`sinTenantPorqueEsPlataforma`,
 *     `sinTenantDeclarado`): todo se lee y se escribe bajo RLS, dentro del contexto de una agencia.
 *   · La capa de dominio no importa framework ni Prisma.
 *   · Ningún módulo que cargue `PrismaWebhookService` (el trabajador) registra consumidores de
 *     dominio: el despachador solo vive en el contenedor de la API.
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

describe('fronteras de booking y del despachador', () => {
  const booking = fuentes(join(SRC, 'modules/booking'));
  const quoting = fuentes(join(SRC, 'modules/quoting'));
  const eventos = fuentes(join(SRC, 'shared/eventos'));

  it('hay código que revisar (la prueba no es vacua)', () => {
    expect(booking.length).toBeGreaterThan(5);
    expect(eventos.length).toBeGreaterThan(3);
  });

  it('booking no importa quoting, ni quoting importa booking (R4)', () => {
    const deBooking = booking
      .flatMap(importaciones)
      .filter((i) => /modules\/quoting|\/quoting\//.test(i));
    const deQuoting = quoting
      .flatMap(importaciones)
      .filter((i) => /modules\/booking|\/booking\//.test(i));
    expect(deBooking).toEqual([]);
    expect(deQuoting).toEqual([]);
  });

  it('booking ni el despachador usan vías de plataforma ni el pool del webhook', () => {
    const prohibidos =
      /sinTenantPorqueEsPlataforma|sinTenantDeclarado|PrismaWebhookService|conTenantResuelto/;
    const culpables = [...booking, ...eventos].filter((f) =>
      prohibidos.test(readFileSync(f, 'utf8')),
    );
    expect(culpables).toEqual([]);
  });

  it('el dominio de booking no importa framework, Prisma ni otras capas', () => {
    const dominio = booking.filter((f) => f.includes('/domain/'));
    expect(dominio.length).toBeGreaterThan(0);
    const malos = dominio
      .flatMap(importaciones)
      .filter(
        (i) => /^(@nestjs|@prisma)/.test(i) || /\/(application|infrastructure|interface)\//.test(i),
      );
    expect(malos).toEqual([]);
  });

  it('el módulo de booking solo lo carga la API (AppModule), nunca el trabajador', () => {
    const cargan = fuentes(SRC).filter((f) =>
      importaciones(f).some((i) => /booking\.module/.test(i)),
    );
    expect(cargan.map((f) => f.slice(SRC.length + 1))).toEqual(['app.module.ts']);
  });
});
