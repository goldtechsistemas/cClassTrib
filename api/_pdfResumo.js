const PDFDocument = require("pdfkit");

// Gera um PDF-resumo simples (NÃO é o DANFE oficial — o layout, código de
// barras e regras visuais do DANFE são normatizados e exigem uma biblioteca
// dedicada/homologada; aqui é só um resumo legível dos dados já recebidos
// da SEFAZ, deixado claro no próprio documento).
function gerarPdfResumo(doc) {
  return new Promise((resolve) => {
    const pdf = new PDFDocument({ size: "A4", margin: 40 });
    const partes = [];
    pdf.on("data", (c) => partes.push(c));
    pdf.on("end", () => resolve(Buffer.concat(partes)));

    const L = 595.28 - 80; // largura útil
    const X = 40;
    const LARANJA = "#E8590C";

    // Faixa de título
    pdf.rect(X, 40, L, 46).fill(LARANJA);
    pdf.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(16).text("Resumo de Nota Fiscal Eletrônica", X + 16, 53, { width: L - 32 });
    pdf.font("Helvetica").fontSize(8.5).text("Este documento NÃO é o DANFE — traz só os dados do resumo recebido da SEFAZ", X + 16, 72, { width: L - 32 });

    // Aviso (por que é um resumo e o que fazer)
    const manifestada = doc.manifestacao === "ciencia" || doc.manifestacao === "confirmacao";
    const aviso = manifestada
      ? "Esta nota já foi manifestada, mas a SEFAZ ainda não liberou o XML completo — por isso este PDF é um resumo. O XML completo chega pelas próximas sincronizações (a SEFAZ limita quantas notas podem ser buscadas por hora); clique em \"Sincronizar agora\" ou baixe o PDF de novo mais tarde para obter o DANFE."
      : "Esta nota ainda não tem o XML completo (só o resumo) — por isso este PDF é um resumo. Clique em \"Dar ciência\" nesta nota: depois disso, o download passa a trazer o DANFE completo automaticamente.";
    pdf.font("Helvetica").fontSize(9);
    const hAviso = pdf.heightOfString(aviso, { width: L - 28 }) + 20;
    pdf.rect(X, 100, L, hAviso).fillAndStroke("#FFF6DB", "#E0B23B");
    pdf.fillColor("#5B4300").text(aviso, X + 14, 110, { width: L - 28 });

    let y = 100 + hAviso + 18;

    // Chave de acesso em destaque (grupos de 4 dígitos)
    const chave = String(doc.ch_nfe || "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
    pdf.rect(X, y, L, 46).lineWidth(0.75).strokeColor("#999999").stroke();
    pdf.fillColor("#666666").font("Helvetica").fontSize(7).text("CHAVE DE ACESSO", X + 10, y + 7);
    pdf.fillColor("#000000").font("Courier-Bold").fontSize(11).text(chave || "—", X + 10, y + 21, { width: L - 20, lineBreak: false });
    y += 62;

    // Tabela de dados (linhas alternadas)
    const valorTotal = doc.v_nf != null ? Number(doc.v_nf).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
    const linhas = [
      ["Número / Série", `${doc.numero || "—"} / ${doc.serie || "—"}`],
      ["Emitente", doc.emit_nome || "—"],
      ["CNPJ do emitente", doc.emit_cnpj || "—"],
      ["UF do emitente", doc.emit_uf || "—"],
      ["Data de emissão", doc.dh_emi ? new Date(doc.dh_emi).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"],
      ["Valor total", valorTotal],
      ["Situação", doc.situacao ? doc.situacao.charAt(0).toUpperCase() + doc.situacao.slice(1) : "—"],
      ["Dado disponível", doc.tipo === "completa" ? "XML completo" : "Resumo (sem itens detalhados)"],
      [
        "Manifestação do destinatário",
        doc.manifestacao === "confirmacao"
          ? "Confirmação da Operação registrada"
          : doc.manifestacao === "ciencia"
            ? "Ciência da Operação registrada"
            : "Não manifestada",
      ],
    ];
    const W_ROTULO = 170;
    linhas.forEach(([rotulo, valor], i) => {
      const h = Math.max(24, pdf.font("Helvetica").fontSize(10).heightOfString(String(valor), { width: L - W_ROTULO - 20 }) + 12);
      if (i % 2 === 0) pdf.rect(X, y, L, h).fill("#F3F4F6");
      pdf.fillColor("#444444").font("Helvetica-Bold").fontSize(9.5).text(rotulo, X + 10, y + 7, { width: W_ROTULO - 14 });
      pdf.fillColor("#000000").font("Helvetica").fontSize(10).text(String(valor), X + W_ROTULO, y + 7, { width: L - W_ROTULO - 10 });
      y += h;
    });

    pdf.fillColor("#888888").font("Helvetica").fontSize(7).text(
      "Documento gerado pelo cClassTrib a partir dos dados recebidos da SEFAZ. Em caso de divergência, o XML assinado digitalmente prevalece.",
      X,
      y + 18,
      { width: L, align: "center" }
    );

    pdf.end();
  });
}

// Escolhe DANFE completo (quando já temos o XML completo) ou o resumo
// simplificado (quando só temos o resumo) — usado tanto pelo download de
// uma nota só quanto pelo ZIP em lote, pra não duplicar essa decisão e o
// fallback em dois arquivos.
async function gerarPdfParaDocumento(doc) {
  if (!doc.xml_completo) return gerarPdfResumo(doc);
  try {
    const { gerarDanfePdf } = require("./_danfe");
    return await gerarDanfePdf(doc.xml_completo);
  } catch (e) {
    console.error(`Falha ao gerar DANFE completo para ${doc.ch_nfe}, caindo para o resumo:`, e.message || e);
    return gerarPdfResumo(doc);
  }
}

module.exports = { gerarPdfResumo, gerarPdfParaDocumento };
