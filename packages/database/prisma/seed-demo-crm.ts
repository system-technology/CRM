/**
 * Datos de demostración del CRM, construidos sobre el catálogo REAL.
 *
 * **Por qué existen y por qué no están inventados.** Hasta ahora las pantallas se llenaban con
 * paquetes que me saqué de la cabeza. El 2026-10-10 llegó el tarifario de **Agencias André's
 * Tours** —47 productos, 34 destinos, de 189.000 a 1.689.000 COP— y a partir de ahí no hay
 * excusa: un pipeline poblado con «Paquete Demo 1» no enseña nada, y uno poblado con «Pasadía
 * Piangüita + Ballenas, 329.000» le dice a un asesor de verdad si la pantalla le sirve.
 * Ver `docs/01-producto/10-catalogo-real-de-referencia.json`.
 *
 * **Las etapas se leen de la base, no se escriben aquí.** La agencia demo tiene siete y el
 * vocabulario común solo nombra cinco: si esta semilla asumiera las cinco, dos columnas del
 * tablero quedarían vacías para siempre y nadie sabría por qué. R12.
 *
 * **Idempotente.** Se puede correr dos veces sin duplicar nada: los contactos se buscan por
 * teléfono —que es su llave natural por agencia— y las oportunidades por título.
 *
 *   pnpm --filter @viajapro/database seed:crm
 */

import { PrismaClient, type Consentimiento } from '@prisma/client';

const prisma = new PrismaClient();

/** Productos del tarifario real, con su precio al público en pesos. */
const CATALOGO = [
  { titulo: 'Pasadía Parque del Café', destino: 'Quindío', valor: 275_000 },
  { titulo: 'Pasadía Piangüita + Ballenas', destino: 'Buenaventura', valor: 329_000 },
  { titulo: 'Pasadía Magüipí + Ballenas', destino: 'Buenaventura', valor: 399_000 },
  { titulo: 'Pasadía Nevado del Ruiz', destino: 'Los Nevados', valor: 365_000 },
  { titulo: 'Pasadía Termales de San Vicente', destino: 'Risaralda', valor: 299_000 },
  { titulo: 'Pasadía Panaca', destino: 'Quindío', valor: 239_000 },
  { titulo: 'Pasadía Lago Calima', destino: 'Valle del Cauca', valor: 189_000 },
  { titulo: 'Pasanoche Entre Palmas y Café', destino: 'Quindío', valor: 499_000 },
  { titulo: 'Pasanoche Magüipí + Ballenas', destino: 'Buenaventura', valor: 869_000 },
  { titulo: 'Mini-excursión Medellín y Guatapé', destino: 'Antioquia', valor: 489_000 },
  { titulo: 'Excursión Hacienda Nápoles', destino: 'Antioquia', valor: 829_000 },
  { titulo: 'Excursión Tour Capital', destino: 'Bogotá', valor: 819_000 },
  { titulo: 'Super excursión Costa Atlántica', destino: 'Costa Atlántica', valor: 1_689_000 },
  { titulo: 'Super excursión Valledupar y Guajira', destino: 'La Guajira', valor: 1_650_000 },
  { titulo: 'Super excursión Coveñas y Morrosquillo', destino: 'Sucre', valor: 1_299_000 },
];

/**
 * Los contactos.
 *
 * Nombres y teléfonos verosímiles de Colombia, **todos con prefijo 3 y rango +57300…**, que es
 * la pinta de un móvil colombiano. Las preferencias llevan lo que una agencia de verdad apunta
 * —asiento, alergia, aerolínea— porque es el campo que R10 marca como sensible y conviene que
 * esté ejercitado desde el primer día.
 */
const CONTACTOS = [
  {
    nombre: 'Carolina Ramírez',
    telefono: '+573001112233',
    correo: 'carolina.ramirez@ejemplo.test',
    etiquetas: ['VIP', 'Luna de miel'],
    preferencias: 'Prefiere hotel frente al mar. Asiento de pasillo. Alérgica a los mariscos.',
    promocional: true,
  },
  {
    nombre: 'Juan Esteban Pérez',
    telefono: '+573002223344',
    correo: 'juan.perez@ejemplo.test',
    etiquetas: ['Familia'],
    preferencias: 'Viaja con dos niños (6 y 9). Necesita silla infantil en el bus.',
    promocional: true,
  },
  {
    nombre: 'Luz Marina Ospina',
    telefono: '+573003334455',
    correo: null,
    etiquetas: ['Grupo', 'Corporativo'],
    preferencias:
      'Compra para el comité de bienestar de su empresa. Factura a nombre de la compañía.',
    promocional: false,
  },
  {
    nombre: 'Andrés Felipe Cardona',
    telefono: '+573004445566',
    correo: 'afcardona@ejemplo.test',
    etiquetas: ['Recompra'],
    preferencias: 'Viajó a San Andrés en 2025. Pregunta siempre por salidas de puente festivo.',
    promocional: true,
  },
  {
    nombre: 'Diana Carolina Mejía',
    telefono: '+573005556677',
    correo: 'diana.mejia@ejemplo.test',
    etiquetas: ['VIP'],
    preferencias: 'Prefiere pagar con tarjeta a cuotas. Pide siempre factura electrónica.',
    promocional: false,
  },
  {
    nombre: 'Sebastián Quintero',
    telefono: '+573006667788',
    correo: null,
    etiquetas: ['Aventura'],
    preferencias:
      'Le interesan los planes de senderismo y el Nevado. No le gustan los buses largos.',
    promocional: true,
  },
  {
    nombre: 'Martha Lucía Arango',
    telefono: '+573007778899',
    correo: 'mlarango@ejemplo.test',
    etiquetas: ['Tercera edad'],
    preferencias: 'Camina con bastón: necesita asiento delantero y paradas frecuentes.',
    promocional: false,
  },
  {
    nombre: 'Nicolás Betancur',
    telefono: '+573008889900',
    correo: 'nbetancur@ejemplo.test',
    etiquetas: ['Primera vez'],
    preferencias: 'Primer viaje con nosotros. Llegó por Instagram.',
    promocional: true,
  },
  {
    nombre: 'Paola Andrea Zuluaga',
    telefono: '+573009990011',
    correo: null,
    etiquetas: ['Familia', 'Recompra'],
    preferencias: 'Grupo familiar de seis. Siempre pregunta por descuento de menores.',
    promocional: true,
  },
  {
    nombre: 'Jorge Iván Castaño',
    telefono: '+573010001122',
    correo: 'jicastano@ejemplo.test',
    etiquetas: ['Corporativo'],
    preferencias: 'Coordina salidas de integración. Decide por comité: responde lento.',
    promocional: false,
  },
];

/** Reparto de oportunidades por etapa. El índice apunta al orden de la etapa en la base. */
const REPARTO: { ordenEtapa: number; contacto: number; producto: number; dias: number }[] = [
  { ordenEtapa: 1, contacto: 7, producto: 0, dias: 0 },
  { ordenEtapa: 1, contacto: 5, producto: 3, dias: 1 },
  { ordenEtapa: 1, contacto: 9, producto: 11, dias: 2 },
  { ordenEtapa: 2, contacto: 0, producto: 12, dias: 3 },
  { ordenEtapa: 2, contacto: 1, producto: 1, dias: 4 },
  { ordenEtapa: 2, contacto: 8, producto: 5, dias: 2 },
  { ordenEtapa: 2, contacto: 3, producto: 9, dias: 6 },
  { ordenEtapa: 3, contacto: 2, producto: 13, dias: 8 },
  { ordenEtapa: 3, contacto: 4, producto: 10, dias: 5 },
  { ordenEtapa: 4, contacto: 3, producto: 2, dias: 12 },
  { ordenEtapa: 4, contacto: 6, producto: 6, dias: 20 },
  { ordenEtapa: 5, contacto: 9, producto: 14, dias: 15 },
  { ordenEtapa: 5, contacto: 5, producto: 8, dias: 25 },
];

/** Motivos de pérdida, para que el informe de pérdidas tenga de qué hablar. */
const MOTIVOS = ['PRECIO', 'COMPRO_EN_OTRA_AGENCIA'] as const;

/** Tareas pendientes verosímiles, de las que un asesor apunta de verdad. */
const TAREAS = [
  'Enviar propuesta en PDF por WhatsApp',
  'Confirmar disponibilidad con el mayorista',
  'Llamar para cerrar: vence el time limit',
  'Pedir documentos de los menores',
  'Recordar el anticipo del 30 %',
];

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { creadoEn: 'asc' } });
  if (!tenant) throw new Error('No hay ninguna agencia. Corre antes `pnpm db:seed`.');

  // Las etapas se LEEN. Si esta agencia tiene siete, se usan las siete.
  const etapas = await prisma.etapaPipeline.findMany({
    where: { tenantId: tenant.id },
    orderBy: { orden: 'asc' },
  });
  if (etapas.length === 0) throw new Error('La agencia no tiene etapas de pipeline sembradas.');

  const porOrden = new Map(etapas.map((e) => [e.orden, e]));
  const ultimaEtapa = etapas[etapas.length - 1];

  // --- Contactos ----------------------------------------------------------
  const contactos = [];
  for (const c of CONTACTOS) {
    const contacto = await prisma.contacto.upsert({
      where: { tenantId_telefonoE164: { tenantId: tenant.id, telefonoE164: c.telefono } },
      update: { nombre: c.nombre, etiquetas: c.etiquetas },
      create: {
        tenantId: tenant.id,
        telefonoE164: c.telefono,
        nombre: c.nombre,
        correo: c.correo,
        etiquetas: c.etiquetas,
        // ADR-0015: `preferencias` va cifrada y la cifra la API; esta semilla no puede
        // importar la primitiva. `c.preferencias` queda como dato para cuando `backend`
        // siembre por ese camino (`campos:sembrar-dev` en `apps/api`).
        ultimoContactoEn: new Date(Date.now() - Math.floor(Math.random() * 72) * 3_600_000),
      },
    });
    contactos.push(contacto);

    // El consentimiento transaccional lo da cualquiera que escribe; el promocional, no.
    // La Ley 1581 pide poder DEMOSTRARLO, así que cada uno lleva su canal y su fecha.
    const finalidades: Consentimiento[] = ['TRANSACCIONAL'];
    if (c.promocional) finalidades.push('PROMOCIONAL');
    for (const finalidad of finalidades) {
      const ya = await prisma.consentimientoContacto.findFirst({
        where: { tenantId: tenant.id, contactoId: contacto.id, finalidad },
      });
      if (!ya) {
        await prisma.consentimientoContacto.create({
          data: {
            tenantId: tenant.id,
            contactoId: contacto.id,
            finalidad,
            canal: 'WHATSAPP',
            // La prueba es de dónde salió el consentimiento, no una casilla marcada. Aquí va
            // el identificador del mensaje de WhatsApp en el que el contacto lo dio: eso es lo
            // que se le enseña a un juez, y es lo que la Ley 1581 pide poder demostrar.
            prueba: `whatsapp:wamid.demo-${contacto.id.slice(0, 8)}-${finalidad.toLowerCase()}`,
            otorgadoEn: new Date(Date.now() - 30 * 86_400_000),
          },
        });
      }
    }
  }

  // --- Oportunidades ------------------------------------------------------
  let creadas = 0;
  for (const [i, r] of REPARTO.entries()) {
    const etapa = porOrden.get(r.ordenEtapa) ?? ultimaEtapa;
    const contacto = contactos[r.contacto];
    const producto = CATALOGO[r.producto];
    if (!etapa || !contacto || !producto) continue;

    const primerNombre = (contacto.nombre ?? 'Cliente').split(' ')[0];
    const titulo = `${producto.titulo} — ${primerNombre}`;
    const ya = await prisma.oportunidad.findFirst({ where: { tenantId: tenant.id, titulo } });
    if (ya) continue;

    const esPerdida = etapa.esPerdida;
    const esCerrada = etapa.esGanada || etapa.esPerdida;
    // `noUncheckedIndexedAccess` obliga a tratar el índice como posiblemente vacío, y
    // tiene razón: un arreglo puede quedarse sin elementos al editarlo.
    const tarea = TAREAS[i % TAREAS.length] ?? 'Hacer seguimiento';
    const motivo = MOTIVOS[i % MOTIVOS.length] ?? 'OTRO';

    await prisma.oportunidad.create({
      data: {
        tenantId: tenant.id,
        contactoId: contacto.id,
        etapaId: etapa.id,
        titulo,
        destino: producto.destino,
        // El dinero en la unidad mínima de la moneda. En pesos colombianos esa unidad es el
        // peso: 275.000 son 275000 unidades, no 27.500.000. R8.
        valorEstimadoUnidades: BigInt(producto.valor),
        monedaIso: 'COP',
        probabilidad: etapa.probabilidad,
        ultimoContactoEn: new Date(Date.now() - r.dias * 86_400_000),
        cerradaEn: esCerrada ? new Date(Date.now() - r.dias * 86_400_000) : null,
        // Una oportunidad perdida SIN motivo es justo el estado que la regla impide. Sembrarlo
        // dejaría el informe de pérdidas mintiendo desde el primer día.
        motivoPerdida: esPerdida ? motivo : null,
        // Una oportunidad cerrada no lleva próxima tarea: sería una tarea que nadie va a
        // hacer, contaminando la lista de pendientes del asesor con trabajo muerto.
        proximaTareaDescripcion: esCerrada ? null : tarea,
        proximaTareaVenceEn: esCerrada
          ? null
          : new Date(Date.now() + (i % 4) * 86_400_000 - 86_400_000),
        proximaTareaCompletada: esCerrada ? null : false,
      },
    });
    creadas += 1;
  }

  // --- Notas internas -----------------------------------------------------
  // ADR-0015: `notas_internas.texto` es obligatorio y cifrado, y la cifra la API. Hasta que
  // `pnpm --filter @viajapro/api campos:sembrar-dev` (primitiva de la API), no hay notas de
  // demostración: una nota sin texto no es representable.

  const resumen = {
    etapas: etapas.length,
    contactos: await prisma.contacto.count({ where: { tenantId: tenant.id } }),
    oportunidades: await prisma.oportunidad.count({ where: { tenantId: tenant.id } }),
    'creadas ahora': creadas,
    consentimientos: await prisma.consentimientoContacto.count({ where: { tenantId: tenant.id } }),
    notas: await prisma.notaInterna.count({ where: { tenantId: tenant.id } }),
  };

  console.log("\nDatos de demostración del CRM (catálogo real de André's Tours):");
  for (const [k, v] of Object.entries(resumen)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log(`\n  tenantId: ${tenant.id}`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
