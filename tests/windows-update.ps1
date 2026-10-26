$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Only run on a disposable Actions runner' }
foreach ($version in @($env:FROM_VERSION, $env:TO_VERSION)) {
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
}
New-Item -ItemType Directory -Force update-evidence | Out-Null
Start-Transcript -Path update-evidence/test.log
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--force-renderer-accessibility'
$base = 'https://github.com/zhang-jincheng/space-dictation/releases'
$manifest = Invoke-RestMethod "$base/latest/download/latest.json"
if ($manifest.version -ne $env:TO_VERSION) { throw 'Expected release is not public latest' }
$oldInstaller = Join-Path $env:RUNNER_TEMP 'old-setup.exe'
Invoke-WebRequest "$base/download/v$env:FROM_VERSION/Space-Dictation_$($env:FROM_VERSION)_Windows-x64-setup.exe" -OutFile $oldInstaller
$installed = Start-Process $oldInstaller -ArgumentList '/S' -PassThru -Wait
if ($installed.ExitCode -ne 0) { throw "Old installer failed: $($installed.ExitCode)" }
$exe = Join-Path $env:LOCALAPPDATA '空格听写\space-dictation.exe'
if (!(Test-Path $exe)) { throw "Missing installed application: $exe" }
function Get-Version { (Get-Item $exe).VersionInfo.ProductVersion }
if (!(Get-Version).StartsWith($env:FROM_VERSION)) { throw 'Wrong initial version' }
function Get-App {
    Get-Process -Name space-dictation -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Select-Object -First 1
}
function Get-Window($appProcess) {
    if (!$appProcess) { return $null }
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$appProcess.Id)
    [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
}
function Find-Named($window, $name) {
    if (!$window) { return $null }
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Save-UI($name) {
    $window = Get-Window (Get-App)
    if ($window) {
        $nodes = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $nodes | ForEach-Object { "$($_.Current.ControlType.ProgrammaticName): $($_.Current.Name)" } | Set-Content "update-evidence/$name.txt"
    }
    try {
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save((Join-Path $PWD "update-evidence/$name.png"))
        $graphics.Dispose(); $bitmap.Dispose()
    } catch { Write-Warning "Screenshot unavailable: $_" }
}
try {
    $first = Start-Process $exe -PassThru
    $db = Join-Path $env:APPDATA 'local.space-dictation\space-dictation.db'
    $deadline = (Get-Date).AddSeconds(60)
    while (!(Test-Path $db) -and (Get-Date) -lt $deadline) { Start-Sleep 1 }
    if (!(Test-Path $db)) { throw 'Old app did not initialize database' }
    Start-Sleep 5
    Stop-Process -Id $first.Id
    Wait-Process -Id $first.Id -ErrorAction SilentlyContinue
    python tests/update-data.py seed
    if ($LASTEXITCODE -ne 0) { throw 'Fixture creation failed' }
    $old = Start-Process $exe -PassThru
    $deadline = (Get-Date).AddSeconds(90)
    $button = $null
    while (!$button -and (Get-Date) -lt $deadline) {
        $button = Find-Named (Get-Window (Get-App)) '立即更新'
        if (!$button) { Start-Sleep 2 }
    }
    Save-UI 'before-update'
    if (!$button) { throw 'Real app did not expose its update confirmation button' }
    $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
    $deadline = (Get-Date).AddMinutes(5)
    $restarted = $null
    while ((Get-Date) -lt $deadline) {
        $candidate = Get-App
        if ($candidate -and $candidate.Id -ne $old.Id -and (Get-Version).StartsWith($env:TO_VERSION)) {
            $window = Get-Window $candidate
            if (Find-Named $window '继续核对') { $restarted = $candidate; break }
        }
        Start-Sleep 2
    }
    Save-UI 'after-update'
    if (!$restarted) { throw 'Update did not install, automatically restart and restore the practice UI' }
    python tests/update-data.py verify
    if ($LASTEXITCODE -ne 0) { throw 'Data preservation failed' }
    [ordered]@{
        result = 'PASS'; from = $env:FROM_VERSION; to = (Get-Version)
        oldProcess = $old.Id; newProcess = $restarted.Id
        realPublishedBinaries = $true; realInAppUpdateButton = $true
        automaticRestart = $true; allTablesAndRecordingPreserved = $true
        windows = [Environment]::OSVersion.VersionString
    } | ConvertTo-Json | Set-Content update-evidence/result.json
    Write-Output 'WINDOWS_UPDATE_PASS'
} finally {
    Save-UI 'final-state'
    Stop-Transcript
}
