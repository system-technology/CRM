/**
 * Fronteras de las notificaciones en la aplicación (R4, ADR-0024 §3.6.4), fijadas leyendo el código:
 * `notifications` no importa `booking`, `crm` ni `identity` y no usa vías «de plataforma»; la capa de
 * dominio no importa framework ni Prisma.
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
    else if (e.name.endsWith('.ts') && !/\.(e2e-)?spec\.ts$/.test(e.name)) encontrados.push(ruta);
  }
  return encontrados;
}

const importaciones = (archivo: string): string[] =>
  [...readFileSync(archivo, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');

describe('fronteras de notifications (avisos en la aplicación)', () => {
  const notifications = fuentes(join(SRC, 'modules/notifications'));

  it('hay código que revisar', () => {
    expect(notifications.length).toBeGreaterThan(8);
  });

  it('no importa booking, crm ni identity (R4): solo sus puertos de shared/', () => {
    const prohibidas = notifications
      .flatMap(importaciones)
      .filter((i) => /modules\/(booking|crm|identity)|\/(booking|crm|identity)\//.test(i));
    expect(prohibidas).toEqual([]);
  });

  it('no usa vías de plataforma ni el pool del webhook', () => {
    const malos = notifications.filter((f) =>
      /sinTenantPorqueEsPlataforma|sinTenantDeclarado|PrismaWebhookService|conTenantResuelto/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(malos).toEqual([]);
  });

  it('el dominio no importa framework ni Prisma', () => {
    const dominio = notifications.filter((f) => f.includes('/domain/'));
    expect(dominio.length).toBeGreaterThan(0);
    const malos = dominio.flatMap(importaciones).filter((i) => /@nestjs|@prisma/.test(i));
    expect(malos).toEqual([]);
  });
});
