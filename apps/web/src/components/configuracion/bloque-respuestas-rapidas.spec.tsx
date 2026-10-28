import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BloqueRespuestasRapidas } from './bloque-respuestas-rapidas';

describe('BloqueRespuestasRapidas — Administración por Agencia (T-104)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it('1. Renderiza el título, distintivo T-104 y listado inicial por defecto', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" nombreAgencia="Viajes El Sol" />);

    expect(screen.getByText('Respuestas Rápidas para la Bandeja')).toBeDefined();
    expect(screen.getByText('T-104')).toBeDefined();
    expect(screen.getByText(/6 disponibles/i)).toBeDefined();

    // Debe mostrar los atajos predeterminados
    expect(screen.getByText('/saludo')).toBeDefined();
    expect(screen.getByText('/cuenta')).toBeDefined();
  });

  it('2. Muestra el estado honesto de almacenamiento local y mención a la API T-078', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    expect(
      screen.getByText(/Estado de Persistencia: Almacenamiento Local de Agencia Activo/i),
    ).toBeDefined();
    expect(screen.getByText(/endpoint de API de Respuestas Rápidas \(T-078\)/i)).toBeDefined();
  });

  it('3. Filtra respuestas al seleccionar una categoría específica', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const btnPagos = screen.getByRole('button', { name: /Pagos y Bancos COP/i });
    fireEvent.click(btnPagos);

    // Solo debe mostrar la de cuenta
    expect(screen.getByText('/cuenta')).toBeDefined();
    expect(screen.queryByText('/saludo')).toBeNull();
  });

  it('4. Filtra por texto en el campo de búsqueda', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const input = screen.getByPlaceholderText(/Buscar atajo o texto.../i);
    fireEvent.change(input, { target: { value: 'horario' } });

    expect(screen.getByText('/horario')).toBeDefined();
    expect(screen.queryByText('/saludo')).toBeNull();
  });

  it('5. Alterna la vista previa interactiva con variables interpoladas', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" nombreAgencia="Viajes El Sol" />);

    // Buscar los botones de vista previa
    const botonesPreview = screen.getAllByRole('button', { name: /Alternar vista previa/i });
    fireEvent.click(botonesPreview[0]!);

    // Debe mostrar vista previa con viajero de prueba
    expect(screen.getByText(/👁️ Vista previa \(Sofía Ramírez\):/i)).toBeDefined();
  });

  it('6. Abre modal de creación, agrega variable con botón y guarda una nueva respuesta', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const btnNueva = screen.getByRole('button', { name: /Nueva respuesta/i });
    fireEvent.click(btnNueva);

    expect(screen.getByText('Nueva Respuesta Rápida')).toBeDefined();

    const inputAtajo = screen.getByPlaceholderText(/ej. cuenta, requisitos, saludo/i);
    const inputTitulo = screen.getByPlaceholderText(/ej. Datos de cuenta para pagos COP/i);
    const textarea = screen.getByPlaceholderText(/Escribe el mensaje/i);

    fireEvent.change(inputAtajo, { target: { value: 'bienvenida' } });
    fireEvent.change(inputTitulo, { target: { value: 'Mensaje de Bienvenida' } });
    fireEvent.change(textarea, { target: { value: 'Hola viajero' } });

    // Clic en botón de variable '+ {nombre}'
    const btnTagNombre = screen.getByRole('button', { name: /\+ \{nombre\}/i });
    fireEvent.click(btnTagNombre);

    // Enviar formulario
    const btnGuardar = screen.getByRole('button', { name: /Crear Respuesta/i });
    fireEvent.click(btnGuardar);

    // Debe cerrarse el modal y agregarse la respuesta
    expect(screen.getByText('/bienvenida')).toBeDefined();
    expect(screen.getByText('Mensaje de Bienvenida')).toBeDefined();
  });

  it('7. Abre modal de edición y modifica una respuesta existente', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const btnEditar = screen.getByRole('button', { name: /Editar respuesta saludo/i });
    fireEvent.click(btnEditar);

    expect(screen.getByText('Editar Respuesta Rápida')).toBeDefined();

    const inputTitulo = screen.getByPlaceholderText(/ej. Datos de cuenta para pagos COP/i);
    fireEvent.change(inputTitulo, { target: { value: 'Saludo Ultra Cordial' } });

    const btnGuardar = screen.getByRole('button', { name: /Guardar Cambios/i });
    fireEvent.click(btnGuardar);

    expect(screen.getByText('Saludo Ultra Cordial')).toBeDefined();
  });

  it('8. Elimina una respuesta rápida con confirmación', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const btnEliminar = screen.getByRole('button', { name: /Eliminar respuesta saludo/i });
    fireEvent.click(btnEliminar);

    expect(screen.queryByText('/saludo')).toBeNull();
  });

  it('9. Restablece respuestas por defecto al confirmar', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    // Primero eliminamos una
    const btnEliminar = screen.getByRole('button', { name: /Eliminar respuesta saludo/i });
    fireEvent.click(btnEliminar);
    expect(screen.queryByText('/saludo')).toBeNull();

    // Restablecemos
    const btnReset = screen.getByRole('button', { name: /Restablecer por defecto/i });
    fireEvent.click(btnReset);

    expect(screen.getByText('/saludo')).toBeDefined();
  });

  it('10. Garantiza objetivos táctiles >= 44 px en botones principales', () => {
    render(<BloqueRespuestasRapidas tenantId="agencia-test" />);

    const btnNueva = screen.getByRole('button', { name: /Nueva respuesta/i });
    expect(btnNueva.className).toContain('min-h-[44px]');

    const btnReset = screen.getByRole('button', { name: /Restablecer por defecto/i });
    expect(btnReset.className).toContain('min-h-[44px]');
  });
});
