# 2026-10-13 — El veinte por ciento tiene dos lecturas

El propietario dio dos instrucciones en una línea: que el ADR-0009 fuera paramétrico, porque estas
agencias de turismo no todas trabajan igual, y que el precio sale del tarifario neto del mayorista
con un margen del 20 %.

La primera retiró la última premisa que le quedaba al ADR. La segunda parecía cerrar un hueco y
abrió uno más interesante.

## Lo que estaba mal encuadrado

El ADR venía arrastrando una pregunta mal planteada: ¿la agencia vende **salidas con fecha** o
**paquetes con fecha abierta**? De ahí salía la opción B —la salida asciende a unidad de venta— y de
ahí salía que la opción C —las dos conviviendo, con un discriminador por tenant— se descartara, con
razón, por duplicar el cotizador entero antes de tener una segunda agencia.

La instrucción del propietario obligaba a reabrir eso, y al reabrirlo apareció que **no son dos
modelos**. Son dos valores de un eje:

> Una tarifa es un precio válido para una **ventana de fechas de salida**. Una salida programada es
> la ventana de **un solo día**, publicada. Una vigencia abierta es la ventana de un rango.

Con ese encuadre, `Temporada` no se retira: se generaliza. La salida deja de ser un modelo rival y
pasa a ser su caso degenerado. Y lo que importa de verdad: **hay una sola función de resolución de
tarifa**, una sola superficie de prueba y una sola forma de equivocarse. Es lo paramétrico que el
propietario pidió sin el precio que la opción C cobraba.

El límite quedó escrito en el propio ADR, porque es donde esto se puede torcer: `modoDeCatalogo`
afecta a las **altas** y a la interfaz, **nunca al cálculo**. El día que una ruta de cotización
ramifique sobre él, nos habremos vuelto C sin haberlo decidido.

## Lo que la segunda instrucción destapó

«Margen del 20 %» parecía una multiplicación. Tiene dos lecturas, y las dos se oyen a diario en una
agencia:

| Lectura | Cómo se dice | Sobre un neto de $1.000.000 |
|---|---|---|
| Markup, sobre el neto | «le subo el 20 %» | venta **$1.200.000** |
| Comisión, sobre la venta | «me deja el 20 %» | venta **$1.250.000** |

**Cincuenta mil pesos por silla.** En un bus de cuarenta, dos millones por salida.

Lo cómodo era elegir una y seguir. Eso es exactamente el patrón que ya nos ha costado caro otras
veces: el respaldo cómodo es el agujero. Así que la base es un campo con valor por defecto
—`SOBRE_EL_NETO`, que es la lectura más frecuente en agencia minorista colombiana—, **declarado en
el ADR como suposición nuestra y no como dato del propietario**, y confirmarlo o cambiarlo es una
palabra suya y un campo de una tabla. Ni una línea de código.

## Qué se construyó con el ADR sin firmar, y por qué se podía

De los tres ejes, solo el segundo. ADR-0006 ya había puesto el *markup* en el nivel 1 de
configurabilidad por tenant, en v1: la agencia necesita declarar su margen cuelgue la tarifa de
donde cuelgue. Los ejes 1 y 3 no se tocaron, porque esos sí dependen de que exista `Vigencia`.

`calcularVenta`, `derivarNeto`, `calcularMargen` y `redondearA`, aritmética pura en
`packages/domain`, con su espejo Zod en `packages/contracts`. El valor por defecto vive en **un solo
sitio**: el contrato valida la forma y no repite el «20», para que no haya dos fuentes del mismo
número separándose con el tiempo.

Dos decisiones que merecen quedar escritas:

**Una tarifa sin neto cargado reporta margen `null`, no cero.** Decir «margen $0» afirmaría que
vendemos a precio de costo. La verdad es que no lo sabemos, y mientras esperamos el tarifario del
mayorista eso es lo único honesto que se puede enseñar.

**Se redondea la venta, nunca el neto.** El neto es lo que cobra el mayorista y no es nuestro para
redondearlo. El redondeo existe porque ninguna hoja colombiana publica $1.236.432.

## Lo que esto desbloquea, con su asterisco

Seguimos sin la hoja de netos del mayorista —es la tarea 2 de la cola desde el día 7—. Lo que
tenemos son precios de venta al público. `derivarNeto` permite que la semilla lleve un neto
coherente con el margen declarado, `venta ÷ 1,20`, **marcado como derivado**. Sirve para la
demostración; no es el dato del mayorista y no debe enseñarse como tal.

## Las compuertas

`lint`, `typecheck`, `test`, `build`, `format:check`: las cinco, ejecutadas, en verde. 20 pruebas
nuevas, 280 en el monorepo.

El `typecheck` de la web dio primero un rojo **falso**: un `.next/types` viejo apuntaba a una
pantalla que solo existe en la rama de Antigravity. Es la tarea 13 de la cola —la carrera de
`turbo` entre `build` y `typecheck`—, ya documentada el día 11. Conviene anotar que **sigue
cobrando peaje**: es la segunda vez esta semana que un artefacto viejo produce un color que no
corresponde al código. La primera fue un `dist` de contratos que escondió catorce errores.
