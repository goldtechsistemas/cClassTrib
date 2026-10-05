/*
 * Leitor mínimo de planilhas .xlsx (Pasta de Trabalho do Excel) para a
 * consulta em lote — sem dependências externas, na mesma linha do csv.js.
 *
 * Um .xlsx é um zip com XMLs dentro: lemos o diretório central do zip,
 * descompactamos só o que precisamos (workbook, textos compartilhados e a
 * primeira planilha) com DecompressionStream, e devolvemos o conteúdo como
 * texto de linhas/colunas pronto pra passar pelos parsers de csv.js.
 */
(function (global) {
  "use strict";

  // Separador entre colunas do texto devolvido. Não pode ser tab nem ";":
  // parseCSV faz trim() em cada linha, e um tab no começo (célula vazia na
  // primeira coluna) seria engolido, deslocando as colunas. O separador de
  // unidade (U+001F) não é espaço em branco, então sobrevive ao trim.
  const DELIMITADOR = "\u001f";

  const NS_RELACIONAMENTOS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  async function inflarRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error('Este navegador não consegue abrir arquivos .xlsx. Atualize o navegador ou salve a planilha como CSV.');
    }
    const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }

  // Lê o diretório central do zip (fim do arquivo) — é ele, e não os
  // cabeçalhos locais, que tem os tamanhos confiáveis em arquivos gerados
  // pelo Excel (que usam "data descriptor" nos cabeçalhos locais).
  function lerDiretorioZip(buffer) {
    const dv = new DataView(buffer);
    let fim = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim === -1) throw new Error("O arquivo não parece ser uma planilha .xlsx válida.");
    const total = dv.getUint16(fim + 10, true);
    let pos = dv.getUint32(fim + 16, true);
    const entradas = new Map();
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(pos + 10, true);
      const tamComprimido = dv.getUint32(pos + 20, true);
      const tamNome = dv.getUint16(pos + 28, true);
      const tamExtra = dv.getUint16(pos + 30, true);
      const tamComentario = dv.getUint16(pos + 32, true);
      const offsetLocal = dv.getUint32(pos + 42, true);
      const nome = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, tamNome));
      entradas.set(nome, { metodo, tamComprimido, offsetLocal });
      pos += 46 + tamNome + tamExtra + tamComentario;
    }
    return entradas;
  }

  async function extrairTexto(buffer, entradas, nome) {
    const e = entradas.get(nome);
    if (!e) return null;
    const dv = new DataView(buffer);
    if (dv.getUint32(e.offsetLocal, true) !== 0x04034b50) throw new Error("Planilha .xlsx corrompida.");
    const tamNome = dv.getUint16(e.offsetLocal + 26, true);
    const tamExtra = dv.getUint16(e.offsetLocal + 28, true);
    const inicio = e.offsetLocal + 30 + tamNome + tamExtra;
    const dados = new Uint8Array(buffer, inicio, e.tamComprimido);
    let bytes;
    if (e.metodo === 0) bytes = dados;
    else if (e.metodo === 8) bytes = await inflarRaw(dados);
    else throw new Error("Planilha .xlsx com compactação não suportada.");
    return new TextDecoder("utf-8").decode(bytes);
  }

  function lerXml(texto) {
    const doc = new DOMParser().parseFromString(texto, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Planilha .xlsx corrompida.");
    return doc;
  }

  function porNome(doc, nome) {
    return Array.from(doc.getElementsByTagNameNS("*", nome));
  }

  // Texto de um <si> ou <is>: junta todos os <t> (texto formatado vem em
  // vários pedaços <r><t>), ignorando a pronúncia fonética (<rPh>).
  function textoRico(no) {
    return porNome(no, "t")
      .filter((t) => !t.parentNode || t.parentNode.localName !== "rPh")
      .map((t) => t.textContent)
      .join("");
  }

  function indiceColuna(referencia) {
    const letras = (referencia || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    let n = 0;
    for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function caminhoDaPrimeiraPlanilha(workbook, relacionamentos) {
    const primeira = porNome(workbook, "sheet")[0];
    const rid = primeira && primeira.getAttributeNS(NS_RELACIONAMENTOS, "id");
    if (rid && relacionamentos) {
      const rel = porNome(relacionamentos, "Relationship").find((r) => r.getAttribute("Id") === rid);
      if (rel) {
        const alvo = rel.getAttribute("Target") || "";
        return alvo.startsWith("/") ? alvo.slice(1) : "xl/" + alvo;
      }
    }
    return "xl/worksheets/sheet1.xml";
  }

  function limparCelula(valor) {
    return String(valor == null ? "" : valor).replace(/[\u001f\t\r\n]+/g, " ").trim();
  }

  /**
   * Lê a primeira planilha do arquivo e devolve o texto (uma linha por
   * linha da planilha, colunas separadas por DELIMITADOR).
   */
  async function lerPlanilha(buffer) {
    // Planilha com senha (e o .xls antigo) não é um zip: começa com a
    // assinatura de arquivo composto do Office (D0 CF 11 E0).
    if (new DataView(buffer).getUint32(0, false) === 0xd0cf11e0) {
      throw new Error("Não consegui abrir esta planilha — ela tem senha ou é do formato antigo (.xls). Remova a senha / salve como \"Pasta de Trabalho do Excel (*.xlsx)\" e envie de novo.");
    }
    const entradas = lerDiretorioZip(buffer);
    if (!entradas.has("xl/workbook.xml")) {
      throw new Error("O arquivo não parece ser uma planilha .xlsx válida.");
    }

    const [workbookTxt, relsTxt, sharedTxt] = await Promise.all([
      extrairTexto(buffer, entradas, "xl/workbook.xml"),
      extrairTexto(buffer, entradas, "xl/_rels/workbook.xml.rels"),
      extrairTexto(buffer, entradas, "xl/sharedStrings.xml")
    ]);
    if (!workbookTxt) throw new Error("O arquivo não parece ser uma planilha .xlsx válida.");

    const caminho = caminhoDaPrimeiraPlanilha(lerXml(workbookTxt), relsTxt ? lerXml(relsTxt) : null);
    const sheetTxt = await extrairTexto(buffer, entradas, caminho);
    if (!sheetTxt) throw new Error("Não encontrei a planilha dentro do arquivo .xlsx.");

    const compartilhados = sharedTxt ? porNome(lerXml(sharedTxt), "si").map(textoRico) : [];

    // Cada célula guarda o valor e se era numérica: o Excel guarda NCM
    // digitado como número e descarta o zero à esquerda (04011010 vira
    // 4011010) — recuperamos isso abaixo, só na coluna do NCM.
    const linhas = porNome(lerXml(sheetTxt), "row").map((row) => {
      const celulas = [];
      porNome(row, "c").forEach((c, ordem) => {
        const ref = c.getAttribute("r");
        const col = ref ? indiceColuna(ref) : ordem;
        const tipo = c.getAttribute("t");
        const v = porNome(c, "v")[0];
        let valor = "";
        let numerico = false;
        if (tipo === "s") valor = compartilhados[parseInt(v && v.textContent, 10)] || "";
        else if (tipo === "inlineStr") valor = textoRico(c);
        else if (tipo === "str") valor = v ? v.textContent : "";
        else if (tipo === "b") valor = v && v.textContent === "1" ? "VERDADEIRO" : "FALSO";
        else if (tipo === "e") valor = "";
        else { valor = v ? v.textContent : ""; numerico = true; }
        celulas[col] = { valor: limparCelula(valor), numerico };
      });
      return celulas;
    });

    const cabecalho = linhas.find((l) => l.some((c) => c && c.valor)) || [];
    const colNcm = cabecalho.findIndex((c) => c && /ncm/i.test(c.valor));

    return linhas
      .map((celulas) => {
        const saida = [];
        for (let i = 0; i < celulas.length; i++) {
          const c = celulas[i];
          if (!c) { saida.push(""); continue; }
          let valor = c.valor;
          if (i === colNcm && celulas !== cabecalho && c.numerico && /^\d{7}$/.test(valor)) valor = "0" + valor;
          saida.push(valor);
        }
        return saida.join(DELIMITADOR);
      })
      .join("\n");
  }

  global.XlsxUtil = { lerPlanilha, DELIMITADOR };
})(window);
