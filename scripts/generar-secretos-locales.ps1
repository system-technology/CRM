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
    [switch] $Forzar
)

$ErrorActionPreference = 'Stop'

# Nombre -> bytes de entropia. 32 bytes = 256 bits, que es lo que piden HMAC-SHA256 y AES-256.
$secretos = @{
    'WHATSAPP_DIRECTORY_PEPPER' = 32
    'WEBHOOK_PAYLOAD_KEY'       = 32
}

$raiz = (git rev-parse --show-toplevel 2>$null)
if (-not $raiz) { throw 'Esto no es un repositorio git.' }

$arboles = git worktree list --porcelain |
    Where-Object { $_ -like 'worktree *' } |
    ForEach-Object { ($_ -replace '^worktree ', '') -replace '/', '\' } |
    Where-Object { Test-Path (Join-Path $_ '.env') }

if (-not $arboles) { throw 'Ningun arbol de trabajo tiene .env.' }

Write-Host 'Arboles con .env:' -ForegroundColor Cyan
$arboles | ForEach-Object { Write-Host "  $_" }

# ---------------------------------------------------------------------------
# Que falta, mirando el PRIMER arbol como referencia
# ---------------------------------------------------------------------------
$referencia = Join-Path $arboles[0] '.env'
$textoRef = Get-Content -LiteralPath $referencia -Raw

$generados = @{}
$conservados = @()

foreach ($nombre in $secretos.Keys) {
    $yaTiene = $textoRef -match "(?m)^$nombre=.+$"

    if ($yaTiene -and -not $Forzar) {
        $conservados += $nombre
        continue
    }

    # `RandomNumberGenerator.Fill` es de .NET Core; Windows PowerShell 5.1 trae .NET Framework
    # y no lo tiene. `RNGCryptoServiceProvider` existe en los dos y es igual de criptografico
    # — lo que NO vale aqui es `Get-Random`, que no sirve para material de clave.
    $bytes = [byte[]]::new($secretos[$nombre])
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generador.GetBytes($bytes) } finally { $generador.Dispose() }
    # Hexadecimal, no base64: evita los caracteres que complican un archivo .env o una URL.
    $generados[$nombre] = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

if ($conservados) {
    Write-Host ''
    Write-Host 'Ya tenian valor y NO se tocan:' -ForegroundColor Yellow
    $conservados | ForEach-Object { Write-Host "  $_" }
    Write-Host '  (regenerarlos deja ilegible lo cifrado y huerfano el directorio;' -ForegroundColor DarkGray
    Write-Host '   para rotar de verdad hace falta ventana de dos valores, no -Forzar a secas)' -ForegroundColor DarkGray
}

if (-not $generados.Count) {
    Write-Host ''
    Write-Host 'No habia nada que generar.' -ForegroundColor Green
    exit 0
}

# ---------------------------------------------------------------------------
# Escribir en cada .env
# ---------------------------------------------------------------------------
Write-Host ''
foreach ($arbol in $arboles) {
    $ruta = Join-Path $arbol '.env'
    Copy-Item -LiteralPath $ruta -Destination "$ruta.bak" -Force

    $lineas = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $ruta)

    foreach ($nombre in $generados.Keys) {
        $indice = -1
        for ($i = 0; $i -lt $lineas.Count; $i++) {
            if ($lineas[$i].TrimStart().StartsWith("$nombre=")) { $indice = $i; break }
        }
        if ($indice -ge 0) {
            $lineas[$indice] = "$nombre=$($generados[$nombre])"
        } else {
            $lineas.Add("$nombre=$($generados[$nombre])")
        }
    }

    Set-Content -LiteralPath $ruta -Value $lineas -Encoding utf8
    Write-Host "  $ruta  ->  $($generados.Count) secretos escritos" -ForegroundColor Green
}

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
