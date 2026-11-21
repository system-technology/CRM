/**
 * Lógica pura de indexación y búsqueda global (Cmd+K / Ctrl+K).
 *
 * Cero dependencias de UI, 100% testeable en Vitest.
 */

import { MOCK_CONVERSACIONES, ID_ASESOR_ACTUAL } from './mock-inbox';
import { obtenerMockPaginaContactos } from './mock-contactos';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import { MOCK_COTIZACIONES_INICIALES } from './mock-cotizaciones';
import type { Permiso, ResumenDeArchivo, SesionActual } from '@viajapro/contracts';
import { estaUsandoApiReal } from './crm-api';
import { estaUsandoApiRealInbox } from './inbox-api';
import { estaUsandoCatalogoReal } from './catalogo-api';
import { etiquetaDelArchivo } from './enlaces-viaje-logica';
import { puedeVerTodasConversaciones, tienePermiso } from './permisos';
import { formatearFecha } from './formato';
import { ACCIONES, NAVEGACION, esVisiblePara, type GrupoDeNavegacion } from './navegacion';

export type CategoriaBusqueda =
  | 'acciones'
  | 'conversaciones'
  | 'contactos'
  | 'cotizaciones'
  | 'oportunidades'
  | 'viajes'
  | 'catalogo';

export interface ResultadoBusqueda {
  id: string;
  categoria: CategoriaBusqueda;
  titulo: string;
  subtitulo: string;
  href: string;
  etiquetaExtra?: string | undefined;
}

const ETIQUETA_DE_GRUPO: Record<GrupoDeNavegacion, string> = {
  hoy: 'Hoy',
  atender: 'Atender',
  vender: 'Vender',
  operar: 'Operar',
  clientes: 'Clientes',
  agencia: 'Agencia',
};

/**
 * Comandos de la paleta derivados de la tabla única de navegación (ADR-0032): un comando por
 * módulo, con su etiqueta, más las acciones. La paleta no es el menú: incluye módulos que aún no
 * están en `enMenu`.
 */
export const ACCIONES_RAPIDAS: ResultadoBusqueda[] = [
  ...NAVEGACION.map((m): ResultadoBusqueda => ({
    id: `nav-${m.id}`,
    categoria: 'acciones',
    titulo: m.etiqueta,
    subtitulo: m.descripcion,
    href: m.ruta,
    etiquetaExtra: ETIQUETA_DE_GRUPO[m.grupo],
  })),
  ...ACCIONES.map((a): ResultadoBusqueda => ({
    id: `accion-${a.id}`,
    categoria: 'acciones',
    titulo: a.etiqueta,
    subtitulo: 'Calcular una cotización nueva',
    href: a.ruta,
    etiquetaExtra: 'Acción',
  })),
];

/**
 * Normaliza cadenas para búsqueda insensible a mayúsculas y acentos.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Las categorías con datos de demostración solo se indexan mientras su pantalla también lee la
 * demo: en modo real un contacto o una cotización inventados llevarían a una ficha que no existe.
 * Los archivos de viaje no entran aquí: llegan siempre de `listarArchivos`, la misma fuente de
 * `/viajes` (demo o API real).
 */
function fuentesDeDemo() {
  const crm = !estaUsandoApiReal();
  return {
    conversaciones: !estaUsandoApiRealInbox(),
    contactos: crm,
    cotizaciones: crm,
    oportunidades: crm,
    catalogo: !estaUsandoCatalogoReal(),
  };
}

/**
 * Genera el índice unificado en memoria para el buscador global y paleta de comandos.
 * Respeta permisos de sesión: asesores sin permiso no ven conversaciones de otros
 * ni acciones de configuración restringidas (T-103).
 */
export function construirIndiceGlobal(
  sesion?: SesionActual | null,
  archivos: readonly ResumenDeArchivo[] = [],
): ResultadoBusqueda[] {
  const items: ResultadoBusqueda[] = [];
  const demo = fuentesDeDemo();

  // 1. Acciones rápidas (filtradas según permisos de la tabla de navegación)
  const tiene = (permiso: Permiso) => tienePermiso(sesion, permiso);
  const visiblePorId = new Map<string, boolean>(
    NAVEGACION.map((m) => [`nav-${m.id}`, !sesion || esVisiblePara(m, tiene)] as const),
  );

  for (const accion of ACCIONES_RAPIDAS) {
    if (visiblePorId.get(accion.id) === false) {
      continue;
    }
    items.push(accion);
  }

  // 2. Conversaciones de WhatsApp (restringidas al asesor si no tiene permiso conversaciones.ver_todas)
  const verTodasConvs = !sesion || puedeVerTodasConversaciones(sesion);
  const miUsuarioId = sesion?.acceso?.usuarioId ?? sesion?.identidad?.id ?? ID_ASESOR_ACTUAL;

  for (const c of demo.conversaciones ? MOCK_CONVERSACIONES : []) {
    if (!verTodasConvs && c.asignadoAId && c.asignadoAId !== miUsuarioId) {
      // Excluir conversaciones de otros asesores
      continue;
    }

    items.push({
      id: `conv-${c.id}`,
      categoria: 'conversaciones',
      titulo: c.contactoNombre || 'Contacto WhatsApp',
      subtitulo: `${c.contactoTelefono} · ${c.ultimoMensajeTexto ? c.ultimoMensajeTexto.slice(0, 60) + '...' : 'Sin mensajes'}`,
      href: `/bandeja/${c.id}`,
      etiquetaExtra: c.estado,
    });
  }

  // 3. Contactos y Viajeros (PaginaContactos.datos)
  const listaContactos = demo.contactos ? obtenerMockPaginaContactos().datos : [];
  for (const ct of listaContactos) {
    items.push({
      id: `cont-${ct.id}`,
      categoria: 'contactos',
      titulo: ct.nombre || 'Cliente',
      subtitulo: `${ct.telefono} · ${ct.correo || 'Sin correo'}`,
      href: `/contactos/${ct.id}`,
      etiquetaExtra: ct.etiquetas.join(', '),
    });
  }

  // 4. Cotizaciones
  for (const cot of demo.cotizaciones ? MOCK_COTIZACIONES_INICIALES : []) {
    const ult = cot.versiones[cot.versiones.length - 1];
    const valor = ult?.venta ? Number(ult.venta.unidades).toLocaleString('es-CO') : '0';
    const moneda = ult?.venta?.moneda || 'COP';
    items.push({
      id: `cot-${cot.id}`,
      categoria: 'cotizaciones',
      titulo: cot.titulo || `Cotización #${cot.id.slice(0, 8)}`,
      subtitulo: `${ult?.paqueteNombre || 'Tour personalizado'} · $${valor} ${moneda}`,
      href: `/cotizaciones/${cot.id}`,
      etiquetaExtra: cot.estado,
    });
  }

  // 5. Oportunidades del Pipeline (TableroPipeline.columnas) con Destino indexado
  const oportunidades = demo.oportunidades
    ? obtenerMockTableroPipeline().columnas.flatMap((col) => col.oportunidades)
    : [];
  for (const op of oportunidades) {
    const valorCop = op.valorEstimado
      ? Number(op.valorEstimado.unidades).toLocaleString('es-CO')
      : '0';
    const moneda = op.valorEstimado?.moneda || 'COP';
    items.push({
      id: `oport-${op.id}`,
      categoria: 'oportunidades',
      titulo: op.titulo,
      subtitulo: `${op.contactoNombre || 'Cliente'}${op.destino ? ` · ${op.destino}` : ''} · $${valorCop} ${moneda}`,
      href: `/pipeline?op=${op.id}`,
      etiquetaExtra: op.etapa.nombre,
    });
  }

  // 6. Archivos de viaje: los mismos que lista `/viajes`, así que abrirlos nunca falla.
  for (const a of archivos) {
    items.push({
      id: `viaje-${a.id}`,
      categoria: 'viajes',
      titulo: `${etiquetaDelArchivo(a.numero)} — ${a.destino}`,
      subtitulo: `${a.paqueteNombre} · Salida: ${formatearFecha(a.fechaSalida)}`,
      href: `/viajes?id=${a.id}`,
      etiquetaExtra: a.estado,
    });
  }

  // 7. Catálogo de Paquetes
  for (const p of demo.catalogo ? MOCK_PAQUETES_CATALOGO : []) {
    items.push({
      id: `paq-${p.id}`,
      categoria: 'catalogo',
      titulo: `${p.nombre} (${p.destino})`,
      subtitulo: `Mayorista: ${p.mayorista?.nombre || 'General'} · ${p.dias}d/${p.noches}n · ${p.planAlimentacion}`,
      href: `/catalogo?id=${p.id}`,
      etiquetaExtra: p.paisIso || undefined,
    });
  }

  return items;
}

/** 0 si el título empieza por la consulta, 1 si la contiene, 2 si solo coincide el resto. */
function rangoDeTitulo(titulo: string, palabras: string[]): number {
  const t = normalizarTexto(titulo);
  if (palabras.every((p) => t.startsWith(p) || t.includes(` ${p}`))) return 0;
  if (palabras.every((p) => t.includes(p))) return 1;
  return 2;
}

/**
 * Ejecuta búsqueda omnicanal agrupada por categoría con límite configurable y filtro opcional.
 * Encuentra por nombre, teléfono y destino sin exponer más de lo que el rol puede ver (T-103).
 */
export function buscarEnIndiceGlobal(
  query: string,
  indiceOpcional?: ResultadoBusqueda[],
  limitePorCategoria = 4,
  filtroCategoria?: CategoriaBusqueda | 'todos',
  sesion?: SesionActual | null,
  archivos: readonly ResumenDeArchivo[] = [],
): Record<CategoriaBusqueda, ResultadoBusqueda[]> {
  const indice = indiceOpcional ?? construirIndiceGlobal(sesion, archivos);

  const vacio: Record<CategoriaBusqueda, ResultadoBusqueda[]> = {
    acciones: [],
    conversaciones: [],
    contactos: [],
    cotizaciones: [],
    oportunidades: [],
    viajes: [],
    catalogo: [],
  };

  const qLimpia = normalizarTexto(query);
  if (!qLimpia) {
    if (filtroCategoria && filtroCategoria !== 'todos') {
      vacio[filtroCategoria] = indice
        .filter((item) => item.categoria === filtroCategoria)
        .slice(0, limitePorCategoria * 2);
    } else {
      vacio.acciones = indice.filter((item) => item.categoria === 'acciones').slice(0, 6);
    }
    return vacio;
  }

  const palabras = qLimpia.split(/\s+/).filter(Boolean);
  const digitosQuery = qLimpia.replace(/\D/g, '');

  const coincidencias: Record<
    CategoriaBusqueda,
    Array<{ item: ResultadoBusqueda; rango: number }>
  > = {
    acciones: [],
    conversaciones: [],
    contactos: [],
    cotizaciones: [],
    oportunidades: [],
    viajes: [],
    catalogo: [],
  };

  for (const item of indice) {
    if (filtroCategoria && filtroCategoria !== 'todos' && item.categoria !== filtroCategoria) {
      continue;
    }

    const textoAlineado = normalizarTexto(
      `${item.titulo} ${item.subtitulo} ${item.etiquetaExtra || ''}`,
    );
    const digitosItem = (item.subtitulo + ' ' + item.titulo).replace(/\D/g, '');

    // Coincide por palabras de texto (nombre, destino, código)
    const coincideTexto = palabras.every((palabra) => textoAlineado.includes(palabra));
    // Coincide por secuencia de dígitos telefónicos si se buscan al menos 4 dígitos
    const coincideTelefono = digitosQuery.length >= 4 && digitosItem.includes(digitosQuery);

    if (coincideTexto || coincideTelefono) {
      coincidencias[item.categoria].push({ item, rango: rangoDeTitulo(item.titulo, palabras) });
    }
  }

  const hayFiltro = filtroCategoria && filtroCategoria !== 'todos';
  const limite = hayFiltro ? limitePorCategoria * 3 : limitePorCategoria;
  for (const cat of Object.keys(vacio) as CategoriaBusqueda[]) {
    // Orden estable: primero lo que el título empieza o contiene, luego lo que solo coincide
    // en el subtítulo («seguimientos» es el módulo Seguimientos antes que la descripción de Hoy).
    vacio[cat] = coincidencias[cat]
      .sort((a, b) => a.rango - b.rango)
      .slice(0, limite)
      .map((c) => c.item);
  }

  return vacio;
}
