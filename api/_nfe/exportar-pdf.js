const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { gerarPdfParaDocumento } = require("../_pdfResumo");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  const chNFe = req.query && req.query.chNFe;
  if (!chNFe) {
    res.status(400).json({ ok: false, erro: "Informe a nota." });
    return;
  }
  const empresa = await exigirEmpresaDoUsuario(req, res, usuarioId, empresaId, "id");
  if (!empresa) return;

  const r = await query("SELECT * FROM nfe_documentos WHERE empresa_id = $1 AND ch_nfe = $2", [empresaId, chNFe]);
  if (!r.rows.length) {
    res.status(404).json({ ok: false, erro: "Nota não encontrada." });
    return;
  }

  const buffer = await gerarPdfParaDocumento(r.rows[0]);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nota-${chNFe}.pdf"`);
  res.status(200).end(buffer);
};
