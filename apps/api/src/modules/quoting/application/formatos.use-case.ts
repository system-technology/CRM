/**
 * Formatos de viaje de la agencia (ADR-0017 §4.2): listar, crear, editar y generar el descriptor de
 * plantilla de un formato.
 *
 * Es solo entrada y presentación: ninguna ruta de cálculo ramifica sobre el formato (ADR-0009).
 * Un formato en uso no se borra, se desactiva: por eso no hay DELETE.
 *
 * Todo corre en `conTenant`: el tenant sale de la sesión y RLS lo hace cumplir (R1). Pedir el
 * formato de otra agencia da `FORMATO_DE_VIAJE_NO_ENCONTRADO` (404), igual que uno inexistente.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type ColumnaDePlantilla,
  type CrearFormatoDeViaje,
  DescriptorDePlantilla,
  type EditarFormatoDeViaje,
  type FormatoDeViaje,
  PLANTILLAS_DE_SISTEMA,
  PlantillaDeFormato,
} from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { FormatoDeViajeDuplicadoError, FormatoDeViajeNoEncontradoError } from '../domain/errors.js';
import { normalizarNombre } from '../domain/validar-y-planificar.js';

interface FilaDeFormato {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  plantilla: Prisma.JsonValue;
  creadoEn: Date;
}

function aVista(f: FilaDeFormato): FormatoDeViaje {
  // Una plantilla guardada que ya no cumple el esquema se lee como vacía: no tumba el listado.
  const plantilla = PlantillaDeFormato.safeParse(f.plantilla);
  return {
    id: f.id,
    nombre: f.nombre,
    orden: f.orden,
    activo: f.activo,
    plantilla: plantilla.success ? plantilla.data : PlantillaDeFormato.parse({}),
    creadoEn: f.creadoEn.toISOString(),
  };
}

function esUnicoRepetido(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

const slug = (texto: string): string => {
  const s = normalizarNombre(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(s) ? s : 'formato';
};

type TipoDeCampo = 'TEXTO' | 'NUMERO' | 'FECHA' | 'BOOLEANO' | 'SELECCION' | 'SELECCION_MULTIPLE';

function columnaDeCampo(
  d: { clave: string; etiqueta: string; tipo: TipoDeCampo; obligatorio: boolean },
  opciones: string[],
): ColumnaDePlantilla | null {
  const clave = `campo_${d.clave}`;
  if (!/^[a-z][a-z0-9_]*$/.test(clave)) return null;
  const base = { clave, etiqueta: d.etiqueta, obligatoria: d.obligatorio };
  switch (d.tipo) {
    case 'TEXTO':
      return { ...base, tipo: 'TEXTO', ejemplo: '' };
    case 'NUMERO':
      return { ...base, tipo: 'ENTERO', ejemplo: '0' };
    case 'FECHA':
      return { ...base, tipo: 'FECHA', ejemplo: '2026-12-01' };
    case 'BOOLEANO':
      return { ...base, tipo: 'BOOLEANO', ejemplo: 'no' };
    case 'SELECCION':
      return {
        ...base,
        tipo: 'ENUM',
        ejemplo: opciones[0] ?? '',
        ...(opciones.length > 0 ? { valores: opciones } : {}),
      };
    case 'SELECCION_MULTIPLE':
      return { ...base, tipo: 'LISTA', ejemplo: opciones.slice(0, 2).join(' | ') };
  }
}

@Injectable()
export class FormatosUseCase {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listar(): Promise<{ datos: FormatoDeViaje[] }> {
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.formatoDeViaje.findMany({
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      });
      return { datos: filas.map(aVista) };
    });
  }

  crear(datos: CrearFormatoDeViaje): Promise<FormatoDeViaje> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant(async (tx) => {
      await this.exigirNombreLibre(tx, datos.nombre, null);
      try {
        const fila = await tx.formatoDeViaje.create({
          data: {
            tenantId,
            nombre: datos.nombre,
            orden: datos.orden ?? 0,
            plantilla: PlantillaDeFormato.parse(datos.plantilla ?? {}),
          },
        });
        return aVista(fila);
      } catch (error) {
        if (esUnicoRepetido(error)) throw new FormatoDeViajeDuplicadoError(datos.nombre);
        throw error;
      }
    });
  }

  editar(id: string, cambios: EditarFormatoDeViaje): Promise<FormatoDeViaje> {
    return this.prisma.conTenant(async (tx) => {
      const existente = await tx.formatoDeViaje.findFirst({ where: { id } });
      if (!existente) throw new FormatoDeViajeNoEncontradoError(id);
      if (cambios.nombre !== undefined) await this.exigirNombreLibre(tx, cambios.nombre, id);
      try {
        const fila = await tx.formatoDeViaje.update({
          where: { id },
          data: {
            ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
            ...(cambios.orden !== undefined ? { orden: cambios.orden } : {}),
            ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
            ...(cambios.plantilla !== undefined ? { plantilla: cambios.plantilla } : {}),
          },
        });
        return aVista(fila);
      } catch (error) {
        if (esUnicoRepetido(error)) throw new FormatoDeViajeDuplicadoError(cambios.nombre ?? '');
        throw error;
      }
    });
  }

  /**
   * El descriptor de columnas de la hoja de este formato: las del formato de sistema que coincide
   * por nombre (o el más general si no hay), con las obligatorias que declara la plantilla y una
   * columna por cada campo personalizado de `PAQUETE` que el formato declara.
   */
  plantilla(id: string): Promise<DescriptorDePlantilla> {
    return this.prisma.conTenant(async (tx) => {
      const fila = await tx.formatoDeViaje.findFirst({ where: { id } });
      if (!fila) throw new FormatoDeViajeNoEncontradoError(id);
      const vista = aVista(fila);

      const clave = normalizarNombre(vista.nombre);
      const base =
        PLANTILLAS_DE_SISTEMA.find((p) => normalizarNombre(p.nombre) === clave) ??
        PLANTILLAS_DE_SISTEMA.find((p) => p.formato === 'paquete-con-hotel') ??
        PLANTILLAS_DE_SISTEMA[0];
      if (!base) throw new FormatoDeViajeNoEncontradoError(id);
      const coincide = normalizarNombre(base.nombre) === clave;

      const obligatorios = new Set<string>(vista.plantilla.obligatorios);
      const columnas: ColumnaDePlantilla[] = base.columnas.map((c) =>
        obligatorios.has(c.clave) ? { ...c, obligatoria: true } : c,
      );

      const claves = vista.plantilla.camposPersonalizados;
      if (claves.length > 0) {
        const definiciones = await tx.definicionCampoPersonalizado.findMany({
          where: { entidad: 'PAQUETE', clave: { in: claves } },
          orderBy: [{ orden: 'asc' }, { clave: 'asc' }],
        });
        for (const d of definiciones) {
          const columna = columnaDeCampo(
            d,
            Array.isArray(d.opciones)
              ? d.opciones.filter((o): o is string => typeof o === 'string')
              : [],
          );
          if (columna) columnas.push(columna);
        }
      }

      return DescriptorDePlantilla.parse({
        formato: coincide ? base.formato : slug(vista.nombre),
        nombre: vista.nombre,
        version: base.version,
        columnas,
        valoresPorDefecto: { ...base.valoresPorDefecto, ...vista.plantilla.valoresPorDefecto },
      });
    });
  }

  private async exigirNombreLibre(
    tx: Pick<Prisma.TransactionClient, 'formatoDeViaje'>,
    nombre: string,
    propioId: string | null,
  ): Promise<void> {
    const todos = await tx.formatoDeViaje.findMany({ select: { id: true, nombre: true } });
    const clave = normalizarNombre(nombre);
    if (todos.some((f) => f.id !== propioId && normalizarNombre(f.nombre) === clave)) {
      throw new FormatoDeViajeDuplicadoError(nombre);
    }
  }
}
