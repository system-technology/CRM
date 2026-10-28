# Política de seguridad

Gracias por ayudarnos a proteger ViajaPro y los datos de las agencias de turismo y sus viajeros.

## Estado del proyecto

ViajaPro está **en construcción**. No hay ninguna agencia operando con datos reales todavía. El
alcance de un informe hoy es el **código de este repositorio**; los servicios desplegados entrarán
en alcance cuando existan.

## Cómo informar una vulnerabilidad

**No abras un issue, un PR ni una discusión pública.** Usa uno de estos canales privados:

1. **Preferido:** el reporte privado de vulnerabilidades de GitHub, en la pestaña
   **Security → Report a vulnerability** de este repositorio.
2. Correo a **`seguridad@<dominio-por-definir>`**.
   > Marcador: la dirección aún no existe. Se reemplazará cuando el proyecto tenga dominio propio.

Incluye, si puedes:

- Descripción del problema y su impacto (en especial si permite leer o escribir datos de **otra
  agencia**).
- Pasos para reproducirlo, versión o commit afectado.
- Una prueba de concepto mínima.

## Qué puedes esperar

| Paso | Plazo objetivo |
|---|---|
| Acuse de recibo | 3 días hábiles |
| Evaluación inicial y severidad | 10 días hábiles |
| Corrección | Según la severidad; te mantendremos informado |
| Aviso público | Cuando la corrección esté desplegada, coordinado contigo |

Si lo deseas, te reconoceremos públicamente. **No hay programa de recompensas** por ahora.

## Reglas para investigar de buena fe

Dentro de estas reglas no emprenderemos acciones legales contra ti:

- **No accedas, modifiques ni conserves datos que no sean tuyos.** Si te encuentras con datos
  personales de terceros, detente, no los copies y avísanos.
- No hagas pruebas de denegación de servicio, ingeniería social ni ataques físicos.
- No hagas pruebas contra números de WhatsApp, cuentas de Meta ni proveedores de terceros.
- Usa solo cuentas y agencias de prueba creadas por ti en un entorno local.
- Danos un plazo razonable para corregir antes de divulgar.

## Fuera de alcance

- Informes de escáneres automáticos sin una explotación demostrada.
- Ausencia de cabeceras o configuraciones sin un impacto concreto.
- Vulnerabilidades en dependencias ya publicadas sin un camino de explotación en ViajaPro.
- Los datos de demostración del repositorio, que son ficticios.

## Más información

El procedimiento interno está en
[`docs/05-seguridad/11-divulgacion-responsable.md`](docs/05-seguridad/11-divulgacion-responsable.md)
y el resto de políticas en
[`docs/05-seguridad/00-indice-de-politicas.md`](docs/05-seguridad/00-indice-de-politicas.md).
