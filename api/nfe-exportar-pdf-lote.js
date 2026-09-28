const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const { montarFiltroDocumentos } = require("./_nfeFiltros");
const { gerarPdfResumo } = require("./_pdfResumo");
const JSZip = require("jszip");

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

  const empresaCheck = await query("SELECT id, cnpj FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
  if (!empresaCheck.rows.length) {
    res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
    return;
  }

  const params = [empresaId];
  const filtro = montarFiltroDocumentos(req.query || {}, params);
  const r = await query(
    `SELECT * FROM nfe_documentos WHERE empresa_id = $1${filtro} ORDER BY dh_emi DESC NULLS LAST`,
    params
  );
  if (!r.rows.length) {
    res.status(404).json({ ok: false, erro: "Nenhuma nota encontrada para gerar PDF." });
    return;
  }

  const zip = new JSZip();
  for (const doc of r.rows) {
    const buffer = await gerarPdfResumo(doc);
    zip.file(`${doc.ch_nfe}.pdf`, buffer);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="pdf-notas-${empresaCheck.rows[0].cnpj}.zip"`);
  res.status(200).end(buffer);
};
