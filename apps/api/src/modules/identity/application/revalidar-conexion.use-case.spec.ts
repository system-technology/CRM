/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * El contrato de revalidación del socket. La prueba contra un Socket.IO real queda pendiente
 * (`it.todo` en `identity.e2e-spec.ts`) hasta que exista el gateway.
 */
import { describe, expect, it } from 'vitest';
import {
  type EntradaDeAcceso,
  ResolutorDeAcceso,
  type ResultadoDeAcceso,
} from '../../../shared/puertos/puerto-de-acceso.js';
import { INTERVALO_DE_REVALIDACION_MS, RevalidarConexion } from './revalidar-conexion.use-case.js';

class Resolutor extends ResolutorDeAcceso {
  entradas: EntradaDeAcceso[] = [];
  constructor(private readonly r: ResultadoDeAcceso) {
    super();
  }
  async resolver(e: EntradaDeAcceso): Promise<ResultadoDeAcceso> {
    this.entradas.push(e);
    return this.r;
  }
}

describe('RevalidarConexion', () => {
  it('el intervalo es de 60 segundos', () => {
    expect(INTERVALO_DE_REVALIDACION_MS).toBe(60_000);
  });

  it('con acceso vigente, mantiene la conexión y trae los permisos de ESE momento', async () => {
    const acceso = {
      tenantId: 't',
      usuarioId: 'u',
      identidadId: 'i',
      sesionId: 's',
      rol: 'Asesor',
      permisos: new Set<never>(),
    };
    const resolutor = new Resolutor({ concedido: true, acceso, cookies: [] });
    const d = await new RevalidarConexion(resolutor).ejecutar('cookie-del-handshake');
    expect(d).toEqual({ mantener: true, acceso });
    // Con la cookie guardada en el handshake: pasa por el paso 3, no solo por el 4.
    expect(resolutor.entradas).toEqual([{ cookie: 'cookie-del-handshake' }]);
  });

  it.each(['SIN_SESION', 'SIN_AGENCIA_ACTIVA', 'ACCESO_REVOCADO', 'AGENCIA_SUSPENDIDA'] as const)(
    'con %s, cierra la conexión',
    async (motivo) => {
      const d = await new RevalidarConexion(
        new Resolutor({ concedido: false, motivo, cookies: [] }),
      ).ejecutar('x');
      expect(d).toEqual({ mantener: false, motivo });
    },
  );
});
