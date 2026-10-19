/**
 * Lógica pura de agregación y clasificación de notificaciones operativas críticas.
 *
 * Cero dependencias de UI, 100% testeable en Vitest.
 */

import { MOCK_CONVERSACIONES } from './mock-inbox';
import { MOCK_ARCHIVOS_VIAJE } from './mock-viajes';
import {
  evaluarAlertaTimeLimit,
  calcularSaldoPendiente,
  verificarDocumentacionCompleta,
} from './viajes-logica';

export type SeveridadAlerta = 'critica' | 'advertencia' | 'informativa';
export type TipoAlerta = 'sla_vencido' | 'time_limit' | 'pago_pendiente' | 'documentos_faltantes';

export interface AlertaOperativa {
  id: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  titulo: string;
  mensaje: string;
  href: string;
  fechaUtc: string;
  leida: boolean;
  accionTexto: string;
}

/**
 * Escanea el estado operativo del CRM y produce la lista de alertas activas ordenadas por severidad.
 */
export function generarAlertasOperativas(
  ahora: Date = new Date('2026-10-11T16:00:00Z'),
): AlertaOperativa[] {
  const alertas: AlertaOperativa[] = [];

  // 1. Detección de SLA en conversaciones de WhatsApp
  for (const c of MOCK_CONVERSACIONES) {
    if (c.slaVenceEn) {
      const venceUtc = new Date(c.slaVenceEn).getTime();
      const vencido = ahora.getTime() > venceUtc;
      if (vencido || c.mensajesSinLeer > 0) {
        alertas.push({
          id: `alerta-sla-${c.id}`,
          tipo: 'sla_vencido',
          severidad: 'critica',
          titulo: 'SLA de WhatsApp Excedido',
          mensaje: `${c.contactoNombre || 'Contacto'} tiene ${c.mensajesSinLeer} mensaje(s) sin responder (SLA vencido).`,
          href: `/bandeja/${c.id}`,
          fechaUtc: c.slaVenceEn,
          leida: false,
          accionTexto: 'Responder Chat',
        });
      }
    }
  }

  // 2. Detección de Time Limits en Reservas Mayoristas (< 24h o vencido)
  for (const v of MOCK_ARCHIVOS_VIAJE) {
    for (const r of v.reservas) {
      const alertaTl = evaluarAlertaTimeLimit(r.timeLimitUtc, ahora.getTime());
      if (
        alertaTl.estado === 'CRITICO' ||
        alertaTl.estado === 'VENCIDO' ||
        alertaTl.estado === 'PROXIMO'
      ) {
        alertas.push({
          id: `alerta-tl-${r.id}`,
          tipo: 'time_limit',
          severidad:
            alertaTl.estado === 'CRITICO' || alertaTl.estado === 'VENCIDO'
              ? 'critica'
              : 'advertencia',
          titulo: 'Time Limit Mayorista Próximo',
          mensaje: `${v.codigoExpediente} (${r.proveedorNombre}): Reserva ${r.localizador} — ${alertaTl.mensaje}.`,
          href: `/viajes?id=${v.id}`,
          fechaUtc: r.timeLimitUtc,
          leida: false,
          accionTexto: 'Ver Expediente',
        });
      }
    }

    // 3. Saldos pendientes en expedientes activos
    const balance = calcularSaldoPendiente(v.totalVentaCop, v.totalPagadoCop);
    if (!balance.estaPagadoTotal && (v.estado === 'CONFIRMADO' || v.estado === 'EN_OPERACION')) {
      alertas.push({
        id: `alerta-pago-${v.id}`,
        tipo: 'pago_pendiente',
        severidad: 'advertencia',
        titulo: 'Saldo Pendiente por Recaudar',
        mensaje: `${v.codigoExpediente} (${v.titularNombre}): Saldo de $${balance.saldoCop.toLocaleString('es-CO')} COP pendiente (${balance.porcentajePagado}% pagado).`,
        href: `/viajes?id=${v.id}`,
        fechaUtc: v.fechaSalida,
        leida: false,
        accionTexto: 'Registrar Abono',
      });
    }

    // 4. Documentación incompleta de viajeros
    const doc = verificarDocumentacionCompleta(v.pasajeros);
    if (!doc.completa) {
      alertas.push({
        id: `alerta-doc-${v.id}`,
        tipo: 'documentos_faltantes',
        severidad: 'informativa',
        titulo: 'Documentación Incompleta',
        mensaje: `${v.codigoExpediente}: ${doc.faltantes} documento(s) pendiente(s) de adjuntar.`,
        href: `/viajes?id=${v.id}`,
        fechaUtc: v.fechaSalida,
        leida: false,
        accionTexto: 'Cargar Documentos',
      });
    }
  }

  // Ordenar: críticas primero, luego advertencias, luego informativas
  const pesos: Record<SeveridadAlerta, number> = {
    critica: 3,
    advertencia: 2,
    informativa: 1,
  };

  return alertas.sort((a, b) => pesos[b.severidad] - pesos[a.severidad]);
}

/**
 * Cuenta la cantidad de alertas no leídas.
 */
export function contarAlertasNoLeidas(alertas: AlertaOperativa[]): number {
  return alertas.filter((a) => !a.leida).length;
}

/**
 * Marca una alerta como leída por su ID inmutablemente.
 */
export function marcarAlertaLeida(alertas: AlertaOperativa[], idAlerta: string): AlertaOperativa[] {
  return alertas.map((a) => (a.id === idAlerta ? { ...a, leida: true } : a));
}
