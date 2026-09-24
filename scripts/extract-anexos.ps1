# Baixa o texto oficial da LC 214/2025 do Planalto e fatia os Anexos I-XVII
# em arquivos de texto individuais, para facilitar a atualização de js/data.js
# quando a lei for alterada. Não depende de Node/Python — apenas PowerShell.
#
# Uso: pwsh -File scripts/extract-anexos.ps1
#
# IMPORTANTE: os limites (offsets) de cada Anexo no array $bounds abaixo foram
# calculados manualmente para a versão da lei consolidada em 2026-09-12. Se o
# texto da lei mudar de tamanho (novos parágrafos antes dos Anexos, etc.), os
# offsets vão mudar e este script vai fatiar nos lugares errados. Nesse caso,
# rode a Etapa 1 (buscar `^\s*ANEXO\s+([IVXL]+)\s*$` no texto simples) para
# recalcular os offsets antes de fatiar.

$ErrorActionPreference = "Stop"
$outDir = Join-Path $PSScriptRoot "..\data\raw"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Baixando LC 214/2025 do Planalto..."
$resp = Invoke-WebRequest -Uri "https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm" `
  -UseBasicParsing -TimeoutSec 30 -Headers @{"User-Agent"="Mozilla/5.0"}
$bytes = $resp.RawContentStream.ToArray()

# O Planalto publica em Windows-1252 (não UTF-8) apesar de não declarar charset.
$enc = [System.Text.Encoding]::GetEncoding(1252)
$html = $enc.GetString($bytes)

# HTML -> texto simples, preservando quebras de linha/células de tabela.
$text = [regex]::Replace($html, '(?is)<script.*?</script>', '')
$text = [regex]::Replace($text, '(?is)<style.*?</style>', '')
$text = [regex]::Replace($text, '(?i)<br\s*/?>', "`n")
$text = [regex]::Replace($text, '(?i)</p>', "`n")
$text = [regex]::Replace($text, '(?i)</tr>', "`n")
$text = [regex]::Replace($text, '(?i)</td>', " | ")
$plain = [regex]::Replace($text, '<[^>]+>', '')
$plain = $plain -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"'
$plain = [regex]::Replace($plain, '[ \t]+', ' ')
$plain = [regex]::Replace($plain, '(\r?\n){3,}', "`n`n")

$plainPath = Join-Path $outDir "lcp214_plain.txt"
[System.IO.File]::WriteAllText($plainPath, $plain, [System.Text.Encoding]::UTF8)
Write-Host "Texto simples salvo em $plainPath ($($plain.Length) caracteres)"

Write-Host "`nOcorrências de 'ANEXO <romano>' encontradas (confira se ainda bate com `$bounds abaixo):"
$pattern = '(?m)^\s*ANEXO\s+([IVXL]+)\s*$'
[regex]::Matches($plain, $pattern) | ForEach-Object {
  Write-Host ("  {0,8}  ANEXO {1}" -f $_.Index, $_.Groups[1].Value)
}

# Offsets válidos para a versão consolidada em 2026-09-12. Ajuste se a busca
# acima mostrar posições diferentes (ex.: apos uma nova alteração legislativa).
$bounds = [ordered]@{
  "I" = 902925; "II" = 908175; "III" = 909589; "IV" = 912622; "V" = 924694
  "VI" = 929309; "VII" = 936018; "VIII" = 939468; "IX" = 940412; "X" = 949055
  "XI" = 957408; "XII" = 964293; "XIII" = 967026; "XIV" = 968320; "XV" = 997386
  "XVI" = 998505; "XVII" = 1000715; "END" = 1001921
}

$anexosDir = Join-Path $outDir "anexos"
New-Item -ItemType Directory -Force -Path $anexosDir | Out-Null
$keys = @($bounds.Keys)
for ($i = 0; $i -lt $keys.Count - 1; $i++) {
  $k = $keys[$i]
  $start = $bounds[$k]
  $end = $bounds[$keys[$i + 1]]
  if ($start -ge $plain.Length -or $end -gt $plain.Length -or $start -ge $end) {
    Write-Warning "Offsets de ANEXO $k parecem desatualizados (start=$start, end=$end, len=$($plain.Length)). Recalcule antes de usar."
    continue
  }
  $chunk = $plain.Substring($start, $end - $start)
  $outFile = Join-Path $anexosDir "anexo_$k.txt"
  [System.IO.File]::WriteAllText($outFile, $chunk, [System.Text.Encoding]::UTF8)
  Write-Host "  anexo_$k.txt escrito ($($chunk.Length) caracteres)"
}

Write-Host "`nPronto. Revise os arquivos em $anexosDir e atualize js/data.js manualmente."
