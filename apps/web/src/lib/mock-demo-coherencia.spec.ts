import { describe, expect, it } from 'vitest';
import { EstadoCanalWhatsapp, ResumenDeReportes } from '@viajapro/contracts';
import { crearResumenDeReportesDemo } from './mock-reportes-resumen';
import { crearVistaDeCobrosDemo } from './dashboard-admin-api';
import { obtenerResumenTrabajoDelDia } from './crm-api';
import { obtenerMockCotizaciones } from './mock-cotizaciones';
import { crearEstadoCanalWhatsappDemo } from './mock-canal-whatsapp';
import { obtenerMockFichaDeContacto } from './mock-crm';
import { obtenerMockPaginaContactos } from './mock-contactos';
import {
  MOCK_CONVERSACIONES,
  obtenerConversacionDetalleMock,
  obtenerContadoresMock,
} from './mock-inbox';
import { MOCK_COTIZACIONES_INICIALES } from './mock-cotizaciones';
import { crearAvisosDemo } from './avisos-plazo-api';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';
import { MOCK_CONFIGURACION_AGENCIA } from './mock-configuracion';
import { MOCK_SESION_UNICA_AGENCIA } from './auth-api';
import { formatearDinero } from './formato';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { nombreCortoDeDestino } from './viaje-solicitado-logica';

describe('Datos de demostración coherentes entre pantallas', () => {
  it('R8: COP en pesos. Una oportunidad de pocos pasajeros no pasa de cientos de millones', () => {
    for (const c of obtenerMockPaginaContactos().datos) {
      const ficha = obtenerMockFichaDeContacto(c.id);
      const valor = Number(ficha.oportunidadActual?.valorEstimado?.unidades ?? 0);
      expect(valor).toBeGreaterThan(0);
      expect(valor).toBeLessThan(100_000_000);
      for (const cot of ficha.cotizaciones) {
        expect(Number(cot.precioVenta.unidades)).toBeLessThan(100_000_000);
      }
    }
    // El formato no divide ni multiplica en COP: 12.500.000 pesos se ven como $ 12.500.000.
    expect(formatearDinero({ unidades: '12500000', moneda: 'COP' })).toBe('$ 12.500.000');
  });

  it('dos contactos distintos no comparten la misma ficha', () => {
    const [a, b] = obtenerMockPaginaContactos().datos;
    const fa = obtenerMockFichaDeContacto(a!.id);
    const fb = obtenerMockFichaDeContacto(b!.id);
    expect(fa.oportunidadActual?.titulo).not.toBe(fb.oportunidadActual?.titulo);
    expect(fa.oportunidadActual?.valorEstimado).not.toEqual(fb.oportunidadActual?.valorEstimado);
  });

  it('un mensaje SALIENTE nunca lleva el texto del cliente y uno ENTRANTE no tiene autor', async () => {
    const textosCliente = new Set(
      MOCK_CONVERSACIONES.filter((c) => c.ultimoMensajeDireccion === 'ENTRANTE').map(
        (c) => c.ultimoMensajeTexto,
      ),
    );
    for (const c of MOCK_CONVERSACIONES.slice(0, 40)) {
      const detalle = await obtenerConversacionDetalleMock(c.id, 0);
      if (!c.ultimoMensajeTexto) continue; // filas sin mensajes: caso límite de la bandeja
      const ultimo = detalle?.mensajes.at(-1);
      expect(ultimo?.direccion).toBe(c.ultimoMensajeDireccion);
      if (ultimo?.direccion === 'SALIENTE') {
        expect(textosCliente.has(ultimo.texto)).toBe(false);
      } else {
        expect(ultimo?.autorId).toBeNull();
      }
      // Lo no leído siempre es del cliente.
      if (c.mensajesSinLeer > 0) expect(c.ultimoMensajeDireccion).toBe('ENTRANTE');
    }
  });

  it('el KPI de pendientes de Inicio cuenta lo que muestra la bandeja', () => {
    const contadores = obtenerContadoresMock();
    expect(contadores.sinAsignar + contadores.conversacionesSinLeer).toBeGreaterThan(0);
    expect(contadores.todas).toBe(MOCK_CONVERSACIONES.length);
  });

  it('el time limit del file 1043 es el mismo en Reservas y en la campana', () => {
    const aviso = crearAvisosDemo(Date.now()).find((n) => n.archivoNumero === 1043)!;
    const archivo = MOCK_DETALLES_ARCHIVOS.find((a) => a.numero === 1043)!;
    const dif = Math.abs(Date.parse(aviso.venceEn) - Date.parse(archivo.proximoPlazo!));
    expect(dif).toBeLessThan(5_000);
  });

  it('todo aviso de la campana apunta a un archivo que existe en Reservas (T-322)', () => {
    const existentes = new Map(MOCK_DETALLES_ARCHIVOS.map((a) => [a.id, a.numero]));
    for (const aviso of crearAvisosDemo(Date.now())) {
      expect(existentes.get(aviso.archivoId)).toBe(aviso.archivoNumero);
    }
  });

  it('una cotización ENVIADA no tiene la vigencia ni la salida en el pasado', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    for (const c of MOCK_COTIZACIONES_INICIALES.filter((x) => x.estado === 'ENVIADA')) {
      for (const v of c.versiones) {
        expect(v.vigenteHasta! >= hoy).toBe(true);
        expect(v.fechaSalida >= hoy).toBe(true);
      }
    }
  });

  it('la agencia tiene un solo nombre en sesión y configuración', () => {
    expect(MOCK_CONFIGURACION_AGENCIA.nombreComercial).toBe(
      MOCK_SESION_UNICA_AGENCIA.agencias[0]!.nombre,
    );
  });

  it('el resumen de reportes y el canal de demostración cumplen el contrato', () => {
    const rango = { desde: '2026-10-21T05:00:00.000Z', hasta: '2026-11-20T05:00:00.000Z' };
    expect(ResumenDeReportes.safeParse(crearResumenDeReportesDemo(rango)).success).toBe(true);
    const canal = crearEstadoCanalWhatsappDemo();
    expect(EstadoCanalWhatsapp.safeParse(canal).success).toBe(true);
    expect(canal.conectado).toBe(true);
  });

  describe('el resumen de la demo trae las cifras de hoy: cotizaciones abiertas y por cobrar (T-556)', () => {
    const rango = { desde: '2026-10-21T05:00:00.000Z', hasta: '2026-11-20T05:00:00.000Z' };

    it('«Hoy» en demo recibe las dos cifras: ni un error ni la tarjeta de cobro ausente', async () => {
      const hoy = await obtenerResumenTrabajoDelDia();
      expect(hoy.cotizacionesAbiertas).not.toBeNull();
      expect(hoy.porCobrar).not.toBeNull();
      expect(hoy.alcanceDeCifras).toBe('AGENCIA');
    });

    it('las cotizaciones abiertas cuentan las mismas que lista Cotizaciones, y los tramos suman las enviadas', () => {
      const r = crearResumenDeReportesDemo(rango);
      const abiertas = obtenerMockCotizaciones().filter(
        (c) => c.estado === 'BORRADOR' || c.estado === 'ENVIADA',
      );
      expect(r.cotizacionesAbiertas?.total).toBe(abiertas.length);
      expect(r.cotizacionesAbiertas?.total).toBeGreaterThan(0);
      const t = r.cotizacionesAbiertas!.porAntiguedad;
      expect(t.hastaTresDias + t.deCuatroASiete + t.masDeSiete).toBe(
        r.cotizacionesAbiertas!.enviadas,
      );
    });

    it('por cobrar: una fila por moneda, COP en pesos y USD en centavos, sin sumarlas (R8)', () => {
      const r = crearResumenDeReportesDemo(rango);
      const filas = r.porCobrar!.porMoneda;
      expect(filas.map((f) => f.moneda)).toEqual(['COP', 'USD']);
      for (const f of filas) expect(f.saldo.unidades).toMatch(/^[1-9]\d*$/);
      // El peso es la unidad mínima de COP: dos órdenes de magnitud por encima de «centavos» sería
      // un saldo de cientos de millones, y por debajo, de unos pocos cientos de miles.
      const cop = BigInt(filas.find((f) => f.moneda === 'COP')!.saldo.unidades);
      expect(cop).toBeGreaterThan(1_000_000n);
      expect(cop).toBeLessThan(500_000_000n);
    });

    it('el por cobrar de la agencia es el mismo que suman los archivos abiertos del dashboard de administración', () => {
      const r = crearResumenDeReportesDemo(rango);
      const porMoneda = new Map<string, { saldo: bigint; archivos: number }>();
      for (const f of crearVistaDeCobrosDemo(new Date('2026-11-21T15:00:00Z')).datos) {
        const saldo = BigInt(f.saldo.unidades);
        if (saldo <= 0n) continue;
        const acc = porMoneda.get(f.saldo.moneda) ?? { saldo: 0n, archivos: 0 };
        porMoneda.set(f.saldo.moneda, { saldo: acc.saldo + saldo, archivos: acc.archivos + 1 });
      }
      for (const f of r.porCobrar!.porMoneda) {
        expect(f.saldo.unidades).toBe(porMoneda.get(f.moneda)!.saldo.toString());
        expect(f.archivos).toBe(porMoneda.get(f.moneda)!.archivos);
      }
      expect(r.porCobrar!.porMoneda).toHaveLength(porMoneda.size);
    });

    it('la demo enseña también truncado: la vista de un asesor lo trae en true y la de la agencia en false', () => {
      expect(crearResumenDeReportesDemo(rango, 'PROPIO').porCobrar?.truncado).toBe(true);
      expect(crearResumenDeReportesDemo(rango, 'AGENCIA').porCobrar?.truncado).toBe(false);
    });

    it('lo de un asesor es una parte de lo de la agencia, y ambas cumplen el contrato strict', () => {
      const agencia = crearResumenDeReportesDemo(rango, 'AGENCIA');
      const propio = crearResumenDeReportesDemo(rango, 'PROPIO');
      expect(ResumenDeReportes.safeParse(propio).success).toBe(true);
      expect(propio.cotizacionesAbiertas!.total).toBeLessThanOrEqual(
        agencia.cotizacionesAbiertas!.total,
      );
      const cop = (r: typeof agencia) =>
        BigInt(r.porCobrar!.porMoneda.find((f) => f.moneda === 'COP')!.saldo.unidades);
      expect(cop(propio)).toBeLessThan(cop(agencia));
    });
  });

  describe('el viaje cuenta lo mismo en el chat, la ficha, el tablero, las cotizaciones y Reservas', () => {
    const JUAN = '00000000-0002-4000-8000-000000000001';
    const ANA = '00000000-0002-4000-8000-000000000002';
    const FELIPE = '00000000-0002-4000-8000-000000000004';

    it('la ficha toma la oportunidad abierta del tablero: Juan es Cancún y Ana es Curazao', () => {
      const juan = obtenerMockFichaDeContacto(JUAN).oportunidadActual!;
      const ana = obtenerMockFichaDeContacto(ANA).oportunidadActual!;
      expect(nombreCortoDeDestino(juan.destino)).toBe('Cancún');
      expect(nombreCortoDeDestino(ana.destino)).toBe('Curazao');
      // Y la etiqueta del contacto dice lo mismo que su viaje.
      const etiquetasAna = obtenerMockFichaDeContacto(ANA).contacto.etiquetas;
      expect(etiquetasAna).toContain('Curazao');
    });

    it('el chat de Juan habla de Cancún en diciembre para 2+2, igual que su cotización y su oportunidad', () => {
      const chatJuan = MOCK_CONVERSACIONES.find((c) => c.contactoId === JUAN)!;
      expect(chatJuan.ultimoMensajeTexto).toMatch(/Cancún.*2 adultos y 2 niños.*diciembre/);
      const cot = MOCK_COTIZACIONES_INICIALES.find((c) => c.contactoId === JUAN)!;
      const v = cot.versiones.at(-1)!;
      expect(nombreCortoDeDestino(v.destino)).toBe('Cancún');
      expect([v.adultos, v.ninos]).toEqual([2, 2]);
      expect(v.fechaSalida.slice(5, 7)).toBe('12');
      const op = obtenerMockFichaDeContacto(JUAN).oportunidadActual!;
      expect(op.fechaSalida!.slice(5, 7)).toBe('12');
      expect(op.valorEstimado?.unidades).toBe(v.venta.unidades);
    });

    it('el chat de Ana habla de Curazao y su cotización también', () => {
      const chatAna = MOCK_CONVERSACIONES.find((c) => c.contactoId === ANA)!;
      expect(chatAna.ultimoMensajeTexto).toMatch(/Curazao/);
      const cot = MOCK_COTIZACIONES_INICIALES.find((c) => c.contactoId === ANA)!;
      expect(nombreCortoDeDestino(cot.versiones.at(-1)!.destino)).toBe('Curazao');
    });

    it('la oportunidad de Felipe y su archivo 1043 salen el mismo día, con la misma cotización de 2+1', () => {
      const archivo = MOCK_DETALLES_ARCHIVOS.find((a) => a.numero === 1043)!;
      const op = obtenerMockFichaDeContacto(FELIPE).oportunidadActual!;
      expect(archivo.contactoId).toBe(FELIPE);
      expect(op.fechaSalida).toBe(archivo.fechaSalida);
      const cot = MOCK_COTIZACIONES_INICIALES.find((c) => c.contactoId === FELIPE)!;
      const v = cot.versiones.at(-1)!;
      expect([v.adultos, v.ninos]).toEqual([archivo.adultos, archivo.ninos]);
      expect(v.fechaSalida).toBe(archivo.fechaSalida);
    });

    it('ninguna salida de las oportunidades abiertas del tablero está en el pasado', () => {
      const hoy = new Date().toISOString().slice(0, 10);
      for (const col of obtenerMockTableroPipeline().columnas) {
        for (const o of col.oportunidades) expect(o.fechaSalida! >= hoy).toBe(true);
      }
    });

    it('la ficha solo lista archivos que existen en Reservas', () => {
      const ids = new Set(MOCK_DETALLES_ARCHIVOS.map((a) => a.id));
      for (const c of obtenerMockPaginaContactos().datos) {
        for (const id of obtenerMockFichaDeContacto(c.id).archivosDeViajeIds) {
          expect(ids.has(id)).toBe(true);
        }
      }
    });
  });
});
