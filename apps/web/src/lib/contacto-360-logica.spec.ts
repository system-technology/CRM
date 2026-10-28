import { describe, it, expect } from 'vitest';
import { construirLineaTiempo360, calcularMetricasContacto360 } from './contacto-360-logica';
import { obtenerMockFichaDeContacto } from './mock-crm';
import { Seguimiento } from '@viajapro/contracts';

describe('contacto-360-logica (T-100)', () => {
  const fichaMock = obtenerMockFichaDeContacto('00000000-0002-4000-8000-000000000001');

  const seguimientosMock: Seguimiento[] = [
    {
      id: '01932000-0000-7000-8000-000000000091',
      descripcion: 'Llamar para verificar itinerario',
      venceEn: '2026-10-29T10:00:00.000Z',
      completadoEn: null,
      asesorId: '00000000-0000-4000-a000-000000000001',
      asesorNombre: 'Laura Gómez',
      contactoId: fichaMock.contacto.id,
      contactoNombre: fichaMock.contacto.nombre,
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: null,
    },
    {
      id: '01932000-0000-7000-8000-000000000092',
      descripcion: 'Enviar catálogo PDF por WhatsApp',
      venceEn: '2026-10-25T14:00:00.000Z',
      completadoEn: '2026-10-25T15:30:00.000Z',
      asesorId: '00000000-0000-4000-a000-000000000001',
      asesorNombre: 'Laura Gómez',
      contactoId: fichaMock.contacto.id,
      contactoNombre: fichaMock.contacto.nombre,
      oportunidadId: null,
      oportunidadTitulo: null,
      conversacionId: null,
    },
  ];

  it('1. Construye la línea de tiempo 360 con todos los tipos de eventos ordenados cronológicamente inverso', () => {
    const eventos = construirLineaTiempo360(fichaMock, seguimientosMock);

    expect(eventos.length).toBeGreaterThan(0);

    // Comprobar orden cronológico inverso (el primer evento tiene fecha mayor o igual al siguiente)
    for (let i = 0; i < eventos.length - 1; i++) {
      const tiempoActual = new Date(eventos[i]!.fechaIso).getTime();
      const tiempoSiguiente = new Date(eventos[i + 1]!.fechaIso).getTime();
      expect(tiempoActual).toBeGreaterThanOrEqual(tiempoSiguiente);
    }

    // Comprobar presencia de eventos clave
    const tipos = eventos.map((e) => e.tipo);
    expect(tipos).toContain('CREACION_CONTACTO');
    expect(tipos).toContain('OPORTUNIDAD');
    expect(tipos).toContain('COTIZACION');
    expect(tipos).toContain('NOTA_INTERNA');
    expect(tipos).toContain('SEGUIMIENTO');
  });

  it('2. Distingue entre seguimientos pendientes y completados en la línea de tiempo', () => {
    const eventos = construirLineaTiempo360(fichaMock, seguimientosMock);
    const eventosSeguimiento = eventos.filter((e) => e.tipo === 'SEGUIMIENTO');

    expect(eventosSeguimiento.length).toBe(2);

    const completado = eventosSeguimiento.find((e) => e.estado === 'completado');
    const pendiente = eventosSeguimiento.find((e) => e.estado === 'pendiente');

    expect(completado).toBeDefined();
    expect(completado?.etiquetaBadge).toBe('Completado');

    expect(pendiente).toBeDefined();
    expect(pendiente?.etiquetaBadge).toBe('Pendiente');
  });

  it('3. Calcula métricas 360 sintéticas del contacto', () => {
    const metricas = calcularMetricasContacto360(fichaMock, seguimientosMock);

    expect(metricas.totalCotizaciones).toBe(fichaMock.cotizaciones.length);
    expect(metricas.cotizacionesMontoTotalCop).toBeGreaterThan(0);
    expect(metricas.seguimientosPendientes).toBe(1);
    expect(metricas.tieneOportunidadActiva).toBe(true);
    expect(metricas.etapaOportunidad).toBe(fichaMock.oportunidadActual?.etapa.nombre);
  });
});
