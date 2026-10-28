/**
 * Pruebas unitarias del aplicador, con un puerto de persistencia y uno de auditoría en memoria.
 *
 * El doble imita lo que importa del adaptador real: una unidad de trabajo que **revierte todo**
 * (catálogo y auditoría) si la función lanza, y un `bloquear` que debe llamarse antes de `leer`.
 * La prueba contra PostgreSQL con RLS está en `catalogo-gestion.e2e-spec.ts`.
 */

import type {
  Permiso,
  ProductoPropuesto,
  PropuestaDeCatalogo,
  TarifaPropuesta,
} from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  PaqueteDuplicadoError,
  PaqueteNoEncontradoError,
  PropuestaCambioError,
  PropuestaInvalidaError,
} from '../domain/errors.js';
import { huellaDeEstado } from '../domain/huella-de-estado.js';
import {
  type CatalogoActual,
  type PaqueteActual,
  type VigenciaActual,
  normalizarNombre,
  validarYPlanificar,
} from '../domain/validar-y-planificar.js';
import { AplicadorDeCatalogo, type ContextoDeAplicacion } from './aplicador-de-catalogo.js';
import {
  type ActorDelCambio,
  type CambioRegistrado,
  CatalogoPersistente,
  type EspacioDeTrabajo,
  RegistroDeCambios,
  type ResultadoDeDesactivar,
  UnidadDeTrabajoDeCatalogo,
} from './puertos-de-catalogo.js';

// ------------------------------------------------------------------------------------------------
// Dobles en memoria
// ------------------------------------------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type VigenciaM = Mutable<VigenciaActual>;
type PaqueteM = Omit<Mutable<PaqueteActual>, 'vigencias'> & {
  vigencias: VigenciaM[];
  activo: boolean;
};

interface Estado {
  paquetes: PaqueteM[];
  auditoria: { actor: ActorDelCambio; cambio: CambioRegistrado }[];
  secuencia: number;
}

class CatalogoMemoria extends CatalogoPersistente {
  bloqueado = false;
  fallaEnTarifa: string | null = null;

  constructor(private readonly e: Estado) {
    super();
  }

  bloquear(): Promise<void> {
    this.bloqueado = true;
    return Promise.resolve();
  }

  leer(): Promise<CatalogoActual> {
    if (!this.bloqueado) throw new Error('se leyó el catálogo sin tomar el bloqueo');
    return Promise.resolve({
      paquetes: structuredClone(this.e.paquetes),
      mayoristas: [],
    });
  }

  guardarPaquete(
    id: string | null,
    p: ProductoPropuesto,
    codigo: string | null | undefined,
  ): Promise<string> {
    const previo = id === null ? null : this.e.paquetes.find((x) => x.id === id);
    const base = {
      nombre: p.nombre,
      destino: p.destino,
      dias: p.dias,
      noches: p.noches,
      // `undefined` = no tocar; `null` es un valor (pasadía sin alimentación), no «no tocar».
      planAlimentacion:
        p.planAlimentacion !== undefined ? p.planAlimentacion : (previo?.planAlimentacion ?? null),
      inclusiones: p.inclusiones ?? previo?.inclusiones ?? [],
      exclusiones: p.exclusiones ?? previo?.exclusiones ?? [],
    };
    if (previo) {
      Object.assign(previo, base, codigo !== undefined ? { codigo } : {});
      return Promise.resolve(previo.id);
    }
    const nuevo = {
      id: `p${++this.e.secuencia}`,
      codigo: codigo ?? null,
      ...base,
      vigencias: [],
      activo: true,
    };
    this.e.paquetes.push(nuevo);
    return Promise.resolve(nuevo.id);
  }

  guardarVigencia(
    paqueteId: string,
    v: { desde: string; hasta: string; publicada: boolean },
  ): Promise<string> {
    const paquete = this.e.paquetes.find((x) => x.id === paqueteId);
    if (!paquete) throw new Error('paquete inexistente');
    const existente = paquete.vigencias.find((x) => x.desde === v.desde && x.hasta === v.hasta);
    if (existente) Object.assign(existente, { publicada: v.publicada });
    else paquete.vigencias = [...paquete.vigencias, { ...v, tarifas: [] }];
    return Promise.resolve(`${paqueteId}|${v.desde}|${v.hasta}`);
  }

  guardarTarifa(
    paqueteId: string,
    vigenciaId: string,
    t: TarifaPropuesta,
    opciones: { conservarNeto: boolean },
  ): Promise<string> {
    if (this.fallaEnTarifa === t.nombre) throw new Error('fallo simulado de la base');
    const paquete = this.e.paquetes.find((x) => x.id === paqueteId);
    const vigencia = paquete?.vigencias.find(
      (x) => `${paqueteId}|${x.desde}|${x.hasta}` === vigenciaId,
    );
    if (!vigencia) throw new Error('vigencia inexistente');
    const existente = vigencia.tarifas.find(
      (x) => normalizarNombre(x.nombre) === normalizarNombre(t.nombre),
    );
    const fila = {
      nombre: t.nombre,
      unidad: t.unidad,
      cubrePasajeros: t.cubrePasajeros,
      neto: opciones.conservarNeto ? (existente?.neto ?? null) : t.neto,
      venta: t.venta,
      lista: t.lista ?? null,
      promoHasta: t.promoHasta ?? null,
      mayorista: t.mayorista,
      aditiva: t.aditiva,
      condicion: t.condicion,
    };
    const idx = existente ? vigencia.tarifas.indexOf(existente) : vigencia.tarifas.length;
    vigencia.tarifas = Object.assign([...vigencia.tarifas], { [idx]: fila });
    return Promise.resolve(`t:${vigenciaId}:${normalizarNombre(t.nombre)}`);
  }

  desactivarPaquete(id: string): Promise<ResultadoDeDesactivar> {
    const p = this.e.paquetes.find((x) => x.id === id);
    if (!p) return Promise.resolve('NO_EXISTE');
    if (!p.activo) return Promise.resolve('YA_INACTIVO');
    p.activo = false;
    return Promise.resolve('DESACTIVADO');
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

class TrabajoMemoria extends UnidadDeTrabajoDeCatalogo {
  estado: Estado = { paquetes: [], auditoria: [], secuencia: 0 };
  fallaEnTarifa: string | null = null;

  async ejecutar<T>(fn: (espacio: EspacioDeTrabajo) => Promise<T>): Promise<T> {
    const respaldo = structuredClone(this.estado);
    const catalogo = new CatalogoMemoria(this.estado);
    catalogo.fallaEnTarifa = this.fallaEnTarifa;
    try {
      return await fn({ catalogo, registro: new RegistroMemoria(this.estado) });
    } catch (error) {
      this.estado = respaldo; // la transacción se revierte entera: catálogo y auditoría
      throw error;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Datos
// ------------------------------------------------------------------------------------------------

const USUARIO = '01932000-0000-7000-8000-00000000aaaa';
const contexto = (permisos: Permiso[] = ['catalogo.administrar']): ContextoDeAplicacion => ({
  tenantId: '01932000-0000-7000-8000-0000000000d1',
  usuarioId: USUARIO,
  permisos,
});

const tarifa = (
  nombre: string,
  venta: string,
  extra: Partial<TarifaPropuesta> = {},
): TarifaPropuesta => ({
  nombre,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  neto: null,
  venta: { unidades: venta, moneda: 'COP' },
  mayorista: null,
  aditiva: false,
  condicion: {
    acomodacion: null,
    tipoPasajero: null,
    edadMinima: null,
    edadMaxima: null,
    pasajerosMinimo: null,
    pasajerosMaximo: null,
    ocupaSilla: null,
  },
  ...extra,
});

const producto = (nombre: string, tarifas: TarifaPropuesta[] = []): ProductoPropuesto => ({
  nombre,
  destino: 'Cartagena',
  dias: 1,
  noches: 0,
  vigencias: [{ desde: '2027-01-10', hasta: '2027-01-10', publicada: false, tarifas }],
});

const propuesta = (...productos: ProductoPropuesto[]): PropuestaDeCatalogo => ({
  version: 1,
  origen: 'ARCHIVO',
  productos,
});

function montar() {
  const trabajo = new TrabajoMemoria();
  return { trabajo, aplicador: new AplicadorDeCatalogo(trabajo) };
}

// ------------------------------------------------------------------------------------------------

describe('AplicadorDeCatalogo.aplicar', () => {
  it('crea paquete, vigencia y tarifa y audita el alta del precio', async () => {
    const { trabajo, aplicador } = montar();
    const r = await aplicador.aplicar(
      propuesta(producto('Isla Corona', [tarifa('Adulto', '150000')])),
      contexto(),
    );

    expect(r.informe.resumen).toMatchObject({ creados: 1, errores: 0 });
    expect(trabajo.estado.paquetes).toHaveLength(1);
    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.venta.unidades).toBe('150000');
    const acciones = trabajo.estado.auditoria.map((a) => a.cambio.accion);
    expect(acciones).toEqual([
      'catalogo.paquete.creado',
      'catalogo.tarifa.creada',
      'catalogo.propuesta_aplicada',
    ]);
    expect(trabajo.estado.auditoria.every((a) => a.actor.usuarioId === USUARIO)).toBe(true);
  });

  it('es idempotente: repetir la misma propuesta no cambia el catálogo ni audita de nuevo', async () => {
    const { trabajo, aplicador } = montar();
    const p = propuesta(producto('Isla Corona', [tarifa('Adulto', '150000')]));
    await aplicador.aplicar(p, contexto());
    const catalogo = structuredClone(trabajo.estado.paquetes);
    const filasDeAuditoria = trabajo.estado.auditoria.length;

    const segunda = await aplicador.aplicar(p, contexto());

    expect(segunda.informe.resumen).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 1 });
    expect(trabajo.estado.paquetes).toEqual(catalogo);
    expect(trabajo.estado.auditoria).toHaveLength(filasDeAuditoria);
  });

  it('audita un cambio de precio con el valor anterior y el nuevo, sin datos personales', async () => {
    const { trabajo, aplicador } = montar();
    await aplicador.aplicar(
      propuesta(producto('Isla Corona', [tarifa('Adulto', '150000')])),
      contexto(),
    );
    const antes = trabajo.estado.auditoria.length;

    await aplicador.aplicar(
      propuesta(producto('Isla Corona', [tarifa('Adulto', '165000')])),
      contexto(),
    );

    const nuevas = trabajo.estado.auditoria.slice(antes).map((a) => a.cambio);
    const precio = nuevas.filter((c) => c.accion === 'catalogo.tarifa.modificada');
    expect(precio).toHaveLength(1);
    expect(precio[0]?.detalle).toMatchObject({
      campo: 'venta',
      antes: '150000',
      despues: '165000',
      moneda: 'COP',
      origen: 'ARCHIVO',
    });
    // Solo importes, moneda, origen y huella: nada que identifique a una persona (R10).
    expect(Object.keys(precio[0]?.detalle ?? {}).sort()).toEqual(
      ['antes', 'campo', 'despues', 'huella', 'moneda', 'origen'].sort(),
    );
  });

  it('todo o nada: un ERROR en cualquier producto no deja nada aplicado', async () => {
    const { trabajo, aplicador } = montar();
    const malo = producto('Roto', [tarifa('Adulto', '1000'), tarifa('adulto', '2000')]); // TARIFA_DUPLICADA

    await expect(
      aplicador.aplicar(propuesta(producto('Bueno', [tarifa('Adulto', '1000')]), malo), contexto()),
    ).rejects.toBeInstanceOf(PropuestaInvalidaError);

    expect(trabajo.estado.paquetes).toHaveLength(0);
    expect(trabajo.estado.auditoria).toHaveLength(0);
  });

  it('todo o nada: si la persistencia falla a mitad, se revierte el catálogo y la auditoría', async () => {
    const { trabajo, aplicador } = montar();
    trabajo.fallaEnTarifa = 'Menor';

    await expect(
      aplicador.aplicar(
        propuesta(
          producto('Uno', [tarifa('Adulto', '1000')]),
          producto('Dos', [tarifa('Menor', '500')]),
        ),
        contexto(),
      ),
    ).rejects.toThrow('fallo simulado');

    expect(trabajo.estado.paquetes).toHaveLength(0);
    expect(trabajo.estado.auditoria).toHaveLength(0);
  });

  it('rechaza con PROPUESTA_CAMBIO si la huella de la previsualización ya no coincide', async () => {
    const { aplicador } = montar();
    await expect(
      aplicador.aplicar(propuesta(producto('Uno')), contexto(), { huellaEsperada: 'a'.repeat(64) }),
    ).rejects.toBeInstanceOf(PropuestaCambioError);
  });

  it('huella de estado: si el catálogo cambió desde la previsualización, 409 y nada escrito', async () => {
    const { trabajo, aplicador } = montar();
    const p = propuesta(producto('Uno', [tarifa('Adulto', '1000')]));
    const previa = validarYPlanificar(
      p,
      { paquetes: [], mayoristas: [] },
      ['catalogo.administrar'],
      {
        tenantId: contexto().tenantId,
        soportaM2: true,
      },
    ).informe;
    // Otro cambia el precio mientras tanto.
    await aplicador.aplicar(propuesta(producto('Uno', [tarifa('Adulto', '900')])), contexto());
    const antes = trabajo.estado.auditoria.length;

    await expect(
      aplicador.aplicar(p, contexto(), {
        huellaDeEstadoEsperada: huellaDeEstado(previa, { paquetes: [], mayoristas: [] }),
      }),
    ).rejects.toBeInstanceOf(PropuestaCambioError);
    expect(trabajo.estado.auditoria).toHaveLength(antes);
    expect(trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0]?.venta.unidades).toBe('900');
  });

  it('huella de estado: reintentar con la huella de la primera previsualización converge sin escribir', async () => {
    const { trabajo, aplicador } = montar();
    const p = propuesta(producto('Uno', [tarifa('Adulto', '1000')]));
    const previa = validarYPlanificar(
      p,
      { paquetes: [], mayoristas: [] },
      ['catalogo.administrar'],
      {
        tenantId: contexto().tenantId,
        soportaM2: true,
      },
    ).informe;
    const opciones = {
      huellaDeEstadoEsperada: huellaDeEstado(previa, { paquetes: [], mayoristas: [] }),
    };

    await aplicador.aplicar(p, contexto(), opciones);
    const auditoria = trabajo.estado.auditoria.length;
    const otra = await aplicador.aplicar(p, contexto(), opciones);

    expect(otra.informe.resumen).toMatchObject({ creados: 0, actualizados: 0, sinCambios: 1 });
    expect(trabajo.estado.auditoria).toHaveLength(auditoria);
  });

  it('rechaza el neto sin el permiso de neto y no escribe nada', async () => {
    const { trabajo, aplicador } = montar();
    const conNeto = tarifa('Adulto', '1000', { neto: { unidades: '800', moneda: 'COP' } });
    await expect(
      aplicador.aplicar(propuesta(producto('Uno', [conNeto])), contexto()),
    ).rejects.toBeInstanceOf(PropuestaInvalidaError);
    expect(trabajo.estado.paquetes).toHaveLength(0);
  });

  it('conserva el neto existente cuando quien escribe no tiene permiso de neto', async () => {
    const { trabajo, aplicador } = montar();
    const conNeto = tarifa('Adulto', '1000', { neto: { unidades: '800', moneda: 'COP' } });
    await aplicador.aplicar(
      propuesta(producto('Uno', [conNeto])),
      contexto(['catalogo.administrar', 'cotizacion.ver_neto_y_margen']),
    );

    const antes = trabajo.estado.auditoria.length;
    await aplicador.aplicar(propuesta(producto('Uno', [tarifa('Adulto', '1200')])), contexto());

    const guardada = trabajo.estado.paquetes[0]?.vigencias[0]?.tarifas[0];
    expect(guardada?.venta.unidades).toBe('1200');
    expect(guardada?.neto?.unidades).toBe('800');
    const campos = trabajo.estado.auditoria.slice(antes).map((a) => a.cambio.detalle['campo']);
    expect(campos).not.toContain('neto'); // lo que no se tocó no se audita
  });

  it('toma el bloqueo antes de leer el catálogo', async () => {
    const { aplicador } = montar();
    // El doble lanza si se lee sin bloquear: si el orden fuera otro, esto fallaría.
    await expect(aplicador.aplicar(propuesta(producto('Uno')), contexto())).resolves.toBeDefined();
  });
});

describe('AplicadorDeCatalogo.crearPaquete / editarPaquete', () => {
  const ISLA = { nombre: 'Isla Corona', destino: 'Cartagena', dias: 1, noches: 0 };

  it('crea desde el formulario con origen PANTALLA y sin fila de lote', async () => {
    const { trabajo, aplicador } = montar();
    const r = await aplicador.crearPaquete(ISLA, contexto());

    expect(r.paquetes[0]?.accion).toBe('CREAR');
    expect(trabajo.estado.paquetes[0]?.nombre).toBe('Isla Corona');
    const creado = trabajo.estado.auditoria.map((a) => a.cambio);
    expect(creado).toHaveLength(1);
    expect(creado[0]).toMatchObject({
      accion: 'catalogo.paquete.creado',
      entidad: 'paquete',
      detalle: { origen: 'PANTALLA' },
    });
  });

  it('edita casando por id, aunque cambie el nombre, y audita la modificación', async () => {
    const { trabajo, aplicador } = montar();
    const alta = await aplicador.crearPaquete(ISLA, contexto());
    const id = alta.paquetes[0]?.id ?? '';

    const r = await aplicador.editarPaquete(
      id,
      { nombre: 'Isla Corona VIP', noches: 1, dias: 2 },
      contexto(),
    );

    expect(r.paquetes[0]).toMatchObject({ id, accion: 'ACTUALIZAR' });
    expect(trabajo.estado.paquetes).toHaveLength(1);
    expect(trabajo.estado.paquetes[0]).toMatchObject({ nombre: 'Isla Corona VIP', noches: 1 });
    expect(trabajo.estado.paquetes[0]?.codigo).toBeNull(); // la clave sintética no se guarda
    expect(trabajo.estado.auditoria.at(-1)?.cambio).toMatchObject({
      accion: 'catalogo.paquete.modificado',
      entidadId: id,
      detalle: { origen: 'PANTALLA', antes: { nombre: 'Isla Corona' } },
    });
  });

  it('T-065: PATCH puede poner planAlimentacion en null de forma explícita', async () => {
    const { trabajo, aplicador } = montar();
    const alta = await aplicador.crearPaquete(
      { ...ISLA, planAlimentacion: 'DESAYUNO' },
      contexto(),
    );
    const id = alta.paquetes[0]?.id ?? '';
    expect(trabajo.estado.paquetes[0]?.planAlimentacion).toBe('DESAYUNO');

    const r = await aplicador.editarPaquete(id, { planAlimentacion: null }, contexto());

    expect(r.paquetes[0]).toMatchObject({ id, accion: 'ACTUALIZAR' });
    expect(trabajo.estado.paquetes[0]?.planAlimentacion).toBeNull();
    expect(trabajo.estado.auditoria.at(-1)?.cambio).toMatchObject({
      accion: 'catalogo.paquete.modificado',
      detalle: { antes: { planAlimentacion: 'DESAYUNO' } },
    });
    // Sin el campo, el plan no se toca.
    await aplicador.editarPaquete(id, { planAlimentacion: 'TODO_INCLUIDO' }, contexto());
    await aplicador.editarPaquete(id, { destino: 'Barú' }, contexto());
    expect(trabajo.estado.paquetes[0]?.planAlimentacion).toBe('TODO_INCLUIDO');
  });

  it('editar sin cambios reales converge: sin escritura ni auditoría', async () => {
    const { trabajo, aplicador } = montar();
    const alta = await aplicador.crearPaquete(ISLA, contexto());
    const filas = trabajo.estado.auditoria.length;

    const r = await aplicador.editarPaquete(
      alta.paquetes[0]?.id ?? '',
      { destino: 'Cartagena' },
      contexto(),
    );

    expect(r.paquetes[0]?.accion).toBe('SIN_CAMBIOS');
    expect(trabajo.estado.auditoria).toHaveLength(filas);
  });

  it('no deja renombrar a la clave natural de otro paquete', async () => {
    const { aplicador } = montar();
    await aplicador.crearPaquete(ISLA, contexto());
    const otro = await aplicador.crearPaquete({ ...ISLA, nombre: 'Rosario' }, contexto());

    await expect(
      aplicador.editarPaquete(otro.paquetes[0]?.id ?? '', { nombre: 'isla  corona' }, contexto()),
    ).rejects.toBeInstanceOf(PaqueteDuplicadoError);
  });

  it('editar un paquete inexistente es PAQUETE_NO_ENCONTRADO', async () => {
    const { aplicador } = montar();
    await expect(
      aplicador.editarPaquete('no-existe', { nombre: 'X' }, contexto()),
    ).rejects.toBeInstanceOf(PaqueteNoEncontradoError);
  });
});

describe('AplicadorDeCatalogo.desactivarPaquete', () => {
  it('desactiva y audita una sola vez; repetir no audita', async () => {
    const { trabajo, aplicador } = montar();
    const alta = await aplicador.crearPaquete(
      { nombre: 'Isla Corona', destino: 'Cartagena', dias: 1, noches: 0 },
      contexto(),
    );
    const id = alta.paquetes[0]?.id ?? '';

    await aplicador.desactivarPaquete(id, contexto());
    await aplicador.desactivarPaquete(id, contexto());

    const bajas = trabajo.estado.auditoria.filter(
      (a) => a.cambio.accion === 'catalogo.paquete.desactivado',
    );
    expect(bajas).toHaveLength(1);
    expect(trabajo.estado.paquetes[0]?.activo).toBe(false);
  });

  it('un paquete inexistente es PAQUETE_NO_ENCONTRADO', async () => {
    const { aplicador } = montar();
    await expect(aplicador.desactivarPaquete('x', contexto())).rejects.toBeInstanceOf(
      PaqueteNoEncontradoError,
    );
  });
});
