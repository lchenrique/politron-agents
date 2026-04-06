$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "Testing electron..."

$electronPath = "D:\projetos pessoais\politron\apps\desktop\node_modules\electron\dist\electron.exe"

if (Test-Path $electronPath) {
    Write-Host "Electron exists at: $electronPath"
    $fileInfo = Get-Item $electronPath
    Write-Host "Size: $($fileInfo.Length) bytes"
    Write-Host "Last modified: $($fileInfo.LastWriteTime)"
} else {
    Write-Host "Electron NOT found!"
    exit 1
}

Write-Host "`nTrying to spawn electron..."

try {
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = $electronPath
    $process.StartInfo.Arguments = "--version"
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.CreateNoWindow = $true

    $process.Start() | Out-Null

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()

    $process.WaitForExit()

    Write-Host "Exit code: $($process.ExitCode)"
    Write-Host "STDOUT: $stdout"
    Write-Host "STDERR: $stderr"
} catch {
    Write-Host "Exception: $_"
    Write-Host "InnerException: $($_.Exception.Message)"
}

Write-Host "`nDone."