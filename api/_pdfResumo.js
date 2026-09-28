const PDFDocument = require("pdfkit");

// Gera um PDF-resumo simples (NÃO é o DANFE oficial — o layout, código de
// barras e regras visuais do DANFE são normatizados e exigem uma biblioteca
// dedicada/homologada; aqui é só um resumo legível dos dados já recebidos
// da SEFAZ, deixado claro no próprio documento).
function gerarPdfResumo(doc) {
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
        "Esta nota ainda não tem o XML completo (só o resumo) — por isso este PDF é um resumo, não o DANFE. " +
          'Dê "Ciência da Operação" nesta nota e sincronize de novo: quando o XML completo chegar, o download passa a trazer o DANFE completo automaticamente.',
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

module.exports = { gerarPdfResumo };
