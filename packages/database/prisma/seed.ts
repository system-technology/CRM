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

const prisma = new PrismaClient();

const TENANT_DEMO = '01932000-0000-7000-8000-0000000000d0';

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
  // Tabla por agencia, no enum (R12, ADR-0011). Los tres sembrados se identifican por CLAVE:
  // la agencia puede renombrarlos, y la siembra no le pisa ni el nombre ni los permisos.
  const rolesSembrados = [
    {
      clave: 'DUENO',
      nombre: 'Dueño',
      permisos: [
        'cotizacion.ver_neto_y_margen',
        'usuarios.administrar',
        'roles.administrar',
        'conversaciones.ver_todas',
      ],
    },
    { clave: 'ASESOR', nombre: 'Asesor', permisos: [] },
    { clave: 'OPERACIONES', nombre: 'Operaciones', permisos: ['conversaciones.ver_todas'] },
  ] as const;
  const rolPorClave = new Map<string, string>();
  for (const r of rolesSembrados) {
    const rol = await prisma.rol.upsert({
      where: { tenantId_clave: { tenantId: tenant.id, clave: r.clave } },
      update: {},
      create: { tenantId: tenant.id, clave: r.clave, nombre: r.nombre, permisos: [...r.permisos] },
    });
    rolPorClave.set(r.clave, rol.id);
  }

  // --- Equipo -------------------------------------------------------------
  // La persona es una identidad GLOBAL; su pertenencia a la agencia es `usuarios`.
  // Sin credencial: la contraseña de desarrollo la pone la rebanada 2 (Better Auth), con el
  // hash que genere su biblioteca, no uno escrito aquí.
  const equipo = [
    { correo: 'dueno@agenciademo.test', nombre: 'Marcela Duarte', clave: 'DUENO' },
    { correo: 'ana@agenciademo.test', nombre: 'Ana Lucía Pérez', clave: 'ASESOR' },
    { correo: 'carlos@agenciademo.test', nombre: 'Carlos Mejía', clave: 'ASESOR' },
  ];
  for (const persona of equipo) {
    const identidad = await prisma.identidad.upsert({
      where: { correo: persona.correo },
      update: {},
      create: { correo: persona.correo, nombre: persona.nombre },
    });
    const rolId = rolPorClave.get(persona.clave);
    if (!rolId) throw new Error(`Falta el rol sembrado ${persona.clave}`);
    await prisma.usuario.upsert({
      where: { tenantId_correo: { tenantId: tenant.id, correo: persona.correo } },
      update: {},
      create: {
        tenantId: tenant.id,
        identidadId: identidad.id,
        rolId,
        correo: persona.correo,
        nombre: persona.nombre,
      },
    });
  }

  // --- Embudo -------------------------------------------------------------
  // Tabla, no enum: cada agencia define su proceso. R12 y ADR-0006.
  const etapas = [
    { nombre: 'Consulta nueva', clave: 'NUEVO_LEAD', orden: 1, probabilidad: 10 },
    { nombre: 'En cotización', clave: 'EN_COTIZACION', orden: 2, probabilidad: 35 },
    { nombre: 'En negociación', clave: 'EN_NEGOCIACION', orden: 3, probabilidad: 70 },
    { nombre: 'Ganada', clave: 'GANADA', orden: 4, probabilidad: 100, esGanada: true },
    { nombre: 'Perdida', clave: 'PERDIDA', orden: 5, probabilidad: 0, esPerdida: true },
  ];
  // **Se identifican por CLAVE, no por orden.** El orden es presentación: una agencia lo
  // reordena arrastrando columnas y eso no convierte «Ganada» en otra etapa. La clave sí es
  // identidad, y la base lo respalda con una unique parcial `(tenant_id, clave) WHERE clave IS
  // NOT NULL`.
  //
  // Identificarlas por orden rompía la siembra en cuanto la agencia tenía más etapas que las
  // cinco canónicas: con siete en la base, poner `GANADA` en el orden 4 chocaba contra la fila
  // que ya la tenía en el 6, y `pnpm db:seed` moría con P2002. Una semilla que solo funciona
  // sobre una base virgen no sirve para nada.
  const ordenesOcupados = new Set(
    (
      await prisma.etapaPipeline.findMany({
        where: { tenantId: tenant.id },
        select: { orden: true },
      })
    ).map((x) => x.orden),
  );

  for (const e of etapas) {
    const existente = await prisma.etapaPipeline.findFirst({
      where: { tenantId: tenant.id, clave: e.clave },
    });

    if (existente) {
      // NO se toca el orden: la agencia pudo reordenar su embudo, y devolverlo a nuestro
      // orden por defecto en cada siembra le desharía la configuración.
      await prisma.etapaPipeline.update({
        where: { id: existente.id },
        data: {
          nombre: e.nombre,
          probabilidad: e.probabilidad,
          esGanada: e.esGanada ?? false,
          esPerdida: e.esPerdida ?? false,
        },
      });
      continue;
    }

    // Si el orden que queríamos ya está ocupado por una etapa propia de la agencia, se va al
    // final en vez de pelearse por el sitio.
    let orden = e.orden;
    while (ordenesOcupados.has(orden)) orden += 1;
    ordenesOcupados.add(orden);

    await prisma.etapaPipeline.create({ data: { tenantId: tenant.id, ...e, orden } });
  }

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

  // --- Catálogo de paquetes ----------------------------------------------
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
      temporadas: [
        {
          nombre: 'Temporada baja',
          desde: '2027-02-01',
          hasta: '2027-06-15',
          precios: [
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
          precios: [
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
          nombre: 'Puente de Reyes',
          desde: '2028-01-06',
          hasta: '2028-01-09',
          precios: [
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
      temporadas: [
        {
          nombre: 'Temporada baja',
          desde: '2027-02-01',
          hasta: '2027-06-15',
          precios: [
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
      temporadas: [
        {
          nombre: 'Temporada media',
          desde: '2027-05-01',
          hasta: '2027-11-30',
          precios: [
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

  for (const p of paquetes) {
    const existente = await prisma.paquete.findFirst({
      where: { tenantId: tenant.id, nombre: p.nombre },
    });
    if (existente) {
      console.log(`  ya existe: ${p.nombre}`);
      continue;
    }

    const { temporadas, ...datosPaquete } = p;
    const paquete = await prisma.paquete.create({
      data: { tenantId: tenant.id, ...datosPaquete },
    });

    for (const t of temporadas) {
      const temporada = await prisma.temporada.create({
        data: {
          tenantId: tenant.id,
          paqueteId: paquete.id,
          nombre: t.nombre,
          desde: new Date(t.desde),
          hasta: new Date(t.hasta),
        },
      });
      await prisma.precio.createMany({
        data: t.precios.map((pr) => ({
          tenantId: tenant.id,
          temporadaId: temporada.id,
          acomodacion: pr.acomodacion as never,
          tipoPasajero: pr.tipoPasajero as never,
          netoUnidades: cop(pr.neto),
          ventaUnidades: cop(pr.venta),
          monedaIso: 'COP',
          edadMinima: pr.edadMinima ?? null,
          edadMaxima: pr.edadMaxima ?? null,
        })),
      });
    }
    console.log(`  creado: ${p.nombre}  (${temporadas.length} temporadas)`);
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
  const contactos = [
    { telefonoE164: '+573001234567', nombre: 'Laura Giraldo', correo: 'laura@ejemplo.test' },
    { telefonoE164: '+573109876543', nombre: 'Familia Ramírez', correo: null },
    { telefonoE164: '+573155551234', nombre: 'Diego Morales', correo: 'diego@ejemplo.test' },
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
  // Un hilo con historia, no una fila vacia: la bandeja no se puede evaluar sin ver
  // como se ve un mensaje entrante, uno saliente y una ventana de servicio a punto de
  // cerrarse. Los instantes son RELATIVOS a la siembra, a proposito: una semilla con
  // fechas fijas muestra una bandeja de hace meses el dia que alguien la corra.
  const contactoDemo = await prisma.contacto.findFirstOrThrow({
    where: { tenantId: tenant.id, telefonoE164: '+573001234567' },
  });

  const ahora = Date.now();
  const haceHoras = (h: number) => new Date(ahora - h * 60 * 60 * 1000);

  const conversacion = await prisma.conversacion.upsert({
    where: {
      tenantId_canalId_contactoId: {
        tenantId: tenant.id,
        canalId: canal.id,
        contactoId: contactoDemo.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      canalId: canal.id,
      contactoId: contactoDemo.id,
      estado: 'ABIERTA',
      // Hace 20 horas: quedan 4 de ventana. Es el estado interesante de la interfaz,
      // el que obliga a decidir entre responder ya o gastar una plantilla.
      ultimoMensajeClienteEn: haceHoras(20),
      // ADR-0015: la vista previa va cifrada y la cifra la API (`apps/api/src/shared/cifrado/`),
      // que esta semilla no puede importar. La siembra: `pnpm --filter @viajapro/api campos:sembrar-dev`.
      ultimoMensajeEn: haceHoras(20),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 1,
      slaVenceEn: haceHoras(19),
      etiquetas: ['San Andres'],
    },
  });

  // ADR-0015: `mensajes.texto` ya no existe en claro. El hilo de demostración se siembra
  // sin texto; lo completa `pnpm --filter @viajapro/api campos:sembrar-dev`.
  //
  // `skipDuplicates` se apoya en el indice unico de (tenant_id, wamid): volver a sembrar
  // no duplica el hilo, que es la misma propiedad que protege de los reintentos de Meta.
  await prisma.mensaje.createMany({
    skipDuplicates: true,
    data: [
      {
        tenantId: tenant.id,
        conversacionId: conversacion.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        estado: 'ENTREGADO',
        wamid: 'wamid.DEMO.0001',
        ocurridoEn: haceHoras(22),
      },
      {
        tenantId: tenant.id,
        conversacionId: conversacion.id,
        direccion: 'SALIENTE',
        tipo: 'TEXTO',
        estado: 'LEIDO',
        wamid: 'wamid.DEMO.0002',
        claveIdempotencia: '01932000-0000-7000-8000-00000000e001',
        ocurridoEn: haceHoras(21),
      },
      {
        tenantId: tenant.id,
        conversacionId: conversacion.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        estado: 'ENTREGADO',
        wamid: 'wamid.DEMO.0003',
        ocurridoEn: haceHoras(20),
      },
    ],
  });

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
    temporadas: await prisma.temporada.count({ where: { tenantId: tenant.id } }),
    precios: await prisma.precio.count({ where: { tenantId: tenant.id } }),
    vigencias: await prisma.vigencia.count({ where: { tenantId: tenant.id } }),
    tarifas: await prisma.tarifa.count({ where: { tenantId: tenant.id } }),
    contactos: await prisma.contacto.count({ where: { tenantId: tenant.id } }),
    etapas: await prisma.etapaPipeline.count({ where: { tenantId: tenant.id } }),
    canales: await prisma.canal.count({ where: { tenantId: tenant.id } }),
    conversaciones: await prisma.conversacion.count({ where: { tenantId: tenant.id } }),
    mensajes: await prisma.mensaje.count({ where: { tenantId: tenant.id } }),
    plantillas: await prisma.plantillaWhatsapp.count({ where: { tenantId: tenant.id } }),
  };

  console.log('\nAgencia demo lista:');
  for (const [k, v] of Object.entries(resumen)) console.log(`  ${k.padEnd(12)} ${v}`);
  console.log(`\n  tenantId: ${tenant.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
