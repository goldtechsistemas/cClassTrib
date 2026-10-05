// Monta o pedaço "AND ..." do WHERE para filtrar nfe_documentos por período
// de emissão (dataInicio/dataFim, formato YYYY-MM-DD), por emitente/CNPJ
// (busca) e/ou por uma lista específica de chaves de acesso
// (chaves=chave1,chave2,...) — usado tanto na listagem da tela quanto nos
// exports (XML/Excel/PDF respeitam o mesmo filtro que está sendo exibido).

// Os dias do filtro são dias do calendário brasileiro (o que aparece na
// nota), mas o banco guarda dh_emi em UTC: uma nota das 22h de 30/09 em
// Brasília já é 01/10 em UTC. Comparar direto com ::date jogava essas notas
// no dia errado — por isso a meia-noite de cada dia é calculada em
// America/Sao_Paulo.
const FUSO_NOTAS = "America/Sao_Paulo";

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, (c) => "\\" + c);
}

function montarFiltroDocumentos(queryParams, params) {
  const condicoes = [];

  if (queryParams.dataInicio) {
    params.push(`${queryParams.dataInicio}`);
    condicoes.push(`dh_emi >= ($${params.length}::date::timestamp AT TIME ZONE '${FUSO_NOTAS}')`);
  }
  if (queryParams.dataFim) {
    params.push(`${queryParams.dataFim}`);
    condicoes.push(`dh_emi < (($${params.length}::date + 1)::timestamp AT TIME ZONE '${FUSO_NOTAS}')`);
  }
  if (queryParams.busca) {
    const termo = String(queryParams.busca).trim().slice(0, 100);
    if (termo) {
      params.push(`%${escaparLike(termo)}%`);
      const alternativas = [`emit_nome ILIKE $${params.length}`];
      // Termo só com dígitos e pontuação ("10.707.389/0001-63", "10707389",
      // "163131") também procura no CNPJ do emitente e no número da nota —
      // sem letras, pra um nome como "ATACADO 2000" não trazer notas só
      // porque o CNPJ ou o número tem "2000". Com 44 dígitos é a chave de
      // acesso inteira.
      const digitos = termo.replace(/\D/g, "");
      if (digitos && /^[\d.\-\/\s]+$/.test(termo)) {
        params.push(`%${digitos}%`);
        alternativas.push(`emit_cnpj LIKE $${params.length}`);
        const semZeros = digitos.replace(/^0+/, "");
        if (semZeros) {
          params.push(`%${semZeros}%`);
          alternativas.push(`numero LIKE $${params.length}`);
        }
        if (digitos.length === 44) {
          params.push(digitos);
          alternativas.push(`ch_nfe = $${params.length}`);
        }
      }
      condicoes.push(`(${alternativas.join(" OR ")})`);
    }
  }
  if (queryParams.chaves) {
    const lista = String(queryParams.chaves)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lista.length) {
      params.push(lista);
      condicoes.push(`ch_nfe = ANY($${params.length})`);
    }
  }

  return condicoes.length ? ` AND ${condicoes.join(" AND ")}` : "";
}

module.exports = { montarFiltroDocumentos };
