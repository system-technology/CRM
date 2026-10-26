# Registra (o quita) las tareas programadas de Windows que mantienen vivo el ciclo autónomo.
#
#   .\scripts\ciclo-instalar.ps1                 instala las dos tareas (backend y frontend)
#   .\scripts\ciclo-instalar.ps1 -Quitar         las elimina
#   .\scripts\ciclo-instalar.ps1 -Repo D:\ruta   checkout desde el que corre el supervisor
#
# Qué hace cada tarea: al iniciar sesión en Windows lanza `node scripts\ciclo.mjs <carril>` en una
# ventana oculta y, si el proceso muere, lo relanza (hasta 3 veces, cada minuto). No necesita
# administrador: corre con tu usuario. El PC tiene que estar encendido y con la sesión iniciada.
#
# Requisitos del checkout (-Repo): en `main` y limpio, con `npm ci` hecho en tools\roadmap-mcp.
# Freno de emergencia: crear el fichero  <sesiones>\STOP  (se reanuda borrándolo).
param(
  [string]$Repo = 'D:\Projects\ViajaPro\VIAJAPRO',
  [switch]$Quitar
)
$ErrorActionPreference = 'Stop'
$carriles = @('backend', 'frontend')

if ($Quitar) {
  foreach ($c in $carriles) {
    $n = "ViajaPro-Ciclo-$c"
    if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; "Quitada: $n" } else { "No existía: $n" }
  }
  return
}

$node = (Get-Command node -ErrorAction Stop).Source
foreach ($f in @('scripts\ciclo.mjs', 'scripts\ciclo.config.json', 'ownership.json')) {
  if (-not (Test-Path (Join-Path $Repo $f))) { throw "Falta $f en $Repo (¿está en main y al día?)" }
}
if (-not (Test-Path (Join-Path $Repo 'tools\roadmap-mcp\node_modules'))) { throw "Falta npm ci en $Repo\tools\roadmap-mcp" }
$rama = (git -C $Repo rev-parse --abbrev-ref HEAD).Trim()
if ($rama -ne 'main') { throw "El checkout $Repo está en '$rama', debe estar en main" }
if ((git -C $Repo status --porcelain)) { throw "El checkout $Repo tiene cambios sin commitear" }

foreach ($c in $carriles) {
  $n = "ViajaPro-Ciclo-$c"
  $accion = New-ScheduledTaskAction -Execute $node -Argument "scripts\ciclo.mjs $c" -WorkingDirectory $Repo
  $disparador = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $n -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal -Force | Out-Null
  "Instalada: $n  ->  $node scripts\ciclo.mjs $c   (en $Repo)"
}
"`nArráncalas ya con:  Start-ScheduledTask -TaskName ViajaPro-Ciclo-backend ; Start-ScheduledTask -TaskName ViajaPro-Ciclo-frontend"
"Estado:  node scripts\ciclo-estado.mjs        Freno:  New-Item D:\Projects\ViajaPro\sesiones\STOP"
