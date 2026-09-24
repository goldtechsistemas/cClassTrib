# Converte a tabela NCM oficial completa (JSON do Siscomex/Receita Federal,
# fornecida pelo usuario) em um arquivo js/ncm-tabela.js compacto, pronto
# para ser carregado via <script src> (sem fetch, sem servidor obrigatorio).
#
# Uso: pwsh -File scripts/transformar-tabela-ncm.ps1 -Origem "caminho\para\Tabela_NCM_Vigente_*.json"
param(
  [Parameter(Mandatory=$true)][string]$Origem,
  [string]$Destino = (Join-Path $PSScriptRoot "..\js\ncm-tabela.js")
)

$ErrorActionPreference = "Stop"
Write-Host "Lendo $Origem..."
$json = Get-Content -Raw -Encoding UTF8 $Origem | ConvertFrom-Json

Write-Host "Total de nomenclaturas na fonte: $($json.Nomenclaturas.Count)"

function LimparDescricao($texto) {
  if (-not $texto) { return "" }
  # Remove marcacao HTML (ex.: <i>nome cientifico</i>) que vem na fonte oficial.
  $t = [regex]::Replace($texto, '<[^>]+>', '')
  $t = $t.Trim()
  return $t
}

$itens = New-Object System.Collections.Generic.List[PSObject]
foreach ($n in $json.Nomenclaturas) {
  if ($n.Data_Fim -ne "31/12/9999") { continue } # pula codigos ja revogados/substituidos
  $codigo = $n.Codigo
  $descricao = LimparDescricao $n.Descricao
  if (-not $descricao) { continue }
  $completo = $codigo -match '^\d{4}\.\d{2}\.\d{2}$'
  $itens.Add([PSCustomObject]@{
    c = $codigo
    d = $descricao
    f = [bool]$completo
  })
}

Write-Host "Itens vigentes com descricao: $($itens.Count)"

# A tabela oficial descreve cada nivel hierarquico so pela DIFERENCA em
# relacao ao pai (ex.: "10.06 Arroz." -> "1006.10 - Arroz com casca" ->
# "1006.10.10 Para semeadura") -- o codigo completo ("1006.10.10") sozinho
# nao menciona "arroz" em lugar nenhum. Para a busca funcionar de verdade,
# reconstruimos o "caminho" hierarquico (breadcrumb) de cada item somando
# a descricao de todos os ancestrais, na ordem em que aparecem no arquivo
# (que ja vem em ordem hierarquica/sequencial). O numero de digitos do
# codigo (sem pontos) indica a profundidade; ancestrais sao os itens
# anteriores na pilha com MENOS digitos que o item atual.
Write-Host "Reconstruindo contexto hierarquico (breadcrumb) para a busca..."
$pilha = New-Object System.Collections.Generic.List[PSObject]
foreach ($it in $itens) {
  $digitos = ($it.c -replace '[^\d]', '').Length
  while ($pilha.Count -gt 0 -and $pilha[$pilha.Count - 1].digitos -ge $digitos) {
    $pilha.RemoveAt($pilha.Count - 1)
  }
  $textoAncestral = ($pilha | ForEach-Object { $_.texto }) -join " "
  $textoBusca = if ($textoAncestral) { "$textoAncestral $($it.d)" } else { $it.d }
  Add-Member -InputObject $it -MemberType NoteProperty -Name "b" -Value $textoBusca
  $pilha.Add([PSCustomObject]@{ digitos = $digitos; texto = $it.d })
}

# Serializa manualmente (mais compacto e previsivel que ConvertTo-Json para
# um array grande) como um array de arrays
# [codigo, descricaoExibida, completo(0/1), textoBusca] para reduzir o
# tamanho do arquivo final. textoBusca so e diferente de descricaoExibida
# quando o item tem ancestrais (a imensa maioria) -- nesse caso omitimos
# textoBusca do array (fica null) quando os dois sao iguais, pra nao
# duplicar texto a toa.
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("/*")
[void]$sb.AppendLine(" * Tabela NCM oficial completa (Siscomex / Receita Federal).")
[void]$sb.AppendLine(" * FONTE: arquivo fornecido pelo usuario em $(Get-Date -Format 'yyyy-MM-dd') —")
[void]$sb.AppendLine(" * `"$($json.Data_Ultima_Atualizacao_NCM)`", ato normativo: $($json.Ato).")
[void]$sb.AppendLine(" * Contém apenas códigos vigentes (Data_Fim = 31/12/9999). Cada item é")
[void]$sb.AppendLine(" * [codigo, descricaoExibida, ehCodigoCompleto, textoBusca?] —")
[void]$sb.AppendLine(" * ehCodigoCompleto=true para os códigos NCM completos (8 dígitos, padrão")
[void]$sb.AppendLine(" * NNNN.NN.NN); false para capítulos/posições/subposições (níveis mais amplos,")
[void]$sb.AppendLine(" * contexto mas não declaráveis). textoBusca (4º elemento, omitido quando é")
[void]$sb.AppendLine(" * igual à descrição) é o texto usado para BUSCAR — inclui a descrição de")
[void]$sb.AppendLine(" * todos os ancestrais na hierarquia, porque a tabela oficial só descreve")
[void]$sb.AppendLine(" * cada nível pela diferença em relação ao pai (ex.: o item completo")
[void]$sb.AppendLine(" * '1006.10.10' só diz 'Para semeadura', sem repetir 'Arroz'). Use SEMPRE")
[void]$sb.AppendLine(" * textoBusca||descricaoExibida para buscar, e descricaoExibida para exibir.")
[void]$sb.AppendLine(" */")
[void]$sb.Append("window.NCM_TABELA_META = ")
[void]$sb.Append(([PSCustomObject]@{
  fonte = "Siscomex / Receita Federal (arquivo fornecido pelo usuário)"
  vigenciaTexto = $json.Data_Ultima_Atualizacao_NCM
  ato = $json.Ato
  totalItens = $itens.Count
} | ConvertTo-Json -Compress))
[void]$sb.AppendLine(";")
[void]$sb.Append("window.NCM_TABELA = [")

function EscapeJs($s) {
  return ($s -replace '\\','\\\\' -replace '"','\"')
}

$partes = New-Object System.Collections.Generic.List[string]
foreach ($it in $itens) {
  $c = EscapeJs $it.c
  $d = EscapeJs $it.d
  $f = if ($it.f) { 1 } else { 0 }
  if ($it.b -and $it.b -ne $it.d) {
    $b = EscapeJs $it.b
    $partes.Add("[`"$c`",`"$d`",$f,`"$b`"]")
  } else {
    $partes.Add("[`"$c`",`"$d`",$f]")
  }
}
[void]$sb.Append([string]::Join(",", $partes))
[void]$sb.AppendLine("];")

[System.IO.File]::WriteAllText($Destino, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
$tamanho = (Get-Item $Destino).Length / 1KB
Write-Host ("Escrito {0} ({1:N0} KB, {2} itens)" -f $Destino, $tamanho, $itens.Count)
