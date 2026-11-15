/**
 * R10: la lectura auditada. Sin base: la transacción es un doble que apunta lo que se escribiría.
 */
import { describe, expect, it } from 'vitest';
import type { ClienteTenant } from '../prisma/prisma.service.js';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import { ACCION_LECTURA_SENSIBLE, RegistroDeLectura } from './lectura-auditada.js';
import { COLUMNAS_CIFRADAS } from './puerto-de-cifrado.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const USUARIO = '01932000-0000-7000-8000-0000000000bb';

function txQueApunta() {
  const escritas: Array<Record<string, unknown>> = [];
  const tx = {
    registroAuditoria: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        escritas.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as ClienteTenant;
  return { tx, escritas };
}

const enContexto = <T>(fn: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: USUARIO, identidadId: null, permisos: new Set(), trazaId: 't' },
    fn,
  );

describe('RegistroDeLectura', () => {
  it('una fila por respuesta: quién, a qué (columnas e ids) y NUNCA el valor', async () => {
    const { tx, escritas } = txQueApunta();
    const r = new RegistroDeLectura();
    expect(r.anotar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, 'm1', 'Pasaporte AB123')).toBe(
      'Pasaporte AB123',
    );
    r.anotar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, 'm2', 'Alergia');
    r.anotar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, 'n1', 'Nota');
    await enContexto(() => r.registrar(tx, 'Conversacion', 'c1'));

    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toEqual({
      tenantId: TENANT,
      usuarioId: USUARIO,
      accion: ACCION_LECTURA_SENSIBLE,
      entidad: 'Conversacion',
      entidadId: 'c1',
      detalle: {
        camposSensibles: ['mensajes.texto', 'notas_internas.texto'],
        filas: ['m1', 'm2', 'n1'],
      },
    });
    expect(JSON.stringify(escritas)).not.toMatch(/AB123|Alergia|Nota/);
  });

  it('sin ningún valor descifrado (todo nulo) no escribe nada', async () => {
    const { tx, escritas } = txQueApunta();
    const r = new RegistroDeLectura();
    r.anotar(COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO, 'c1', null);
    await enContexto(() => r.registrar(tx, 'Conversacion', null));
    expect(escritas).toHaveLength(0);
  });
});
