/**
 * El armado PURO de la bandeja de demostración cifrada (T-225). Sin base de datos ni red: recibe
 * el puerto de cifrado, el tenant y los ids que ya existan, y devuelve las filas listas para
 * insertar, con cada columna de texto cifrada EXACTAMENTE como la escriben los adaptadores
 * (`bandeja.prisma.ts`, `puertos-de-crm.prisma.ts`): el id de la fila se genera antes y entra en
 * el AAD.
 *
 * Desde ADR-0015 la semilla SQL no puede escribir texto (la clave no está en la base). Esto es lo
 * que lo hace del lado de la API. Todo es sintético: nombres y teléfonos de `@agenciademo.test`
 * y del rango de ejemplo de la semilla; ninguna persona real.
 */
import {
  columnasDeTexto,
  columnasDeUltimoMensaje,
} from '../../../shared/cifrado/columnas-de-prisma.js';
import {
  COLUMNAS_CIFRADAS,
  type PuertoCifradoDeCampos,
} from '../../../shared/cifrado/puerto-de-cifrado.js';
import { uuidV7 } from '../../../shared/cifrado/uuid-v7.js';

/** El tope de la vista previa que declara el contrato; se recorta antes de cifrar. */
const TOPE_DE_VISTA_PREVIA = 200;
const HORA_MS = 3_600_000;

interface MensajeDelPlan {
  readonly wamid: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly estado: 'ENTREGADO' | 'LEIDO';
  readonly haceHoras: number;
  readonly texto: string;
}

interface NotaDelPlan {
  readonly haceHoras: number;
  readonly texto: string;
}

interface ConversacionDelPlan {
  /** Contacto de la semilla (`seed.ts`); la conversación cuelga de él. */
  readonly telefono: string;
  readonly etiquetas: readonly string[];
  readonly mensajes: readonly MensajeDelPlan[];
  readonly notas: readonly NotaDelPlan[];
}

/**
 * Los tres hilos. El primero es el que ya crea la semilla (wamid.DEMO.0001-0003): aquí solo se le
 * pone el texto. Los otros dos son nuevos y cubren los estados interesantes de la bandeja: un
 * entrante sin responder con la ventana abierta, y un saliente con la ventana ya vencida.
 */
export const PLAN_DE_LA_DEMO: readonly ConversacionDelPlan[] = [
  {
    telefono: '+573001234567',
    etiquetas: ['San Andres'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.0001',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 22,
        texto:
          'Hola, buenas tardes. Quisiera cotizar un plan a San Andrés para 4 personas, ' +
          'saliendo desde Bogotá el 12 de diciembre y regresando el 16. ¿Qué incluye?',
      },
      {
        wamid: 'wamid.DEMO.0002',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 21,
        texto:
          'Hola Laura, con gusto. El plan de 5 días y 4 noches incluye tiquetes aéreos, hotel con ' +
          'desayuno, traslados y el tour a Johnny Cay. ¿Viajan adultos y niños?',
      },
      {
        wamid: 'wamid.DEMO.0003',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 20,
        texto:
          'Somos 2 adultos y 2 niños de 8 y 11 años. ¿Cuál sería el valor total y hasta cuándo ' +
          'puedo separar los cupos?',
      },
    ],
    notas: [
      {
        haceHoras: 19,
        texto:
          'Pidió plan con desayuno incluido. Confirmar documento de los menores antes de ' +
          'emitir tiquetes. Hacer seguimiento mañana en la mañana.',
      },
    ],
  },
  {
    telefono: '+573155551234',
    etiquetas: ['Cartagena'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 5,
        texto:
          'Buenas, ¿tienen salidas a Cartagena para el puente festivo de diciembre? ' +
          'Somos una pareja y queremos 3 noches.',
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.2',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 4,
        texto:
          'Hola Diego, sí tenemos cupos. Le propongo hotel en el Centro Histórico con desayuno, ' +
          'tiquetes desde Medellín y city tour por la ciudad amurallada. Le envío la cotización.',
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.3',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 1,
        texto:
          'Perfecto. ¿El hotel queda en el Centro Histórico o en Bocagrande? ' +
          '¿Y se puede pagar en dos cuotas?',
      },
    ],
    notas: [
      {
        haceHoras: 3,
        texto:
          'Pareja en aniversario. Ofrecer cena en la ciudad amurallada como adicional y ' +
          'preguntar si prefieren vuelo de la mañana.',
      },
    ],
  },
  {
    telefono: '+573109876543',
    etiquetas: ['Santa Marta'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.CIFRADA.6543.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 30,
        texto:
          'Buenos días. Somos una familia de 6 y queremos ir a Santa Marta y al Parque Tayrona ' +
          'en la semana de receso de octubre. ¿Qué opciones nos recomiendan?',
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.6543.2',
        direccion: 'SALIENTE',
        estado: 'ENTREGADO',
        haceHoras: 29,
        texto:
          'Buenos días. Para 6 personas le recomiendo el plan de 4 noches con hotel en El Rodadero, ' +
          'excursión a Tayrona y Minca. Le envío el detalle por aquí en un momento.',
      },
    ],
    notas: [],
  },
];

export interface ExistentesDeLaDemo {
  /** Teléfono del contacto -> id de la conversación que ya existe. */
  readonly conversaciones: ReadonlyMap<string, string>;
  /** wamid -> id del mensaje que ya existe. */
  readonly mensajes: ReadonlyMap<string, string>;
}

type ColumnasDeTexto = ReturnType<typeof columnasDeTexto>;
type ColumnasDeVistaPrevia = ReturnType<typeof columnasDeUltimoMensaje>;

export interface MensajeArmado {
  readonly id: string;
  readonly wamid: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly estado: 'ENTREGADO' | 'LEIDO';
  readonly ocurridoEn: Date;
  readonly existente: boolean;
  readonly texto: ColumnasDeTexto;
}

export interface NotaArmada {
  readonly id: string;
  readonly escritaEn: Date;
  readonly texto: ColumnasDeTexto;
}

export interface ConversacionArmada {
  readonly telefono: string;
  readonly id: string;
  readonly existente: boolean;
  readonly etiquetas: readonly string[];
  readonly ultimoMensajeEn: Date;
  readonly ultimoMensajeDireccion: 'ENTRANTE' | 'SALIENTE';
  readonly ultimoMensajeClienteEn: Date;
  readonly mensajesSinLeer: number;
  readonly primeraRespuestaEn: Date | null;
  readonly vistaPrevia: ColumnasDeVistaPrevia;
  readonly mensajes: readonly MensajeArmado[];
  readonly notas: readonly NotaArmada[];
}

export function armarLaDemoCifrada(entrada: {
  readonly cifrado: PuertoCifradoDeCampos;
  readonly tenantId: string;
  readonly ahoraMs: number;
  readonly existentes: ExistentesDeLaDemo;
}): ConversacionArmada[] {
  const { cifrado, tenantId, ahoraMs, existentes } = entrada;
  const hace = (h: number): Date => new Date(ahoraMs - h * HORA_MS);

  return PLAN_DE_LA_DEMO.map((c) => {
    const conversacionExistente = existentes.conversaciones.get(c.telefono);
    const conversacionId = conversacionExistente ?? uuidV7(ahoraMs);

    const mensajes: MensajeArmado[] = c.mensajes.map((m) => {
      const existente = existentes.mensajes.get(m.wamid);
      // El id va en el AAD: se fija ANTES de cifrar (ADR-0015, concreción 3).
      const id = existente ?? uuidV7(ahoraMs - m.haceHoras * HORA_MS);
      return {
        id,
        wamid: m.wamid,
        direccion: m.direccion,
        estado: m.estado,
        ocurridoEn: hace(m.haceHoras),
        existente: existente !== undefined,
        texto: columnasDeTexto(
          cifrado.cifrar(COLUMNAS_CIFRADAS.MENSAJES_TEXTO, tenantId, id, m.texto),
        ),
      };
    });

    // El plan va en orden cronológico: el último es el más reciente.
    const ultimo = c.mensajes[c.mensajes.length - 1];
    const ultimoCliente = [...c.mensajes].reverse().find((m) => m.direccion === 'ENTRANTE');
    if (!ultimo || !ultimoCliente) {
      throw new Error('Un hilo de la demo necesita al menos un mensaje entrante.');
    }
    const primeraRespuesta = c.mensajes.find((m) => m.direccion === 'SALIENTE');
    // Sin leer: los entrantes posteriores a la última respuesta nuestra.
    const ultimaSaliente = [...c.mensajes].reverse().find((m) => m.direccion === 'SALIENTE');
    const sinLeer = c.mensajes.filter(
      (m) =>
        m.direccion === 'ENTRANTE' && (!ultimaSaliente || m.haceHoras < ultimaSaliente.haceHoras),
    ).length;

    const notas: NotaArmada[] = c.notas.map((n) => {
      const id = uuidV7(ahoraMs - n.haceHoras * HORA_MS);
      return {
        id,
        escritaEn: hace(n.haceHoras),
        texto: columnasDeTexto(
          cifrado.cifrar(COLUMNAS_CIFRADAS.NOTAS_INTERNAS_TEXTO, tenantId, id, n.texto),
        ),
      };
    });

    return {
      telefono: c.telefono,
      id: conversacionId,
      existente: conversacionExistente !== undefined,
      etiquetas: c.etiquetas,
      ultimoMensajeEn: hace(ultimo.haceHoras),
      ultimoMensajeDireccion: ultimo.direccion,
      ultimoMensajeClienteEn: hace(ultimoCliente.haceHoras),
      mensajesSinLeer: sinLeer,
      primeraRespuestaEn: primeraRespuesta ? hace(primeraRespuesta.haceHoras) : null,
      vistaPrevia: columnasDeUltimoMensaje(
        cifrado.cifrar(
          COLUMNAS_CIFRADAS.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
          tenantId,
          conversacionId,
          ultimo.texto.slice(0, TOPE_DE_VISTA_PREVIA),
        ),
      ),
      mensajes,
      notas,
    };
  });
}
