# Extrai apenas colunas especificas (por nome do cabecalho) de uma planilha
# .xlsx, colapsando quebras de linha internas de cada celula em espaco, para
# gerar um TSV compacto e facil de revisar. Depende so de .NET (sem Excel/Python).
# Uso: pwsh -File scripts/read-xlsx-cols.ps1 -Path "arquivo.xlsx" -SheetName "cClass 2026-06-01 Pub" -Columns "CST-IBS/CBS","cClassTrib","Nome cClassTrib" -OutFile "saida.tsv"
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$SheetName,
  [Parameter(Mandatory=$true)][string[]]$Columns,
  [Parameter(Mandatory=$true)][string]$OutFile,
  [int]$MaxRows = 1000
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($Path)

function Get-EntryXml($zip, $entryName) {
  $entry = $zip.GetEntry($entryName)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  $content = $reader.ReadToEnd()
  $reader.Close()
  return [xml]$content
}

$sstXml = Get-EntryXml $zip "xl/sharedStrings.xml"
$sharedStrings = @()
if ($sstXml) {
  $ns = New-Object System.Xml.XmlNamespaceManager($sstXml.NameTable)
  $ns.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  foreach ($si in $sstXml.SelectNodes("//s:si", $ns)) { $sharedStrings += $si.InnerText }
}

$wbXml = Get-EntryXml $zip "xl/workbook.xml"
$relsXml = Get-EntryXml $zip "xl/_rels/workbook.xml.rels"
$ns2 = New-Object System.Xml.XmlNamespaceManager($wbXml.NameTable)
$ns2.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
$ns2.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

$targetSheet = $null
foreach ($sheet in $wbXml.SelectNodes("//s:sheets/s:sheet", $ns2)) {
  if ($sheet.name -eq $SheetName) {
    $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    $targetSheet = $rid
  }
}
if (-not $targetSheet) { throw "Planilha '$SheetName' nao encontrada." }

$target = $null
foreach ($rel in $relsXml.Relationships.Relationship) { if ($rel.Id -eq $targetSheet) { $target = $rel.Target } }
$entryPath = "xl/" + $target.TrimStart("/")
$sheetXml = Get-EntryXml $zip $entryPath
$nsS = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
$nsS.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

function Col-ToIndex($colLetters) {
  $idx = 0
  foreach ($c in $colLetters.ToCharArray()) { $idx = $idx * 26 + ([int][char]$c - [int][char]'A' + 1) }
  return $idx
}

function Get-RowValues($row) {
  $cellsByCol = @{}
  $maxCol = 0
  foreach ($c in $row.c) {
    if (-not $c.r) { continue }
    $colLetters = ($c.r -replace '[0-9]', '')
    $colIdx = Col-ToIndex $colLetters
    if ($colIdx -gt $maxCol) { $maxCol = $colIdx }
    $val = $null
    if ($c.t -eq "s") { $val = $sharedStrings[[int]$c.v] }
    elseif ($c.t -eq "inlineStr") { $val = $c.is.t }
    else { $val = $c.v }
    $cellsByCol[$colIdx] = $val
  }
  return @{ Cells = $cellsByCol; MaxCol = $maxCol }
}

$rows = $sheetXml.SelectNodes("//s:sheetData/s:row", $nsS)
if ($rows.Count -eq 0) { throw "Nenhuma linha encontrada." }

# Cabecalho -> indice de coluna
$headerInfo = Get-RowValues $rows[0]
$headerMap = @{}
for ($i = 1; $i -le $headerInfo.MaxCol; $i++) {
  $h = $headerInfo.Cells[$i]
  if ($h) { $headerMap[$h.Trim()] = $i }
}

$missing = $Columns | Where-Object { -not $headerMap.ContainsKey($_) }
if ($missing) {
  Write-Warning "Colunas nao encontradas: $($missing -join ', ')"
  Write-Warning "Colunas disponiveis: $($headerMap.Keys -join ' | ')"
}

$outLines = @()
$outLines += ($Columns -join "`t")
$rowCount = 0
for ($r = 1; $r -lt $rows.Count -and $rowCount -lt $MaxRows; $r++) {
  $info = Get-RowValues $rows[$r]
  if ($info.MaxCol -eq 0) { continue }
  $vals = foreach ($col in $Columns) {
    $idx = $headerMap[$col]
    $v = if ($idx -and $info.Cells.ContainsKey($idx)) { $info.Cells[$idx] } else { "" }
    ($v -replace "[\r\n]+", " ").Trim()
  }
  $outLines += ($vals -join "`t")
  $rowCount++
}

$outLines -join "`r`n" | Out-File -FilePath $OutFile -Encoding utf8
Write-Host "Escrito $rowCount linha(s) de dados em $OutFile"
$zip.Dispose()
