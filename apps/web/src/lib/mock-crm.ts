import {
  Contacto,
  ContactoDeLista,
  CrearContacto,
  CrearOportunidad,
  CrearOportunidadDeConversacion,
  CrearSeguimiento,
  EditarContacto,
  FichaDeContacto,
  FiltroSeguimientos,
  Oportunidad,
  PaginaSeguimientos,
  PendientesDelDia,
  Seguimiento,
  OtorgarConsentimiento,
  RevocarConsentimiento,
} from '@viajapro/contracts';
import { MOCK_CONVERSACIONES } from './mock-inbox';
import { obtenerMockPaginaContactos, PREFERENCIAS_MOCK_POR_CONTACTO } from './mock-contactos';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';

function hashCadena(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const DIA_MS = 86_400_000;
const diaIso = (offsetDias: number): string =>
  new Date(Date.now() + offsetDias * DIA_MS).toISOString().slice(0, 10);
const instanteIso = (offsetDias: number): string =>
  new Date(Date.now() + offsetDias * DIA_MS).toISOString();

/**
 * Escenarios de demostración de la ficha. Cada contacto toma uno según su identificador, para que
 * dos contactos no muestren la misma oportunidad, las mismas cotizaciones ni el mismo historial.
 * R8: COP en pesos enteros (en COP la unidad mínima es el peso, no el centavo).
 */
interface EscenarioFicha {
  destino: string;
  titulo: string;
  valorCop: string;
  probabilidad: number;
  tarea: string;
  cotizaciones: Array<{
    version: number;
    titulo: string;
    valorCop: string;
    vigenteEnDias: number;
    enviadaHaceDias: number;
  }>;
  archivos: number;
}

const ESCENARIOS_FICHA: readonly EscenarioFicha[] = [
  {
    destino: 'Cancún, México',
    titulo: 'Hotel Hard Rock + Vuelos Avianca (4 pax)',
    valorCop: '12500000',
    probabilidad: 80,
    tarea: 'Confirmar si requiere vuelos desde Medellín o Bogotá',
    cotizaciones: [
      {
        version: 2,
        titulo: 'Hotel Hard Rock + Vuelos Avianca (4 pax)',
        valorCop: '12500000',
        vigenteEnDias: 5,
        enviadaHaceDias: 1,
      },
      {
        version: 1,
        titulo: 'Hotel Riu Palace (4 pax)',
        valorCop: '11000000',
        vigenteEnDias: -3,
        enviadaHaceDias: 6,
      },
    ],
    archivos: 1,
  },
  {
    destino: 'Curazao',
    titulo: 'Luna de miel en Curazao (2 pax)',
    valorCop: '8900000',
    probabilidad: 60,
    tarea: 'Enviar opciones de hotel frente al mar',
    cotizaciones: [
      {
        version: 1,
        titulo: 'Curazao 5 noches con desayuno (2 pax)',
        valorCop: '8900000',
        vigenteEnDias: 7,
        enviadaHaceDias: 2,
      },
    ],
    archivos: 0,
  },
  {
    destino: 'San Andrés, Colombia',
    titulo: 'San Andrés todo incluido familiar (3 pax)',
    valorCop: '6200000',
    probabilidad: 90,
    tarea: 'Pedir copia de los documentos de los pasajeros',
    cotizaciones: [
      {
        version: 1,
        titulo: 'San Andrés todo incluido (2 adultos y 1 niño)',
        valorCop: '6200000',
        vigenteEnDias: 2,
        enviadaHaceDias: 4,
      },
    ],
    archivos: 2,
  },
  {
    destino: 'Cartagena, Colombia',
    titulo: 'Cartagena histórica 4 días (2 pax)',
    valorCop: '3400000',
    probabilidad: 40,
    tarea: 'Llamar para resolver dudas sobre el itinerario',
    cotizaciones: [],
    archivos: 0,
  },
];

/** Sin cotizaciones ni archivos de escenario: lo que haya lo ponen el tablero y los archivos reales. */
const ESCENARIO_SOLO_TABLERO: EscenarioFicha = {
  destino: '',
  titulo: '',
  valorCop: '0',
  probabilidad: 0,
  tarea: '',
  cotizaciones: [],
  archivos: 0,
};

/** Primera palabra sin tildes: «Cancún, México» y «Cancún» son el mismo destino. */
function claveDeDestino(destino: string | null): string {
  return (destino ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[\s,]+/)[0] as string;
}

/**
 * La oportunidad abierta que el tablero del pipeline ya tiene de este contacto. La ficha la toma de
 * ahí para que el chat, la ficha y el tablero cuenten el mismo viaje (antes la ficha de Juan decía
 * Curazao mientras su chat y su tarjeta decían Cancún).
 */
function oportunidadAbiertaDelTablero(contactoId: string): Oportunidad | undefined {
  for (const columna of obtenerMockTableroPipeline().columnas) {
    if (columna.etapa.esGanada || columna.etapa.esPerdida) continue;
    const o = columna.oportunidades.find((x) => x.contactoId === contactoId);
    if (o) return o;
  }
  return undefined;
}

// Almacén mutable en memoria para mutaciones en modo demo/desconectado
const mockContactosModificados = new Map<string, Contacto>();
const mockOportunidadesContacto = new Map<string, Oportunidad>();
const mockNotasContacto = new Map<
  string,
  Array<{ id: string; autorNombre: string | null; texto: string; escritaEn: string }>
>();

/**
 * Función mock para obtener la Ficha del Viajero por ID de contacto o de conversación.
 * Conforme 100% con los esquemas de @viajapro/contracts (FichaDeContacto, Contacto, Oportunidad, etc.).
 */
export function obtenerMockFichaDeContacto(identificador: string): FichaDeContacto {
  // 1. Buscar en contactos modificados en memoria
  let contacto: (ContactoDeLista & { preferencias?: string | null }) | undefined =
    mockContactosModificados.get(identificador);

  // 2. Buscar en la lista oficial de contactos mock
  if (!contacto) {
    const contactosMock = obtenerMockPaginaContactos().datos;
    contacto = contactosMock.find((c) => c.id === identificador);
  }

  // 3. Buscar si el identificador es una conversación
  const conv = MOCK_CONVERSACIONES.find(
    (c) => c.id === identificador || c.contactoId === identificador,
  );

  const hash = hashCadena(identificador);
  const idBase = contacto?.id ?? conv?.contactoId ?? identificador;
  const sufijo = Number.parseInt(idBase.slice(-4), 16);
  const contactoId =
    contacto?.id ??
    conv?.contactoId ??
    `00000000-0002-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`;
  const oportunidadDelTablero = oportunidadAbiertaDelTablero(contactoId);
  const escenario = oportunidadDelTablero
    ? (ESCENARIOS_FICHA.find(
        (e) => claveDeDestino(e.destino) === claveDeDestino(oportunidadDelTablero.destino),
      ) ?? ESCENARIO_SOLO_TABLERO)
    : (ESCENARIOS_FICHA[(Number.isFinite(sufijo) ? sufijo : hash) % ESCENARIOS_FICHA.length] ??
      ESCENARIOS_FICHA[0]!);
  const destinoDelViaje = oportunidadDelTablero?.destino ?? escenario.destino;

  const nombre = contacto?.nombre ?? conv?.contactoNombre ?? (conv ? null : 'Viajero Simulado');
  const telefono =
    contacto?.telefono ??
    conv?.contactoTelefono ??
    `+57300${((hash % 9000000) + 1000000).toString()}`;
  const etiquetas =
    contacto?.etiquetas ??
    (conv?.etiquetas && conv.etiquetas.length > 0 ? conv.etiquetas : ['Lead Nuevo']);
  const preferencias =
    contacto?.preferencias ??
    PREFERENCIAS_MOCK_POR_CONTACTO[contactoId] ??
    'Prefiere hoteles 4+ estrellas frente al mar. Asientos de pasillo en vuelos matutinos.';
  const consentimientos = contacto?.consentimientos ?? [
    'TRANSACCIONAL' as const,
    'PROMOCIONAL' as const,
  ];

  const oportunidadExistente = mockOportunidadesContacto.get(contactoId);
  const notasExistentes = mockNotasContacto.get(contactoId) ?? [
    {
      id: `00000000-0006-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`,
      autorNombre: conv?.asignadoANombre ?? 'Carlos Asesor',
      texto: `Cliente muy interesado en ${destinoDelViaje}. Pide opciones antes de decidir.`,
      escritaEn: instanteIso(-5),
    },
  ];

  const fichaSinValidar = {
    contacto: {
      id: contactoId,
      nombre,
      telefono,
      correo:
        contacto?.correo ??
        (nombre ? `${nombre.toLowerCase().replace(/[^a-z0-9]/g, '.')}@ejemplo.com` : null),
      etiquetas,
      preferencias,
      consentimientos,
      creadoEn: contacto?.creadoEn ?? '2026-01-15T10:00:00.000Z',
      ultimoContactoEn:
        contacto?.ultimoContactoEn ?? conv?.ultimoMensajeEn ?? '2026-10-10T14:30:00.000Z',
    },
    oportunidadActual: oportunidadExistente ??
      oportunidadDelTablero ?? {
        id: `00000000-0003-4000-8000-${hash.toString(16).padStart(12, '0').slice(0, 12)}`,
        contactoId,
        contactoNombre: nombre,
        titulo: escenario.titulo,
        destino: escenario.destino,
        paqueteId: null,
        fechaSalida: diaIso(25),
        etapa: {
          id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
          clave: 'EN_COTIZACION' as const,
          nombre: 'En cotización',
          orden: 2,
          probabilidad: 40,
          esGanada: false,
          esPerdida: false,
        },
        valorEstimado: {
          unidades: escenario.valorCop, // R8: COP en pesos enteros
          moneda: 'COP' as const,
        },
        probabilidad: escenario.probabilidad,
        asesorId: conv?.asignadoAId ?? '00000000-0000-4000-a000-000000000001',
        asesorNombre: conv?.asignadoANombre ?? 'Carlos Asesor',
        proximaTarea: {
          descripcion: escenario.tarea,
          venceEn: instanteIso(1),
          completada: false,
        },
        motivoPerdida: null,
        notaPerdida: null,
        creadaEn: instanteIso(-18),
        ultimoContactoEn: conv?.ultimoMensajeEn ?? instanteIso(-1),
      },
    cotizaciones: escenario.cotizaciones.map((c, i) => ({
      id: `00000000-0004-4000-8000-${(hash + i + 1).toString(16).padStart(12, '0').slice(0, 12)}`,
      version: c.version,
      titulo: c.titulo,
      precioVenta: { unidades: c.valorCop, moneda: 'COP' as const },
      vigenteHasta: diaIso(c.vigenteEnDias),
      enviadaEn: instanteIso(-c.enviadaHaceDias),
    })),
    // Solo archivos que existen en Reservas: un id inventado no tendría a dónde enlazar.
    archivosDeViajeIds: MOCK_DETALLES_ARCHIVOS.filter(
      (a) => a.contactoId === contactoId && a.estado === 'ABIERTO',
    ).map((a) => a.id),
    notasInternas: notasExistentes,
  };

  return FichaDeContacto.parse(fichaSinValidar);
}

export function crearOportunidadDeConversacionMock(
  conversacionId: string,
  datos: CrearOportunidadDeConversacion,
): Oportunidad {
  const ficha = obtenerMockFichaDeContacto(conversacionId);
  const nuevaOportunidad: Oportunidad = {
    id: crypto.randomUUID(),
    contactoId: ficha.contacto.id,
    contactoNombre: ficha.contacto.nombre,
    titulo: datos.titulo,
    destino: datos.destino ?? 'Destino no especificado',
    paqueteId: null,
    fechaSalida: datos.fechaSalida ?? null,
    etapa: {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
      clave: 'NUEVO_LEAD',
      nombre: 'Oportunidad nueva',
      orden: 1,
      probabilidad: 10,
      esGanada: false,
      esPerdida: false,
    },
    valorEstimado: datos.valorEstimado ?? null,
    probabilidad: 10,
    asesorId: datos.asesorId ?? '00000000-0000-4000-a000-000000000001',
    asesorNombre: 'Carlos Asesor',
    proximaTarea: null,
    motivoPerdida: null,
    notaPerdida: null,
    creadaEn: new Date().toISOString(),
    ultimoContactoEn: new Date().toISOString(),
  };

  const validada = Oportunidad.parse(nuevaOportunidad);
  mockOportunidadesContacto.set(ficha.contacto.id, validada);
  return validada;
}

export function crearContactoMock(datos: CrearContacto): Contacto {
  return Contacto.parse({
    id: crypto.randomUUID(),
    nombre: datos.nombre ?? null,
    telefono: datos.telefono,
    correo: datos.correo ?? null,
    etiquetas: datos.etiquetas ?? [],
    preferencias: datos.preferencias ?? null,
    consentimientos: ['TRANSACCIONAL'],
    creadoEn: new Date().toISOString(),
    ultimoContactoEn: new Date().toISOString(),
  });
}

/**
 * Las fechas de los seguimientos de demostración se escriben respecto a una fecha de referencia
 * y se desplazan a «ahora», para que haya vencidos, de hoy y próximos sin envejecer.
 */
const REFERENCIA_SEGUIMIENTOS_MS = Date.parse('2026-10-26T12:00:00.000Z');
const ARRANQUE_MS = Date.now();
function relativoAhora(iso: string): string {
  return new Date(ARRANQUE_MS + (Date.parse(iso) - REFERENCIA_SEGUIMIENTOS_MS)).toISOString();
}

const MOCK_PENDIENTES_INICIALES: Seguimiento[] = [
  {
    id: '01932000-0000-7000-8000-000000000071',
    descripcion: 'Confirmar pago de anticipo $2.500.000 San Andrés Decameron',
    venceEn: relativoAhora('2026-10-26T15:00:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000021',
    contactoNombre: 'Laura Restrepo',
    oportunidadId: '01932000-0000-7000-8000-000000000031',
    oportunidadTitulo: 'Paquete San Andrés Decameron',
    conversacionId: '01932000-0000-7000-8000-000000000041',
  },
  {
    id: '01932000-0000-7000-8000-000000000072',
    descripcion: 'Enviar itinerario corregido con lancha privada Barú',
    venceEn: relativoAhora('2026-10-27T08:30:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000022',
    contactoNombre: 'Carlos Mario Valencia',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: '01932000-0000-7000-8000-000000000042',
  },
  {
    id: '01932000-0000-7000-8000-000000000073',
    descripcion: 'Confirmar pasaportes y asistencia médica internacional',
    venceEn: relativoAhora('2026-10-27T14:30:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000023',
    contactoNombre: 'Andrés Cepeda',
    oportunidadId: '01932000-0000-7000-8000-000000000033',
    oportunidadTitulo: 'Punta Cana Todo Incluido 5N',
    conversacionId: '01932000-0000-7000-8000-000000000043',
  },
  {
    id: '01932000-0000-7000-8000-000000000074',
    descripcion: 'Enviar cotización formal Pasadía Bora Bora VIP (4 pax)',
    venceEn: relativoAhora('2026-10-27T16:00:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000024',
    contactoNombre: 'Sofía Henao',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: '01932000-0000-7000-8000-000000000044',
  },
  {
    id: '01932000-0000-7000-8000-000000000075',
    descripcion: 'Seguimiento a objeción de hotel en Cartagena Centro Histórico',
    venceEn: relativoAhora('2026-10-27T17:15:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000025',
    contactoNombre: 'Mariana Gómez',
    oportunidadId: '01932000-0000-7000-8000-000000000035',
    oportunidadTitulo: 'Cartagena Histórica & Encanto 3N',
    conversacionId: '01932000-0000-7000-8000-000000000045',
  },
  {
    id: '01932000-0000-7000-8000-000000000076',
    descripcion: 'Agendar llamada de cierre con comité de viajes corporativo',
    venceEn: relativoAhora('2026-10-29T10:00:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000021',
    contactoNombre: 'Laura Restrepo',
    oportunidadId: '01932000-0000-7000-8000-000000000031',
    oportunidadTitulo: 'Paquete San Andrés Decameron',
    conversacionId: '01932000-0000-7000-8000-000000000041',
  },
  {
    id: '01932000-0000-7000-8000-000000000077',
    descripcion: 'Enviar encuesta de satisfacción y solicitud de recomendación',
    venceEn: relativoAhora('2026-10-31T15:00:00.000Z'),
    completadoEn: null,
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000022',
    contactoNombre: 'Carlos Mario Valencia',
    oportunidadId: null,
    oportunidadTitulo: null,
    conversacionId: '01932000-0000-7000-8000-000000000042',
  },
  {
    id: '01932000-0000-7000-8000-000000000078',
    descripcion: 'Verificar emisión de tiquetes aéreos Avianca Bogotá - Cancún',
    venceEn: relativoAhora('2026-10-25T11:00:00.000Z'),
    completadoEn: relativoAhora('2026-10-25T11:45:00.000Z'),
    asesorId: '01932000-0000-7000-8000-000000000011',
    asesorNombre: 'Laura Gómez',
    contactoId: '01932000-0000-7000-8000-000000000023',
    contactoNombre: 'Andrés Cepeda',
    oportunidadId: '01932000-0000-7000-8000-000000000033',
    oportunidadTitulo: 'Punta Cana Todo Incluido 5N',
    conversacionId: '01932000-0000-7000-8000-000000000043',
  },
];

let mockSeguimientosEstado: Seguimiento[] = [...MOCK_PENDIENTES_INICIALES];

export function resetearMockSeguimientos(): void {
  mockSeguimientosEstado = [...MOCK_PENDIENTES_INICIALES];
}

export function obtenerMockPendientesDelDia(): PendientesDelDia {
  const ahora = new Date();
  const fechaHoy = ahora.toISOString().slice(0, 10);
  const inicioHoy = new Date(`${fechaHoy}T00:00:00.000Z`).getTime();
  const finHoy = new Date(`${fechaHoy}T23:59:59.999Z`).getTime();

  const pendientes = mockSeguimientosEstado.filter((s) => s.completadoEn === null);

  const vencidos = pendientes
    .filter((s) => new Date(s.venceEn).getTime() < inicioHoy)
    .sort((a, b) => new Date(a.venceEn).getTime() - new Date(b.venceEn).getTime());

  const deHoy = pendientes
    .filter((s) => {
      const ms = new Date(s.venceEn).getTime();
      return ms >= inicioHoy && ms <= finHoy;
    })
    .sort((a, b) => new Date(a.venceEn).getTime() - new Date(b.venceEn).getTime());

  return PendientesDelDia.parse({
    fecha: fechaHoy,
    vencidos,
    deHoy,
  });
}

export function completarMockSeguimiento(id: string): Seguimiento {
  const index = mockSeguimientosEstado.findIndex((s) => s.id === id);
  if (index === -1) {
    throw new Error(`Seguimiento ${id} no encontrado en mock.`);
  }

  const actualizado: Seguimiento = {
    ...mockSeguimientosEstado[index]!,
    completadoEn: new Date().toISOString(),
  };

  mockSeguimientosEstado[index] = actualizado;
  return Seguimiento.parse(actualizado);
}

/**
 * Edita un contacto en memoria (modo mock).
 */
export function editarMockContacto(id: string, cambios: EditarContacto): Contacto {
  const fichaActual = obtenerMockFichaDeContacto(id);
  const contactoPrevio = fichaActual.contacto;

  const actualizado: Contacto = {
    ...contactoPrevio,
    ...(cambios.nombre !== undefined && { nombre: cambios.nombre }),
    ...(cambios.telefono !== undefined && { telefono: cambios.telefono }),
    ...(cambios.correo !== undefined && { correo: cambios.correo }),
    ...(cambios.etiquetas !== undefined && { etiquetas: cambios.etiquetas }),
    ...(cambios.preferencias !== undefined && { preferencias: cambios.preferencias }),
    ultimoContactoEn: new Date().toISOString(),
  };

  const validado = Contacto.parse(actualizado);
  mockContactosModificados.set(id, validado);
  return validado;
}

/**
 * Crea una oportunidad para un contacto en memoria (modo mock).
 */
export function crearMockOportunidad(cuerpo: CrearOportunidad): Oportunidad {
  const ficha = obtenerMockFichaDeContacto(cuerpo.contactoId);
  const ahora = new Date().toISOString();

  const nuevaOportunidad = {
    id: `01932000-0000-7000-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`,
    contactoId: cuerpo.contactoId,
    contactoNombre: ficha.contacto.nombre,
    titulo: cuerpo.titulo,
    destino: cuerpo.destino ?? 'Cancún, México',
    paqueteId: cuerpo.paqueteId ?? null,
    fechaSalida: cuerpo.fechaSalida ?? null,
    etapa: {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a01',
      clave: 'NUEVO_LEAD' as const,
      nombre: 'Nuevo lead',
      orden: 1,
      probabilidad: 20,
      esGanada: false,
      esPerdida: false,
    },
    valorEstimado: cuerpo.valorEstimado ?? {
      unidades: '5000000',
      moneda: 'COP' as const,
    },
    probabilidad: 20,
    asesorId: cuerpo.asesorId ?? '00000000-0000-4000-a000-000000000001',
    asesorNombre: 'Laura Gómez',
    proximaTarea: null,
    motivoPerdida: null,
    notaPerdida: null,
    creadaEn: ahora,
    ultimoContactoEn: ahora,
  };

  const validada = Oportunidad.parse(nuevaOportunidad);
  mockOportunidadesContacto.set(cuerpo.contactoId, validada);
  return validada;
}

/**
 * Crea un seguimiento en memoria (modo mock).
 */
export function crearMockSeguimiento(cuerpo: CrearSeguimiento): Seguimiento {
  let contactoId = '00000000-0002-4000-8000-000000000001';
  let contactoNombre: string | null = 'Viajero';
  let oportunidadTitulo: string | null = null;

  if (cuerpo.oportunidadId) {
    for (const [, op] of mockOportunidadesContacto.entries()) {
      if (op.id === cuerpo.oportunidadId) {
        contactoId = op.contactoId;
        contactoNombre = op.contactoNombre;
        oportunidadTitulo = op.titulo;
        break;
      }
    }
  }

  const nuevo: Seguimiento = {
    id: `01932000-0000-7000-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`,
    descripcion: cuerpo.descripcion,
    venceEn: cuerpo.venceEn,
    completadoEn: null,
    asesorId: '00000000-0000-4000-a000-000000000001',
    asesorNombre: 'Laura Gómez',
    contactoId,
    contactoNombre,
    oportunidadId: cuerpo.oportunidadId ?? null,
    oportunidadTitulo,
    conversacionId: cuerpo.conversacionId ?? null,
  };

  const validado = Seguimiento.parse(nuevo);
  mockSeguimientosEstado.unshift(validado);
  return validado;
}

/**
 * Lista seguimientos filtrados en memoria (modo mock).
 */
export function listarMockSeguimientos(filtro: FiltroSeguimientos): PaginaSeguimientos {
  let lista = [...mockSeguimientosEstado];

  if (filtro.estado === 'PENDIENTE') {
    lista = lista.filter((s) => s.completadoEn === null);
  } else if (filtro.estado === 'COMPLETADO') {
    lista = lista.filter((s) => s.completadoEn !== null);
  }

  if (filtro.oportunidadId) {
    lista = lista.filter((s) => s.oportunidadId === filtro.oportunidadId);
  }

  if (filtro.conversacionId) {
    lista = lista.filter((s) => s.conversacionId === filtro.conversacionId);
  }

  return {
    datos: lista,
    pageInfo: { nextCursor: null, hasMore: false },
  };
}

/**
 * Añade una nota interna al contacto en memoria (modo mock).
 */
export function agregarMockNotaInterna(
  contactoId: string,
  texto: string,
  autorNombre: string = 'Laura Gómez',
): void {
  const notas = mockNotasContacto.get(contactoId) ?? [];
  notas.unshift({
    id: `00000000-0006-4000-8000-${Date.now().toString(16).slice(-12).padStart(12, '0')}`,
    autorNombre,
    texto,
    escritaEn: new Date().toISOString(),
  });
  mockNotasContacto.set(contactoId, notas);
}

/**
 * Otorga consentimiento a un contacto en memoria (modo mock) (T-116).
 */
export function otorgarMockConsentimiento(
  contactoId: string,
  cuerpo: OtorgarConsentimiento,
): Contacto {
  const fichaActual = obtenerMockFichaDeContacto(contactoId);
  const contactoPrevio = fichaActual.contacto;
  const yaExiste = contactoPrevio.consentimientos.includes(cuerpo.finalidad);
  const nuevos = yaExiste
    ? contactoPrevio.consentimientos
    : [...contactoPrevio.consentimientos, cuerpo.finalidad];

  const actualizado: Contacto = {
    ...contactoPrevio,
    consentimientos: nuevos,
    ultimoContactoEn: new Date().toISOString(),
  };

  const validado = Contacto.parse(actualizado);
  mockContactosModificados.set(contactoId, validado);
  return validado;
}

/**
 * Revoca consentimiento a un contacto en memoria (modo mock) (T-116).
 */
export function revocarMockConsentimiento(
  contactoId: string,
  cuerpo: RevocarConsentimiento,
): Contacto {
  const fichaActual = obtenerMockFichaDeContacto(contactoId);
  const contactoPrevio = fichaActual.contacto;
  const nuevos = contactoPrevio.consentimientos.filter((c) => c !== cuerpo.finalidad);

  const actualizado: Contacto = {
    ...contactoPrevio,
    consentimientos: nuevos,
    ultimoContactoEn: new Date().toISOString(),
  };

  const validado = Contacto.parse(actualizado);
  mockContactosModificados.set(contactoId, validado);
  return validado;
}
