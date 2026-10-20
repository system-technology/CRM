<#
.SYNOPSIS
  Genera los secretos propios del proyecto que faltan y los escribe en todos los .env, sin
  mostrarlos por pantalla.

.DESCRIPTION
  El esquema del ADR-0008 ya se comprometio con dos secretos versionados —la pimienta del
  directorio y la clave del payload— que hasta ahora no existian en ningun sitio. Son NUESTROS:
  se generan aqui, a diferencia del App Secret de Meta, que solo puede sacarlo el propietario
  de su consola.

  **Es idempotente a proposito, y esa es la parte importante.** Si un secreto ya tiene valor,
  NO se toca:

    · Regenerar la pimienta deja huerfano el directorio de enrutamiento: las claves guardadas
      son HMAC con la pimienta anterior y dejan de resolver. Un webhook entrante pasaria a
      "tenant desconocido" y, con la rama de desconocido tal como esta especificada, eso
      **borra el contenido del mensaje**. Rotar una pimienta no es generar una nueva: es un
      procedimiento con ventana de dos valores y reconstruccion, y no es lo que hace este
      script.
    · Regenerar la clave del payload deja ilegible lo cifrado con la anterior.

  Para rotar de verdad, -Forzar, y hay que saber lo que se hace.

.EXAMPLE
  pwsh -File scripts/generar-secretos-locales.ps1
#>

[CmdletBinding()]
param(
    [switch] $Forzar,
    # Solo para pruebas: carpetas con .env en lugar de los arboles de `git worktree list`.
    [string[]] $Carpetas
)

$ErrorActionPreference = 'Stop'

# Nombre -> bytes de entropia. 32 bytes = 256 bits, que es lo que piden HMAC-SHA256 y AES-256.
$secretos = @{
    'WHATSAPP_DIRECTORY_PEPPER' = 32
    'WEBHOOK_PAYLOAD_KEY'       = 32
}

if ($Carpetas) {
    $arboles = @($Carpetas | Where-Object { Test-Path (Join-Path $_ '.env') })
} else {
    $raiz = (git rev-parse --show-toplevel 2>$null)
    if (-not $raiz) { throw 'Esto no es un repositorio git.' }

    $arboles = @(git worktree list --porcelain |
        Where-Object { $_ -like 'worktree *' } |
        ForEach-Object { ($_ -replace '^worktree ', '') -replace '/', '\' } |
        Where-Object { Test-Path (Join-Path $_ '.env') })
}

if (-not $arboles) { throw 'Ningun arbol de trabajo tiene .env.' }

Write-Host 'Arboles con .env:' -ForegroundColor Cyan
$arboles | ForEach-Object { Write-Host "  $_" }

# ---------------------------------------------------------------------------
# Que valor tiene cada secreto en CADA arbol (no solo en el primero)
# ---------------------------------------------------------------------------
# Regla: copiar antes que generar. Si algun arbol ya tiene un valor, ese es el bueno y se copia a
# los que no lo tienen. Si dos arboles tienen valores DISTINTOS no hay forma de saber cual es el
# bueno: se aborta. Solo se genera cuando ningun arbol lo tiene.
function Leer-Valor([string] $texto, [string] $nombre) {
    $m = [regex]::Matches($texto, "(?m)^$nombre=(.+?)\s*$")
    if ($m.Count -eq 0) { return $null }
    return $m[$m.Count - 1].Groups[1].Value   # gana la ultima, igual que al cargar el .env
}

$valorFinal = @{}      # nombre -> valor que debe quedar en todos los arboles
$origen = @{}          # nombre -> 'copiado' | 'generado' | 'conservado'

foreach ($nombre in $secretos.Keys) {
    $porArbol = @{}
    foreach ($arbol in $arboles) {
        $v = Leer-Valor (Get-Content -LiteralPath (Join-Path $arbol '.env') -Raw) $nombre
        if ($v) { $porArbol[$arbol] = $v }
    }
    $distintos = @($porArbol.Values | Sort-Object -Unique)

    if ($distintos.Count -gt 1 -and -not $Forzar) {
        Write-Host ''
        Write-Host "ABORTADO: $nombre tiene valores DISTINTOS entre arboles:" -ForegroundColor Red
        foreach ($arbol in $arboles) {
            $estado = if ($porArbol.ContainsKey($arbol)) { 'tiene valor' } else { 'sin valor' }
            Write-Host "  $arbol  ($estado)"
        }
        Write-Host '  No se sabe cual es el bueno; elegirlo es decision humana. No se escribio nada.' -ForegroundColor Red
        exit 2
    }

    if ($distintos.Count -ge 1 -and -not $Forzar) {
        $valorFinal[$nombre] = $distintos[0]
        $origen[$nombre] = if ($porArbol.Count -eq $arboles.Count) { 'conservado' } else { 'copiado' }
        continue
    }

    # `RandomNumberGenerator.Fill` es de .NET Core; Windows PowerShell 5.1 trae .NET Framework
    # y no lo tiene. `Create().GetBytes` existe en los dos y es igual de criptografico
    # — lo que NO vale aqui es `Get-Random`, que no sirve para material de clave.
    $bytes = [byte[]]::new($secretos[$nombre])
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generador.GetBytes($bytes) } finally { $generador.Dispose() }
    # Hexadecimal, no base64: evita los caracteres que complican un archivo .env o una URL.
    $valorFinal[$nombre] = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    $origen[$nombre] = 'generado'
}

Write-Host ''
foreach ($nombre in $secretos.Keys) {
    $color = switch ($origen[$nombre]) { 'generado' { 'Green' } 'copiado' { 'Cyan' } default { 'Yellow' } }
    Write-Host ("  {0,-28} {1}" -f $nombre, $origen[$nombre]) -ForegroundColor $color
}
Write-Host '  (conservado = ya estaba igual en todos; copiado = se llevo el valor existente a los que' -ForegroundColor DarkGray
Write-Host '   no lo tenian; generado = no lo tenia ninguno. Regenerar deja ilegible lo cifrado y' -ForegroundColor DarkGray
Write-Host '   huerfano el directorio: para rotar de verdad hace falta ventana de dos valores.)' -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# Escribir, solo en los arboles a los que les falta o difiere algo
# ---------------------------------------------------------------------------
Write-Host ''
$escritos = 0
foreach ($arbol in $arboles) {
    $ruta = Join-Path $arbol '.env'
    $texto = Get-Content -LiteralPath $ruta -Raw
    $pendientes = @($valorFinal.Keys | Where-Object { (Leer-Valor $texto $_) -ne $valorFinal[$_] })
    if ($pendientes.Count -eq 0) { continue }

    Copy-Item -LiteralPath $ruta -Destination "$ruta.bak" -Force
    $lineas = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $ruta)

    foreach ($nombre in $pendientes) {
        # Quita TODAS las apariciones (tambien duplicados) y deja una.
        $lineas.RemoveAll([Predicate[string]]{ param($l) $l.TrimStart().StartsWith("$nombre=") }) | Out-Null
        $lineas.Add("$nombre=$($valorFinal[$nombre])")
    }

    Set-Content -LiteralPath $ruta -Value $lineas -Encoding utf8
    Write-Host "  $ruta  ->  $($pendientes.Count) secretos escritos" -ForegroundColor Green
    $escritos++
}
if ($escritos -eq 0) { Write-Host 'No habia nada que escribir.' -ForegroundColor Green }

# ---------------------------------------------------------------------------
# Comprobar, no afirmar
# ---------------------------------------------------------------------------
Write-Host ''
$problemas = 0
foreach ($arbol in $arboles) {
    $texto = Get-Content -LiteralPath (Join-Path $arbol '.env') -Raw
    foreach ($nombre in $secretos.Keys) {
        if ($texto -notmatch "(?m)^$nombre=.{32,}$") {
            Write-Host "  FALTA o es corto: $nombre en $arbol" -ForegroundColor Red
            $problemas++
        }
        if (([regex]::Matches($texto, "(?m)^$nombre=")).Count -gt 1) {
            Write-Host "  $nombre duplicado en $arbol (gana la ultima)" -ForegroundColor Red
            $problemas++
        }
    }
}

if ($problemas -gt 0) { exit 1 }

Write-Host '  Verificado: los secretos estan en todos los .env, sin duplicados.' -ForegroundColor Green
Write-Host ''
Write-Host 'Pendiente, y solo lo puede poner el propietario:' -ForegroundColor Cyan
Write-Host '  META_APP_SECRET  — Configuracion de la app -> Basica -> Mostrar'
Write-Host '  Sin el, el webhook RECHAZA todo lo que llegue, que es el comportamiento correcto.'
