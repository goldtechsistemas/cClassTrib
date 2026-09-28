/*
 * Gera o DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) a partir do
 * XML completo autorizado pela SEFAZ, no layout retrato padrão: canhoto,
 * código de barras da chave de acesso, emitente/destinatário, fatura,
 * cálculo do imposto, transportador, itens (com grade completa) e dados
 * adicionais — com linhas de grade entre os campos, igual ao layout
 * oficial usado pelos emissores homologados.
 *
 * Só é possível quando já temos o XML completo (nfeProc) — notas que
 * chegaram só como "resumo" não têm itens/impostos detalhados; para essas,
 * ver _pdfResumo.js.
 */
const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");
const { interpretarXmlCompleto } = require("./_xmlNfe");

const MARGEM = 20;
const LARGURA = 595.28 - MARGEM * 2;
const ALTURA_MAX_PAGINA = 800;

function moeda(n) {
  return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dataHora(d) {
  return d ? d.toLocaleString("pt-BR") : "";
}
function data(d) {
  return d ? d.toLocaleDateString("pt-BR") : "";
}
function hora(d) {
  return d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}
function agruparChave(chave) {
  return (chave || "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

async function gerarBarcode(chave) {
  return bwipjs.toBuffer({ bcid: "code128", text: chave, scale: 2, height: 12, includetext: false, paddingwidth: 0, paddingheight: 0 });
}

class Desenhista {
  constructor(pdf) {
    this.pdf = pdf;
  }

  rotulo(texto, x, y) {
    this.pdf.font("Helvetica").fontSize(5.5).fillColor("#555555").text(texto, x + 2, y + 1, { width: undefined, lineBreak: false });
  }

  valor(texto, x, y, w) {
    this.pdf.font("Helvetica").fontSize(7.5).fillColor("#000000").text(texto || "", x + 2, y + 8, { width: w - 4, height: 12, ellipsis: true, lineBreak: false });
  }

  /** Desenha uma "seção-grade": título opcional (barra cinza) + linhas, cada
   * linha é uma lista de campos {label, value, w (fração de LARGURA da seção)}.
   * Retorna a altura total desenhada. */
  secao(x, y, w, { titulo, linhas, alturaLinha = 22 }) {
    const alturaTitulo = titulo ? 11 : 0;
    const alturaCorpo = linhas.length * alturaLinha;
    const alturaTotal = alturaTitulo + alturaCorpo;

    this.pdf.lineWidth(0.75).rect(x, y, w, alturaTotal).stroke();
    if (titulo) {
      this.pdf.font("Helvetica-Bold").fontSize(6.5).fillColor("#000000").text(titulo, x + 3, y + 2);
      this.pdf.moveTo(x, y + alturaTitulo).lineTo(x + w, y + alturaTitulo).lineWidth(0.75).stroke();
    }

    let linhaY = y + alturaTitulo;
    linhas.forEach((linha, i) => {
      if (i > 0) this.pdf.moveTo(x, linhaY).lineTo(x + w, linhaY).lineWidth(0.5).stroke();
      let campoX = x;
      linha.forEach((campo, j) => {
        const campoW = w * campo.w;
        if (j > 0) this.pdf.moveTo(campoX, linhaY).lineTo(campoX, linhaY + alturaLinha).lineWidth(0.5).stroke();
        this.rotulo(campo.label, campoX, linhaY);
        this.valor(campo.value, campoX, linhaY, campoW);
        campoX += campoW;
      });
      linhaY += alturaLinha;
    });

    return alturaTotal;
  }
}

function montarCanhoto(pdf, x, y, w, nfe) {
  const altura = 40;
  const wDireita = w * 0.22;
  const wEsquerda = w - wDireita;
  pdf.lineWidth(0.75).rect(x, y, w, altura).stroke();
  pdf.moveTo(x + wEsquerda, y).lineTo(x + wEsquerda, y + altura).stroke();
  pdf.moveTo(x, y + 24).lineTo(x + wEsquerda, y + 24).stroke();
  pdf.moveTo(x + wEsquerda * 0.35, y + 24).lineTo(x + wEsquerda * 0.35, y + altura).stroke();

  pdf.font("Helvetica").fontSize(6.5).fillColor("#000000").text(
    `RECEBEMOS DE ${nfe.emitente.nome || "—"} OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO`,
    x + 3,
    y + 3,
    { width: wEsquerda - 6, height: 18 }
  );
  pdf.fontSize(5.5).fillColor("#555555").text("DATA DE RECEBIMENTO", x + 3, y + 26);
  pdf.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", x + wEsquerda * 0.35 + 3, y + 26);

  pdf.font("Helvetica-Bold").fontSize(8).fillColor("#000000").text(`NF-e Nº ${nfe.numero}`, x + wEsquerda + 4, y + 6, { width: wDireita - 8 });
  pdf.font("Helvetica").fontSize(7).text(`SÉRIE: ${nfe.serie}`, x + wEsquerda + 4, y + 22, { width: wDireita - 8 });

  return altura;
}

async function gerarDanfePdf(xmlCompleto) {
  const nfe = interpretarXmlCompleto(xmlCompleto);
  if (!nfe) throw new Error("Não foi possível interpretar o XML completo da nota.");

  const pdf = new PDFDocument({ size: "A4", margin: MARGEM });
  const partes = [];
  pdf.on("data", (c) => partes.push(c));
  const pronto = new Promise((resolve) => pdf.on("end", resolve));
  const D = new Desenhista(pdf);

  let y = MARGEM;
  const x = MARGEM;
  let pagina = 1;

  y += montarCanhoto(pdf, x, y, LARGURA, nfe);
  y += 4;
  pdf.lineWidth(1).dash(2, { space: 2 }).moveTo(x, y).lineTo(x + LARGURA, y).stroke();
  pdf.undash();
  y += 4;

  // --- Cabeçalho: Emitente | DANFE | Controle do Fisco (código de barras) ---
  const alturaCab = 110;
  const wEmit = LARGURA * 0.42;
  const wDanfe = LARGURA * 0.22;
  const wBarra = LARGURA - wEmit - wDanfe;

  D.pdf.lineWidth(0.75).rect(x, y, wEmit, alturaCab).stroke();
  pdf.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(nfe.emitente.nome || "—", x + 6, y + 6, { width: wEmit - 12 });
  pdf.font("Helvetica").fontSize(7.5);
  const end = nfe.emitente.endereco;
  if (end) {
    pdf.text(`${end.logradouro}, ${end.numero} - ${end.bairro}`, x + 6, y + 36, { width: wEmit - 12 });
    pdf.text(`${end.municipio} - ${end.uf}`, x + 6, y + 50, { width: wEmit - 12 });
    pdf.text(`CEP: ${end.cep}`, x + 6, y + 62, { width: wEmit - 12 });
    if (end.fone) pdf.text(`Fone: ${end.fone}`, x + 6, y + 76, { width: wEmit - 12 });
  }

  const xDanfe = x + wEmit;
  pdf.lineWidth(0.75).rect(xDanfe, y, wDanfe, alturaCab).stroke();
  pdf.moveTo(xDanfe, y + 44).lineTo(xDanfe + wDanfe, y + 44).stroke();
  pdf.font("Helvetica-Bold").fontSize(13).text("DANFE", xDanfe + 4, y + 3, { width: wDanfe - 8, align: "center" });
  pdf.font("Helvetica").fontSize(5.5).text("Documento Auxiliar da Nota Fiscal Eletrônica", xDanfe + 4, y + 18, { width: wDanfe - 8, align: "center" });
  pdf.fontSize(6.5).text("0 - Entrada", xDanfe + 4, y + 30, { width: wDanfe / 2 - 8, align: "center" });
  pdf.text("1 - Saída", xDanfe + wDanfe / 2, y + 30, { width: wDanfe / 2 - 8, align: "center" });
  pdf.font("Helvetica-Bold").fontSize(8).text(nfe.tipoOperacao === "Entrada" ? "[0]" : "[1]", xDanfe + 4, y + 30, {
    width: wDanfe - 8,
    align: nfe.tipoOperacao === "Entrada" ? "left" : "right",
  });
  pdf.font("Helvetica-Bold").fontSize(9).text(`Nº ${nfe.numero}`, xDanfe + 4, y + 50, { width: wDanfe - 8, align: "center" });
  pdf.font("Helvetica").fontSize(8).text(`Série ${nfe.serie}`, xDanfe + 4, y + 64, { width: wDanfe - 8, align: "center" });
  pdf.fontSize(6.5).text("Folha 1/1", xDanfe + 4, y + 78, { width: wDanfe - 8, align: "center" });
  if (nfe.tipoAmbiente === "Homologação") {
    pdf.font("Helvetica-Bold").fontSize(6.5).fillColor("#c0392b").text("SEM VALOR FISCAL — HOMOLOGAÇÃO", xDanfe + 4, y + 92, { width: wDanfe - 8, align: "center" });
    pdf.fillColor("#000000");
  }

  const xBarra = xDanfe + wDanfe;
  pdf.lineWidth(0.75).rect(xBarra, y, wBarra, alturaCab).stroke();
  pdf.font("Helvetica-Bold").fontSize(6).fillColor("#000000").text("CONTROLE DO FISCO", xBarra + 6, y + 4);
  try {
    const png = await gerarBarcode(nfe.chave);
    pdf.image(png, xBarra + 6, y + 14, { width: wBarra - 12, height: 32 });
  } catch (e) {
    pdf.fontSize(7).text("(código de barras indisponível)", xBarra + 6, y + 14);
  }
  pdf.font("Helvetica-Bold").fontSize(6).text("CHAVE DE ACESSO", xBarra + 6, y + 50);
  pdf.font("Helvetica").fontSize(7).text(agruparChave(nfe.chave), xBarra + 6, y + 59, { width: wBarra - 12 });
  pdf.fontSize(5.5).fillColor("#555555").text(
    "Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora, informando a chave de acesso.",
    xBarra + 6,
    y + 76,
    { width: wBarra - 12 }
  );
  pdf.fillColor("#000000");
  y += alturaCab;

  // --- Natureza da Operação ---
  y += D.secao(x, y, LARGURA, { linhas: [[{ label: "NATUREZA DA OPERAÇÃO", value: nfe.naturezaOperacao, w: 1 }]] });

  // --- IE / IE Subst. / CNPJ do emitente ---
  y += D.secao(x, y, LARGURA, {
    linhas: [
      [
        { label: "INSCRIÇÃO ESTADUAL", value: nfe.emitente.ie, w: 0.34 },
        { label: "INSCRIÇÃO ESTADUAL DE SUBST.", value: nfe.emitente.ieSt || "—", w: 0.33 },
        { label: "CNPJ", value: nfe.emitente.cnpj, w: 0.33 },
      ],
    ],
  });

  // --- Protocolo de autorização ---
  const protTexto = nfe.protocolo ? `${nfe.protocolo.numero} — ${dataHora(nfe.protocolo.dataRecebimento)}` : "—";
  y += D.secao(x, y, LARGURA, { linhas: [[{ label: "PROTOCOLO DE AUTORIZAÇÃO DE USO", value: protTexto, w: 1 }]] });

  // --- Destinatário/Remetente ---
  const destEnd = nfe.destinatario.endereco;
  y += D.secao(x, y, LARGURA, {
    titulo: "DESTINATÁRIO / REMETENTE",
    linhas: [
      [
        { label: "NOME/RAZÃO SOCIAL", value: nfe.destinatario.nome, w: 0.55 },
        { label: "CNPJ/CPF", value: nfe.destinatario.cnpj, w: 0.25 },
        { label: "DATA EMISSÃO", value: data(nfe.dataEmissao), w: 0.2 },
      ],
      [
        { label: "ENDEREÇO", value: destEnd ? `${destEnd.logradouro}, ${destEnd.numero}` : "", w: 0.45 },
        { label: "BAIRRO/DISTRITO", value: destEnd ? destEnd.bairro : "", w: 0.3 },
        { label: "CEP", value: destEnd ? destEnd.cep : "", w: 0.25 },
      ],
      [
        { label: "MUNICÍPIO", value: destEnd ? destEnd.municipio : "", w: 0.24 },
        { label: "FONE/FAX", value: destEnd ? destEnd.fone : "", w: 0.16 },
        { label: "UF", value: destEnd ? destEnd.uf : "", w: 0.06 },
        { label: "INSCRIÇÃO ESTADUAL", value: nfe.destinatario.ie, w: 0.18 },
        { label: "DATA SAÍDA/ENTRADA", value: data(nfe.dataSaidaEntrada), w: 0.18 },
        { label: "HORA SAÍDA/ENTRADA", value: hora(nfe.dataSaidaEntrada), w: 0.18 },
      ],
    ],
  });

  // --- Fatura/Duplicatas (só se existirem) ---
  if (nfe.duplicatas.length) {
    const alturaFat = 42;
    D.pdf.lineWidth(0.75).rect(x, y, LARGURA, alturaFat).stroke();
    pdf.font("Helvetica-Bold").fontSize(6.5).fillColor("#000000").text("FATURA / DUPLICATA", x + 3, y + 2);
    pdf.moveTo(x, y + 12).lineTo(x + LARGURA, y + 12).lineWidth(0.5).stroke();
    const wCel = Math.min(LARGURA / nfe.duplicatas.length, 90);
    nfe.duplicatas.forEach((dup, i) => {
      const cx = x + i * wCel;
      if (i > 0) pdf.moveTo(cx, y + 12).lineTo(cx, y + alturaFat).lineWidth(0.5).stroke();
      pdf.font("Helvetica-Bold").fontSize(7).fillColor("#000000").text(dup.numero, cx + 3, y + 16, { width: wCel - 6 });
      pdf.font("Helvetica").fontSize(6.5).text(`Venc. ${data(dup.vencimento)}`, cx + 3, y + 25, { width: wCel - 6 });
      pdf.text(`Valor R$ ${moeda(dup.valor)}`, cx + 3, y + 34, { width: wCel - 6 });
    });
    y += alturaFat;
  }

  // --- Cálculo do Imposto ---
  y += D.secao(x, y, LARGURA, {
    titulo: "CÁLCULO DO IMPOSTO",
    alturaLinha: 20,
    linhas: [
      [
        { label: "BASE DE CÁLC. ICMS", value: moeda(nfe.totais.baseIcms), w: 1 / 5 },
        { label: "VALOR DO ICMS", value: moeda(nfe.totais.valorIcms), w: 1 / 5 },
        { label: "BASE CÁLC. ICMS ST", value: moeda(nfe.totais.baseIcmsSt), w: 1 / 5 },
        { label: "VALOR ICMS ST", value: moeda(nfe.totais.valorIcmsSt), w: 1 / 5 },
        { label: "VALOR TOTAL PRODUTOS", value: moeda(nfe.totais.valorProdutos), w: 1 / 5 },
      ],
      [
        { label: "VALOR DO FRETE", value: moeda(nfe.totais.valorFrete), w: 1 / 5 },
        { label: "VALOR DO SEGURO", value: moeda(nfe.totais.valorSeguro), w: 1 / 5 },
        { label: "DESCONTO", value: moeda(nfe.totais.valorDesconto), w: 1 / 5 },
        { label: "OUTRAS DESPESAS", value: moeda(nfe.totais.valorOutrasDespesas), w: 1 / 5 },
        { label: "VALOR DO IPI", value: moeda(nfe.totais.valorIpi), w: 1 / 5 },
      ],
      [
        { label: "V. APROX. TRIBUTOS", value: moeda(nfe.totais.valorTotalTributos), w: 1 / 4 },
        { label: "VALOR DO PIS", value: moeda(nfe.totais.valorPis), w: 1 / 4 },
        { label: "VALOR DA COFINS", value: moeda(nfe.totais.valorCofins), w: 1 / 4 },
        { label: "VALOR TOTAL DA NOTA", value: moeda(nfe.totais.valorTotalNota), w: 1 / 4 },
      ],
    ],
  });

  // --- Transportador/Volumes ---
  const t = nfe.transportador;
  const vol = t.volumes[0] || {};
  y += D.secao(x, y, LARGURA, {
    titulo: "TRANSPORTADOR / VOLUMES TRANSPORTADOS",
    linhas: [
      [
        { label: "NOME/RAZÃO SOCIAL", value: t.nome, w: 0.4 },
        { label: "FRETE POR CONTA", value: t.modalidadeFrete, w: 0.24 },
        { label: "UF", value: t.uf, w: 0.06 },
        { label: "CNPJ/CPF", value: t.cnpj, w: 0.3 },
      ],
      [
        { label: "ENDEREÇO", value: t.endereco, w: 0.45 },
        { label: "MUNICÍPIO", value: t.municipio, w: 0.35 },
        { label: "INSCRIÇÃO ESTADUAL", value: t.ie, w: 0.2 },
      ],
      [
        { label: "QUANTIDADE", value: vol.quantidade, w: 1 / 5 },
        { label: "ESPÉCIE", value: vol.especie, w: 1 / 5 },
        { label: "MARCA", value: vol.marca, w: 1 / 5 },
        { label: "PESO BRUTO", value: vol.pesoBruto, w: 1 / 5 },
        { label: "PESO LÍQUIDO", value: vol.pesoLiquido, w: 1 / 5 },
      ],
    ],
  });

  // --- Tabela de itens (grade completa: linhas E colunas) ---
  const colunas = [
    { titulo: "CÓDIGO", w: 0.07, chave: "codigo" },
    { titulo: "DESCRIÇÃO", w: 0.19, chave: "descricao" },
    { titulo: "NCM/SH", w: 0.06, chave: "ncm" },
    { titulo: "O/CST", w: 0.05, chave: "origCst" },
    { titulo: "CFOP", w: 0.05, chave: "cfop" },
    { titulo: "UNID", w: 0.04, chave: "unidade" },
    { titulo: "QTDE", w: 0.05, chave: "quantidade", num: true },
    { titulo: "V.UNIT", w: 0.07, chave: "valorUnitario", num: true },
    { titulo: "V.TOTAL", w: 0.07, chave: "valorTotal", num: true },
    { titulo: "BASE ICMS", w: 0.07, chave: "baseIcms", num: true },
    { titulo: "V.ICMS", w: 0.06, chave: "valorIcms", num: true },
    { titulo: "V.IPI", w: 0.06, chave: "valorIpi", num: true },
    { titulo: "AL.ICMS%", w: 0.05, chave: "aliquotaIcms", num: true },
    { titulo: "AL.IPI%", w: 0.05, chave: "aliquotaIpi", num: true },
  ];

  function linhaComGrade(y0, altura, celulas) {
    pdf.lineWidth(0.5).rect(x, y0, LARGURA, altura).stroke();
    let cx = x;
    colunas.forEach((c, i) => {
      const w = LARGURA * c.w;
      if (i > 0) pdf.moveTo(cx, y0).lineTo(cx, y0 + altura).stroke();
      celulas(c, cx, w, i);
      cx += w;
    });
  }

  function cabecalhoTabela() {
    linhaComGrade(y, 16, (c, cx) => {
      pdf.font("Helvetica-Bold").fontSize(5.5).fillColor("#000000").text(c.titulo, cx + 2, y + 5, { width: LARGURA * c.w - 4, align: c.num ? "right" : "left", lineBreak: false });
    });
    y += 16;
  }

  cabecalhoTabela();
  for (const item of nfe.itens) {
    const temSt = item.valorIcmsSt || item.baseIcmsSt;
    const alturaLinha = temSt ? 24 : 14;
    if (y + alturaLinha > ALTURA_MAX_PAGINA) {
      pdf.addPage();
      pagina++;
      y = MARGEM;
      cabecalhoTabela();
    }
    linhaComGrade(y, alturaLinha, (c, cx, w) => {
      let texto = item[c.chave];
      if (c.chave === "origCst") texto = `${item.origem || "0"}${item.cst || ""}`;
      else if (c.chave === "quantidade") texto = Number(texto).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
      else if (c.chave === "aliquotaIcms" || c.chave === "aliquotaIpi") texto = texto ? moeda(texto) : "0,00";
      else if (c.num) texto = moeda(texto);
      pdf.font("Helvetica").fontSize(6).fillColor("#000000").text(String(texto ?? ""), cx + 2, y + 3, { width: w - 4, align: c.num ? "right" : "left" });
    });
    if (temSt) {
      pdf.font("Helvetica").fontSize(5).fillColor("#555555").text(
        `.vIcmsST ${moeda(item.valorIcmsSt)}  .vBcIcmsST ${moeda(item.baseIcmsSt)}  .pIcmsST ${moeda(item.aliquotaIcmsSt)}%`,
        x + LARGURA * 0.07 + 2,
        y + 14,
        { width: LARGURA * 0.5 }
      );
      pdf.fillColor("#000000");
    }
    y += alturaLinha;
  }

  // --- Dados adicionais ---
  if (y + 60 > ALTURA_MAX_PAGINA) {
    pdf.addPage();
    pagina++;
    y = MARGEM;
  }
  const alturaAdic = 70;
  D.pdf.lineWidth(0.75).rect(x, y, LARGURA, alturaAdic).stroke();
  D.rotulo("DADOS ADICIONAIS / INFORMAÇÕES COMPLEMENTARES", x, y);
  pdf.font("Helvetica").fontSize(6.5).fillColor("#000000").text(nfe.informacoesComplementares || "", x + 4, y + 12, { width: LARGURA - 8, height: alturaAdic - 16 });
  y += alturaAdic;

  pdf.fontSize(6).fillColor("#888888").text(
    "Documento gerado pelo cClassTrib a partir do XML autorizado pela SEFAZ. Em caso de divergência, o XML assinado digitalmente prevalece.",
    x,
    y + 6,
    { width: LARGURA, align: "center" }
  );

  pdf.end();
  return pronto.then(() => Buffer.concat(partes));
}

module.exports = { gerarDanfePdf };
