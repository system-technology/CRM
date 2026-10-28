/**
 * Lógica pura de indexación y búsqueda global (Cmd+K / Ctrl+K).
 *
 * Cero dependencias de UI, 100% testeable en Vitest.
 */

import { MOCK_CONVERSACIONES, ID_ASESOR_ACTUAL } from './mock-inbox';
import { obtenerMockPaginaContactos } from './mock-contactos';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { MOCK_ARCHIVOS_VIAJE } from './mock-viajes';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import { MOCK_COTIZACIONES_INICIALES } from './mock-cotizaciones';
import type { SesionActual } from '@viajapro/contracts';
import { puedeVerTodasConversaciones, puedeVerNetoYMargen, tienePermiso } from './permisos';

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

export const ACCIONES_RAPIDAS: ResultadoBusqueda[] = [
  {
    id: 'act-inbox',
    categoria: 'acciones',
    titulo: 'Ir a Bandeja de WhatsApp',
    subtitulo: 'Gestionar chats y atención omnicanal',
    href: '/bandeja',
    etiquetaExtra: 'Navegación',
  },
  {
    id: 'act-pipeline',
    categoria: 'acciones',
    titulo: 'Ir al Pipeline Kanban',
    subtitulo: 'Ver oportunidades y embudo de ventas',
    href: '/pipeline',
    etiquetaExtra: 'Ventas',
  },
  {
    id: 'act-cotizador',
    categoria: 'acciones',
    titulo: 'Abrir Cotizador de Paquetes',
    subtitulo: 'Calcular tarifas mayoristas con márgenes en COP',
    href: '/cotizador',
    etiquetaExtra: 'Operaciones',
  },
  {
    id: 'act-viajes',
    categoria: 'acciones',
    titulo: 'Ir a Archivos de Viaje (TravelFiles)',
    subtitulo: 'Expedientes operativos, bookings y time limits',
    href: '/viajes',
    etiquetaExtra: 'Operaciones',
  },
  {
    id: 'act-contactos',
    categoria: 'acciones',
    titulo: 'Directorio de Contactos y Viajeros',
    subtitulo: 'Base de clientes con PII protegida',
    href: '/contactos',
    etiquetaExtra: 'Clientes',
  },
  {
    id: 'act-catalogo',
    categoria: 'acciones',
    titulo: 'Catálogo de Mayoristas',
    subtitulo: 'Inventario de paquetes y circuitos vigentes',
    href: '/catalogo',
    etiquetaExtra: 'Inventario',
  },
  {
    id: 'act-reportes',
    categoria: 'acciones',
    titulo: 'Ver Reportes y Cierres',
    subtitulo: 'Métricas comerciales y cumplimiento de meta',
    href: '/reportes',
    etiquetaExtra: 'Métricas',
  },
  {
    id: 'act-config',
    categoria: 'acciones',
    titulo: 'Configuración de Agencia',
    subtitulo: 'Equipo, roles, WABA y SLA comercial',
    href: '/configuracion',
    etiquetaExtra: 'Ajustes',
  },
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
 * Genera el índice unificado en memoria para el buscador global y paleta de comandos.
 * Respeta permisos de sesión: asesores sin permiso no ven conversaciones de otros
 * ni acciones de configuración restringidas (T-103).
 */
export function construirIndiceGlobal(sesion?: SesionActual | null): ResultadoBusqueda[] {
  const items: ResultadoBusqueda[] = [];

  // 1. Acciones rápidas (filtradas según permisos)
  const puedeAdministrar =
    !sesion ||
    tienePermiso(sesion, 'usuarios.administrar') ||
    tienePermiso(sesion, 'roles.administrar') ||
    tienePermiso(sesion, 'catalogo.administrar');

  const puedeReportes = !sesion || puedeVerNetoYMargen(sesion);

  for (const accion of ACCIONES_RAPIDAS) {
    if (accion.id === 'act-config' && !puedeAdministrar) {
      continue;
    }
    if (accion.id === 'act-reportes' && !puedeReportes) {
      continue;
    }
    items.push(accion);
  }

  // 2. Conversaciones de WhatsApp (restringidas al asesor si no tiene permiso conversaciones.ver_todas)
  const verTodasConvs = !sesion || puedeVerTodasConversaciones(sesion);
  const miUsuarioId = sesion?.acceso?.usuarioId ?? sesion?.identidad?.id ?? ID_ASESOR_ACTUAL;

  for (const c of MOCK_CONVERSACIONES) {
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
  const listaContactos = obtenerMockPaginaContactos().datos;
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
  for (const cot of MOCK_COTIZACIONES_INICIALES) {
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
  const tablero = obtenerMockTableroPipeline();
  const oportunidades = tablero.columnas.flatMap((col) => col.oportunidades);
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

  // 6. Archivos de Viaje (TravelFiles)
  for (const v of MOCK_ARCHIVOS_VIAJE) {
    items.push({
      id: `viaje-${v.id}`,
      categoria: 'viajes',
      titulo: `${v.codigoExpediente} — ${v.destino}`,
      subtitulo: `Titular: ${v.titularNombre} · Salida: ${new Date(v.fechaSalida).toLocaleDateString('es-CO')}`,
      href: `/viajes?id=${v.id}`,
      etiquetaExtra: v.estado,
    });
  }

  // 7. Catálogo de Paquetes
  for (const p of MOCK_PAQUETES_CATALOGO) {
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
): Record<CategoriaBusqueda, ResultadoBusqueda[]> {
  const indice = indiceOpcional ?? construirIndiceGlobal(sesion);

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
      const limite =
        filtroCategoria && filtroCategoria !== 'todos'
          ? limitePorCategoria * 3
          : limitePorCategoria;
      if (vacio[item.categoria].length < limite) {
        vacio[item.categoria].push(item);
      }
    }
  }

  return vacio;
}
