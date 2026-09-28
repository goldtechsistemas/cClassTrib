/*
 * Gera o DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) a partir do
 * XML completo autorizado pela SEFAZ — código de barras (chave de acesso),
 * dados do emitente/destinatário, protocolo de autorização, tabela de
 * itens e totais de impostos, no layout "retrato" padrão.
 *
 * Isso só é possível quando já temos o XML completo (nfeProc) — notas que
 * chegaram só como "resumo" não têm itens/impostos detalhados; para essas,
 * ver _pdfResumo.js.
 *
 * Gerado de forma independente (pdfkit + bwip-js), não por uma biblioteca
 * homologada pela SEFAZ — os dados são fiéis ao XML autorizado, mas a
 * posição exata de cada campo pode variar um pouco do layout de um ERP
 * certificado.
 */
const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");
const { interpretarXmlCompleto } = require("./_xmlNfe");

const MARGEM = 20;
const LARGURA = 595.28 - MARGEM * 2;

function moeda(n) {
  return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHora(d) {
  return d ? d.toLocaleString("pt-BR") : "";
}

function data(d) {
  return d ? d.toLocaleDateString("pt-BR") : "";
}

function agruparChave(chave) {
  return (chave || "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

async function gerarBarcode(chave) {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: chave,
    scale: 2,
    height: 12,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
}

function caixa(pdf, x, y, w, h) {
  pdf.rect(x, y, w, h).stroke();
}

function rotulo(pdf, texto, x, y) {
  pdf.font("Helvetica").fontSize(6).fillColor("#555555").text(texto, x + 2, y + 1);
}

function valor(pdf, texto, x, y, w) {
  pdf.font("Helvetica").fontSize(8).fillColor("#000000").text(texto || "", x + 2, y + 8, { width: w - 4 });
}

async function gerarDanfePdf(xmlCompleto) {
  const nfe = interpretarXmlCompleto(xmlCompleto);
  if (!nfe) throw new Error("Não foi possível interpretar o XML completo da nota.");

  const pdf = new PDFDocument({ size: "A4", margin: MARGEM });
  const partes = [];
  pdf.on("data", (c) => partes.push(c));
  const pronto = new Promise((resolve) => pdf.on("end", resolve));

  let y = MARGEM;
  const x = MARGEM;

  // --- Cabeçalho: Emitente | DANFE + Nº/Série | Código de barras ---
  const alturaCab = 112;
  const wEmit = LARGURA * 0.42;
  const wDanfe = LARGURA * 0.2;
  const wBarra = LARGURA - wEmit - wDanfe;

  caixa(pdf, x, y, wEmit, alturaCab);
  pdf.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(nfe.emitente.nome || "—", x + 6, y + 6, { width: wEmit - 12 });
  pdf.font("Helvetica").fontSize(8);
  const end = nfe.emitente.endereco;
  if (end) {
    pdf.text(`${end.logradouro}, ${end.numero} - ${end.bairro}`, x + 6, y + 38, { width: wEmit - 12 });
    pdf.text(`${end.municipio} - ${end.uf} - CEP ${end.cep}`, x + 6, y + 52, { width: wEmit - 12 });
    if (end.fone) pdf.text(`Fone: ${end.fone}`, x + 6, y + 66, { width: wEmit - 12 });
  }
  pdf.text(`CNPJ: ${nfe.emitente.cnpj}   IE: ${nfe.emitente.ie}`, x + 6, y + 82, { width: wEmit - 12 });

  const xDanfe = x + wEmit;
  caixa(pdf, xDanfe, y, wDanfe, alturaCab);
  pdf.font("Helvetica-Bold").fontSize(14).text("DANFE", xDanfe + 4, y + 4, { width: wDanfe - 8, align: "center" });
  pdf.font("Helvetica").fontSize(6).text("Documento Auxiliar da Nota Fiscal Eletrônica", xDanfe + 4, y + 20, { width: wDanfe - 8, align: "center" });
  pdf.fontSize(7).text(`${nfe.tipoOperacao === "Entrada" ? "0 - Entrada" : "1 - Saída"}`, xDanfe + 4, y + 34, { width: wDanfe - 8, align: "center" });
  pdf.font("Helvetica-Bold").fontSize(9).text(`Nº ${nfe.numero}`, xDanfe + 4, y + 50, { width: wDanfe - 8, align: "center" });
  pdf.text(`Série ${nfe.serie}`, xDanfe + 4, y + 64, { width: wDanfe - 8, align: "center" });
  if (nfe.tipoAmbiente === "Homologação") {
    pdf.font("Helvetica-Bold").fontSize(7).fillColor("#c0392b").text("SEM VALOR FISCAL — HOMOLOGAÇÃO", xDanfe + 4, y + 88, { width: wDanfe - 8, align: "center" });
    pdf.fillColor("#000000");
  }

  const xBarra = xDanfe + wDanfe;
  caixa(pdf, xBarra, y, wBarra, alturaCab);
  try {
    const png = await gerarBarcode(nfe.chave);
    pdf.image(png, xBarra + 6, y + 6, { width: wBarra - 12, height: 30 });
  } catch (e) {
    pdf.fontSize(7).text("(código de barras indisponível)", xBarra + 6, y + 6);
  }
  pdf.font("Helvetica").fontSize(7).text(agruparChave(nfe.chave), xBarra + 6, y + 40, { width: wBarra - 12, align: "center" });
  pdf.fontSize(6).fillColor("#555555").text(
    "Consulte a autenticidade no site da SEFAZ do estado do emitente ou no Portal Nacional da NF-e, informando a chave de acesso.",
    xBarra + 6,
    y + 54,
    { width: wBarra - 12 }
  );
  pdf.fillColor("#000000");

  y += alturaCab;

  // --- Natureza da Operação ---
  caixa(pdf, x, y, LARGURA, 20);
  rotulo(pdf, "NATUREZA DA OPERAÇÃO", x, y);
  valor(pdf, nfe.naturezaOperacao, x, y, LARGURA);
  y += 20;

  // --- Protocolo de autorização ---
  caixa(pdf, x, y, LARGURA, 20);
  rotulo(pdf, "PROTOCOLO DE AUTORIZAÇÃO DE USO", x, y);
  const protTexto = nfe.protocolo ? `${nfe.protocolo.numero} — ${dataHora(nfe.protocolo.dataRecebimento)}` : "—";
  valor(pdf, protTexto, x, y, LARGURA);
  y += 20;

  // --- Destinatário/Remetente ---
  const alturaDest = 72;
  caixa(pdf, x, y, LARGURA, alturaDest);
  pdf.font("Helvetica-Bold").fontSize(7).text("DESTINATÁRIO / REMETENTE", x + 4, y + 2);
  const meio = LARGURA * 0.6;
  rotulo(pdf, "NOME/RAZÃO SOCIAL", x, y + 14);
  valor(pdf, nfe.destinatario.nome, x, y + 14, meio);
  rotulo(pdf, "CNPJ/CPF", x + meio, y + 14);
  valor(pdf, nfe.destinatario.cnpj, x + meio, y + 14, LARGURA - meio);

  const destEnd = nfe.destinatario.endereco;
  const meio2 = LARGURA * 0.5;
  rotulo(pdf, "ENDEREÇO", x, y + 34);
  valor(pdf, destEnd ? `${destEnd.logradouro}, ${destEnd.numero} - ${destEnd.bairro}` : "", x, y + 34, meio2);
  rotulo(pdf, "MUNICÍPIO / UF", x + meio2, y + 34);
  valor(pdf, destEnd ? `${destEnd.municipio} - ${destEnd.uf}` : "", x + meio2, y + 34, LARGURA * 0.25);
  rotulo(pdf, "CEP", x + meio2 + LARGURA * 0.25, y + 34);
  valor(pdf, destEnd ? destEnd.cep : "", x + meio2 + LARGURA * 0.25, y + 34, LARGURA * 0.25);

  rotulo(pdf, "DATA DE EMISSÃO", x, y + 54);
  valor(pdf, data(nfe.dataEmissao), x, y + 54, LARGURA * 0.25);
  rotulo(pdf, "INSCRIÇÃO ESTADUAL", x + LARGURA * 0.25, y + 54);
  valor(pdf, nfe.destinatario.ie, x + LARGURA * 0.25, y + 54, LARGURA * 0.25);
  rotulo(pdf, "DATA DE SAÍDA/ENTRADA", x + LARGURA * 0.5, y + 54);
  valor(pdf, data(nfe.dataSaidaEntrada), x + LARGURA * 0.5, y + 54, LARGURA * 0.5);
  y += alturaDest;

  // --- Cálculo do Imposto ---
  const alturaImp = 56;
  caixa(pdf, x, y, LARGURA, alturaImp);
  pdf.font("Helvetica-Bold").fontSize(7).text("CÁLCULO DO IMPOSTO", x + 4, y + 2);
  const colsImp1 = [
    ["BASE DE CÁLC. ICMS", moeda(nfe.totais.baseIcms)],
    ["VALOR DO ICMS", moeda(nfe.totais.valorIcms)],
    ["BASE DE CÁLC. ICMS ST", moeda(nfe.totais.baseIcmsSt)],
    ["VALOR DO ICMS ST", moeda(nfe.totais.valorIcmsSt)],
    ["VALOR TOTAL PRODUTOS", moeda(nfe.totais.valorProdutos)],
  ];
  const wImp1 = LARGURA / colsImp1.length;
  colsImp1.forEach(([lbl, val], i) => {
    rotulo(pdf, lbl, x + i * wImp1, y + 14);
    valor(pdf, val, x + i * wImp1, y + 14, wImp1);
  });
  const colsImp2 = [
    ["VALOR DO FRETE", moeda(nfe.totais.valorFrete)],
    ["VALOR DO SEGURO", moeda(nfe.totais.valorSeguro)],
    ["DESCONTO", moeda(nfe.totais.valorDesconto)],
    ["OUTRAS DESPESAS", moeda(nfe.totais.valorOutrasDespesas)],
    ["VALOR DO IPI", moeda(nfe.totais.valorIpi)],
    ["VALOR TOTAL DA NOTA", moeda(nfe.totais.valorTotalNota)],
  ];
  const wImp2 = LARGURA / colsImp2.length;
  colsImp2.forEach(([lbl, val], i) => {
    rotulo(pdf, lbl, x + i * wImp2, y + 36);
    valor(pdf, val, x + i * wImp2, y + 36, wImp2);
  });
  y += alturaImp;

  // --- Tabela de itens (larguras somam <= 1.0 — não pode passar disso, ou
  // a última coluna sai da margem da página) ---
  const colunas = [
    { titulo: "CÓDIGO", w: 0.08, chave: "codigo" },
    { titulo: "DESCRIÇÃO", w: 0.22, chave: "descricao" },
    { titulo: "NCM", w: 0.07, chave: "ncm" },
    { titulo: "CST", w: 0.04, chave: "cst" },
    { titulo: "CFOP", w: 0.05, chave: "cfop" },
    { titulo: "UN", w: 0.04, chave: "unidade" },
    { titulo: "QTDE", w: 0.06, chave: "quantidade", num: true },
    { titulo: "V.UNIT", w: 0.08, chave: "valorUnitario", num: true },
    { titulo: "V.TOTAL", w: 0.08, chave: "valorTotal", num: true },
    { titulo: "AL.ICMS", w: 0.06, chave: "aliquotaIcms", num: true },
    { titulo: "V.ICMS", w: 0.07, chave: "valorIcms", num: true },
    { titulo: "V.IPI", w: 0.07, chave: "valorIpi", num: true },
  ];

  function cabecalhoTabela() {
    caixa(pdf, x, y, LARGURA, 14);
    pdf.font("Helvetica-Bold").fontSize(6);
    let cx = x;
    colunas.forEach((c) => {
      const w = LARGURA * c.w;
      pdf.text(c.titulo, cx + 2, y + 4, { width: w - 4, align: c.num ? "right" : "left" });
      cx += w;
    });
    y += 14;
  }

  cabecalhoTabela();
  const ALTURA_MAX_PAGINA = 780;
  for (const item of nfe.itens) {
    const alturaLinha = 16;
    if (y + alturaLinha > ALTURA_MAX_PAGINA) {
      pdf.addPage();
      y = MARGEM;
      cabecalhoTabela();
    }
    caixa(pdf, x, y, LARGURA, alturaLinha);
    pdf.font("Helvetica").fontSize(6.5);
    let cx = x;
    colunas.forEach((c) => {
      const w = LARGURA * c.w;
      let texto = item[c.chave];
      if (c.chave === "quantidade") texto = Number(texto).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
      else if (c.num) texto = moeda(texto);
      pdf.text(String(texto ?? ""), cx + 2, y + 4, { width: w - 4, align: c.num ? "right" : "left" });
      cx += w;
    });
    y += alturaLinha;
  }

  // --- Dados adicionais ---
  if (y + 60 > ALTURA_MAX_PAGINA) {
    pdf.addPage();
    y = MARGEM;
  }
  const alturaAdic = 60;
  caixa(pdf, x, y, LARGURA, alturaAdic);
  rotulo(pdf, "DADOS ADICIONAIS / INFORMAÇÕES COMPLEMENTARES", x, y);
  pdf.font("Helvetica").fontSize(7).fillColor("#000000").text(nfe.informacoesComplementares || "", x + 4, y + 12, { width: LARGURA - 8, height: alturaAdic - 16 });
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
