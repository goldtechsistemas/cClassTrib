const { query } = require("./_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("./_nfeHelpers");
const { montarFiltroDocumentos } = require("./_nfeFiltros");
const ExcelJS = require("exceljs");

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
    res.status(404).json({ ok: false, erro: "Nenhuma nota sincronizada ainda para esta empresa." });
    return;
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Notas Fiscais");
  sheet.columns = [
    { header: "Chave de Acesso", key: "chave", width: 46 },
    { header: "Número", key: "numero", width: 12 },
    { header: "Série", key: "serie", width: 8 },
    { header: "Emitente", key: "emitente", width: 40 },
    { header: "CNPJ Emitente", key: "cnpj", width: 20 },
    { header: "UF", key: "uf", width: 6 },
    { header: "Data Emissão", key: "dhEmi", width: 20 },
    { header: "Valor (R$)", key: "valor", width: 14 },
    { header: "Situação", key: "situacao", width: 14 },
    { header: "Tipo de dado", key: "tipo", width: 14 },
    { header: "Manifestação", key: "manifestacao", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const doc of r.rows) {
    sheet.addRow({
      chave: doc.ch_nfe,
      numero: doc.numero,
      serie: doc.serie,
      emitente: doc.emit_nome,
      cnpj: doc.emit_cnpj,
      uf: doc.emit_uf,
      dhEmi: doc.dh_emi ? new Date(doc.dh_emi).toLocaleString("pt-BR") : "",
      valor: doc.v_nf != null ? Number(doc.v_nf) : null,
      situacao: doc.situacao,
      tipo: doc.tipo === "completa" ? "XML completo" : "Resumo",
      manifestacao: doc.manifestacao === "ciencia" ? "Ciência dada" : "Não manifestada",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="notas-${empresa.cnpj}.xlsx"`);
  res.status(200).end(Buffer.from(buffer));
};
