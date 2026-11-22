/**
 * Semilla de desarrollo: una agencia demo con catálogo de paquetes.
 *
 *   pnpm db:seed
 *
 * Los datos son **verosímiles, no reales**: destinos, temporadas y estructura de precios tal
 * como los publica un mayorista colombiano, con cifras inventadas. Sirven para desarrollar y
 * demostrar; no para tomar decisiones de precio.
 *
 * Por qué importa que sean verosímiles y no `test1`, `test2`: casi todos los defectos de
 * modelado de este dominio aparecen al cargar un tarifario de verdad —precio por acomodación,
 * temporadas que se solapan, niños con edad de corte—. Con datos de juguete no se ven.
 *
 * Es idempotente: se puede ejecutar varias veces.
 */

import { PrismaClient } from '@prisma/client';
import { sembrarCatalogoReal } from './semilla-catalogo-real.js';
import {
  sembrarEtapas,
  sembrarEtiquetas,
  sembrarEtiquetasDadas,
  sembrarFormatos,
  sembrarMotivosDePerdida,
  sembrarRoles,
  type EtiquetaSembrada,
} from './siembra-de-tenant.js';

const prisma = new PrismaClient();

const TENANT_DEMO = '01932000-0000-7000-8000-0000000000d0';

/**
 * Las etiquetas que SOLO recibe la agencia demo (T-614), además de las tres de toda agencia.
 *
 * Son las palabras con las que el cliente del piloto pidió la función: «poder organizar o
 * categorizar los chats —los que ya reservaron, los que tienen reserva pendiente, los nuevos—».
 * Se AÑADEN, no sustituyen: «Pagado» es cobro y «Ya reservó» es gestión del chat, son dos ejes
 * distintos; y las tres de toda agencia las siembra también la migración 20261121110000, que
 * falla si una agencia no queda con las tres.
 *
 * Van aquí y no en `ETIQUETAS_SEMBRADAS` a propósito: lo de `siembra-de-tenant.ts` es lo que
 * recibe TODA agencia —incluidas las reales—, y qué etiquetas trae una agencia nueva es una
 * decisión de producto que nadie ha tomado. Esto es la demo, que es dato de muestra.
 *
 * Colores distintos de los tres ya usados (verde, ámbar, azul) dentro de la paleta del CHECK
 * `etiquetas_color_de_la_paleta`, y orden detrás de ellos.
 */
const ETIQUETAS_DE_LA_DEMO = [
  { nombre: 'Ya reservó', color: 'turquesa', orden: 3 },
  { nombre: 'Reserva pendiente', color: 'naranja', orden: 4 },
  { nombre: 'Nuevo', color: 'rosa', orden: 5 },
] as const satisfies ReadonlyArray<EtiquetaSembrada>;

interface MensajeDelHilo {
  readonly wamid: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly estado: 'ENTREGADO' | 'LEIDO';
  /** Hace cuántas horas ocurrió. La lista va en orden cronológico: el último es el más reciente. */
  readonly haceHoras: number;
  readonly claveIdempotencia: string | null;
}

interface HiloDeLaDemo {
  /** Teléfono del contacto sembrado arriba; la conversación cuelga de él y del canal demo. */
  readonly telefono: string;
  /** Nombres de etiquetas de la agencia, tal cual se siembran. */
  readonly etiquetas: readonly string[];
  readonly mensajes: readonly MensajeDelHilo[];
  /** Plazo de PRIMERA respuesta: horas hacia atrás (vencido) o negativas (aún por vencer). */
  readonly slaVenceHaceHoras: number | null;
  /** Cuándo se cumplió ese plazo. Nulo deja el hilo como «sin primera respuesta». */
  readonly primeraRespuestaHaceHoras: number | null;
}

/**
 * La bandeja de demostración (T-614): siete hilos repartidos entre las seis etiquetas, para que
 * cada filtro devuelva algo. Con un solo hilo no se puede enseñar «organizar los chats», que es
 * justo lo que pidió el cliente del piloto.
 *
 * **Sin texto, y no es un olvido**: desde ADR-0015 el texto del mensaje y la vista previa solo
 * existen cifrados, y la clave vive en la API y el trabajador, no aquí. Los hilos se ven con su
 * estructura (dirección, estado, instantes, sin leer) y sin contenido. Quien quiera texto corre
 * `apps/api/src/demo/sembrar-demo-cifrada.ts`, que rellena los TRES primeros —por eso sus wamids
 * son los de `PLAN_DE_LA_DEMO` y sus instantes los mismos: así el script les pone el texto en vez
 * de crear un hilo paralelo—. Los cuatro de T-614 no están en ese plan y se quedan sin texto:
 * añadírselo es tocar `apps/api`, que es otro carril.
 *
 * Los instantes son RELATIVOS a la siembra, a propósito: una semilla con fechas fijas muestra una
 * bandeja de hace meses el día que alguien la corra.
 */
const HILOS_DE_LA_DEMO = [
  {
    // San Andrés, 4 pasajeros: pidió cotización y está decidiendo. Hace 20 horas: quedan 4 de
    // ventana. Es el estado interesante de la interfaz, el que obliga a decidir entre responder
    // ya o gastar una plantilla. Y con el plazo de primera respuesta vencido, que es lo que
    // alimenta el filtro SLA_VENCIDO de la bandeja.
    telefono: '+573001234567',
    etiquetas: ['Reserva pendiente', 'Seguimiento'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.0001',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 22,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.0002',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 21,
        claveIdempotencia: '01932000-0000-7000-8000-00000000e001',
      },
      {
        wamid: 'wamid.DEMO.0003',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 20,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: 19,
    primeraRespuestaHaceHoras: null,
  },
  {
    // Cartagena, pareja: preguntó por pagar en dos cuotas. Ventana abierta y uno sin leer.
    telefono: '+573155551234',
    etiquetas: ['Reserva pendiente', 'Pago pendiente'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 5,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.2',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 4,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.1234.3',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 1,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: null,
    primeraRespuestaHaceHoras: 4,
  },
  {
    // Santa Marta, familia de 6: consulta nueva, ya respondida, sin contestar todavía. Ventana
    // vencida (el cliente escribió hace 30 horas).
    telefono: '+573109876543',
    etiquetas: ['Nuevo'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.CIFRADA.6543.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 30,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.CIFRADA.6543.2',
        direccion: 'SALIENTE',
        estado: 'ENTREGADO',
        haceHoras: 29,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: null,
    primeraRespuestaHaceHoras: 29,
  },
  {
    // Luna de miel: reservó y pagó. El caso que el cliente llama «ya reservó».
    telefono: '+573124445566',
    etiquetas: ['Ya reservó', 'Pagado'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.T614.4455.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 48,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.4455.2',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 47,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.4455.3',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 46,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.4455.4',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 45,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: null,
    primeraRespuestaHaceHoras: 47,
  },
  {
    // Excursión de colegio: cupos separados, falta el saldo. Reservó pero no ha pagado del todo.
    telefono: '+573017778899',
    etiquetas: ['Ya reservó', 'Pago pendiente'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.T614.8899.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 10,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.8899.2',
        direccion: 'SALIENTE',
        estado: 'LEIDO',
        haceHoras: 9,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.8899.3',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 8,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: null,
    primeraRespuestaHaceHoras: 9,
  },
  {
    // Acaba de escribir y nadie ha respondido: el plazo de primera respuesta vence dentro de una
    // hora (horas negativas = en el futuro).
    telefono: '+573145556677',
    etiquetas: ['Nuevo'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.T614.6677.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 2,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: -1,
    primeraRespuestaHaceHoras: null,
  },
  {
    // Eje Cafetero: pagado, y queda pendiente que mande los documentos de los viajeros.
    telefono: '+573186669900',
    etiquetas: ['Ya reservó', 'Pagado', 'Seguimiento'],
    mensajes: [
      {
        wamid: 'wamid.DEMO.T614.9900.1',
        direccion: 'ENTRANTE',
        estado: 'ENTREGADO',
        haceHoras: 26,
        claveIdempotencia: null,
      },
      {
        wamid: 'wamid.DEMO.T614.9900.2',
        direccion: 'SALIENTE',
        estado: 'ENTREGADO',
        haceHoras: 25,
        claveIdempotencia: null,
      },
    ],
    slaVenceHaceHoras: null,
    primeraRespuestaHaceHoras: 25,
  },
] as const satisfies ReadonlyArray<HiloDeLaDemo>;

/**
 * Lo denormalizado de la fila de bandeja, derivado de los mensajes y no escrito a mano: el último
 * mensaje, el último del cliente (la ventana de servicio) y cuántos quedan sin leer —los entrantes
 * posteriores a nuestra última respuesta—. Es la misma derivación que hace `armarLaDemoCifrada` en
 * la API, para que los tres hilos compartidos cuadren con el texto que ese script les pone.
 */
function resumenDelHilo(hilo: HiloDeLaDemo): {
  ultimo: MensajeDelHilo;
  ultimoDelCliente: MensajeDelHilo;
  sinLeer: number;
} {
  const ultimo = hilo.mensajes[hilo.mensajes.length - 1];
  const ultimoDelCliente = [...hilo.mensajes].reverse().find((m) => m.direccion === 'ENTRANTE');
  if (!ultimo || !ultimoDelCliente) {
    throw new Error(`El hilo de ${hilo.telefono} necesita al menos un mensaje entrante.`);
  }
  const ultimaSaliente = [...hilo.mensajes].reverse().find((m) => m.direccion === 'SALIENTE');
  const sinLeer = hilo.mensajes.filter(
    (m) =>
      m.direccion === 'ENTRANTE' && (!ultimaSaliente || m.haceHoras < ultimaSaliente.haceHoras),
  ).length;
  return { ultimo, ultimoDelCliente, sinLeer };
}

/**
 * ¿La base es local? Solo un host de loopback (Docker en la máquina o el contenedor de CI) cuenta.
 * Una URL ilegible o ausente cuenta como NO local: lo que depende de esto se omite.
 */
function esBaseLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Pesos colombianos: cero decimales, así que la unidad mínima es el peso. R8. */
const cop = (pesos: number) => BigInt(pesos);

async function main() {
  console.log('Sembrando la agencia demo…');

  // --- Datos de referencia globales --------------------------------------
  await prisma.moneda.createMany({
    data: [
      { codigoIso: 'COP', nombre: 'Peso colombiano', decimales: 0 },
      { codigoIso: 'USD', nombre: 'Dólar estadounidense', decimales: 2 },
      { codigoIso: 'EUR', nombre: 'Euro', decimales: 2 },
      { codigoIso: 'MXN', nombre: 'Peso mexicano', decimales: 2 },
    ],
    skipDuplicates: true,
  });

  // --- La agencia ---------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_DEMO },
    update: {},
    create: {
      id: TENANT_DEMO,
      slug: 'agencia-demo',
      nombre: 'Agencia Demo — Viajes del Caribe',
      paisIso: 'CO',
      monedaIso: 'COP',
      zonaHoraria: 'America/Bogota',
      estado: 'ACTIVO',
    },
  });

  // --- Roles -------------------------------------------------------------
  // Tabla por agencia, no enum (R12, ADR-0011); ver siembra-de-tenant.ts.
  const rolPorClave = await sembrarRoles(prisma, tenant.id);

  // --- Formatos de viaje (ADR-0017 M2) -------------------------------------
  await sembrarFormatos(prisma, tenant.id);

  // --- Equipo -------------------------------------------------------------
  // La persona es una identidad GLOBAL; su pertenencia a la agencia es `usuarios`.
  // Sin credencial: la contraseña de desarrollo la pone la rebanada 2 (Better Auth), con el
  // hash que genere su biblioteca, no uno escrito aquí.
  //
  // Apodos de ingreso (ADR-0031): sintéticos y SOLO en una base local. `dueno` y `demo` solos
  // están reservados, por eso `dueno.demo`. Fuera de loopback (staging, una rama de Neon) la
  // semilla no pone ni quita apodos: la cola de ADR-0031 (C8) los deja fuera de staging.
  const conApodos = esBaseLocal(process.env['DATABASE_URL']);
  const equipo = [
    {
      correo: 'dueno@agenciademo.test',
      nombre: 'John Duarte',
      clave: 'DUENO',
      apodo: 'dueno.demo',
    },
    {
      correo: 'ana@agenciademo.test',
      nombre: 'Ana Lucía Pérez',
      clave: 'ASESOR',
      apodo: 'ana.demo',
    },
    {
      correo: 'carlos@agenciademo.test',
      nombre: 'Carlos Mejía',
      clave: 'ASESOR',
      apodo: 'carlos.demo',
    },
  ];
  for (const persona of equipo) {
    const apodo = conApodos ? { apodo: persona.apodo } : {};
    const identidad = await prisma.identidad.upsert({
      where: { correo: persona.correo },
      // El nombre SÍ se actualiza al resembrar. Con `update: {}` un cambio aquí no llegaba nunca a
      // una base ya sembrada: el código decía una cosa y la demo enseñaba otra (T-601).
      update: { nombre: persona.nombre },
      create: { correo: persona.correo, nombre: persona.nombre },
    });
    const rolId = rolPorClave.get(persona.clave);
    if (!rolId) throw new Error(`Falta el rol sembrado ${persona.clave}`);
    await prisma.usuario.upsert({
      where: { tenantId_correo: { tenantId: tenant.id, correo: persona.correo } },
      update: { ...apodo },
      create: {
        tenantId: tenant.id,
        identidadId: identidad.id,
        rolId,
        correo: persona.correo,
        nombre: persona.nombre,
        ...apodo,
      },
    });
  }

  // --- Embudo -------------------------------------------------------------
  // Las etapas y su lógica de idempotencia viven en siembra-de-tenant.ts (compartida con las
  // agencias de prospecto).
  await sembrarEtapas(prisma, tenant.id);
  await sembrarMotivosDePerdida(prisma, tenant.id);
  await sembrarEtiquetas(prisma, tenant.id);
  // Y, solo en la demo, las tres con las palabras del cliente del piloto (T-614).
  await sembrarEtiquetasDadas(prisma, tenant.id, ETIQUETAS_DE_LA_DEMO);

  // --- Campos personalizados ---------------------------------------------
  // Se siembran para que la columna jsonb y las definiciones se ejerciten desde el principio.
  await prisma.definicionCampoPersonalizado.createMany({
    data: [
      {
        tenantId: tenant.id,
        entidad: 'CONTACTO',
        clave: 'como_nos_conocio',
        etiqueta: '¿Cómo nos conoció?',
        tipo: 'SELECCION',
        orden: 1,
        opciones: ['Instagram', 'Referido', 'Google', 'Cliente anterior', 'Otro'],
      },
      {
        tenantId: tenant.id,
        entidad: 'OPORTUNIDAD',
        clave: 'motivo_del_viaje',
        etiqueta: 'Motivo del viaje',
        tipo: 'SELECCION',
        orden: 1,
        opciones: ['Vacaciones', 'Luna de miel', 'Negocios', 'Familiar', 'Celebración'],
      },
    ],
    skipDuplicates: true,
  });

  // --- Mayoristas ---------------------------------------------------------
  const mayoristas = [
    { nombre: 'Mayorista Caribe S.A.S.', diasTimeLimit: 5, contactoNombre: 'Jorge Restrepo' },
    { nombre: 'Operadora Andina', diasTimeLimit: 3, contactoNombre: 'Liliana Gómez' },
  ];
  const mayoristasCreados = [];
  for (const m of mayoristas) {
    const existente = await prisma.mayorista.findFirst({
      where: { tenantId: tenant.id, nombre: m.nombre },
    });
    mayoristasCreados.push(
      existente ?? (await prisma.mayorista.create({ data: { tenantId: tenant.id, ...m } })),
    );
  }

  // --- Paquetes con hotel ---------------------------------------------------
  //
  // En vigencias y tarifas (ADR-0009), el modelo que lee el cotizador. Hasta T-180 vivían en
  // `temporadas`/`precios`, que el cotizador no lee: estos tres paquetes no se podían cotizar.
  // Cada temporada es una vigencia de rango (no publicada) y cada precio, una tarifa POR_PERSONA
  // con su acomodación, tipo de pasajero y edad de corte. Tras T-188, cotizarlos exige
  // `acomodacion`; con niños o infantes, también sus edades (T-179).
  //
  // Tres patrones reales del tarifario colombiano, elegidos a propósito:
  //   · San Andrés: el destino más vendido. Temporada alta de diciembre y puente festivo.
  //   · Cartagena: cercano, precios por acomodación muy marcados.
  //   · Punta Cana: internacional, todo incluido, con infante gratis.
  const paquetes = [
    {
      nombre: 'San Andrés — 4 días / 3 noches, todo incluido',
      destino: 'San Andrés',
      paisIso: 'CO',
      dias: 4,
      noches: 3,
      planAlimentacion: 'TODO_INCLUIDO' as const,
      mayoristaId: mayoristasCreados[0]!.id,
      inclusiones: [
        'Tiquetes aéreos Bogotá — San Andrés — Bogotá',
        'Traslados aeropuerto — hotel — aeropuerto',
        'Alojamiento 3 noches con todo incluido',
        'Tarjeta de turismo',
        'Seguro de asistencia médica',
      ],
      exclusiones: ['Impuesto de ingreso a la isla', 'Tours opcionales', 'Gastos no especificados'],
      vigencias: [
        {
          nombre: 'Temporada baja',
          desde: '2027-02-01',
          hasta: '2027-06-15',
          tarifas: [
            { acomodacion: 'DOBLE', tipoPasajero: 'ADT', neto: 1_280_000, venta: 1_590_000 },
            { acomodacion: 'TRIPLE', tipoPasajero: 'ADT', neto: 1_150_000, venta: 1_430_000 },
            { acomodacion: 'CUADRUPLE', tipoPasajero: 'ADT', neto: 1_080_000, venta: 1_340_000 },
            { acomodacion: 'SENCILLA', tipoPasajero: 'ADT', neto: 1_850_000, venta: 2_290_000 },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'CHD',
              neto: 890_000,
              venta: 1_110_000,
              edadMinima: 2,
              edadMaxima: 11,
            },
            {
              acomodacion: 'TRIPLE',
              tipoPasajero: 'CHD',
              neto: 820_000,
              venta: 1_020_000,
              edadMinima: 2,
              edadMaxima: 11,
            },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'INF',
              neto: 180_000,
              venta: 220_000,
              edadMinima: 0,
              edadMaxima: 1,
            },
          ],
        },
        {
          nombre: 'Temporada alta — diciembre',
          desde: '2027-12-15',
          hasta: '2028-01-15',
          tarifas: [
            { acomodacion: 'DOBLE', tipoPasajero: 'ADT', neto: 2_150_000, venta: 2_690_000 },
            { acomodacion: 'TRIPLE', tipoPasajero: 'ADT', neto: 1_980_000, venta: 2_480_000 },
            { acomodacion: 'CUADRUPLE', tipoPasajero: 'ADT', neto: 1_850_000, venta: 2_310_000 },
            { acomodacion: 'SENCILLA', tipoPasajero: 'ADT', neto: 3_100_000, venta: 3_870_000 },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'CHD',
              neto: 1_490_000,
              venta: 1_860_000,
              edadMinima: 2,
              edadMaxima: 11,
            },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'INF',
              neto: 220_000,
              venta: 270_000,
              edadMinima: 0,
              edadMaxima: 1,
            },
          ],
        },
        {
          // En Colombia los puentes festivos son su propia temporada y cuestan como la alta.
          // Cae DENTRO de la alta: gana por ser la vigencia más corta (`resolverVigencia`).
          nombre: 'Puente de Reyes',
          desde: '2028-01-06',
          hasta: '2028-01-09',
          tarifas: [
            { acomodacion: 'DOBLE', tipoPasajero: 'ADT', neto: 1_890_000, venta: 2_360_000 },
            { acomodacion: 'TRIPLE', tipoPasajero: 'ADT', neto: 1_740_000, venta: 2_170_000 },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'CHD',
              neto: 1_310_000,
              venta: 1_640_000,
              edadMinima: 2,
              edadMaxima: 11,
            },
          ],
        },
      ],
    },
    {
      nombre: 'Cartagena — 4 días / 3 noches con desayuno',
      destino: 'Cartagena',
      paisIso: 'CO',
      dias: 4,
      noches: 3,
      planAlimentacion: 'DESAYUNO' as const,
      mayoristaId: mayoristasCreados[1]!.id,
      inclusiones: [
        'Tiquetes aéreos ida y regreso',
        'Traslados aeropuerto — hotel — aeropuerto',
        'Alojamiento 3 noches con desayuno',
        'City tour por la ciudad amurallada',
        'Seguro de asistencia médica',
      ],
      exclusiones: ['Almuerzos y cenas', 'Tour a Islas del Rosario', 'Propinas'],
      vigencias: [
        {
          nombre: 'Temporada baja',
          desde: '2027-02-01',
          hasta: '2027-06-15',
          tarifas: [
            { acomodacion: 'DOBLE', tipoPasajero: 'ADT', neto: 980_000, venta: 1_250_000 },
            { acomodacion: 'TRIPLE', tipoPasajero: 'ADT', neto: 880_000, venta: 1_120_000 },
            { acomodacion: 'CUADRUPLE', tipoPasajero: 'ADT', neto: 820_000, venta: 1_040_000 },
            { acomodacion: 'SENCILLA', tipoPasajero: 'ADT', neto: 1_480_000, venta: 1_890_000 },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'CHD',
              neto: 690_000,
              venta: 880_000,
              edadMinima: 2,
              edadMaxima: 11,
            },
          ],
        },
      ],
    },
    {
      nombre: 'Punta Cana — 6 días / 5 noches, todo incluido',
      destino: 'Punta Cana',
      paisIso: 'DO',
      dias: 6,
      noches: 5,
      planAlimentacion: 'TODO_INCLUIDO' as const,
      mayoristaId: mayoristasCreados[0]!.id,
      inclusiones: [
        'Tiquetes aéreos Bogotá — Punta Cana — Bogotá',
        'Traslados de llegada y salida',
        'Alojamiento 5 noches todo incluido',
        'Impuestos aéreos',
        'Seguro de asistencia médica internacional',
      ],
      exclusiones: ['Tarjeta de turista dominicana', 'Excursiones', 'Gastos personales'],
      vigencias: [
        {
          nombre: 'Temporada media',
          desde: '2027-05-01',
          hasta: '2027-11-30',
          tarifas: [
            { acomodacion: 'DOBLE', tipoPasajero: 'ADT', neto: 4_280_000, venta: 5_350_000 },
            { acomodacion: 'TRIPLE', tipoPasajero: 'ADT', neto: 3_990_000, venta: 4_990_000 },
            { acomodacion: 'SENCILLA', tipoPasajero: 'ADT', neto: 6_150_000, venta: 7_690_000 },
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'CHD',
              neto: 2_890_000,
              venta: 3_610_000,
              edadMinima: 2,
              edadMaxima: 12,
            },
            // Infante gratis compartiendo habitación: condición comercial real,
            // y el modelo tiene que poder expresarla sin trucos.
            {
              acomodacion: 'DOBLE',
              tipoPasajero: 'INF',
              neto: 0,
              venta: 0,
              edadMinima: 0,
              edadMaxima: 1,
            },
          ],
        },
      ],
    },
  ];

  const ETIQUETA_TIPO = { ADT: 'Adulto', CHD: 'Niño', INF: 'Infante' } as const;
  const nombreDeTarifa = (t: {
    acomodacion: string;
    tipoPasajero: string;
    edadMinima?: number;
    edadMaxima?: number;
  }): string => {
    const tipo = ETIQUETA_TIPO[t.tipoPasajero as keyof typeof ETIQUETA_TIPO];
    const edad =
      t.edadMinima !== undefined && t.edadMaxima !== undefined
        ? ` de ${t.edadMinima} a ${t.edadMaxima} años`
        : '';
    return `${tipo}${edad} en ${t.acomodacion.toLowerCase()}`;
  };

  // Idempotente por vigencia, no por paquete: una base sembrada antes de T-180 ya tiene los
  // paquetes (con temporadas) y sin esto se quedaría sin vigencias para siempre.
  for (const p of paquetes) {
    const { vigencias, ...datosPaquete } = p;
    const paquete =
      (await prisma.paquete.findFirst({ where: { tenantId: tenant.id, nombre: p.nombre } })) ??
      (await prisma.paquete.create({ data: { tenantId: tenant.id, ...datosPaquete } }));

    let tarifasCreadas = 0;
    for (const v of vigencias) {
      const vigencia = await prisma.vigencia.upsert({
        where: {
          tenantId_paqueteId_desde_hasta: {
            tenantId: tenant.id,
            paqueteId: paquete.id,
            desde: new Date(v.desde),
            hasta: new Date(v.hasta),
          },
        },
        update: {},
        // Un rango, no una salida: `publicada` solo vale para un día (CHECK).
        create: {
          tenantId: tenant.id,
          paqueteId: paquete.id,
          desde: new Date(v.desde),
          hasta: new Date(v.hasta),
          publicada: false,
        },
      });
      if ((await prisma.tarifa.count({ where: { vigenciaId: vigencia.id } })) > 0) continue;

      const { count } = await prisma.tarifa.createMany({
        data: v.tarifas.map((t) => ({
          tenantId: tenant.id,
          vigenciaId: vigencia.id,
          nombre: nombreDeTarifa(t),
          unidad: 'POR_PERSONA' as const,
          cubrePasajeros: 1,
          netoUnidades: cop(t.neto),
          ventaUnidades: cop(t.venta),
          monedaIso: 'COP',
          mayoristaId: p.mayoristaId,
          acomodacion: t.acomodacion as never,
          tipoPasajero: t.tipoPasajero as never,
          edadMinima: t.edadMinima ?? null,
          edadMaxima: t.edadMaxima ?? null,
        })),
      });
      tarifasCreadas += count;
    }
    console.log(
      `  ${p.nombre}: ${vigencias.length} vigencias (${vigencias.map((v) => v.nombre).join(', ')}), ` +
        `${tarifasCreadas} tarifas nuevas`,
    );
  }

  // --- Catálogo real de Agencias André's Tours ----------------------------
  // Sustituye a las salidas inventadas. 34 productos, 8 grupos, con las dos formas de publicar
  // que la hoja real demuestra: fechas concretas y super excursiones con fecha propia.
  const catalogoReal = await sembrarCatalogoReal(prisma, tenant.id);
  console.log(
    `  catálogo real: ${catalogoReal.paquetes} paquetes, ${catalogoReal.vigencias} vigencias, ` +
      `${catalogoReal.tarifas} tarifas`,
  );

  // --- Contactos ----------------------------------------------------------
  // Los tres primeros son los de siempre (los hilos con texto de `apps/api/src/demo` cuelgan de
  // ellos). Los cuatro siguientes entran con T-614: sin varios hilos no se puede enseñar
  // «organizar los chats», que es lo que pidió el cliente del piloto. Inventados, como el resto.
  const contactos = [
    { telefonoE164: '+573001234567', nombre: 'Laura Giraldo', correo: 'laura@ejemplo.test' },
    { telefonoE164: '+573109876543', nombre: 'Familia Ramírez', correo: null },
    { telefonoE164: '+573155551234', nombre: 'Diego Morales', correo: 'diego@ejemplo.test' },
    { telefonoE164: '+573124445566', nombre: 'Carolina Betancur', correo: 'carolina@ejemplo.test' },
    { telefonoE164: '+573017778899', nombre: 'Colegio San José (grupo)', correo: null },
    { telefonoE164: '+573145556677', nombre: 'Marcela Ospina', correo: null },
    { telefonoE164: '+573186669900', nombre: 'Hernán Castaño', correo: 'hernan@ejemplo.test' },
  ];
  for (const c of contactos) {
    const contacto = await prisma.contacto.upsert({
      where: { tenantId_telefonoE164: { tenantId: tenant.id, telefonoE164: c.telefonoE164 } },
      update: {},
      create: {
        tenantId: tenant.id,
        ...c,
        etiquetas: ['WhatsApp'],
        camposPersonalizados: { como_nos_conocio: 'Instagram' },
      },
    });

    // La prueba del consentimiento, no una casilla: quién, cuándo, por qué canal y para
    // qué finalidad. Ley 1581 de 2012. TRANSACCIONAL y no PROMOCIONAL: haber escrito por
    // WhatsApp autoriza una respuesta, nunca una campaña.
    await prisma.consentimientoContacto.createMany({
      data: [
        {
          tenantId: tenant.id,
          contactoId: contacto.id,
          finalidad: 'TRANSACCIONAL',
          prueba: 'semilla:conversacion-entrante-de-whatsapp',
          canal: 'WHATSAPP',
        },
      ],
      skipDuplicates: true,
    });
  }

  // --- Oportunidades: para que el tablero de pipeline tenga qué pintar ----
  const etapaLead = await prisma.etapaPipeline.findFirst({
    where: { tenantId: tenant.id, clave: 'NUEVO_LEAD' },
  });
  const etapaCotizacion = await prisma.etapaPipeline.findFirst({
    where: { tenantId: tenant.id, clave: 'EN_COTIZACION' },
  });
  const laura = await prisma.contacto.findFirst({
    where: { tenantId: tenant.id, telefonoE164: '+573001234567' },
  });
  const familia = await prisma.contacto.findFirst({
    where: { tenantId: tenant.id, telefonoE164: '+573109876543' },
  });

  if (etapaLead && etapaCotizacion && laura && familia) {
    await prisma.oportunidad.createMany({
      data: [
        {
          id: '01932000-0000-7000-8000-0000000000f1',
          tenantId: tenant.id,
          contactoId: laura.id,
          etapaId: etapaLead.id,
          titulo: 'Luna de miel en San Andrés',
          destino: 'San Andrés',
          fechaViajeDesde: new Date('2026-12-20'),
          adultos: 2,
          valorEstimadoUnidades: cop(5_400_000),
          monedaIso: 'COP',
          probabilidad: 15,
          proximaTareaDescripcion: 'Enviar opciones de hotel todo incluido',
          proximaTareaVenceEn: new Date('2026-10-13T14:00:00.000Z'),
          proximaTareaCompletada: false,
        },
        {
          id: '01932000-0000-7000-8000-0000000000f2',
          tenantId: tenant.id,
          contactoId: familia.id,
          etapaId: etapaCotizacion.id,
          titulo: 'Familia Ramírez — Cartagena diciembre',
          destino: 'Cartagena',
          fechaViajeDesde: new Date('2026-12-24'),
          adultos: 2,
          ninos: 2,
          valorEstimadoUnidades: cop(9_100_000),
          monedaIso: 'COP',
          probabilidad: 45,
        },
      ],
      skipDuplicates: true,
    });
  }

  // --- Canal de WhatsApp (ADR-0008) ---------------------------------------
  //
  // Se siembran la CUENTA y el CANAL, que son la verdad y viven bajo RLS. **No se siembra
  // el directorio global**, y no es un olvido: su clave es un HMAC calculado con una
  // pimienta que vive en el almacén de secretos de la aplicación y que NUNCA entra en la
  // base. Sembrarlo desde aquí exigiría meter ese secreto en el repositorio o inventarse
  // uno, y entonces la semilla de desarrollo enseñaría a saltarse la regla. El directorio
  // es derivado: lo escribe el camino de alta y lo reconstruye el trabajo de plataforma
  // recorriendo estas dos tablas.
  //
  // Sin token y en SUSPENDIDO, a propósito: el canje de Embedded Signup no ha ocurrido y
  // un canal demo en ACTIVO invitaría a creer que hay una conexión real con Meta.
  const cuenta = await prisma.cuentaWhatsapp.upsert({
    where: { tenantId_wabaId: { tenantId: tenant.id, wabaId: '000000000000001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      wabaId: '000000000000001',
      nombre: 'WABA de demostración (sin conexión real)',
      estado: 'SUSPENDIDO',
    },
  });

  const canal = await prisma.canal.upsert({
    where: { tenantId_phoneNumberId: { tenantId: tenant.id, phoneNumberId: '100000000000001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      cuentaId: cuenta.id,
      phoneNumberId: '100000000000001',
      numeroE164: '+573001234000',
      nombreVisible: 'Agencia Demo',
      estado: 'SUSPENDIDO',
    },
  });

  // --- Bandeja de demostracion ---------------------------------------------
  //
  // Siete hilos con historia, no una fila vacía: el porqué de cada uno —y de que vayan sin
  // texto— está en `HILOS_DE_LA_DEMO`, arriba.
  //
  // Ya NO se escribe la columna legada `conversaciones.etiquetas` (T-614): la migración
  // 20261121110000 la copió a `etiquetas` + `conversacion_etiquetas`, la bandeja lee solo la
  // tabla (`apps/api/.../inbox/infrastructure/mapeo.ts`) y seguir llenando el arreglo libre era
  // sembrar un dato que nadie lee. La columna se retira en una migración posterior.
  const ahora = Date.now();
  const haceHoras = (h: number) => new Date(ahora - h * 60 * 60 * 1000);

  const contactosDeLaBandeja = await prisma.contacto.findMany({
    where: { tenantId: tenant.id, telefonoE164: { in: HILOS_DE_LA_DEMO.map((h) => h.telefono) } },
    select: { id: true, telefonoE164: true },
  });
  const contactoPorTelefono = new Map(contactosDeLaBandeja.map((c) => [c.telefonoE164, c.id]));

  // El catálogo que se acaba de sembrar, por nombre: las asignaciones van por id. La clave es
  // `lower(btrim(nombre))`, la misma de la unicidad de la base: si la agencia demo renombró
  // «Pagado» a «pagado», la siembra no crea otra y aquí se encuentra igual.
  const catalogoDeEtiquetas = await prisma.label.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nombre: true },
  });
  const claveDeEtiqueta = (nombre: string) => nombre.trim().toLowerCase();
  const etiquetaPorNombre = new Map(
    catalogoDeEtiquetas.map((e) => [claveDeEtiqueta(e.nombre), e.id]),
  );

  // Quién las puso en la demo. La foránea hacia `usuarios` es compuesta con el tenant.
  const duenoDeLaDemo = await prisma.usuario.findUnique({
    where: { tenantId_correo: { tenantId: tenant.id, correo: 'dueno@agenciademo.test' } },
    select: { id: true },
  });

  let asignacionesDeEtiquetas = 0;
  for (const hilo of HILOS_DE_LA_DEMO) {
    const contactoId = contactoPorTelefono.get(hilo.telefono);
    if (!contactoId) throw new Error(`Falta el contacto ${hilo.telefono} de la bandeja demo.`);
    const { ultimo, ultimoDelCliente, sinLeer } = resumenDelHilo(hilo);

    const conversacion = await prisma.conversacion.upsert({
      where: {
        tenantId_canalId_contactoId: { tenantId: tenant.id, canalId: canal.id, contactoId },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        canalId: canal.id,
        contactoId,
        estado: 'ABIERTA',
        ultimoMensajeClienteEn: haceHoras(ultimoDelCliente.haceHoras),
        ultimoMensajeEn: haceHoras(ultimo.haceHoras),
        ultimoMensajeDireccion: ultimo.direccion,
        mensajesSinLeer: sinLeer,
        slaVenceEn: hilo.slaVenceHaceHoras === null ? null : haceHoras(hilo.slaVenceHaceHoras),
        primeraRespuestaEn:
          hilo.primeraRespuestaHaceHoras === null
            ? null
            : haceHoras(hilo.primeraRespuestaHaceHoras),
      },
    });

    // `skipDuplicates` se apoya en el indice unico de (tenant_id, wamid): volver a sembrar
    // no duplica el hilo, que es la misma propiedad que protege de los reintentos de Meta.
    await prisma.mensaje.createMany({
      skipDuplicates: true,
      data: hilo.mensajes.map((m) => ({
        tenantId: tenant.id,
        conversacionId: conversacion.id,
        direccion: m.direccion,
        tipo: 'TEXTO' as const,
        estado: m.estado,
        wamid: m.wamid,
        claveIdempotencia: m.claveIdempotencia,
        ocurridoEn: haceHoras(m.haceHoras),
      })),
    });

    // Las etiquetas PUESTAS en el hilo (T-614): sin esto el catálogo se ve lleno y cualquier
    // filtro devuelve vacío, que es justo lo que hacía parecer que la función no existía.
    // `tenant_id` va en la clave primaria y en las dos foráneas compuestas (R1): una asignación
    // no cruza agencias. Repetirla no duplica (ON CONFLICT DO NOTHING sobre la terna).
    const puestas = await prisma.conversationLabel.createMany({
      skipDuplicates: true,
      data: hilo.etiquetas.map((nombre) => {
        const etiquetaId = etiquetaPorNombre.get(claveDeEtiqueta(nombre));
        if (!etiquetaId) throw new Error(`Falta la etiqueta sembrada «${nombre}».`);
        return {
          tenantId: tenant.id,
          conversacionId: conversacion.id,
          etiquetaId,
          asignadaEn: haceHoras(ultimo.haceHoras),
          asignadaPorId: duenoDeLaDemo?.id ?? null,
        };
      }),
    });
    asignacionesDeEtiquetas += puestas.count;
  }

  // El espejo de Meta. APROBADA y PAUSADA a la vez, a proposito: la bandeja tiene que
  // mostrar la pausada deshabilitada CON SU MOTIVO, y sin un ejemplo nadie lo construye.
  await prisma.plantillaWhatsapp.createMany({
    skipDuplicates: true,
    data: [
      {
        tenantId: tenant.id,
        cuentaId: cuenta.id,
        nombre: 'recordatorio_anticipo',
        idioma: 'es_CO',
        categoria: 'UTILIDAD',
        estado: 'APROBADA',
        cuerpo: 'Hola {{1}}, le recordamos que el anticipo de su viaje vence el {{2}}.',
        variables: [
          { indice: 1, descripcion: 'Nombre del viajero', ejemplo: 'Laura' },
          { indice: 2, descripcion: 'Fecha limite', ejemplo: '15 de noviembre' },
        ],
        botones: [{ tipo: 'RESPUESTA_RAPIDA', texto: 'Ya pague', valor: null }],
        actualizadaEnMeta: haceHoras(72),
      },
      {
        tenantId: tenant.id,
        cuentaId: cuenta.id,
        nombre: 'promo_fin_de_ano',
        idioma: 'es_CO',
        categoria: 'MARKETING',
        estado: 'PAUSADA',
        motivoEstado: 'Meta la pauso: varios destinatarios la marcaron como spam.',
        cuerpo: 'Hola {{1}}, tenemos planes de fin de ano desde {{2}}.',
        variables: [
          { indice: 1, descripcion: 'Nombre del viajero', ejemplo: 'Laura' },
          { indice: 2, descripcion: 'Precio desde', ejemplo: '$1.900.000' },
        ],
        actualizadaEnMeta: haceHoras(48),
        estadoCambiadoEn: haceHoras(12),
      },
    ],
  });

  const resumen = {
    paquetes: await prisma.paquete.count({ where: { tenantId: tenant.id } }),
    vigencias: await prisma.vigencia.count({ where: { tenantId: tenant.id } }),
    tarifas: await prisma.tarifa.count({ where: { tenantId: tenant.id } }),
    contactos: await prisma.contacto.count({ where: { tenantId: tenant.id } }),
    etapas: await prisma.etapaPipeline.count({ where: { tenantId: tenant.id } }),
    canales: await prisma.canal.count({ where: { tenantId: tenant.id } }),
    conversaciones: await prisma.conversacion.count({ where: { tenantId: tenant.id } }),
    mensajes: await prisma.mensaje.count({ where: { tenantId: tenant.id } }),
    plantillas: await prisma.plantillaWhatsapp.count({ where: { tenantId: tenant.id } }),
    etiquetas: await prisma.label.count({ where: { tenantId: tenant.id } }),
    asignaciones: await prisma.conversationLabel.count({ where: { tenantId: tenant.id } }),
  };

  console.log('\nAgencia demo lista:');
  for (const [k, v] of Object.entries(resumen)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`  (${asignacionesDeEtiquetas} asignaciones de etiqueta nuevas en esta corrida)`);
  console.log(`\n  tenantId: ${tenant.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
