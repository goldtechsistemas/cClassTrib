const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { montarFiltroDocumentos } = require("../_nfeFiltros");

function numeroOuNull(v) {
  return v == null ? null : Number(v);
}

function docParaSaida(row) {
  return {
    id: row.id,
    chNFe: row.ch_nfe,
    tipo: row.tipo,
    numero: row.numero,
    serie: row.serie,
    emitCnpj: row.emit_cnpj,
    emitNome: row.emit_nome,
    emitUf: row.emit_uf,
    dhEmi: row.dh_emi,
    vNf: row.v_nf,
    situacao: row.situacao,
    temXmlCompleto: !!row.tem_xml,
    manifestacao: row.manifestacao,
    // Totais de impostos do bloco <ICMSTot> do XML completo — alimentam o
    // painel "Informações do período". Nota só em resumo não tem esses
    // valores (null), e vTotTrib é opcional no XML.
    trib: row.tem_xml
      ? {
          icms: numeroOuNull(row.v_icms),
          icmsSt: numeroOuNull(row.v_icms_st),
          ipi: numeroOuNull(row.v_ipi),
          pis: numeroOuNull(row.v_pis),
          cofins: numeroOuNull(row.v_cofins),
          totTrib: numeroOuNull(row.v_tot_trib),
        }
      : null,
  };
}

// Pega o valor de uma tag do bloco ICMSTot (tag exata, com o ">" — assim
// <vICMS> não casa com <vICMSDeson>). Só olha dentro do
// ICMSTot: os itens têm <vICMS>/<vIPI>... próprios e não podem entrar na conta.
function valorDoTotal(tag) {
  return `substring(tot from '<${tag}>([0-9.]+)</${tag}>')::numeric`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  const empresa = await exigirEmpresaDoUsuario(req, res, usuarioId, empresaId, "id");
  if (!empresa) return;

  try {
    const params = [empresaId];
    const filtro = montarFiltroDocumentos(req.query || {}, params);
    // Não traz o XML inteiro de cada nota (era o que mais pesava na lista):
    // só o recorte do ICMSTot, de onde saem os totais de impostos.
    const r = await query(
      `SELECT id, ch_nfe, tipo, numero, serie, emit_cnpj, emit_nome, emit_uf, dh_emi, v_nf, situacao, manifestacao, tem_xml,
              ${valorDoTotal("vICMS")} AS v_icms,
              ${valorDoTotal("vST")} AS v_icms_st,
              ${valorDoTotal("vIPI")} AS v_ipi,
              ${valorDoTotal("vPIS")} AS v_pis,
              ${valorDoTotal("vCOFINS")} AS v_cofins,
              ${valorDoTotal("vTotTrib")} AS v_tot_trib
         FROM (
           SELECT id, ch_nfe, tipo, numero, serie, emit_cnpj, emit_nome, emit_uf, dh_emi, v_nf, situacao, manifestacao, criado_em,
                  (xml_completo IS NOT NULL) AS tem_xml,
                  substring(xml_completo from '<ICMSTot>(.*?)</ICMSTot>') AS tot
             FROM nfe_documentos
            WHERE empresa_id = $1${filtro}
            ORDER BY dh_emi DESC NULLS LAST, criado_em DESC
            LIMIT 500
         ) d
        ORDER BY dh_emi DESC NULLS LAST, criado_em DESC`,
      params
    );
    res.status(200).json({ ok: true, documentos: r.rows.map(docParaSaida) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao listar documentos." });
  }
};
