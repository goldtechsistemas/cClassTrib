// Monta o pedaço "AND ..." do WHERE para filtrar nfe_documentos por período
// de emissão (dataInicio/dataFim, formato YYYY-MM-DD) e/ou por uma lista
// específica de chaves de acesso (chaves=chave1,chave2,...) — usado tanto
// na listagem da tela quanto nos exports (XML/Excel/PDF respeitam o mesmo
// filtro que está sendo exibido).
function montarFiltroDocumentos(queryParams, params) {
  const condicoes = [];

  if (queryParams.dataInicio) {
    params.push(`${queryParams.dataInicio}`);
    condicoes.push(`dh_emi >= $${params.length}::date`);
  }
  if (queryParams.dataFim) {
    params.push(`${queryParams.dataFim}`);
    condicoes.push(`dh_emi < ($${params.length}::date + interval '1 day')`);
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
