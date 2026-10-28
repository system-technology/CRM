/**
 * Lógica y validaciones para Campos Personalizados por Agencia (T-026).
 *
 * Permite a agencias de turismo extender la información del viajero (contacto)
 * y de la cotización comercial (oportunidad) con atributos específicos:
 * pasaportes, visados, preferencias aéreas, presupuestos y motivos.
 *
 * R3: Los tipos base (TipoCampoPersonalizado, DefinicionCampoPersonalizado)
 * provienen de @viajapro/contracts sin redefinirlos.
 */

import {
  type TipoCampoPersonalizado,
  type DefinicionCampoPersonalizado,
  DefinicionCampoPersonalizado as DefinicionCampoPersonalizadoSchema,
} from '@viajapro/contracts';

export type { TipoCampoPersonalizado, DefinicionCampoPersonalizado };

export const CAMPOS_PREDEFINIDOS_TURISMO: DefinicionCampoPersonalizado[] = [
  {
    id: 'campo-1',
    entidad: 'contacto',
    nombre: 'Número de Pasaporte',
    clave: 'numero_pasaporte',
    tipo: 'texto',
    requerido: false,
    descripcion: 'Documento internacional para reservas de vuelos y hoteles',
  },
  {
    id: 'campo-2',
    entidad: 'contacto',
    nombre: 'Fecha de Vencimiento de Pasaporte',
    clave: 'vencimiento_pasaporte',
    tipo: 'fecha',
    requerido: false,
    descripcion: 'Alerta de vigencia mínima de 6 meses para viajes internacionales',
  },
  {
    id: 'campo-3',
    entidad: 'contacto',
    nombre: 'Segmento de Viajero',
    clave: 'segmento_viajero',
    tipo: 'lista',
    opciones: ['Vacacional', 'Luna de Miel', 'Corporativo / MICE', 'Aventura / Ecoturismo'],
    requerido: true,
    descripcion: 'Clasificación de perfil para ofertas dirigidas',
  },
  {
    id: 'campo-4',
    entidad: 'oportunidad',
    nombre: 'Presupuesto Máximo Estimado (COP)',
    clave: 'presupuesto_maximo_cop',
    tipo: 'numero',
    requerido: false,
    descripcion: 'Tope presupuestal indicado por el cliente',
  },
  {
    id: 'campo-5',
    entidad: 'oportunidad',
    nombre: 'Flexibilidad de Fechas',
    clave: 'flexibilidad_fechas',
    tipo: 'lista',
    opciones: ['Fechas Exactas', 'Flexible +/- 3 días', 'Cualquier fin de semana del mes'],
    requerido: false,
    descripcion: 'Grado de margen para buscar mejores tarifas aéreas',
  },
];

const CLAVE_STORAGE = 'viajapro_definiciones_campos_personalizados';

export function obtenerCamposDefinidosStorage(): DefinicionCampoPersonalizado[] {
  if (typeof window === 'undefined') {
    return CAMPOS_PREDEFINIDOS_TURISMO;
  }
  try {
    const raw = localStorage.getItem(CLAVE_STORAGE);
    if (!raw) return CAMPOS_PREDEFINIDOS_TURISMO;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validar cada elemento contra el contrato oficial Zod
      const validados: DefinicionCampoPersonalizado[] = [];
      for (const item of parsed) {
        const resultado = DefinicionCampoPersonalizadoSchema.safeParse(item);
        if (resultado.success) {
          validados.push(resultado.data);
        }
      }
      return validados.length > 0 ? validados : CAMPOS_PREDEFINIDOS_TURISMO;
    }
    return CAMPOS_PREDEFINIDOS_TURISMO;
  } catch {
    return CAMPOS_PREDEFINIDOS_TURISMO;
  }
}

export function guardarCamposDefinidosStorage(campos: DefinicionCampoPersonalizado[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(campos));
  } catch {
    // Silencio en cuotas excedidas
  }
}

export function normalizarClaveCampo(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function validarValorCampoPersonalizado(
  definicion: DefinicionCampoPersonalizado,
  valor: unknown,
): { valido: boolean; error?: string } {
  const estaVacio =
    valor === undefined ||
    valor === null ||
    valor === '' ||
    (typeof valor === 'string' && valor.trim() === '');
  if (definicion.requerido && estaVacio) {
    return { valido: false, error: `El campo "${definicion.nombre}" es obligatorio.` };
  }

  if (estaVacio) {
    return { valido: true };
  }

  switch (definicion.tipo) {
    case 'numero': {
      const num = Number(valor);
      if (isNaN(num)) {
        return {
          valido: false,
          error: `"${definicion.nombre}" debe ser un valor numérico válido.`,
        };
      }
      return { valido: true };
    }
    case 'fecha': {
      if (typeof valor !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(valor)) {
        return { valido: false, error: `"${definicion.nombre}" debe tener formato AAAA-MM-DD.` };
      }
      return { valido: true };
    }
    case 'lista': {
      const strVal = typeof valor === 'string' || typeof valor === 'number' ? String(valor) : '';
      if (definicion.opciones && !definicion.opciones.includes(strVal)) {
        return {
          valido: false,
          error: `El valor seleccionado no es una opción válida para "${definicion.nombre}".`,
        };
      }
      return { valido: true };
    }
    case 'texto':
    default:
      return { valido: true };
  }
}
