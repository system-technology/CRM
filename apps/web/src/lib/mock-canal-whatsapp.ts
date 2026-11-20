/**
 * Estado del canal de WhatsApp de demostración, en la forma del contrato (`EstadoCanalWhatsapp`,
 * R3). Solo se lee con `estaUsandoApiReal() === false`. Coincide con el número y el nombre de la
 * agencia de demostración de Configuración.
 */
import { EstadoCanalWhatsapp } from '@viajapro/contracts';
import { MOCK_CONFIGURACION_WABA } from './mock-configuracion';

export function crearEstadoCanalWhatsappDemo(ahoraMs: number = Date.now()): EstadoCanalWhatsapp {
  return EstadoCanalWhatsapp.parse({
    conectado: true,
    canales: [
      {
        id: '01932000-0000-7000-8000-0000000e0001',
        numeroE164: MOCK_CONFIGURACION_WABA.numeroE164,
        nombreVisible: MOCK_CONFIGURACION_WABA.nombreVisible,
        estado: 'ACTIVO',
        estadoCuenta: 'ACTIVO',
        conectado: true,
        conectadoDesde: new Date(ahoraMs - 40 * 86_400_000).toISOString(),
        ultimaRecepcionEn: new Date(ahoraMs - 34 * 60_000).toISOString(),
        ultimoEnvioFallido: null,
      },
    ],
  });
}
