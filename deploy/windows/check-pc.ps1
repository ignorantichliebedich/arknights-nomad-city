$pcCpu = Get-CimInstance Win32_Processor
$pcSystem = Get-CimInstance Win32_ComputerSystem
$pcOs = Get-CimInstance Win32_OperatingSystem

[pscustomobject]@{
    CPU = ($pcCpu.Name -join " / ")
    Cores = ($pcCpu | Measure-Object NumberOfCores -Sum).Sum
    LogicalProcessors = ($pcCpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum
    MemoryGB = [math]::Round($pcSystem.TotalPhysicalMemory / 1GB, 1)
    Windows = $pcOs.Caption
    Version = $pcOs.Version
    Architecture = $pcOs.OSArchitecture
} | Format-List

Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
    Select-Object DeviceID,
        @{Name="SizeGB";Expression={[math]::Round($_.Size / 1GB, 1)}},
        @{Name="FreeGB";Expression={[math]::Round($_.FreeSpace / 1GB, 1)}} |
    Format-Table -AutoSize
