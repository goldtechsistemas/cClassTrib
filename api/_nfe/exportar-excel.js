const { query } = require("../_db");
const { exigirUsuario, exigirEmpresaDoUsuario } = require("../_nfeHelpers");
const { montarFiltroDocumentos } = require("../_nfeFiltros");
const ExcelJS = require("exceljs");
const { interpretarXmlCompleto } = require("../_xmlNfe");

function lerXml(xml) {
  if (!xml) return null;
  try {
    return interpretarXmlCompleto(xml);
  } catch (e) {
    return null; // XML ilegível: a linha da nota sai sem os detalhes
  }
}

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
    { header: "Base IBS/CBS (R$)", key: "baseReforma", width: 16 },
    { header: "IBS (R$)", key: "ibs", width: 12 },
    { header: "CBS (R$)", key: "cbs", width: 12 },
    { header: "IS (R$)", key: "is", width: 10 },
    { header: "Chave de Acesso", key: "chave", width: 46 },
  ];
  sheet.getRow(1).font = { bold: true };

  // Aba com os itens de cada nota (só das que têm XML completo): NCM, CST e
  // cClassTrib do IBS/CBS informados pelo fornecedor e os valores destacados.
  const abaItens = wb.addWorksheet("Itens (IBS-CBS)");
  abaItens.columns = [
    { header: "Número NF", key: "numero", width: 11 },
    { header: "Emitente", key: "emitente", width: 32 },
    { header: "Data Emissão", key: "dhEmi", width: 12 },
    { header: "Item", key: "item", width: 6 },
    { header: "Código", key: "codigo", width: 14 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "NCM", key: "ncm", width: 11 },
    { header: "CFOP", key: "cfop", width: 7 },
    { header: "Valor do item (R$)", key: "valor", width: 15 },
    { header: "CST IBS/CBS", key: "cst", width: 11 },
    { header: "cClassTrib", key: "cClassTrib", width: 11 },
    { header: "Base IBS/CBS (R$)", key: "base", width: 15 },
    { header: "% IBS UF", key: "pIbsUf", width: 9 },
    { header: "% IBS Mun.", key: "pIbsMun", width: 9 },
    { header: "IBS (R$)", key: "ibs", width: 11 },
    { header: "% CBS", key: "pCbs", width: 8 },
    { header: "CBS (R$)", key: "cbs", width: 11 },
    { header: "cClassTrib IS", key: "cClassTribIs", width: 12 },
    { header: "IS (R$)", key: "is", width: 10 },
    { header: "Chave de Acesso", key: "chave", width: 46 },
  ];
  abaItens.getRow(1).font = { bold: true };

  for (const doc of r.rows) {
    const nfe = lerXml(doc.xml_completo);
    const rf = nfe && nfe.reforma;
    const dataCurta = doc.dh_emi ? new Date(doc.dh_emi).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    if (nfe) {
      for (const item of nfe.itens) {
        const ib = item.ibsCbs;
        const is = item.impostoSeletivo;
        abaItens.addRow({
          numero: doc.numero,
          emitente: doc.emit_nome,
          dhEmi: dataCurta,
          item: item.numero,
          codigo: item.codigo,
          descricao: item.descricao,
          ncm: item.ncm,
          cfop: item.cfop,
          valor: item.valorTotal,
          cst: ib ? ib.cst : "",
          cClassTrib: ib ? ib.cClassTrib : "",
          base: ib ? ib.base : null,
          pIbsUf: ib ? ib.aliquotaIbsUf : null,
          pIbsMun: ib ? ib.aliquotaIbsMun : null,
          ibs: ib ? ib.valorIbs : null,
          pCbs: ib ? ib.aliquotaCbs : null,
          cbs: ib ? ib.valorCbs : null,
          cClassTribIs: is ? is.cClassTrib : "",
          is: is ? is.valor : null,
          chave: doc.ch_nfe,
        });
      }
    }
    sheet.addRow({
      baseReforma: rf ? rf.base : null,
      ibs: rf ? rf.valorIbs : null,
      cbs: rf ? rf.valorCbs : null,
      is: rf ? rf.valorIs : null,
      chave: doc.ch_nfe,
      numero: doc.numero,
      serie: doc.serie,
      emitente: doc.emit_nome,
      cnpj: doc.emit_cnpj,
      uf: doc.emit_uf,
      dhEmi: doc.dh_emi ? new Date(doc.dh_emi).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
      valor: doc.v_nf != null ? Number(doc.v_nf) : null,
      situacao: doc.situacao,
      tipo: doc.tipo === "completa" ? "XML completo" : "Resumo",
      manifestacao:
        doc.manifestacao === "confirmacao" ? "Confirmação dada" : doc.manifestacao === "ciencia" ? "Ciência dada" : "Não manifestada",
    });
  }

  for (const aba of [sheet, abaItens]) {
    aba.views = [{ state: "frozen", ySplit: 1 }];
    aba.columns.forEach((c) => {
      if (/R\$/.test(c.header)) c.numFmt = "#,##0.00";
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="notas-${empresa.cnpj}.xlsx"`);
  res.status(200).end(Buffer.from(buffer));
};
