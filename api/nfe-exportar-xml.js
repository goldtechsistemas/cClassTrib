const { query } = require("./_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("./_nfeHelpers");
const { montarFiltroDocumentos } = require("./_nfeFiltros");
const JSZip = require("jszip");

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
    `SELECT ch_nfe, xml_completo FROM nfe_documentos WHERE empresa_id = $1 AND xml_completo IS NOT NULL${filtro}`,
    params
  );
  if (!r.rows.length) {
    res.status(404).json({
      ok: false,
      erro: 'Nenhuma nota com XML completo disponível ainda. Dê "Ciência da Operação" na nota e sincronize de novo antes de baixar.',
    });
    return;
  }

  const zip = new JSZip();
  for (const row of r.rows) {
    zip.file(`${row.ch_nfe}.xml`, row.xml_completo);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="xml-notas-${empresa.cnpj}.zip"`);
  res.status(200).end(buffer);
};
