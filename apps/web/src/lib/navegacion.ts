/**
 * Tabla única de navegación (ADR-0032 §3). Fuente del menú, la paleta, los títulos y el módulo activo.
 *
 * Parte A de T-316: solo la tabla y su lógica pura. Hoy solo la paleta la lee; el menú y la barra
 * móvil migran en la parte B.
 */

import type { ComponentType } from 'react';
import { CalendarCheck, ListChecks } from 'lucide-react';
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
  /** Solo barra móvil; debe estar contenida en `etiqueta`. */
  etiquetaCorta?: string;
  /** Una línea para la paleta de comandos. */
  descripcion: string;
  ruta: `/${string}`;
  icono: Icono;
  grupo: GrupoDeNavegacion;
  /** Solo oculta; autoriza la API. */
  permiso?: Permiso;
  /** Coincide si pathname === prefijo o empieza por `prefijo/`. «/» solo coincide exacto. */
  prefijosActivos: readonly string[];
  movil: 'barra' | 'mas';
  /**
   * Si aparece en el menú lateral. Hoy, Cotizaciones y Seguimientos van en `false` hasta T-317
   * (decisiones D1–D4 de docs/01-producto/04-flujos-criticos.md, pendientes del propietario).
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
    enMenu: false,
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
    enMenu: false,
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
    enMenu: false,
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
    permiso: 'cotizacion.ver_neto_y_margen',
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
    // Sin `permiso`: hoy se muestra con cualquiera de tres permisos (usuarios, roles o catálogo) y
    // `permiso` admite uno solo. La paleta conserva ese «cualquiera de»; la parte B lo resuelve.
    prefijosActivos: ['/configuracion', '/bienvenida'],
    movil: 'mas',
    enMenu: true,
  },
];

export interface AccionDeNavegacion {
  id: string;
  etiqueta: string;
  ruta: `/${string}`;
}

export const ACCIONES: readonly AccionDeNavegacion[] = [
  { id: 'cotizar', etiqueta: 'Cotizar', ruta: '/cotizador' },
];

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
export function moduloActivo(pathname: string): EntradaDeNavegacion | null {
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

/** «{pantalla} · ViajaPro»; sin pantalla, solo «ViajaPro». */
export function tituloDeDocumento(pantalla?: string | null): string {
  const limpia = pantalla?.trim();
  return limpia ? `${limpia} · ${MARCA}` : MARCA;
}

/** Título a partir de una ruta: usa la etiqueta de su módulo activo. */
export function tituloDeDocumentoParaRuta(pathname: string): string {
  return tituloDeDocumento(moduloActivo(pathname)?.etiqueta);
}
