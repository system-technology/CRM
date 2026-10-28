'use client';

import React, { useState } from 'react';
import { MessageSquare, Lock, CheckCircle2, AlertTriangle, Clock, Copy, Check } from 'lucide-react';
import {
  type DatosConexionWhatsApp,
  DATOS_WHATSAPP_CONECTADO_DEFAULT,
  DATOS_WHATSAPP_DESCONECTADO_DEFAULT,
  PLANTILLAS_OFICIALES_AGENCIA,
  calcularEstadoVentana24h,
  interpretarCalidadMeta,
  interpretarTierMensajeria,
} from '../../lib/whatsapp-conexion-logica';

export interface BloqueConexionWhatsappProps {
  datosIniciales?: DatosConexionWhatsApp | undefined;
}

export function BloqueConexionWhatsapp({
  datosIniciales = DATOS_WHATSAPP_CONECTADO_DEFAULT,
}: BloqueConexionWhatsappProps) {
  const [datos, setDatos] = useState<DatosConexionWhatsApp>(datosIniciales);
  const [copiadoWebhook, setCopiadoWebhook] = useState(false);

  // Estado del simulador interactivo de ventana de 24 horas
  const [horasSimuladas, setHorasSimuladas] = useState<number>(4);

  const fechaSimulada = new Date(Date.now() - horasSimuladas * 60 * 60 * 1000).toISOString();
  const simulacionVentana = calcularEstadoVentana24h(fechaSimulada);
  const infoCalidad = interpretarCalidadMeta(datos.calidad);
  const infoTier = interpretarTierMensajeria(datos.tierMensajeria);

  const handleCopiarWebhook = () => {
    void navigator.clipboard?.writeText(datos.webhookUrl);
    setCopiadoWebhook(true);
    setTimeout(() => setCopiadoWebhook(false), 2500);
  };

  const alternarModoConexion = () => {
    setDatos((prev) =>
      prev.conectado ? DATOS_WHATSAPP_DESCONECTADO_DEFAULT : DATOS_WHATSAPP_CONECTADO_DEFAULT,
    );
  };

  return (
    <div data-testid="bloque-conexion-whatsapp" className="max-w-4xl space-y-8">
      {/* 1. Tarjeta Principal de Estado de Conexión */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  Canal Oficial de WhatsApp (Meta Cloud API)
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  T-106
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Línea oficial empresarial WhatsApp Business Account (WABA) para ventas y
                cotizaciones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                datos.conectado
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  datos.conectado ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span>{datos.conectado ? 'Conexión Saludable' : 'Canal No Conectado'}</span>
            </span>

            <button
              type="button"
              onClick={alternarModoConexion}
              data-testid="btn-alternar-modo-conexion"
              className="flex min-h-[44px] items-center rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <span>{datos.conectado ? 'Simular desconexión' : 'Conectar canal'}</span>
            </button>
          </div>
        </div>

        {/* Detalles de la Conexión si está conectado */}
        {datos.conectado ? (
          <div className="mt-6 space-y-6 border-t border-neutral-100 pt-6 dark:border-neutral-800">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
                  Número Verificado
                </span>
                <p className="mt-1 text-sm font-extrabold text-neutral-900 dark:text-white">
                  {datos.numeroE164}
                </p>
                <span className="mt-1 inline-block text-[10px] text-neutral-500">
                  {datos.nombreVisible}
                </span>
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
                  Calidad del Número
                </span>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${infoCalidad.colorBadge}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    <span>{infoCalidad.etiqueta}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">
                  {infoCalidad.descripcionAgencia}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
                  Capacidad de Envíos
                </span>
                <p className="mt-1 text-xs font-bold text-neutral-900 dark:text-white">
                  {infoTier.limiteDiario}
                </p>
                <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                  Conversaciones simultáneas activas: {datos.conversacionesActivas24h}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
                  Identificadores Públicos
                </span>
                <p className="mt-1 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                  Phone ID: {datos.phoneNumberId}
                </p>
                <p className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                  WABA: {datos.wabaId}
                </p>
              </div>
            </div>

            {/* Aviso de Seguridad R6: Cero Secretos */}
            <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
              <Lock className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Regla R6 (Cero secretos en frontend):</strong> Las credenciales de acceso
                permanente de Meta Cloud API están cifradas con AES-256-GCM en el backend. Los
                identificadores mostrados arriba son públicos y nunca exponen contraseñas ni llaves
                privadas.
              </span>
            </div>

            {/* Configuración de Webhook */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                    Webhook Oficial de Recepción en Tiempo Real
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Endpoint de alta disponibilidad para recibir mensajes y estados de lectura
                    (entregado/leído).
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Activo
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={datos.webhookUrl}
                  className="min-h-[44px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                />
                <button
                  type="button"
                  onClick={handleCopiarWebhook}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {copiadoWebhook ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-neutral-500" />
                      <span>Copiar URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Estado No Conectado con Pasos Claros */
          <div
            data-testid="estado-whatsapp-no-conectado"
            className="mt-6 space-y-4 border-t border-neutral-100 pt-6 dark:border-neutral-800"
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Tu agencia aún no tiene una línea oficial de WhatsApp conectada
                  </h3>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    Para enviar cotizaciones oficiales y recibir chats directamente en la bandeja,
                    sigue estos 3 pasos de vinculación:
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  1
                </span>
                <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
                  Línea Telefónica Limpia
                </h4>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Disponer de un número que no esté registrado en la aplicación WhatsApp móvil
                  regular.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  2
                </span>
                <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
                  Meta Business Suite
                </h4>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Tener acceso de administrador a la cuenta comercial de tu agencia y verificación
                  con RUT.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-100 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  3
                </span>
                <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
                  Vincular con ViajaPro
                </h4>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Configura el webhook oficial y el token permanente cifrado a través de soporte
                  técnico.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sección Didáctica: La Ventana de 24 Horas Explicada para Agencias */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              ¿Cómo Funciona la Ventana de 24 Horas de WhatsApp?
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Guía práctica en lenguaje de agencia de viajes (sin tecnicismos de Meta)
            </p>
          </div>
        </div>

        {/* Comparativa de los dos estados */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Caso 1: Ventana Abierta */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                  VENTANA ABIERTA
                </span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  0 a 24 horas
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                Conversación Libre con el Viajero
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                Se activa cada vez que un cliente te envía un mensaje. Durante 24 horas, tus
                asesores pueden chatear con total libertad.
              </p>

              <ul className="mt-3 space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>Envío de cotizaciones personalizadas</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>Envío de itinerarios, fotos y notas de voz</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>Sin costo adicional por mensaje individual</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-white/80 p-3 text-[11px] text-emerald-900 dark:bg-neutral-900/60 dark:text-emerald-200">
              💡 <strong>Consejo para asesores:</strong> Si respondes dentro de los primeros 15
              minutos (SLA de la agencia), mantienes la conversación viva y aceleras la decisión de
              compra.
            </div>
          </div>

          {/* Caso 2: Ventana Cerrada */}
          <div className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                  VENTANA CERRADA
                </span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Más de 24 horas
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                Requiere Plantilla Aprobada (HSM)
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                Si pasan más de 24 horas sin que el cliente responda, WhatsApp bloquea el envío de
                texto libre para proteger al usuario de mensajes no deseados.
              </p>

              <ul className="mt-3 space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>Solo se pueden enviar plantillas pre-autorizadas</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>Al recibir respuesta, se reabre la ventana por 24 h</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>Protege la línea de denuncias y bloqueos</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-white/80 p-3 text-[11px] text-amber-900 dark:bg-neutral-900/60 dark:text-amber-200">
              📌 <strong>Regla de oro:</strong> Usa plantillas de utilidad («Seguimiento de
              cotización» o «Recordatorio de salida») para reenganchar al viajero de forma natural.
            </div>
          </div>
        </div>

        {/* 3. Simulador Interactivo de Ventana 24h */}
        <div
          data-testid="simulador-ventana-24h"
          className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5 dark:border-neutral-800 dark:bg-neutral-800/40"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                Simulador de Ventana de Atención
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Selecciona cuánto tiempo ha pasado desde el último mensaje del viajero:
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHorasSimuladas(2)}
                className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  horasSimuladas === 2
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'border border-neutral-300 bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                Hace 2 horas (Reciente)
              </button>
              <button
                type="button"
                onClick={() => setHorasSimuladas(18)}
                className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  horasSimuladas === 18
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'border border-neutral-300 bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                Hace 18 horas (Por vencer)
              </button>
              <button
                type="button"
                onClick={() => setHorasSimuladas(26)}
                className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  horasSimuladas === 26
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'border border-neutral-300 bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                }`}
              >
                Hace 26 horas (Vencida)
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-900 dark:text-white">
                {simulacionVentana.etiquetaEstado}
              </span>
              <span className="font-mono text-[11px] text-neutral-500">
                {simulacionVentana.minutosRestantes > 0
                  ? `${simulacionVentana.horasRestantes}h restantes`
                  : 'Cerrada'}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className={`h-full transition-all duration-300 ${
                  simulacionVentana.abierta
                    ? simulacionVentana.minutosRestantes > 360
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${100 - simulacionVentana.porcentajeTranscurrido}%` }}
              />
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              {simulacionVentana.explicacionAgencia}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Plantillas Pre-Aprobadas Oficiales para la Agencia */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Plantillas Oficiales de Reenganche (HSM)
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Plantillas pre-autorizadas para reabrir conversaciones cuando la ventana libre de 24
              horas ha vencido
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            {PLANTILLAS_OFICIALES_AGENCIA.length} Aprobadas
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANTILLAS_OFICIALES_AGENCIA.map((plantilla) => (
            <div
              key={plantilla.id}
              className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 uppercase dark:bg-neutral-800 dark:text-neutral-300">
                    {plantilla.categoria}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Lista para usar
                  </span>
                </div>

                <h3 className="mt-2 text-xs font-bold text-neutral-900 dark:text-white">
                  {plantilla.nombreVisible}
                </h3>

                <div className="mt-2.5 rounded-xl bg-neutral-50 p-3 font-mono text-[11px] leading-relaxed text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200">
                  «{plantilla.ejemploTexto}»
                </div>
              </div>

              <div className="mt-3 border-t border-neutral-100 pt-2 text-[10px] text-neutral-500 dark:border-neutral-800">
                <strong>Cuándo usarla:</strong> {plantilla.finalidadAgencia}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
