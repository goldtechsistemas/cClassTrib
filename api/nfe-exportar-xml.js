const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
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

  const r = await query(
    "SELECT ch_nfe, xml_completo FROM nfe_documentos WHERE empresa_id = $1 AND xml_completo IS NOT NULL",
    [empresaId]
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
  res.setHeader("Content-Disposition", `attachment; filename="xml-notas-${empresaCheck.rows[0].cnpj}.zip"`);
  res.status(200).end(buffer);
};
