const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const { gerarPdfResumo } = require("./_pdfResumo");
const { gerarDanfePdf } = require("./_danfe");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  const chNFe = req.query && req.query.chNFe;
  if (!empresaId || !chNFe) {
    res.status(400).json({ ok: false, erro: "Informe a empresa e a nota." });
    return;
  }

  const empresaCheck = await query("SELECT id FROM nfe_empresas WHERE id = $1 AND usuario_id = $2", [empresaId, usuarioId]);
  if (!empresaCheck.rows.length) {
    res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
    return;
  }

  const r = await query("SELECT * FROM nfe_documentos WHERE empresa_id = $1 AND ch_nfe = $2", [empresaId, chNFe]);
  if (!r.rows.length) {
    res.status(404).json({ ok: false, erro: "Nota não encontrada." });
    return;
  }

  const doc = r.rows[0];
  let buffer;
  try {
    buffer = doc.xml_completo ? await gerarDanfePdf(doc.xml_completo) : await gerarPdfResumo(doc);
  } catch (e) {
    console.error(e);
    // Se o XML completo veio incompleto/inesperado, cai para o resumo em vez de falhar o download.
    buffer = await gerarPdfResumo(doc);
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nota-${chNFe}.pdf"`);
  res.status(200).end(buffer);
};
