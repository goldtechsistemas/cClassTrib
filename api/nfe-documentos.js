const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const { montarFiltroDocumentos } = require("./_nfeFiltros");

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
    temXmlCompleto: !!row.xml_completo,
    manifestacao: row.manifestacao,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  if (!empresaId) {
    res.status(400).json({ ok: false, erro: "Informe a empresa." });
    return;
  }

  try {
    const empresaCheck = await query("SELECT id FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
    if (!empresaCheck.rows.length) {
      res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
      return;
    }

    const params = [empresaId];
    const filtro = montarFiltroDocumentos(req.query || {}, params);
    const r = await query(
      `SELECT * FROM nfe_documentos WHERE empresa_id = $1${filtro} ORDER BY dh_emi DESC NULLS LAST, criado_em DESC LIMIT 500`,
      params
    );
    res.status(200).json({ ok: true, documentos: r.rows.map(docParaSaida) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro ao listar documentos." });
  }
};
