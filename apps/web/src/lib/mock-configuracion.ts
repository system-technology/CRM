/**
 * Mock data y tipos para el módulo de Equipo y Configuración de Agencia (/configuracion).
 *
 * Conforme a viajapro_diseno_ui_ux.json (Pantalla P1: settings_team),
 * ADR-0006 (Niveles de parametrización: Nivel 1 en v1),
 * y contratos oficiales en @viajapro/contracts (ClaveEtapa, TelefonoE164).
 */

import type { ClaveEtapa } from '@viajapro/contracts';

export type RolMiembro = 'DUENO' | 'ASESOR';
export type EstadoMiembro = 'ACTIVO' | 'INVITADO' | 'INACTIVO';

export interface MiembroEquipo {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  rol: RolMiembro;
  estado: EstadoMiembro;
  fechaIngreso: string;
  avatarIniciales: string;
}

export type CalidadWaba = 'GREEN' | 'YELLOW' | 'RED';
export type EstadoConexionWaba = 'CONECTADO' | 'DEGRADADO' | 'DESCONECTADO';

export interface ConfiguracionWaba {
  phoneNumberId: string;
  wabaId: string;
  numeroE164: string;
  nombreVisible: string;
  calidad: CalidadWaba;
  estado: EstadoConexionWaba;
  webhookActivo: boolean;
  webhookUrl: string;
  ultimoPingUtc: string;
}

export interface ConfiguracionSla {
  tiempoMaximoPrimeraRespuestaMin: number;
  alertaPreventivaMin: number;
  horarioInicio: string;
  horarioFin: string;
  diasHabiles: string[];
}

export interface ConfiguracionAgencia {
  razonSocial: string;
  nombreComercial: string;
  nit: string;
  monedaBase: 'COP';
  zonaHoraria: string;
  direccion: string;
  ciudad: string;
  telefonoSoporte: string;
}

export interface EtapaConfigurada {
  codigo: ClaveEtapa;
  label: string;
  orden: number;
  probabilidad: number;
  descripcion: string;
  color: string;
}

export const MOCK_MIEMBROS_EQUIPO: MiembroEquipo[] = [
  {
    id: '01932000-0000-7000-8000-0000000000b1',
    nombre: 'Alejandro Morales',
    email: 'alejandro@viajesaventura.com',
    telefono: '+573001234500',
    rol: 'DUENO',
    estado: 'ACTIVO',
    fechaIngreso: '2025-01-15',
    avatarIniciales: 'AM',
  },
  {
    id: '01932000-0000-7000-8000-0000000000b2',
    nombre: 'Carlos Asesor',
    email: 'carlos@viajesaventura.com',
    telefono: '+573001234501',
    rol: 'ASESOR',
    estado: 'ACTIVO',
    fechaIngreso: '2025-03-01',
    avatarIniciales: 'CA',
  },
  {
    id: '01932000-0000-7000-8000-0000000000b3',
    nombre: 'María Gómez',
    email: 'maria@viajesaventura.com',
    telefono: '+573001234502',
    rol: 'ASESOR',
    estado: 'ACTIVO',
    fechaIngreso: '2025-04-10',
    avatarIniciales: 'MG',
  },
  {
    id: '01932000-0000-7000-8000-0000000000b4',
    nombre: 'Diana Ospina',
    email: 'diana@viajesaventura.com',
    telefono: '+573001234503',
    rol: 'ASESOR',
    estado: 'INVITADO',
    fechaIngreso: '2026-10-01',
    avatarIniciales: 'DO',
  },
];

export const MOCK_CONFIGURACION_WABA: ConfiguracionWaba = {
  phoneNumberId: '109847291827462',
  wabaId: '384918273948572',
  numeroE164: '+573009123456',
  nombreVisible: 'Viajes Aventura Colombia SAS',
  calidad: 'GREEN',
  estado: 'CONECTADO',
  webhookActivo: true,
  webhookUrl: 'https://api.viajapro.com/v1/inbox/webhook/meta',
  ultimoPingUtc: '2026-10-11T14:30:00Z',
};

export const MOCK_CONFIGURACION_SLA: ConfiguracionSla = {
  tiempoMaximoPrimeraRespuestaMin: 15,
  alertaPreventivaMin: 5,
  horarioInicio: '08:00',
  horarioFin: '18:00',
  diasHabiles: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
};

export const MOCK_CONFIGURACION_AGENCIA: ConfiguracionAgencia = {
  razonSocial: 'Viajes Aventura Colombia S.A.S.',
  nombreComercial: 'ViajaPro Aventura',
  nit: '901.482.910-3',
  monedaBase: 'COP',
  zonaHoraria: 'America/Bogota (UTC-5)',
  direccion: 'Calle 93 # 12-45, Of. 401',
  ciudad: 'Bogotá D.C., Colombia',
  telefonoSoporte: '+573009123456',
};

export const MOCK_ETAPAS_CONFIGURADAS: EtapaConfigurada[] = [
  {
    codigo: 'NUEVO_LEAD',
    label: 'Nuevo Lead',
    orden: 1,
    probabilidad: 10,
    descripcion: 'Contacto recibido vía WhatsApp sin cotizar aún',
    color: 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  {
    codigo: 'EN_COTIZACION',
    label: 'En Cotización',
    orden: 2,
    probabilidad: 30,
    descripcion: 'Borrador de paquete enviado al cliente',
    color: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    codigo: 'EN_NEGOCIACION',
    label: 'En Negociación',
    orden: 3,
    probabilidad: 60,
    descripcion: 'Ajustando fechas, acomodación o tarifas de mayorista',
    color:
      'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  },
  {
    codigo: 'GANADA',
    label: 'Ganada / Cierre',
    orden: 4,
    probabilidad: 100,
    descripcion: 'Anticipo recibido o paquete confirmado con mayorista',
    color:
      'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    codigo: 'PERDIDA',
    label: 'Perdida',
    orden: 5,
    probabilidad: 0,
    descripcion: 'Cliente desistió o no respondió; motivo de pérdida obligatorio',
    color: 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
];
