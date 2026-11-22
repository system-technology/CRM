# Fotos del panel de ingreso: procedencia y licencia

Paquete estándar de ViajaPro (T-620). Todas vienen de Wikimedia Commons, con licencia **CC0 /
dominio público**: uso comercial permitido y **sin atribución obligatoria**. Se anota igualmente
quién las hizo y dónde están, por trazabilidad. Comprobado el 2026-11-22 contra los metadatos de
Commons (`LicenseShortName`).

Los ficheros de aquí son derivados (recortados a cuadrado, reducidos y recomprimidos en AVIF y
WebP, sin metadatos EXIF). Los originales no están en el repositorio.

| Fichero | Destino | Original en Wikimedia Commons | Autor | Licencia |
|---|---|---|---|---|
| `cartagena.{avif,webp}` | Cartagena | `File:View of Cartagena, Colombia. Pixabay 3529030.jpg` | Makalu (Pixabay) | CC0 (Commons) |
| `santa-marta.{avif,webp}` | Santa Marta (Taganga) | `File:Taganga, Santa Marta, Colombia, en julio de 2016 por Sergio Ortiz (Unsplash).jpg` | Sergio Ortiz (Unsplash) | CC0 |
| `barranquilla.{avif,webp}` | Barranquilla (río Magdalena) | `File:El Santuario de las Garzas.jpg` | MelyC43 | CC0 |
| `baru.{avif,webp}` | Barú | `File:Playas de Barú.jpg` | Project5443 | CC0 |

Los originales están en `https://commons.wikimedia.org/wiki/File:<nombre>`.

## Qué NO está comprobado

- Commons confirma que quien subió cada foto la declaró CC0; **no podemos verificar** que fuera
  su autor. Es el mismo riesgo de cualquier banco de imágenes libre.
- No hay personas identificables en ninguna (se descartó una foto de Cartagena por tener una mujer
  de perfil: la licencia de la foto no cubre el derecho a la propia imagen).

## Fotos que se buscaron y NO se usan

- **Islas del Rosario**: no se encontró ninguna con licencia CC0 / dominio público.
- **Playa Blanca**: la única CC0 hallada (`Day In Playa Blanca.jpg`) es la de Santa Marta, no la de
  Barú; no se usa para no mostrar un lugar por otro.

## Peso

El navegador baja un solo formato por foto (AVIF si lo entiende, si no WebP). Solo se pide la
primera con prioridad; las demás, después. En móvil no se pide ninguna: el panel no existe.

| Foto | Tamaño | AVIF | WebP |
|---|---|---|---|
| `cartagena` | 1280×1280 | 196 KB | 334 KB |
| `santa-marta` | 1280×1280 | 130 KB | 226 KB |
| `barranquilla` | 1280×1280 | 132 KB | 215 KB |
| `baru` | 1200×1200 | 37 KB | 47 KB |

Las cuatro en AVIF suman 495 KB; la primera, 196 KB.
