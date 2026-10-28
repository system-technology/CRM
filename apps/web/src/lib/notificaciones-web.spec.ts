import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  crearNotificacionMensajeNuevo,
  crearNotificacionSeguimientoVencido,
  crearNotificacionCotizacionPorVencer,
  adaptarAlertaOperativaANotificacion,
  procesarEventoSocketNotificacion,
  generarNotificacionesIniciales,
  contarNotificacionesNoLeidas,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  descartarNotificacion,
} from './notificaciones-web';
import { TITULOS_SEGUROS_NOTIFICACION } from './preferencias-notificaciones';
import type { EventoBandeja, PendientesDelDia } from '@viajapro/contracts';
import type { AlertaOperativa } from './notificaciones-logica';

describe('Pruebas Unitarias de Notificaciones Web (notificaciones-web.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cero PII en títulos de notificación (R10 / T-110)', () => {
    it('crea notificación de mensaje nuevo con título seguro y sin datos personales', () => {
      const notif = crearNotificacionMensajeNuevo('conv-123', 'Hola Juan Perez +573001234567');
      expect(notif.tipo).toBe('mensaje_nuevo');
      expect(notif.severidad).toBe('critica');
      expect(notif.titulo).toBe(TITULOS_SEGUROS_NOTIFICACION.MENSAJE_NUEVO);
      // R10: el título jamás expone PII
      expect(notif.titulo).not.toMatch(/\+57|\d{10}|Juan|Perez/i);
      expect(notif.href).toBe('/bandeja/conv-123');
      expect(notif.leida).toBe(false);
      expect(notif.accionTexto).toBe('Responder');
    });

    it('crea notificación de seguimiento vencido con título genérico y seguro', () => {
      const notif = crearNotificacionSeguimientoVencido('seg-456', 'LLAMADA_COTIZACION');
      expect(notif.tipo).toBe('seguimiento_vencido');
      expect(notif.titulo).toBe(TITULOS_SEGUROS_NOTIFICACION.SEGUIMIENTO_VENCIDO);
      expect(notif.href).toBe('/seguimientos');
      expect(notif.leida).toBe(false);
    });

    it('crea notificación de cotización por vencer con horas restantes', () => {
      const notif = crearNotificacionCotizacionPorVencer('cot-789', 12);
      expect(notif.tipo).toBe('cotizacion_por_vencer');
      expect(notif.titulo).toBe(TITULOS_SEGUROS_NOTIFICACION.COTIZACION_POR_VENCER);
      expect(notif.detalle).toContain('12 hora(s)');
      expect(notif.href).toBe('/cotizaciones/cot-789');
      expect(notif.severidad).toBe('advertencia');
    });
  });

  describe('adaptarAlertaOperativaANotificacion', () => {
    it('convierte una AlertaOperativa existente en NotificacionWeb', () => {
      const alerta: AlertaOperativa = {
        id: 'alerta-sla-1',
        tipo: 'sla_vencido',
        severidad: 'critica',
        titulo: 'SLA de WhatsApp Excedido',
        mensaje: 'Cliente esperando respuesta',
        href: '/bandeja/1',
        fechaUtc: '2026-10-28T12:00:00Z',
        leida: false,
        accionTexto: 'Responder Chat',
      };

      const notif = adaptarAlertaOperativaANotificacion(alerta);
      expect(notif.id).toBe(alerta.id);
      expect(notif.tipo).toBe('alerta_operativa');
      expect(notif.severidad).toBe('critica');
      expect(notif.titulo).toBe(alerta.titulo);
      expect(notif.detalle).toBe(alerta.mensaje);
      expect(notif.href).toBe(alerta.href);
      expect(notif.creadaEn).toBe(alerta.fechaUtc);
    });
  });

  describe('procesarEventoSocketNotificacion', () => {
    it('añade una notificación al inicio cuando el evento es MENSAJE_NUEVO entrante', () => {
      const evento: EventoBandeja = {
        tipo: 'MENSAJE_NUEVO',
        conversacionId: '01932000-0000-7000-8000-000000000001',
        mensaje: {
          id: '01932000-0000-7000-8000-000000000002',
          conversacionId: '01932000-0000-7000-8000-000000000001',
          direccion: 'ENTRANTE',
          tipo: 'TEXTO',
          texto: 'Buenas tardes, quiero cotizar',
          adjuntos: [],
          estado: 'ENTREGADO',
          motivoFallo: null,
          autorId: null,
          autorNombre: 'Viajero',
          ocurridoEn: '2026-10-28T15:00:00Z',
          cotizacionId: null,
        },
      };

      const listaPrevia = [crearNotificacionCotizacionPorVencer('cot-1')];

      const resultado = procesarEventoSocketNotificacion(evento, listaPrevia);
      expect(resultado.length).toBe(2);
      expect(resultado[0]?.tipo).toBe('mensaje_nuevo');
      expect(resultado[0]?.href).toBe('/bandeja/01932000-0000-7000-8000-000000000001');
    });

    it('no muta la lista si el evento es de mensaje saliente o no nuevo', () => {
      const evento: EventoBandeja = {
        tipo: 'MENSAJE_NUEVO',
        conversacionId: '01932000-0000-7000-8000-000000000001',
        mensaje: {
          id: '01932000-0000-7000-8000-000000000002',
          conversacionId: '01932000-0000-7000-8000-000000000001',
          direccion: 'SALIENTE',
          tipo: 'TEXTO',
          texto: 'Hola',
          adjuntos: [],
          estado: 'ENVIADO',
          motivoFallo: null,
          autorId: '01932000-0000-7000-8000-000000000004',
          autorNombre: 'Asesor',
          ocurridoEn: '2026-10-28T15:00:00Z',
          cotizacionId: null,
        },
      };

      const listaPrevia = [crearNotificacionCotizacionPorVencer('cot-1')];
      const resultado = procesarEventoSocketNotificacion(evento, listaPrevia);
      expect(resultado).toEqual(listaPrevia);
    });
  });

  describe('generarNotificacionesIniciales', () => {
    it('genera lista inicial con demo si pendientes es null o vacío', () => {
      const notifs = generarNotificacionesIniciales(null);
      expect(notifs.length).toBeGreaterThanOrEqual(3);
      expect(notifs.some((n) => n.tipo === 'mensaje_nuevo')).toBe(true);
      expect(notifs.some((n) => n.tipo === 'seguimiento_vencido')).toBe(true);
      expect(notifs.some((n) => n.tipo === 'cotizacion_por_vencer')).toBe(true);
    });

    it('integra pendientes reales de la API cuando están presentes', () => {
      const pendientes: PendientesDelDia = {
        fecha: '2026-10-28',
        vencidos: [
          {
            id: '01932000-0000-7000-8000-000000000003',
            descripcion: 'Llamar al cliente para confirmar',
            venceEn: '2026-10-27T10:00:00Z',
            completadoEn: null,
            asesorId: '01932000-0000-7000-8000-000000000004',
            asesorNombre: 'Carlos',
            contactoId: '01932000-0000-7000-8000-000000000005',
            contactoNombre: 'Juan',
            oportunidadId: null,
            oportunidadTitulo: null,
            conversacionId: null,
          },
        ],
        deHoy: [],
      };

      const notifs = generarNotificacionesIniciales(pendientes);
      const segNotif = notifs.find(
        (n) => n.id === 'notif-seg-01932000-0000-7000-8000-000000000003',
      );
      expect(segNotif).toBeDefined();
      expect(segNotif?.tipo).toBe('seguimiento_vencido');
    });

    it('incluye alertas operativas si se proporcionan', () => {
      const alerta: AlertaOperativa = {
        id: 'alerta-tl-reserva',
        tipo: 'time_limit',
        severidad: 'critica',
        titulo: 'Time Limit Próximo',
        mensaje: 'Vence en 2 horas',
        href: '/viajes?id=1',
        fechaUtc: '2026-10-28T18:00:00Z',
        leida: false,
        accionTexto: 'Ver Expediente',
      };

      const notifs = generarNotificacionesIniciales(null, ['cot-1'], [alerta]);
      expect(notifs.some((n) => n.id === 'alerta-tl-reserva')).toBe(true);
    });
  });

  describe('Manejo inmutable del estado: no leídas, marcar leída, marcar todas y descartar', () => {
    it('cuenta correctamente las no leídas', () => {
      const notifs = [
        { ...crearNotificacionMensajeNuevo('1'), leida: false },
        { ...crearNotificacionSeguimientoVencido('2'), leida: true },
        { ...crearNotificacionCotizacionPorVencer('3'), leida: false },
      ];
      expect(contarNotificacionesNoLeidas(notifs)).toBe(2);
    });

    it('marca una notificación específica como leída inmutablemente', () => {
      const n1 = crearNotificacionMensajeNuevo('1');
      const n2 = crearNotificacionSeguimientoVencido('2');
      const lista = [n1, n2];

      const resultado = marcarNotificacionLeida(lista, n1.id);
      expect(resultado[0]?.leida).toBe(true);
      expect(resultado[1]?.leida).toBe(false);
      expect(lista[0]?.leida).toBe(false); // Inmutable
    });

    it('marca todas las notificaciones como leídas inmutablemente', () => {
      const lista = [crearNotificacionMensajeNuevo('1'), crearNotificacionSeguimientoVencido('2')];

      const resultado = marcarTodasNotificacionesLeidas(lista);
      expect(resultado.every((n) => n.leida)).toBe(true);
      expect(lista.every((n) => !n.leida)).toBe(true); // Inmutable
    });

    it('descarta una notificación de la lista', () => {
      const n1 = crearNotificacionMensajeNuevo('1');
      const n2 = crearNotificacionSeguimientoVencido('2');
      const lista = [n1, n2];

      const resultado = descartarNotificacion(lista, n1.id);
      expect(resultado.length).toBe(1);
      expect(resultado[0]?.id).toBe(n2.id);
      expect(lista.length).toBe(2); // Inmutable
    });
  });
});
