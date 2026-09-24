# Leitor minimo de .xlsx sem dependencias (sem Excel/Python/openpyxl) --
# extrai cada planilha como texto delimitado por tabulacao, usando apenas
# System.IO.Compression (.NET) para abrir o .xlsx como ZIP e parsear o XML.
# Uso: pwsh -File scripts/read-xlsx.ps1 -Path "arquivo.xlsx" -OutDir "pasta_saida" -MaxRows 40
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [int]$MaxRows = 40
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zip = [System.IO.Compression.ZipFile]::OpenRead($Path)

function Get-EntryXml($zip, $entryName) {
  $entry = $zip.GetEntry($entryName)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  $content = $reader.ReadToEnd()
  $reader.Close()
  return [xml]$content
}

# 1) Shared strings (a maioria dos textos de celula fica aqui, referenciada por indice)
$sstXml = Get-EntryXml $zip "xl/sharedStrings.xml"
$sharedStrings = @()
if ($sstXml) {
  $ns = New-Object System.Xml.XmlNamespaceManager($sstXml.NameTable)
  $ns.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  foreach ($si in $sstXml.SelectNodes("//s:si", $ns)) {
    $text = ($si.InnerText)
    $sharedStrings += $text
  }
}

# 2) Nomes das planilhas (workbook.xml) e seus arquivos internos (workbook.xml.rels)
$wbXml = Get-EntryXml $zip "xl/workbook.xml"
$relsXml = Get-EntryXml $zip "xl/_rels/workbook.xml.rels"
$ns2 = New-Object System.Xml.XmlNamespaceManager($wbXml.NameTable)
$ns2.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
$ns2.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

$sheets = @()
foreach ($sheet in $wbXml.SelectNodes("//s:sheets/s:sheet", $ns2)) {
  $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
  $sheets += [PSCustomObject]@{ Name = $sheet.name; RId = $rid }
}

function Resolve-Target($relsXml, $rid) {
  foreach ($rel in $relsXml.Relationships.Relationship) {
    if ($rel.Id -eq $rid) { return $rel.Target }
  }
  return $null
}

function Col-ToIndex($colLetters) {
  $idx = 0
  foreach ($c in $colLetters.ToCharArray()) {
    $idx = $idx * 26 + ([int][char]$c - [int][char]'A' + 1)
  }
  return $idx
}

Write-Host "Arquivo: $Path"
Write-Host "Planilhas encontradas: $($sheets.Name -join ', ')"
Write-Host ""

foreach ($s in $sheets) {
  $target = Resolve-Target $relsXml $s.RId
  $entryPath = "xl/" + $target.TrimStart("/")
  $sheetXml = Get-EntryXml $zip $entryPath
  if (-not $sheetXml) { continue }

  $nsS = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
  $nsS.AddNamespace("s", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  $rows = $sheetXml.SelectNodes("//s:sheetData/s:row", $nsS)
  $outLines = @()
  $rowCount = 0
  foreach ($row in $rows) {
    if ($rowCount -ge $MaxRows) { break }
    $cellsByCol = @{}
    $maxCol = 0
    foreach ($c in $row.c) {
      if (-not $c.r) { continue }
      $colLetters = ($c.r -replace '[0-9]', '')
      $colIdx = Col-ToIndex $colLetters
      if ($colIdx -gt $maxCol) { $maxCol = $colIdx }
      $val = $null
      if ($c.t -eq "s") {
        $ssIdx = [int]$c.v
        $val = $sharedStrings[$ssIdx]
      } elseif ($c.t -eq "inlineStr") {
        $val = $c.is.t
      } else {
        $val = $c.v
      }
      $cellsByCol[$colIdx] = $val
    }
    $lineVals = @()
    for ($i = 1; $i -le $maxCol; $i++) {
      $lineVals += , $(if ($cellsByCol.ContainsKey($i)) { $cellsByCol[$i] } else { "" })
    }
    $outLines += ($lineVals -join "`t")
    $rowCount++
  }

  $outFile = Join-Path $OutDir (($s.Name -replace '[\\/:*?"<>|]', '_') + ".txt")
  $outLines -join "`r`n" | Out-File -FilePath $outFile -Encoding utf8
  Write-Host "Planilha '$($s.Name)': $rowCount linha(s) (de no maximo $MaxRows) salvas em $outFile"
}

$zip.Dispose()
