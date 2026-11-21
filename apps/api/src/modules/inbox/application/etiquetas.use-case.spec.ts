/**
 * Los casos de uso de las etiquetas con un puerto de mentira: la visibilidad llega al puerto tal
 * como la dicta el contexto, cada «no existe / no es de tu agencia» es su 404, el relay solo se
 * avisa si hubo cambio, y avisar al relay nunca rompe una acción ya confirmada. La consulta real
 * contra PostgreSQL está en `etiquetas.e2e-spec.ts`.
 */
import { Logger } from '@nestjs/common';
import type { ConversacionResumen, Etiqueta, Permiso } from '@viajapro/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ConversacionNoEncontradaError } from '../domain/errores-de-conversacion.js';
import { EtiquetaNoEncontradaError } from '../domain/errores-de-etiqueta.js';
import { EtiquetarConversacionUseCase } from './etiquetar-conversacion.js';
import { GestionarEtiquetasUseCase } from './gestionar-etiquetas.js';
import { PuertoDeEtiquetas, type ResultadoDeEtiquetar } from './puerto-de-etiquetas.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const ANA = '01932000-0000-7000-8000-0000000000a1';
const C = '01932000-0000-7000-8000-0000000000c1';
const E = '01932000-0000-7000-8000-0000000000e1';

const como = <T>(fn: () => T, permisos: Permiso[] = []): T =>
  ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId: ANA,
      identidadId: null,
      permisos: new Set(permisos),
      trazaId: 't',
    },
    fn,
  );

const RESUMEN = { id: C, etiquetas: [] } as unknown as ConversacionResumen;
const UNA: Etiqueta = { id: E, nombre: 'Pagado', color: 'verde', orden: 0 };

class PuertoFalso extends PuertoDeEtiquetas {
  visibilidades: Visibilidad[] = [];
  actores: Array<string | null> = [];
  resultado: ResultadoDeEtiquetar = { resultado: 'OK', resumen: RESUMEN, cambio: true };
  existe = true;
  listar(): Promise<Etiqueta[]> {
    return Promise.resolve([UNA]);
  }
  crear(actorId: string | null): Promise<Etiqueta> {
    this.actores.push(actorId);
    return Promise.resolve(UNA);
  }
  actualizar(actorId: string | null): Promise<Etiqueta | null> {
    this.actores.push(actorId);
    return Promise.resolve(this.existe ? UNA : null);
  }
  borrar(): Promise<boolean> {
    return Promise.resolve(this.existe);
  }
  poner(v: Visibilidad): Promise<ResultadoDeEtiquetar> {
    this.visibilidades.push(v);
    return Promise.resolve(this.resultado);
  }
  quitar(v: Visibilidad): Promise<ResultadoDeEtiquetar> {
    this.visibilidades.push(v);
    return Promise.resolve(this.resultado);
  }
}

class RelayFalso extends PuertoAvisoAlRelay {
  avisos: string[] = [];
  falla = false;
  avisar(tenantId: string): Promise<void> {
    if (this.falla) return Promise.reject(new Error('redis caído'));
    this.avisos.push(tenantId);
    return Promise.resolve();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('EtiquetarConversacionUseCase', () => {
  it('pasa al puerto la visibilidad del contexto: sin ver_todas, asignadas y cola', async () => {
    const puerto = new PuertoFalso();
    const uc = new EtiquetarConversacionUseCase(puerto, new RelayFalso());
    await como(() => uc.poner(C, E));
    await como(() => uc.quitar(C, E), ['conversaciones.ver_todas']);
    expect(puerto.visibilidades).toEqual([
      { alcance: 'ASIGNADAS_Y_COLA', usuarioId: ANA },
      { alcance: 'TODAS' },
    ]);
  });

  it('una conversación que no se ve es CONVERSACION_NO_ENCONTRADA (404)', async () => {
    const puerto = new PuertoFalso();
    puerto.resultado = { resultado: 'CONVERSACION_NO_ENCONTRADA' };
    const uc = new EtiquetarConversacionUseCase(puerto, new RelayFalso());
    await expect(como(() => uc.poner(C, E))).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
    await expect(como(() => uc.quitar(C, E))).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
  });

  it('una etiqueta ajena o inexistente es ETIQUETA_NO_ENCONTRADA (404)', async () => {
    const puerto = new PuertoFalso();
    puerto.resultado = { resultado: 'ETIQUETA_NO_ENCONTRADA' };
    const uc = new EtiquetarConversacionUseCase(puerto, new RelayFalso());
    await expect(como(() => uc.poner(C, E))).rejects.toBeInstanceOf(EtiquetaNoEncontradaError);
  });

  it('avisa al relay solo si hubo cambio', async () => {
    const puerto = new PuertoFalso();
    const relay = new RelayFalso();
    const uc = new EtiquetarConversacionUseCase(puerto, relay);
    await como(() => uc.poner(C, E));
    puerto.resultado = { resultado: 'OK', resumen: RESUMEN, cambio: false };
    await como(() => uc.poner(C, E));
    expect(relay.avisos).toEqual([TENANT]);
  });

  it('si el aviso al relay falla, la acción ya confirmada responde igual y se deja constancia sin datos', async () => {
    const puerto = new PuertoFalso();
    const relay = new RelayFalso();
    relay.falla = true;
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const uc = new EtiquetarConversacionUseCase(puerto, relay);
    await expect(como(() => uc.poner(C, E))).resolves.toBe(RESUMEN);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0]?.[0])).not.toMatch(/Pagado/);
  });
});

describe('GestionarEtiquetasUseCase', () => {
  it('lista el catálogo en {datos}', async () => {
    const uc = new GestionarEtiquetasUseCase(new PuertoFalso());
    expect(await como(() => uc.listar())).toEqual({ datos: [UNA] });
  });

  it('crea y actualiza con el usuario de la sesión como autor', async () => {
    const puerto = new PuertoFalso();
    const uc = new GestionarEtiquetasUseCase(puerto);
    await como(() => uc.crear({ nombre: 'Pagado', color: 'verde' }));
    await como(() => uc.actualizar(E, { color: 'azul' }));
    expect(puerto.actores).toEqual([ANA, ANA]);
  });

  it('renombrar o borrar una que no existe (o es ajena) es ETIQUETA_NO_ENCONTRADA', async () => {
    const puerto = new PuertoFalso();
    puerto.existe = false;
    const uc = new GestionarEtiquetasUseCase(puerto);
    await expect(como(() => uc.actualizar(E, { color: 'azul' }))).rejects.toBeInstanceOf(
      EtiquetaNoEncontradaError,
    );
    await expect(como(() => uc.borrar(E))).rejects.toBeInstanceOf(EtiquetaNoEncontradaError);
  });
});
