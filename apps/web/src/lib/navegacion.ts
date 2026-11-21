/**
 * Tabla única de navegación (ADR-0032 §3). Fuente del menú, la paleta, los títulos y el módulo activo.
 *
 * La leen el menú lateral, la barra móvil, la paleta, el H1 de cada pantalla y el título del documento.
 */

import type { ComponentType } from 'react';
import { CalendarCheck, FilePlus, ListChecks } from 'lucide-react';
import type { Permiso } from '@viajapro/contracts';
import { CONFIGURACION_MODULOS } from '../components/comun/iconos-modulos';

export type IdDeModulo =
  | 'hoy'
  | 'conversaciones'
  | 'oportunidades'
  | 'cotizaciones'
  | 'archivos'
  | 'seguimientos'
  | 'contactos'
  | 'catalogo'
  | 'reportes'
  | 'configuracion';

export type GrupoDeNavegacion = 'hoy' | 'atender' | 'vender' | 'operar' | 'clientes' | 'agencia';

type Icono = ComponentType<{ className?: string }>;

export interface EntradaDeNavegacion {
  /** Estable; futura clave i18n `navegacion.<id>` (ADR-0020). */
  id: IdDeModulo;
  /** = ítem del menú = comando de la paleta = H1 = título del documento. */
  etiqueta: string;
  /** Solo barra móvil (11–12 px, ~78 px por sitio); debe estar contenida en `etiqueta`. */
  etiquetaCorta?: string;
  /** Una línea para la paleta de comandos. */
  descripcion: string;
  ruta: `/${string}`;
  icono: Icono;
  grupo: GrupoDeNavegacion;
  /**
   * Solo oculta; autoriza la API. Un permiso, o una lista «cualquiera de». Sin `permiso`, la
   * entrada es visible para todos los roles.
   */
  permiso?: Permiso | readonly Permiso[];
  /** Coincide si pathname === prefijo o empieza por `prefijo/`. «/» solo coincide exacto. */
  prefijosActivos: readonly string[];
  movil: 'barra' | 'mas';
  /**
   * Si aparece en el menú lateral (decisiones D1–D4 de docs/01-producto/04-flujos-criticos.md).
   */
  enMenu: boolean;
  detalleAPantallaCompletaEnMovil?: boolean;
}

/** Orden = orden del menú objetivo (ADR-0032 §3). */
export const NAVEGACION: readonly EntradaDeNavegacion[] = [
  {
    id: 'hoy',
    etiqueta: 'Hoy',
    descripcion: 'Lo pendiente del día: seguimientos y conversaciones por atender',
    ruta: '/',
    icono: CalendarCheck,
    grupo: 'hoy',
    prefijosActivos: ['/'],
    movil: 'barra',
    enMenu: true,
  },
  {
    id: 'conversaciones',
    etiqueta: 'Conversaciones',
    descripcion: 'Chats de WhatsApp con clientes',
    ruta: '/bandeja',
    icono: CONFIGURACION_MODULOS.bandeja.icono,
    grupo: 'atender',
    prefijosActivos: ['/bandeja'],
    movil: 'barra',
    enMenu: true,
    detalleAPantallaCompletaEnMovil: true,
  },
  {
    id: 'oportunidades',
    etiqueta: 'Oportunidades',
    descripcion: 'Embudo de ventas por etapa',
    ruta: '/pipeline',
    icono: CONFIGURACION_MODULOS.pipeline.icono,
    grupo: 'vender',
    prefijosActivos: ['/pipeline'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'cotizaciones',
    etiqueta: 'Cotizaciones',
    descripcion: 'Cotizaciones enviadas y sus versiones',
    ruta: '/cotizaciones',
    icono: CONFIGURACION_MODULOS.cotizaciones.icono,
    grupo: 'vender',
    prefijosActivos: ['/cotizaciones', '/cotizador'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'archivos',
    etiqueta: 'Archivos de viaje',
    etiquetaCorta: 'Archivos',
    descripcion: 'Reservas, pasajeros y plazos de cada viaje',
    ruta: '/viajes',
    icono: CONFIGURACION_MODULOS.viajes.icono,
    grupo: 'operar',
    prefijosActivos: ['/viajes'],
    movil: 'barra',
    enMenu: true,
    detalleAPantallaCompletaEnMovil: true,
  },
  {
    id: 'seguimientos',
    etiqueta: 'Seguimientos',
    descripcion: 'Tareas de seguimiento a clientes y oportunidades',
    ruta: '/seguimientos',
    icono: ListChecks,
    grupo: 'atender',
    prefijosActivos: ['/seguimientos'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'contactos',
    etiqueta: 'Contactos',
    descripcion: 'Clientes y viajeros',
    ruta: '/contactos',
    icono: CONFIGURACION_MODULOS.contactos.icono,
    grupo: 'clientes',
    prefijosActivos: ['/contactos'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'catalogo',
    etiqueta: 'Catálogo',
    descripcion: 'Paquetes y tarifas de los mayoristas',
    ruta: '/catalogo',
    icono: CONFIGURACION_MODULOS.catalogo.icono,
    grupo: 'vender',
    prefijosActivos: ['/catalogo'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'reportes',
    etiqueta: 'Reportes',
    descripcion: 'Métricas comerciales y cumplimiento de meta',
    ruta: '/reportes',
    icono: CONFIGURACION_MODULOS.reportes.icono,
    grupo: 'agencia',
    prefijosActivos: ['/reportes'],
    movil: 'mas',
    enMenu: true,
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Equipo, roles, WhatsApp y SLA comercial',
    ruta: '/configuracion',
    icono: CONFIGURACION_MODULOS.configuracion.icono,
    grupo: 'agencia',
    permiso: ['usuarios.administrar', 'roles.administrar', 'catalogo.administrar'],
    prefijosActivos: ['/configuracion', '/bienvenida'],
    movil: 'mas',
    enMenu: true,
  },
];

export interface AccionDeNavegacion {
  id: string;
  etiqueta: string;
  ruta: `/${string}`;
  icono: Icono;
  /**
   * `'barra'`: la acción ocupa un sitio fijo de la barra inferior móvil (variante B de D4), justo
   * después del módulo `despuesDe`. Sin `movil`, solo vive en la paleta.
   */
  movil?: 'barra';
  despuesDe?: IdDeModulo;
}

export const ACCIONES: readonly AccionDeNavegacion[] = [
  {
    id: 'cotizar',
    etiqueta: 'Cotizar',
    ruta: '/cotizador',
    icono: FilePlus,
    movil: 'barra',
    despuesDe: 'conversaciones',
  },
];

/** Un sitio de la barra inferior móvil: un módulo o una acción (siempre «Más» va después). */
export type ElementoDeBarraMovil =
  { tipo: 'modulo'; entrada: EntradaDeNavegacion } | { tipo: 'accion'; accion: AccionDeNavegacion };

/**
 * Composición de la barra inferior móvil, en orden: los módulos `movil: 'barra'` en el orden de la
 * tabla, con cada acción `movil: 'barra'` tras su `despuesDe`. «Más» no es un elemento de la
 * tabla: lo añade la barra al final. Sin filtrar por permiso (los ítems de la barra no lo exigen).
 */
export function elementosDeBarraMovil(): readonly ElementoDeBarraMovil[] {
  const resultado: ElementoDeBarraMovil[] = [];
  for (const entrada of NAVEGACION) {
    if (entrada.movil !== 'barra') continue;
    resultado.push({ tipo: 'modulo', entrada });
    for (const accion of ACCIONES) {
      if (accion.movil === 'barra' && accion.despuesDe === entrada.id) {
        resultado.push({ tipo: 'accion', accion });
      }
    }
  }
  return resultado;
}

/** Módulos de la hoja «Más»: el resto del menú (`movil: 'mas'`), en el orden de la tabla. */
export function entradasDeHojaMas(): readonly EntradaDeNavegacion[] {
  return NAVEGACION.filter((e) => e.enMenu && e.movil === 'mas');
}

/** Etiqueta con la que sale una entrada en la barra móvil. */
export function etiquetaDeBarra(entrada: EntradaDeNavegacion): string {
  return entrada.etiquetaCorta ?? entrada.etiqueta;
}

const MARCA = 'ViajaPro';

function rutaSinConsulta(pathname: string): string {
  const corte = pathname.search(/[?#]/);
  const limpia = corte === -1 ? pathname : pathname.slice(0, corte);
  return limpia.length > 1 && limpia.endsWith('/') ? limpia.slice(0, -1) : limpia;
}

function coincide(ruta: string, prefijo: string): boolean {
  if (prefijo === '/') return ruta === '/';
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`);
}

/** Módulo activo de una ruta: gana el prefijo más largo. `null` si ninguno coincide. */
export function moduloActivo(pathname: string | null | undefined): EntradaDeNavegacion | null {
  if (!pathname) return null;
  const ruta = rutaSinConsulta(pathname);
  let mejor: EntradaDeNavegacion | null = null;
  let largo = -1;
  for (const entrada of NAVEGACION) {
    for (const prefijo of entrada.prefijosActivos) {
      if (coincide(ruta, prefijo) && prefijo.length > largo) {
        mejor = entrada;
        largo = prefijo.length;
      }
    }
  }
  return mejor;
}

/** Entrada de la tabla por id; falla si el id no existe (error de programación). */
export function entradaDe(id: IdDeModulo): EntradaDeNavegacion {
  const entrada = NAVEGACION.find((e) => e.id === id);
  if (!entrada) throw new Error(`Módulo de navegación desconocido: ${id}`);
  return entrada;
}

/** Entradas del menú lateral. */
export function entradasDelMenu(): readonly EntradaDeNavegacion[] {
  return NAVEGACION.filter((e) => e.enMenu);
}

/**
 * ¿Se muestra la entrada? Sin `permiso`, siempre. Con lista, basta cualquiera. Solo oculta: la
 * autorización real es del servidor.
 */
export function esVisiblePara(
  entrada: EntradaDeNavegacion,
  tiene: (permiso: Permiso) => boolean,
): boolean {
  const { permiso } = entrada;
  if (permiso === undefined) return true;
  const lista: readonly Permiso[] = typeof permiso === 'string' ? [permiso] : permiso;
  return lista.some(tiene);
}

/** `/bandeja/[id]`: en móvil la conversación va a pantalla completa y se oculta la barra inferior. */
export function esDetalleMovilDeBandeja(pathname: string | null | undefined): boolean {
  return Boolean(pathname && pathname !== '/bandeja' && pathname.startsWith('/bandeja/'));
}

/** «{pantalla} · ViajaPro»; sin pantalla, solo «ViajaPro». */
export function tituloDeDocumento(pantalla?: string | null): string {
  const limpia = pantalla?.trim();
  return limpia ? `${limpia} · ${MARCA}` : MARCA;
}

/** Título a partir de una ruta: usa la etiqueta de su módulo activo. */
export function tituloDeDocumentoParaRuta(pathname: string): string {
  return tituloDeDocumento(moduloActivo(pathname)?.etiqueta);
}
