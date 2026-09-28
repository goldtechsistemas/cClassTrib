const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { montarFiltroDocumentos } = require("../_nfeFiltros");
const { gerarPdfParaDocumento } = require("../_pdfResumo");
const JSZip = require("jszip");

const CONCORRENCIA = 5; // gera até 5 PDFs em paralelo (CPU-bound: barcode + layout) em vez de um por um

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const usuarioId = await exigirUsuario(req, res);
  if (usuarioId == null) return;

  const empresaId = req.query && req.query.empresaId;
  const empresa = await exigirEmpresaDoUsuario(req, res, usuarioId, empresaId, "id, cnpj");
  if (!empresa) return;

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
  for (let i = 0; i < r.rows.length; i += CONCORRENCIA) {
    const lote = r.rows.slice(i, i + CONCORRENCIA);
    const buffers = await Promise.all(lote.map((doc) => gerarPdfParaDocumento(doc)));
    lote.forEach((doc, j) => zip.file(`${doc.ch_nfe}.pdf`, buffers[j]));
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="pdf-notas-${empresa.cnpj}.zip"`);
  res.status(200).end(buffer);
};
