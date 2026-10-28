# Divulgación responsable de vulnerabilidades

| Campo | Valor |
|---|---|
| Versión | 0.1, borrador |
| Fecha | 2026-10-27 |
| Estado | **Pendiente de aprobación del propietario.** El texto público vive en [`SECURITY.md`](../../SECURITY.md) en la raíz |
| Responsable | Propietario (recibe y responde); `auditor-seguridad` (triaje técnico) |

## 1. Alcance

Informes de seguridad que llegan **desde fuera** del proyecto sobre el repositorio público
`system-technology/CRM` o sobre los servicios de ViajaPro cuando existan. `SECURITY.md` es la versión
pública; este documento es el procedimiento interno.

## 2. Reglas

| # | Regla |
|---|---|
| DR1 | Un solo canal privado de entrada. **Nunca** se pide ni se acepta un informe en un issue o PR públicos; si llega así, se oculta el contenido y se mueve al canal privado |
| DR2 | Acuse de recibo en **3 días hábiles**; evaluación inicial en **10 días hábiles** (plazos propuestos en `SECURITY.md`) |
| DR3 | El triaje usa la severidad de [09-respuesta-a-incidentes.md §2](09-respuesta-a-incidentes.md). Si el informe revela un incidente real, se abre el procedimiento de incidentes |
| DR4 | Puerto seguro: no se emprenden acciones legales contra quien investigue de buena fe dentro de las reglas de `SECURITY.md` |
| DR5 | **Sin recompensa económica** mientras no se decida lo contrario. Se ofrece reconocimiento público si el investigador lo desea |
| DR6 | La corrección entra por el flujo normal (PR con las compuertas); el aviso público se publica cuando la corrección esté desplegada |

## 3. Cómo se comprueba

- `SECURITY.md` existe en la raíz y GitHub lo muestra en la pestaña *Security* del repositorio.
- Una vez al año, el propietario envía un informe de prueba al canal y comprueba que llega.

## 4. Estado real hoy (2026-10-27)

- **El canal de contacto no existe:** `SECURITY.md` usa el marcador `seguridad@<dominio-por-definir>`
  porque el dominio aún no se ha comprado (ADR-0012, ADR-0013). **Hasta que exista, el único canal
  operativo posible es el reporte privado de vulnerabilidades de GitHub**, y **no está verificado**
  que esté activado en el repositorio (Settings → Code security → *Private vulnerability
  reporting*). Lo activa el propietario.
- No hay servicio desplegado: hoy solo el código está en alcance.
- No se ha hecho la prueba anual del canal.
