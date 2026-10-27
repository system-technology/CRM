/**
 * Lógica pura de indexación y búsqueda global (Cmd+K / Ctrl+K).
 *
 * Cero dependencias de UI, 100% testeable en Vitest.
 */

import { MOCK_CONVERSACIONES } from './mock-inbox';
import { obtenerMockPaginaContactos } from './mock-contactos';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { MOCK_ARCHIVOS_VIAJE } from './mock-viajes';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';

export type CategoriaBusqueda =
  | 'modulos'
  | 'cotizaciones'
  | 'conversaciones'
  | 'contactos'
  | 'oportunidades'
  | 'viajes'
  | 'catalogo'
  | 'acciones';

export interface ResultadoBusqueda {
  id: string;
  categoria: CategoriaBusqueda;
  titulo: string;
  subtitulo: string;
  href: string;
  etiquetaExtra?: string | undefined;
}

export const MODULOS_RAPIDOS: ResultadoBusqueda[] = [
  {
    id: 'mod-bandeja',
    categoria: 'modulos',
    titulo: 'Bandeja de WhatsApp',
    subtitulo: 'Chat en vivo con WhatsApp Cloud API y asignación',
    href: '/bandeja',
    etiquetaExtra: 'Módulo P0',
  },
  {
    id: 'mod-pipeline',
    categoria: 'modulos',
    titulo: 'Pipeline / Oportunidades',
    subtitulo: 'Embudo de ventas y seguimiento comercial',
    href: '/pipeline',
    etiquetaExtra: 'Módulo P0',
  },
  {
    id: 'mod-cotizador',
    categoria: 'modulos',
    titulo: 'Cotizador de Paquetes y Excursiones',
    subtitulo: 'Cálculo de tarifas mayoristas y pasadías en COP',
    href: '/cotizador',
    etiquetaExtra: 'Módulo P0',
  },
  {
    id: 'mod-catalogo',
    categoria: 'modulos',
    titulo: 'Catálogo de Excursiones y Mayoristas',
    subtitulo: 'Inventario de pasadías, tours y paquetes',
    href: '/catalogo',
    etiquetaExtra: 'Módulo P1',
  },
  {
    id: 'mod-contactos',
    categoria: 'modulos',
    titulo: 'Contactos y Viajeros',
    subtitulo: 'Directorio de pasajeros con PII protegida',
    href: '/contactos',
    etiquetaExtra: 'Módulo P1',
  },
  {
    id: 'mod-viajes',
    categoria: 'modulos',
    titulo: 'Archivos de Viaje (TravelFiles)',
    subtitulo: 'Expedientes operativos, bookings y vouchers',
    href: '/viajes',
    etiquetaExtra: 'Módulo P1',
  },
  {
    id: 'mod-reportes',
    categoria: 'modulos',
    titulo: 'Reportes y Cierres',
    subtitulo: 'Métricas de conversión y cumplimiento de meta',
    href: '/reportes',
    etiquetaExtra: 'Módulo P1',
  },
  {
    id: 'mod-configuracion',
    categoria: 'modulos',
    titulo: 'Configuración de Agencia',
    subtitulo: 'Equipo, roles, WABA y ajustes de marca',
    href: '/configuracion',
    etiquetaExtra: 'Ajustes',
  },
];

export const COTIZACIONES_RECIENTES: ResultadoBusqueda[] = [
  {
    id: 'cot-1041',
    categoria: 'cotizaciones',
    titulo: 'Cotización #COT-1041: Pasadía Islas del Rosario VIP',
    subtitulo: '2 adultos • $520.000 COP • Salida Muelle La Bodeguita',
    href: '/cotizador?paquete=islas-rosario-vip',
    etiquetaExtra: 'Pasadía',
  },
  {
    id: 'cot-1042',
    categoria: 'cotizaciones',
    titulo: 'Cotización #COT-1042: Tour 5 Islas con Snorkel y Plancton',
    subtitulo: '4 pasajeros • $920.000 COP • Incluye actividad nocturna',
    href: '/cotizador?paquete=tour-5-islas-vip',
    etiquetaExtra: 'Pasadía',
  },
  {
    id: 'cot-1043',
    categoria: 'cotizaciones',
    titulo: 'Cotización #COT-1043: San Andrés 4D/3N Todo Incluido',
    subtitulo: '2 adultos • $3.780.000 COP • Acomodación doble',
    href: '/cotizador?paquete=san-andres-total',
    etiquetaExtra: 'Paquete',
  },
  {
    id: 'cot-1044',
    categoria: 'cotizaciones',
    titulo: 'Cotización #COT-1044: Pasadía Mambo Beach Club Barú',
    subtitulo: '2 adultos • $760.000 COP • Transporte en lancha rápida',
    href: '/cotizador?paquete=mambo-beach-club',
    etiquetaExtra: 'Pasadía',
  },
];

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
    titulo: 'Catálogo de Mayoristas y Excursiones',
    subtitulo: 'Inventario de pasadías y circuitos vigentes',
    href: '/catalogo',
    etiquetaExtra: 'Inventario',
  },
  {
    id: 'act-reportes',
    categoria: 'acciones',
    titulo: 'Ver Reportes y Cierres',
    subtitulo: 'Métricas gerenciales y cumplimiento de meta',
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
 * Genera el índice unificado en memoria para el buscador global.
 */
export function construirIndiceGlobal(): ResultadoBusqueda[] {
  const items: ResultadoBusqueda[] = [];

  // 1. Módulos del sistema
  items.push(...MODULOS_RAPIDOS);

  // 2. Cotizaciones recientes
  items.push(...COTIZACIONES_RECIENTES);

  // 3. Acciones rápidas
  items.push(...ACCIONES_RAPIDAS);

  // 4. Conversaciones de WhatsApp
  for (const c of MOCK_CONVERSACIONES) {
    items.push({
      id: `conv-${c.id}`,
      categoria: 'conversaciones',
      titulo: c.contactoNombre || 'Contacto WhatsApp',
      subtitulo: `${c.contactoTelefono} • ${c.ultimoMensajeTexto ? c.ultimoMensajeTexto.slice(0, 60) + '...' : 'Sin mensajes'}`,
      href: `/bandeja/${c.id}`,
      etiquetaExtra: c.estado,
    });
  }

  // 5. Contactos y Viajeros (PaginaContactos.datos)
  const listaContactos = obtenerMockPaginaContactos().datos;
  for (const ct of listaContactos) {
    items.push({
      id: `cont-${ct.id}`,
      categoria: 'contactos',
      titulo: ct.nombre || 'Cliente',
      subtitulo: `${ct.telefono} • ${ct.correo || 'Sin correo'}`,
      href: `/contactos?id=${ct.id}`,
      etiquetaExtra: ct.etiquetas.join(', '),
    });
  }

  // 6. Oportunidades del Pipeline (TableroPipeline.columnas)
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
      subtitulo: `${op.contactoNombre} • $${valorCop} ${moneda}`,
      href: `/pipeline?op=${op.id}`,
      etiquetaExtra: op.etapa.nombre,
    });
  }

  // 7. Archivos de Viaje (TravelFiles)
  for (const v of MOCK_ARCHIVOS_VIAJE) {
    items.push({
      id: `viaje-${v.id}`,
      categoria: 'viajes',
      titulo: `${v.codigoExpediente} - ${v.destino}`,
      subtitulo: `Titular: ${v.titularNombre} • Salida: ${new Date(v.fechaSalida).toLocaleDateString('es-CO')}`,
      href: `/viajes?id=${v.id}`,
      etiquetaExtra: v.estado,
    });
  }

  // 8. Catálogo de Paquetes y Excursiones
  for (const p of MOCK_PAQUETES_CATALOGO) {
    items.push({
      id: `paq-${p.id}`,
      categoria: 'catalogo',
      titulo: `${p.nombre} (${p.destino})`,
      subtitulo: `Mayorista: ${p.mayorista?.nombre || 'General'} • ${p.dias}d/${p.noches}n • ${p.planAlimentacion}`,
      href: `/catalogo?id=${p.id}`,
      etiquetaExtra: p.paisIso || undefined,
    });
  }

  return items;
}

/**
 * Ejecuta búsqueda omnicanal agrupada por categoría con límite configurable.
 */
export function buscarEnIndiceGlobal(
  query: string,
  indice: ResultadoBusqueda[] = construirIndiceGlobal(),
  limitePorCategoria = 4,
): Record<CategoriaBusqueda, ResultadoBusqueda[]> {
  const vacio: Record<CategoriaBusqueda, ResultadoBusqueda[]> = {
    modulos: [],
    cotizaciones: [],
    acciones: [],
    conversaciones: [],
    contactos: [],
    oportunidades: [],
    viajes: [],
    catalogo: [],
  };

  const qLimpia = normalizarTexto(query);
  if (!qLimpia) {
    vacio.modulos = MODULOS_RAPIDOS.slice(0, 4);
    vacio.cotizaciones = COTIZACIONES_RECIENTES.slice(0, 3);
    vacio.acciones = ACCIONES_RAPIDAS.slice(0, 3);
    return vacio;
  }

  const palabras = qLimpia.split(/\s+/).filter(Boolean);

  for (const item of indice) {
    const textoAlineado = normalizarTexto(
      `${item.titulo} ${item.subtitulo} ${item.etiquetaExtra || ''}`,
    );

    const coincide = palabras.every((palabra) => textoAlineado.includes(palabra));
    if (coincide) {
      if (vacio[item.categoria].length < limitePorCategoria) {
        vacio[item.categoria].push(item);
      }
    }
  }

  return vacio;
}
