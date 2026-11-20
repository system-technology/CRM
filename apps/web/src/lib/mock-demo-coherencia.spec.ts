import { describe, expect, it } from 'vitest';
import { EstadoCanalWhatsapp, ResumenDeReportes } from '@viajapro/contracts';
import { crearResumenDeReportesDemo } from './mock-reportes-resumen';
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
});
