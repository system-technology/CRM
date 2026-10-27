/**
 * Pruebas unitarias de `AplicadorPorId` con puertos en memoria.
 *
 * El doble de la unidad de trabajo revierte todo (catálogo y auditoría) si la función lanza, igual
 * que la transacción real. La prueba contra PostgreSQL con RLS está en
 * `vigencias-y-tarifas.e2e-spec.ts`.
 */

import type {
  CrearTarifa,
  CrearVigencia,
  Permiso,
  ProductoPropuesto,
  TarifaPropuesta,
} from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { PaqueteNoEncontradoError } from '../domain/errors.js';
import {
  MayoristaNoEncontradoError,
  TarifaDuplicadaError,
  VigenciaDuplicadaError,
  VigenciaEmpatadaError,
  VigenciaInvalidaError,
  VigenciaNoEncontradaError,
} from '../domain/errores-de-gestion.js';
import {
  type CatalogoActual,
  type PaqueteActual,
  type TarifaActual,
  type VigenciaActual,
  normalizarNombre,
} from '../domain/validar-y-planificar.js';
import { AplicadorDeCatalogo, type ContextoDeAplicacion } from './aplicador-de-catalogo.js';
import { AplicadorPorId } from './aplicador-por-id.js';
import {
  type ActorDelCambio,
  type CambioRegistrado,
  CatalogoPersistente,
  RegistroDeCambios,
  type ResultadoDeDesactivar,
  UnidadDeTrabajoDeCatalogo,
} from './puertos-de-catalogo.js';
import {
  type EspacioDeGestion,
  OperacionesPorId,
  UnidadDeTrabajoDeGestion,
  type VentanaDeVigencia,
} from './puertos-de-gestion.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type VigenciaM = Omit<Mutable<VigenciaActual>, 'tarifas'> & { tarifas: Mutable<TarifaActual>[] };
type PaqueteM = Omit<Mutable<PaqueteActual>, 'vigencias'> & { vigencias: VigenciaM[] };

interface Estado {
  paquetes: PaqueteM[];
  mayoristas: Map<string, string>;
  auditoria: { actor: ActorDelCambio; cambio: CambioRegistrado }[];
  secuencia: number;
}

class CatalogoMemoria extends CatalogoPersistente {
  constructor(private readonly e: Estado) {
    super();
  }
  bloquear(): Promise<void> {
    return Promise.resolve();
  }
  leer(): Promise<CatalogoActual> {
    return Promise.resolve({
      paquetes: structuredClone(this.e.paquetes),
      mayoristas: [...this.e.mayoristas.values()],
    });
  }
  guardarPaquete(): Promise<string> {
    throw new Error('la gestión por id no escribe paquetes');
  }
  guardarVigencia(
    paqueteId: string,
    v: { desde: string; hasta: string; publicada: boolean },
  ): Promise<string> {
    const paquete = this.e.paquetes.find((x) => x.id === paqueteId);
    if (!paquete) throw new Error('paquete inexistente');
    const existente = paquete.vigencias.find((x) => x.desde === v.desde && x.hasta === v.hasta);
    if (existente) {
      existente.publicada = v.publicada;
      return Promise.resolve(existente.id ?? '');
    }
    const id = `v${++this.e.secuencia}`;
    paquete.vigencias.push({ id, ...v, cupoTotal: null, tarifas: [] });
    return Promise.resolve(id);
  }
  guardarTarifa(
    paqueteId: string,
    vigenciaId: string,
    t: TarifaPropuesta,
    opciones: { conservarNeto: boolean },
  ): Promise<string> {
    const vigencia = this.e.paquetes
      .find((x) => x.id === paqueteId)
      ?.vigencias.find((x) => x.id === vigenciaId);
    if (!vigencia) throw new Error('vigencia inexistente');
    const existente = vigencia.tarifas.find(
      (x) => normalizarNombre(x.nombre) === normalizarNombre(t.nombre),
    );
    const fila: Mutable<TarifaActual> = {
      id: existente?.id ?? `t${++this.e.secuencia}`,
      nombre: t.nombre,
      unidad: t.unidad,
      cubrePasajeros: t.cubrePasajeros,
      neto: opciones.conservarNeto ? (existente?.neto ?? null) : t.neto,
      venta: t.venta,
      lista: t.lista ?? null,
      promoHasta: t.promoHasta ?? null,
      mayorista: t.mayorista,
      mayoristaId: null,
      opcionDeSalida: existente?.opcionDeSalida ?? null,
      aditiva: t.aditiva,
      condicion: t.condicion,
    };
    if (existente) Object.assign(existente, fila);
    else vigencia.tarifas.push(fila);
    return Promise.resolve(fila.id ?? '');
  }
  desactivarPaquete(): Promise<ResultadoDeDesactivar> {
    throw new Error('no aplica');
  }
}

class RegistroMemoria extends RegistroDeCambios {
  constructor(private readonly e: Estado) {
    super();
  }
  registrar(actor: ActorDelCambio, cambios: readonly CambioRegistrado[]): Promise<void> {
    for (const cambio of cambios) this.e.auditoria.push({ actor, cambio });
    return Promise.resolve();
  }
}

class PorIdMemoria extends OperacionesPorId {
  constructor(private readonly e: Estado) {
    super();
  }
  nombreDeMayorista(id: string): Promise<string | null> {
    return Promise.resolve(this.e.mayoristas.get(id) ?? null);
  }
  actualizarVigencia(id: string, ventana: VentanaDeVigencia): Promise<void> {
    for (const p of this.e.paquetes) {
      const v = p.vigencias.find((x) => x.id === id);
      if (v) Object.assign(v, ventana);
    }
    return Promise.resolve();
  }
  eliminarTarifa(id: string): Promise<void> {
    for (const p of this.e.paquetes) {
      for (const v of p.vigencias) v.tarifas = v.tarifas.filter((t) => t.id !== id);
    }
    return Promise.resolve();
  }
}

class TrabajoMemoria extends UnidadDeTrabajoDeGestion {
  estado: Estado = {
    paquetes: [],
    mayoristas: new Map(),
    auditoria: [],
    secuencia: 0,
  };

  async ejecutar<T>(fn: (espacio: EspacioDeGestion) => Promise<T>): Promise<T> {
    const respaldo = structuredClone(this.estado);
    try {
      return await fn({
        catalogo: new CatalogoMemoria(this.estado),
        registro: new RegistroMemoria(this.estado),
        porId: new PorIdMemoria(this.estado),
      });
    } catch (error) {
      this.estado = respaldo;
      throw error;
    }
  }
}

/** Adapta la unidad de gestión al puerto que espera `AplicadorDeCatalogo` (no se usa su `aplicar`). */
class TrabajoDeCatalogoInerte extends UnidadDeTrabajoDeCatalogo {
  ejecutar<T>(): Promise<T> {
    throw new Error('no aplica');
  }
}

// ------------------------------------------------------------------------------------------------

const USUARIO = '01932000-0000-7000-8000-00000000aaaa';
const MAYORISTA = '01932000-0000-7000-8000-0000000000ee';
const ADMIN: Permiso[] = ['catalogo.administrar'];
const ADMIN_CON_NETO: Permiso[] = ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'];
const contexto = (permisos: Permiso[] = ADMIN): ContextoDeAplicacion => ({
  tenantId: '01932000-0000-7000-8000-0000000000d1',
  usuarioId: USUARIO,
  permisos,
});

const CONDICION = {
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
} as const;

const nuevaTarifa = (nombre: string, venta: string, neto: string | null = null): CrearTarifa => ({
  nombre,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  neto: neto === null ? null : { unidades: neto, moneda: 'COP' },
  venta: { unidades: venta, moneda: 'COP' },
  mayoristaId: null,
  aditiva: false,
  condicion: CONDICION,
});

const nuevaVigencia = (
  desde: string,
  hasta: string,
  tarifas: CrearTarifa[] = [nuevaTarifa('Adulto', '900000')],
): CrearVigencia => ({
  paqueteId: 'p1',
  desde,
  hasta,
  publicada: false,
  cupoTotal: null,
  tarifas,
});

function montar() {
  const trabajo = new TrabajoMemoria();
  const producto: ProductoPropuesto = {
    nombre: 'Isla Corona',
    destino: 'Cartagena',
    dias: 1,
    noches: 0,
    vigencias: [],
  };
  trabajo.estado.paquetes.push({
    id: 'p1',
    codigo: null,
    nombre: producto.nombre,
    destino: producto.destino,
    dias: producto.dias,
    noches: producto.noches,
    planAlimentacion: null,
    inclusiones: [],
    exclusiones: [],
    vigencias: [],
  });
  trabajo.estado.mayoristas.set(MAYORISTA, 'Mayorista Uno');
  const aplicador = new AplicadorDeCatalogo(new TrabajoDeCatalogoInerte());
  return { trabajo, servicio: new AplicadorPorId(trabajo, aplicador) };
}

describe('AplicadorPorId · vigencias', () => {
  it('crea una vigencia con su tarifa y audita el precio con origen PANTALLA', async () => {
    const { trabajo, servicio } = montar();
    const r = await servicio.crearVigencia(nuevaVigencia('2026-11-01', '2027-06-30'), contexto());

    expect(r.id).toBe('v1');
    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.venta.unidades).toBe('900000');
    expect(trabajo.estado.auditoria).toHaveLength(1);
    expect(trabajo.estado.auditoria[0]).toMatchObject({
      actor: { usuarioId: USUARIO },
      cambio: {
        accion: 'catalogo.tarifa.creada',
        detalle: {
          campo: 'venta',
          antes: null,
          despues: '900000',
          moneda: 'COP',
          origen: 'PANTALLA',
        },
      },
    });
  });

  it('es idempotente: repetir la misma creación no escribe ni audita nada más', async () => {
    const { trabajo, servicio } = montar();
    const datos = nuevaVigencia('2026-11-01', '2027-06-30');
    const primera = await servicio.crearVigencia(datos, contexto());
    const antes = structuredClone(trabajo.estado);
    const segunda = await servicio.crearVigencia(datos, contexto());

    expect(segunda.id).toBe(primera.id);
    expect(trabajo.estado).toEqual(antes);
  });

  it('con la misma ventana y datos distintos responde VIGENCIA_DUPLICADA y no cambia nada', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2026-11-01', '2027-06-30'), contexto());
    const antes = structuredClone(trabajo.estado);

    await expect(
      servicio.crearVigencia(
        nuevaVigencia('2026-11-01', '2027-06-30', [nuevaTarifa('Adulto', '950000')]),
        contexto(),
      ),
    ).rejects.toBeInstanceOf(VigenciaDuplicadaError);
    expect(trabajo.estado).toEqual(antes);
  });

  it('rechaza el empate (igual longitud, solapadas) con VIGENCIA_EMPATADA y no guarda nada', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    const antes = structuredClone(trabajo.estado);

    const intento = servicio.crearVigencia(nuevaVigencia('2027-01-15', '2027-02-14'), contexto());
    await expect(intento).rejects.toBeInstanceOf(VigenciaEmpatadaError);
    await expect(intento).rejects.toMatchObject({ code: 'VIGENCIA_EMPATADA' });
    expect(trabajo.estado).toEqual(antes);
  });

  it('una vigencia más específica dentro de otra no es empate', async () => {
    const { servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-03-31'), contexto());
    await expect(
      servicio.crearVigencia(nuevaVigencia('2027-02-01', '2027-02-10'), contexto()),
    ).resolves.toMatchObject({ id: 'v3' });
  });

  it('un paquete que no existe es PAQUETE_NO_ENCONTRADO', async () => {
    const { servicio } = montar();
    await expect(
      servicio.crearVigencia(
        { ...nuevaVigencia('2027-01-01', '2027-01-31'), paqueteId: 'x' },
        contexto(),
      ),
    ).rejects.toBeInstanceOf(PaqueteNoEncontradoError);
  });

  it('un mayoristaId que no es de la agencia es MAYORISTA_NO_ENCONTRADO y no guarda nada', async () => {
    const { trabajo, servicio } = montar();
    const tarifa: CrearTarifa = { ...nuevaTarifa('Adulto', '900000'), mayoristaId: 'ajeno' };
    await expect(
      servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31', [tarifa]), contexto()),
    ).rejects.toBeInstanceOf(MayoristaNoEncontradoError);
    expect(trabajo.estado.paquetes[0]?.vigencias).toHaveLength(0);
  });

  it('mover la ventana a un empate es 409 y la vigencia queda donde estaba', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    const b = await servicio.crearVigencia(nuevaVigencia('2027-03-01', '2027-03-31'), contexto());
    const antes = structuredClone(trabajo.estado);

    await expect(
      servicio.editarVigencia(b.id, { desde: '2027-01-15', hasta: '2027-02-14' }, contexto()),
    ).rejects.toBeInstanceOf(VigenciaEmpatadaError);
    expect(trabajo.estado).toEqual(antes);
  });

  it('mover la ventana sin empate la actualiza y audita antes y después', async () => {
    const { trabajo, servicio } = montar();
    const a = await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    await servicio.editarVigencia(a.id, { desde: '2027-04-01', hasta: '2027-04-30' }, contexto());

    expect(trabajo.estado.paquetes[0]?.vigencias[0]).toMatchObject({
      desde: '2027-04-01',
      hasta: '2027-04-30',
    });
    expect(trabajo.estado.auditoria.at(-1)?.cambio).toMatchObject({
      accion: 'catalogo.vigencia.modificada',
      detalle: {
        antes: { desde: '2027-01-01', hasta: '2027-01-31' },
        despues: { desde: '2027-04-01', hasta: '2027-04-30' },
      },
    });
  });

  it('mover la ventana encima de otra idéntica es VIGENCIA_DUPLICADA', async () => {
    const { servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    const b = await servicio.crearVigencia(nuevaVigencia('2027-03-01', '2027-03-31'), contexto());
    await expect(
      servicio.editarVigencia(b.id, { desde: '2027-01-01', hasta: '2027-01-31' }, contexto()),
    ).rejects.toBeInstanceOf(VigenciaDuplicadaError);
  });

  it('publicar una vigencia abierta es VIGENCIA_INVALIDA; sin cambios no escribe', async () => {
    const { trabajo, servicio } = montar();
    const a = await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    await expect(
      servicio.editarVigencia(a.id, { publicada: true }, contexto()),
    ).rejects.toBeInstanceOf(VigenciaInvalidaError);
    const antes = structuredClone(trabajo.estado);
    await servicio.editarVigencia(a.id, { desde: '2027-01-01' }, contexto());
    expect(trabajo.estado).toEqual(antes);
  });

  it('una vigencia inexistente es VIGENCIA_NO_ENCONTRADO', async () => {
    const { servicio } = montar();
    await expect(
      servicio.editarVigencia('nope', { publicada: false }, contexto()),
    ).rejects.toBeInstanceOf(VigenciaNoEncontradaError);
  });
});

describe('AplicadorPorId · tarifas', () => {
  it('editar la venta audita campo, antes, después, moneda y origen', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    const tarifaId = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.id ?? '';

    await servicio.editarTarifa(
      tarifaId,
      { venta: { unidades: '950000', moneda: 'COP' } },
      contexto(),
    );

    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.venta.unidades).toBe('950000');
    const fila = trabajo.estado.auditoria.at(-1)?.cambio;
    expect(fila).toMatchObject({
      accion: 'catalogo.tarifa.modificada',
      entidadId: tarifaId,
      detalle: {
        campo: 'venta',
        antes: '900000',
        despues: '950000',
        moneda: 'COP',
        origen: 'PANTALLA',
      },
    });
    // Sin datos personales: solo importes, moneda y origen.
    expect(Object.keys(fila?.detalle ?? {}).sort()).toEqual(
      ['antes', 'campo', 'despues', 'huella', 'moneda', 'origen'].sort(),
    );
  });

  it('con permiso de neto, cambiar el neto audita antes y después', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(
      nuevaVigencia('2027-01-01', '2027-01-31', [nuevaTarifa('Adulto', '900000', '700000')]),
      contexto(ADMIN_CON_NETO),
    );
    const tarifaId = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.id ?? '';
    await servicio.editarTarifa(
      tarifaId,
      { neto: { unidades: '720000', moneda: 'COP' } },
      contexto(ADMIN_CON_NETO),
    );
    expect(trabajo.estado.auditoria.at(-1)?.cambio.detalle).toMatchObject({
      campo: 'neto',
      antes: '700000',
      despues: '720000',
    });
  });

  it('sin permiso de neto, editar la venta conserva el neto y no lo audita', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(
      nuevaVigencia('2027-01-01', '2027-01-31', [nuevaTarifa('Adulto', '900000', '700000')]),
      contexto(ADMIN_CON_NETO),
    );
    const tarifaId = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.id ?? '';
    const previas = trabajo.estado.auditoria.length;
    await servicio.editarTarifa(
      tarifaId,
      { venta: { unidades: '1000000', moneda: 'COP' } },
      contexto(ADMIN),
    );
    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.neto?.unidades).toBe('700000');
    const detalles = trabajo.estado.auditoria
      .slice(previas)
      .map((a) => JSON.stringify(a.cambio.detalle));
    expect(detalles).toHaveLength(1);
    expect(detalles.join()).not.toContain('700000');
  });

  it('crear una tarifa con el mismo nombre y otro precio es TARIFA_DUPLICADA; idéntica, idempotente', async () => {
    const { trabajo, servicio } = montar();
    const v = await servicio.crearVigencia(nuevaVigencia('2027-01-01', '2027-01-31'), contexto());
    await expect(
      servicio.crearTarifa(v.id, nuevaTarifa('Adulto', '1'), contexto()),
    ).rejects.toBeInstanceOf(TarifaDuplicadaError);

    const antes = structuredClone(trabajo.estado);
    await servicio.crearTarifa(v.id, nuevaTarifa('Adulto', '900000'), contexto());
    expect(trabajo.estado).toEqual(antes);

    const nueva = await servicio.crearTarifa(v.id, nuevaTarifa('Niño', '500000'), contexto());
    expect(nueva.id).toMatch(/^t/);
    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas).toHaveLength(2);
  });

  it('eliminar audita catalogo.tarifa.eliminada con los valores previos', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(
      nuevaVigencia('2027-01-01', '2027-01-31', [nuevaTarifa('Adulto', '900000', '700000')]),
      contexto(ADMIN_CON_NETO),
    );
    const tarifaId = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.id ?? '';
    await servicio.eliminarTarifa(tarifaId, contexto(ADMIN_CON_NETO));

    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas).toHaveLength(0);
    expect(trabajo.estado.auditoria.at(-1)?.cambio).toMatchObject({
      accion: 'catalogo.tarifa.eliminada',
      entidadId: tarifaId,
      detalle: { venta: '900000', neto: '700000', moneda: 'COP', origen: 'PANTALLA' },
    });
  });

  it('eliminar sin permiso de neto no escribe el neto en la auditoría', async () => {
    const { trabajo, servicio } = montar();
    await servicio.crearVigencia(
      nuevaVigencia('2027-01-01', '2027-01-31', [nuevaTarifa('Adulto', '900000', '700000')]),
      contexto(ADMIN_CON_NETO),
    );
    const tarifaId = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.id ?? '';
    await servicio.eliminarTarifa(tarifaId, contexto(ADMIN));
    expect(trabajo.estado.auditoria.at(-1)?.cambio.detalle).not.toHaveProperty('neto');
  });

  it('una tarifa inexistente es TARIFA_NO_ENCONTRADO', async () => {
    const { servicio } = montar();
    await expect(servicio.eliminarTarifa('nope', contexto())).rejects.toMatchObject({
      code: 'TARIFA_NO_ENCONTRADO',
    });
  });
});

describe('AplicadorPorId · listado', () => {
  it('omite la clave neto sin cotizacion.ver_neto_y_margen y la incluye con ella', async () => {
    const { servicio } = montar();
    await servicio.crearVigencia(
      nuevaVigencia('2027-01-01', '2027-01-31', [nuevaTarifa('Adulto', '900000', '700000')]),
      contexto(ADMIN_CON_NETO),
    );
    const sin = await servicio.listarVigencias('p1', contexto(ADMIN));
    const con = await servicio.listarVigencias('p1', contexto(ADMIN_CON_NETO));

    expect(sin[0]?.tarifas[0]).not.toHaveProperty('neto');
    expect(JSON.stringify(sin)).not.toContain('700000');
    expect(con[0]?.tarifas[0]?.neto).toEqual({ unidades: '700000', moneda: 'COP' });
  });
});
