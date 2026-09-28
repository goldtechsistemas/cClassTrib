const { query } = require("./_db");
const { exigirUsuario } = require("./_nfeHelpers");
const PDFDocument = require("pdfkit");

// Gera um PDF-resumo simples (NÃO é o DANFE oficial — o layout, código de
// barras e regras visuais do DANFE são normatizados e exigem uma biblioteca
// dedicada/homologada; aqui é só um resumo legível dos dados já recebidos
// da SEFAZ, deixado claro no próprio documento).
function gerarPdf(doc) {
  return new Promise((resolve) => {
    const pdf = new PDFDocument({ size: "A4", margin: 50 });
    const partes = [];
    pdf.on("data", (c) => partes.push(c));
    pdf.on("end", () => resolve(Buffer.concat(partes)));

    pdf.fontSize(16).text("Resumo de Nota Fiscal Eletrônica", { align: "center" });
    pdf.moveDown(0.5);
    pdf
      .fontSize(9)
      .fillColor("#888888")
      .text(
        "Este documento NÃO é o DANFE oficial. É um resumo gerado pelo cClassTrib a partir dos dados recebidos " +
          "da SEFAZ. Para o DANFE oficial, utilize o XML completo (quando disponível) em um emissor/visualizador homologado.",
        { align: "center" }
      );
    pdf.moveDown(2);
    pdf.fillColor("#000000").fontSize(11);

    const linha = (rotulo, valor) => {
      pdf.font("Helvetica-Bold").text(`${rotulo}: `, { continued: true });
      pdf.font("Helvetica").text(String(valor || "—"));
    };

    linha("Chave de acesso", doc.ch_nfe);
    linha("Número / Série", `${doc.numero || "—"} / ${doc.serie || "—"}`);
    linha("Emitente", doc.emit_nome);
    linha("CNPJ do emitente", doc.emit_cnpj);
    linha("UF do emitente", doc.emit_uf);
    linha("Data de emissão", doc.dh_emi ? new Date(doc.dh_emi).toLocaleString("pt-BR") : "—");
    linha(
      "Valor total",
      doc.v_nf != null ? Number(doc.v_nf).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"
    );
    linha("Situação", doc.situacao);
    linha("Tipo de dado disponível", doc.tipo === "completa" ? "XML completo" : "Resumo (sem itens detalhados)");
    linha("Manifestação do destinatário", doc.manifestacao === "ciencia" ? "Ciência da Operação registrada" : "Não manifestada");

    pdf.end();
  });
}

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

  const buffer = await gerarPdf(r.rows[0]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="nota-${chNFe}.pdf"`);
  res.status(200).end(buffer);
};
