'use client';

import React, { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Users,
  Building,
  CreditCard,
  FileText,
  MapPin,
  Search,
  ExternalLink,
  Plane,
  Copy,
} from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { MOCK_ARCHIVOS_VIAJE, type ArchivoDeViaje } from '../../lib/mock-viajes';
import {
  calcularSaldoPendiente,
  evaluarAlertaTimeLimit,
  enmascararDocumentoPii,
  verificarDocumentacionCompleta,
  calcularMargenOperativoExpediente,
} from '../../lib/viajes-logica';

type TabExpediente = 'itinerario' | 'pasajeros' | 'reservas' | 'pagos' | 'bitacora';

function ExpedienteDetalleContenido() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');

  const [archivos] = useState<ArchivoDeViaje[]>(MOCK_ARCHIVOS_VIAJE);
  const [archivoSeleccionadoId, setArchivoSeleccionadoId] = useState<string>(
    idParam || MOCK_ARCHIVOS_VIAJE[0]?.id || '',
  );
  const [tabActiva, setTabActiva] = useState<TabExpediente>('reservas');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [copiadoLocalizador, setCopiadoLocalizador] = useState<string | null>(null);

  const expediente = useMemo(() => {
    return archivos.find((a) => a.id === archivoSeleccionadoId) || archivos[0] || null;
  }, [archivos, archivoSeleccionadoId]);

  const archivosFiltrados = useMemo(() => {
    return archivos.filter((a) => {
      const cumpleTexto =
        filtroTexto === '' ||
        a.codigoExpediente.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        a.titularNombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        a.destino.toLowerCase().includes(filtroTexto.toLowerCase());

      const cumpleEstado = filtroEstado === 'TODOS' || a.estado === filtroEstado;
      return cumpleTexto && cumpleEstado;
    });
  }, [archivos, filtroTexto, filtroEstado]);

  if (!expediente) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-neutral-500">
        No hay expedientes operativos registrados.
      </div>
    );
  }

  // Cálculos financieros y alertas del expediente seleccionado
  const balance = calcularSaldoPendiente(expediente.totalVentaCop, expediente.totalPagadoCop);
  const documentacion = verificarDocumentacionCompleta(expediente.pasajeros);
  const margen = calcularMargenOperativoExpediente(expediente.totalVentaCop, expediente.reservas);

  // Búsqueda de reservas con Time Limit crítico
  const reservasCriticas = expediente.reservas.map((r) => ({
    reserva: r,
    alerta: evaluarAlertaTimeLimit(r.timeLimitUtc),
  }));
  const tieneTimeLimitUrgente = reservasCriticas.some(
    (item) => item.alerta.estado === 'CRITICO' || item.alerta.estado === 'VENCIDO',
  );

  const copiarLocalizador = (loc: string) => {
    void navigator.clipboard.writeText(loc).then(() => {
      setCopiadoLocalizador(loc);
      setTimeout(() => setCopiadoLocalizador(null), 2000);
    });
  };

  return (
    <div className="flex h-screen w-full bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      <BarraModulos />

      {/* Panel Maestro: Lista de Expedientes */}
      <aside className="flex w-80 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
              Archivos de Viaje
            </h2>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {archivos.length} activos
            </span>
          </div>

          <div className="relative mt-3">
            <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por código, titular o destino..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pr-3 pl-8 text-xs focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="mt-2 flex gap-1 overflow-x-auto text-[11px]">
            {['TODOS', 'EN_OPERACION', 'CONFIRMADO'].map((est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est)}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${
                  filtroEstado === est
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {est === 'TODOS' ? 'Todos' : est === 'EN_OPERACION' ? 'En Operación' : 'Confirmado'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista con scroll */}
        <div className="flex-1 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800/60">
          {archivosFiltrados.map((a) => {
            const esSeleccionado = a.id === expediente.id;
            const balanceItem = calcularSaldoPendiente(a.totalVentaCop, a.totalPagadoCop);

            return (
              <button
                key={a.id}
                onClick={() => setArchivoSeleccionadoId(a.id)}
                className={`w-full p-3.5 text-left transition-colors ${
                  esSeleccionado
                    ? 'border-l-4 border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold text-neutral-900 dark:text-white">
                    {a.codigoExpediente}
                  </span>
                  <span
                    className={`py-0.2 rounded px-1.5 text-[10px] font-semibold ${
                      a.estado === 'CONFIRMADO'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                    }`}
                  >
                    {a.estado}
                  </span>
                </div>

                <p className="mt-1 truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  {a.titularNombre}
                </p>

                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{a.destino}</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-neutral-500">
                    {a.fechaSalida.slice(5)} al {a.fechaRegreso.slice(5)}
                  </span>
                  <span
                    className={`font-semibold ${
                      balanceItem.estaPagadoTotal
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {balanceItem.estaPagadoTotal
                      ? 'Saldado'
                      : `Saldo: $${balanceItem.saldoCop.toLocaleString('es-CO')}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Área Principal: Expediente Seleccionado */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-14 md:pb-0">
        {/* Cabecera del Expediente */}
        <header className="border-b border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-sm font-bold text-blue-600 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-400">
                  {expediente.codigoExpediente}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    expediente.estado === 'CONFIRMADO'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                  }`}
                >
                  {expediente.estado}
                </span>
                <span className="text-xs text-neutral-400">|</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Asesor: <strong>{expediente.asesorAsignado}</strong>
                </span>
              </div>

              <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {expediente.paqueteNombre}
              </h1>
              <DistintivoDatosDemo visible={true} />

              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-300">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-neutral-400" />
                  Titular: <strong>{expediente.titularNombre}</strong> ({expediente.titularTelefono}
                  )
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  Salida: <strong>{expediente.fechaSalida}</strong> · Regreso:{' '}
                  <strong>{expediente.fechaRegreso}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                  {expediente.destino}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {expediente.pasajeros.length} Pasajeros
              </span>
            </div>
          </div>

          {/* Banners de Alertas Críticas (Regla: mostrar lo que cuesta dinero sin abrir submenús) */}
          <div className="mt-4 space-y-2">
            {tieneTimeLimitUrgente && (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce text-amber-600" />
                <span>
                  <strong>ALERTA OPERATIVA:</strong> Existen reservas con{' '}
                  <strong>Time Limit próximo a vencer</strong>. Si no se emite el pago con el
                  proveedor antes del límite, el cupo será liberado por la aerolínea/mayorista.
                </span>
              </div>
            )}

            {!balance.estaPagadoTotal && (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 shrink-0 text-blue-600" />
                  <span>
                    Saldo pendiente de recaudo:{' '}
                    <strong>${balance.saldoCop.toLocaleString('es-CO')} COP</strong> (
                    {balance.porcentajePagado}% cancelado).
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  Total Venta: ${expediente.totalVentaCop.toLocaleString('es-CO')} COP
                </span>
              </div>
            )}

            {!documentacion.completa && (
              <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300">
                <FileText className="h-4 w-4 text-neutral-500" />
                <span>
                  Documentación incompleta: <strong>{documentacion.faltantes} pasajero(s)</strong>{' '}
                  con documento o voucher pendiente de cargar.
                </span>
              </div>
            )}
          </div>

          {/* Tarjetas KPI Financieras */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Total Venta
              </span>
              <p className="mt-0.5 text-base font-bold text-neutral-900 dark:text-white">
                ${expediente.totalVentaCop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Recaudado</span>
              <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">
                ${expediente.totalPagadoCop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Saldo Pendiente
              </span>
              <p className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">
                ${balance.saldoCop.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Margen Agencia ({margen.porcentajeMargen}%)
              </span>
              <p className="mt-0.5 text-base font-bold text-blue-600 dark:text-blue-400">
                ${margen.margenCop.toLocaleString('es-CO')}
              </p>
            </div>
          </div>

          {/* Pestañas de Navegación del Expediente */}
          <nav className="mt-5 flex space-x-2 border-b border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setTabActiva('reservas')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                tabActiva === 'reservas'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
              }`}
            >
              <Building className="h-4 w-4" />
              <span>Reservas por Proveedor ({expediente.reservas.length})</span>
            </button>

            <button
              onClick={() => setTabActiva('pasajeros')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                tabActiva === 'pasajeros'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Pasajeros y Documentos ({expediente.pasajeros.length})</span>
            </button>

            <button
              onClick={() => setTabActiva('itinerario')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                tabActiva === 'itinerario'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
              }`}
            >
              <Plane className="h-4 w-4" />
              <span>Itinerario ({expediente.itinerario.length} Días)</span>
            </button>

            <button
              onClick={() => setTabActiva('pagos')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                tabActiva === 'pagos'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
              }`}
            >
              <CreditCard className="h-4 w-4" />
              <span>Historial de Pagos ({expediente.pagos.length})</span>
            </button>

            <button
              onClick={() => setTabActiva('bitacora')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                tabActiva === 'bitacora'
                  ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Notas Operativas ({expediente.notasOperativas.length})</span>
            </button>
          </nav>
        </header>

        {/* Contenido de la Pestaña Activa */}
        <div className="flex-1 space-y-6 p-6">
          {/* TAB 1: RESERVAS POR PROVEEDOR */}
          {tabActiva === 'reservas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Confirmaciones con Proveedores y Time Limits
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Control de PNR, cupos bloqueados y fechas límite de emisión
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {expediente.reservas.map((reserva) => {
                  const alerta = evaluarAlertaTimeLimit(reserva.timeLimitUtc);

                  return (
                    <div
                      key={reserva.id}
                      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex flex-col gap-2 border-b border-neutral-100 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`rounded-lg p-2 text-xs font-bold ${
                              reserva.tipo === 'VUELO'
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : reserva.tipo === 'HOTEL'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                            }`}
                          >
                            {reserva.tipo}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                              {reserva.proveedorNombre}
                            </h4>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              {reserva.descripcion}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                            <span className="text-[11px] text-neutral-500">Localizador:</span>
                            <span className="font-mono font-bold text-neutral-900 dark:text-white">
                              {reserva.localizador}
                            </span>
                            <button
                              onClick={() => copiarLocalizador(reserva.localizador)}
                              title="Copiar localizador"
                              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            {copiadoLocalizador === reserva.localizador && (
                              <span className="text-[10px] font-semibold text-emerald-600">
                                Copiado
                              </span>
                            )}
                          </div>

                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              reserva.estado === 'EMITIDA'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                : reserva.estado === 'CONFIRMADA'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            }`}
                          >
                            {reserva.estado}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <Clock
                            className={`h-4 w-4 ${
                              alerta.estado === 'CRITICO' || alerta.estado === 'VENCIDO'
                                ? 'animate-pulse text-rose-600 dark:text-rose-400'
                                : 'text-neutral-400'
                            }`}
                          />
                          <span
                            className={`font-semibold ${
                              alerta.estado === 'CRITICO' || alerta.estado === 'VENCIDO'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            Time Limit: {new Date(reserva.timeLimitUtc).toLocaleString('es-CO')} (
                            {alerta.mensaje})
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-neutral-500">
                            Costo Neto Mayorista:{' '}
                            <strong>${reserva.costoNetoCop.toLocaleString('es-CO')} COP</strong>
                          </span>
                          {reserva.voucherUrl && (
                            <a
                              href={reserva.voucherUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Ver Voucher</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PASAJEROS Y DOCUMENTOS (R10 PII) */}
          {tabActiva === 'pasajeros' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Pasajeros Registrados y Documentación (R10)
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Datos personales y números de identificación enmascarados para protección
                    sensible
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3">Pasajero</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Documento (PII Enmascarado)</th>
                      <th className="px-4 py-3">Nacimiento</th>
                      <th className="px-4 py-3">Estado Documentos</th>
                      <th className="px-4 py-3 text-right">Voucher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {expediente.pasajeros.map((pax) => (
                      <tr
                        key={pax.id}
                        className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30"
                      >
                        <td className="px-4 py-3.5 font-semibold text-neutral-900 dark:text-white">
                          {pax.nombreCompleto}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                            {pax.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-neutral-700 dark:text-neutral-300">
                          {enmascararDocumentoPii(pax.documentoNumero, pax.documentoTipo)}
                        </td>
                        <td className="px-4 py-3.5 text-neutral-500 dark:text-neutral-400">
                          {pax.fechaNacimiento}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              pax.estadoDocumentos === 'VERIFICADO'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {pax.estadoDocumentos === 'VERIFICADO' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                            {pax.estadoDocumentos}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className={`font-semibold ${
                              pax.tieneVoucher
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-neutral-400'
                            }`}
                          >
                            {pax.tieneVoucher ? 'Emitido' : 'Pendiente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ITINERARIO OPERATIVO */}
          {tabActiva === 'itinerario' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Cronograma de Servicios e Itinerario Día por Día
              </h3>

              <div className="space-y-3">
                {expediente.itinerario.map((dia) => (
                  <div
                    key={dia.dia}
                    className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      <span className="text-[10px] font-bold uppercase">Día</span>
                      <span className="text-sm font-extrabold">{dia.dia}</span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                          {dia.titulo}
                        </h4>
                        <span className="text-[11px] text-neutral-400">{dia.fecha}</span>
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        {dia.descripcion}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5 pt-1">
                        {dia.servicios.map((s, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                          >
                            ✓ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: HISTORIAL DE PAGOS */}
          {tabActiva === 'pagos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Abonos y Comprobantes Recaudados
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Registro de anticipos y trazabilidad de tesorería en COP (R8)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Monto Abonado</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Referencia Comprobante</th>
                      <th className="px-4 py-3 text-right">Registrado Por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {expediente.pagos.map((pago) => (
                      <tr
                        key={pago.id}
                        className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30"
                      >
                        <td className="px-4 py-3.5 text-neutral-600 dark:text-neutral-400">
                          {new Date(pago.fechaUtc).toLocaleString('es-CO')}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                          ${pago.montoCop.toLocaleString('es-CO')} COP
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                            {pago.metodo}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-neutral-700 dark:text-neutral-300">
                          {pago.referenciaComprobante}
                        </td>
                        <td className="px-4 py-3.5 text-right text-neutral-500 dark:text-neutral-400">
                          {pago.registradoPor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: BITÁCORA Y NOTAS OPERATIVAS */}
          {tabActiva === 'bitacora' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Bitácora de Incidencias y Requerimientos Operativos
              </h3>

              <div className="space-y-3">
                {expediente.notasOperativas.map((nota) => (
                  <div
                    key={nota.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="font-semibold text-neutral-900 dark:text-white">
                        {nota.autor}
                      </span>
                      <span>{new Date(nota.fechaUtc).toLocaleString('es-CO')}</span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
                      {nota.texto}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ViajesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-neutral-50 text-xs text-neutral-500">
          Cargando expediente operativo...
        </div>
      }
    >
      <ExpedienteDetalleContenido />
    </Suspense>
  );
}
