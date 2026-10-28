/**
 * El caso de uso con puertos de mentira: se afirma que el texto sale de `quoting` por el puerto, que
 * la clave de idempotencia es la derivada, que la ventana cerrada y la cotización de otro contacto
 * se propagan sin enviar nada, y que fallar el aviso al relay no rompe un envío ya guardado.
 * La transacción real (RLS, ventana, unicidad de la clave) está en `enviar-cotizacion.e2e-spec.ts`.
 */
import type { Mensaje } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { Visibilidad } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import {
  type CotizacionParaWhatsapp,
  PuertoCotizacionParaWhatsapp,
} from '../../../shared/puertos/puertos-hacia-quoting.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { claveDeEnvioDeCotizacion } from '../domain/clave-de-envio-de-cotizacion.js';
import {
  ConversacionNoEncontradaError,
  CotizacionParaEnvioNoEncontradaError,
  VentanaCerradaError,
} from '../domain/errores-de-conversacion.js';
import { EnviarCotizacionPorWhatsapp } from './enviar-cotizacion-por-whatsapp.js';
import { type EntradaDeRespuesta, PuertoConversaciones } from './puertos-de-conversaciones.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const ANA = '01932000-0000-7000-8000-0000000000a1';
const CONV = '01932000-0000-7000-8000-0000000000c1';
const COT = '01932000-0000-7000-8000-0000000000f1';
const CONTACTO = '01932000-0000-7000-8000-0000000000b1';

const comoAna = <T>(fn: () => T): T =>
  ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: ANA, identidadId: null, permisos: new Set(), trazaId: 't' },
    fn,
  );

class Cotizaciones extends PuertoCotizacionParaWhatsapp {
  pedidos: Array<[string, string, number | undefined]> = [];
  constructor(private readonly respuesta: CotizacionParaWhatsapp | null) {
    super();
  }
  textoDeVersion(t: string, c: string, v: number | undefined) {
    this.pedidos.push([t, c, v]);
    return Promise.resolve(this.respuesta);
  }
}

const MENSAJE = { id: 'm1' } as unknown as Mensaje;

/** Solo `responder` importa aquí: el resto del puerto no se usa. */
class Conversaciones {
  llamadas: Array<{ v: Visibilidad; id: string; entrada: EntradaDeRespuesta }> = [];
  constructor(private readonly comportamiento: () => Promise<Mensaje | null>) {}
  responder(v: Visibilidad, _a: string | null, id: string, entrada: EntradaDeRespuesta) {
    this.llamadas.push({ v, id, entrada });
    return this.comportamiento();
  }
}

const crear = (
  cotizaciones: PuertoCotizacionParaWhatsapp,
  conversaciones: Conversaciones,
  relay: PuertoAvisoAlRelay,
): EnviarCotizacionPorWhatsapp =>
  new EnviarCotizacionPorWhatsapp(
    cotizaciones,
    conversaciones as unknown as PuertoConversaciones,
    relay,
  );

class Relay extends PuertoAvisoAlRelay {
  avisos: string[] = [];
  constructor(private readonly falla = false) {
    super();
  }
  avisar(tenantId: string): Promise<void> {
    this.avisos.push(tenantId);
    return this.falla ? Promise.reject(new Error('redis caído')) : Promise.resolve();
  }
}

const cot = (sobre: Partial<CotizacionParaWhatsapp> = {}): CotizacionParaWhatsapp => ({
  cotizacionId: COT,
  contactoId: CONTACTO,
  version: 2,
  texto: '*Cotización*',
  ...sobre,
});

describe('EnviarCotizacionPorWhatsapp', () => {
  it('guarda el texto armado por quoting con la clave derivada y la cotización', async () => {
    const cotizaciones = new Cotizaciones(cot());
    const conversaciones = new Conversaciones(() => Promise.resolve(MENSAJE));
    const relay = new Relay();
    const uc = crear(cotizaciones, conversaciones, relay);

    const m = await comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT, version: 2 }));

    expect(m).toBe(MENSAJE);
    expect(cotizaciones.pedidos).toEqual([[TENANT, COT, 2]]);
    const { id, entrada } = conversaciones.llamadas[0]!;
    expect(id).toBe(CONV);
    expect(entrada.texto).toBe('*Cotización*');
    expect(entrada.cotizacion).toEqual({ id: COT, contactoId: CONTACTO });
    expect(entrada.claveIdempotencia).toBe(
      claveDeEnvioDeCotizacion({
        tenantId: TENANT,
        conversacionId: CONV,
        cotizacionId: COT,
        version: 2,
      }),
    );
    expect(relay.avisos).toEqual([TENANT]);
  });

  it('sin versión pedida, la clave usa la versión que armó quoting (la última)', async () => {
    const conversaciones = new Conversaciones(() => Promise.resolve(MENSAJE));
    const uc = crear(new Cotizaciones(cot({ version: 5 })), conversaciones, new Relay());
    await comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }));
    expect(conversaciones.llamadas[0]!.entrada.claveIdempotencia).toBe(
      claveDeEnvioDeCotizacion({
        tenantId: TENANT,
        conversacionId: CONV,
        cotizacionId: COT,
        version: 5,
      }),
    );
  });

  it('dos envíos iguales usan la misma clave (idempotencia)', async () => {
    const conversaciones = new Conversaciones(() => Promise.resolve(MENSAJE));
    const uc = crear(new Cotizaciones(cot()), conversaciones, new Relay());
    await comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }));
    await comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }));
    const [a, b] = conversaciones.llamadas;
    expect(a!.entrada.claveIdempotencia).toBe(b!.entrada.claveIdempotencia);
  });

  it('cotización inexistente: error tipado y no toca la conversación', async () => {
    const conversaciones = new Conversaciones(() => Promise.resolve(MENSAJE));
    const uc = crear(new Cotizaciones(null), conversaciones, new Relay());
    await expect(comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }))).rejects.toBeInstanceOf(
      CotizacionParaEnvioNoEncontradaError,
    );
    expect(conversaciones.llamadas).toHaveLength(0);
  });

  it('conversación no visible: el mismo 404 que una inexistente, sin avisar al relay', async () => {
    const relay = new Relay();
    const uc = crear(
      new Cotizaciones(cot()),
      new Conversaciones(() => Promise.resolve(null)),
      relay,
    );
    await expect(comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }))).rejects.toBeInstanceOf(
      ConversacionNoEncontradaError,
    );
    expect(relay.avisos).toHaveLength(0);
  });

  it('fuera de la ventana de 24 h propaga VentanaCerradaError y no avisa (nada se guardó)', async () => {
    const relay = new Relay();
    const uc = crear(
      new Cotizaciones(cot()),
      new Conversaciones(() => Promise.reject(new VentanaCerradaError())),
      relay,
    );
    await expect(comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }))).rejects.toBeInstanceOf(
      VentanaCerradaError,
    );
    expect(relay.avisos).toHaveLength(0);
  });

  it('si avisar al relay falla, el envío ya guardado se devuelve igual', async () => {
    const uc = crear(
      new Cotizaciones(cot()),
      new Conversaciones(() => Promise.resolve(MENSAJE)),
      new Relay(true),
    );
    await expect(comoAna(() => uc.ejecutar(CONV, { cotizacionId: COT }))).resolves.toBe(MENSAJE);
  });
});
