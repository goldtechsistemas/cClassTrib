/*
 * Cliente do webservice NFeDistribuicaoDFe (Ambiente Nacional) — consulta
 * distDFeInt por NSU, autenticado por mTLS com o certificado A1 da empresa.
 *
 * Referência: Portal Nacional da NF-e, Nota Técnica da Distribuição de DF-e
 * (schema distDFeInt v1.01). O serviço roda só no Ambiente Nacional (AN),
 * não tem contingência SVC.
 */
const https = require("https");
const zlib = require("zlib");
const { XMLParser } = require("fast-xml-parser");

const ENDPOINTS = {
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

const SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

// Código IBGE da UF — usado em cUFAutor (UF da base do CNPJ consultante).
const UF_PARA_CODIGO = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};
const CODIGO_PARA_UF = Object.fromEntries(Object.entries(UF_PARA_CODIGO).map(([sigla, cod]) => [String(cod), sigla]));

const SITUACOES = {
  1: "autorizada",
  2: "cancelada",
  3: "denegada",
};

class ErroSefaz extends Error {}

function montarEnvelope({ tpAmb, cUFAutor, cnpj, ultNsu }) {
  const ultNsuFormatado = String(ultNsu || "0").replace(/\D/g, "").padStart(15, "0");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>` +
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${cUFAutor}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<distNSU><ultNSU>${ultNsuFormatado}</ultNSU></distNSU>` +
    `</distDFeInt>` +
    `</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function enviarSoap({ url, certPem, keyPem, envelopeXml, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const alvo = new URL(url);
    const req = https.request(
      {
        hostname: alvo.hostname,
        path: alvo.pathname,
        port: alvo.port || 443,
        method: "POST",
        cert: certPem,
        key: keyPem,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
          "Content-Length": Buffer.byteLength(envelopeXml),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let dados = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (dados += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: dados }));
      }
    );
    req.on("timeout", () => req.destroy(new ErroSefaz("Tempo esgotado ao consultar a SEFAZ.")));
    req.on("error", (e) => reject(new ErroSefaz(`Falha de conexão com a SEFAZ: ${e.message}`)));
    req.write(envelopeXml);
    req.end();
  });
}

function parsearEnvelopeResposta(xmlTexto) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  let obj;
  try {
    obj = parser.parse(xmlTexto);
  } catch (e) {
    throw new ErroSefaz("Resposta da SEFAZ não é um XML válido.");
  }

  const body = obj.Envelope && obj.Envelope.Body;
  const result =
    body &&
    ((body.nfeDistDFeInteresseResponse && body.nfeDistDFeInteresseResponse.nfeDistDFeInteresseResult) ||
      body.Fault);
  if (body && body.Fault) {
    const motivo = body.Fault.faultstring || body.Fault.Reason || "Erro SOAP desconhecido.";
    throw new ErroSefaz(`SEFAZ retornou um erro SOAP: ${motivo}`);
  }
  const ret = result && result.retDistDFeInt;
  if (!ret) {
    throw new ErroSefaz("Resposta da SEFAZ em formato inesperado (retDistDFeInt não encontrado).");
  }

  const docs = [];
  const lote = ret.loteDistDFeInt;
  if (lote && lote.docZip) {
    const zips = Array.isArray(lote.docZip) ? lote.docZip : [lote.docZip];
    for (const z of zips) {
      const base64 = typeof z === "object" ? z["#text"] : z;
      const nsu = typeof z === "object" ? z["@_NSU"] : null;
      const schema = typeof z === "object" ? z["@_schema"] : null;
      if (!base64) continue;
      let xmlDoc;
      try {
        xmlDoc = zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
      } catch (e) {
        continue; // docZip corrompido/ilegível — pula, não derruba o lote inteiro
      }
      docs.push({ nsu, schema, xml: xmlDoc });
    }
  }

  return {
    cStat: String(ret.cStat),
    xMotivo: ret.xMotivo || "",
    ultNSU: ret.ultNSU,
    maxNSU: ret.maxNSU,
    docs,
  };
}

function chaveParaPartes(chNFe) {
  if (!chNFe || chNFe.length !== 44) return {};
  return {
    uf: CODIGO_PARA_UF[chNFe.slice(0, 2)] || null,
    numero: String(parseInt(chNFe.slice(25, 34), 10)),
    serie: String(parseInt(chNFe.slice(22, 25), 10)),
  };
}

/** Converte o XML já descompactado de um docZip num documento normalizado
 * para gravar em nfe_documentos/nfe_eventos, ou null se o schema não é
 * reconhecido (schemas fora do escopo desta fase são ignorados). */
function normalizarDocumento(item) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false });
  let obj;
  try {
    obj = parser.parse(item.xml);
  } catch (e) {
    return null;
  }

  if (obj.resNFe) {
    const r = obj.resNFe;
    const partes = chaveParaPartes(r.chNFe);
    return {
      categoria: "documento",
      chNFe: r.chNFe,
      nsu: item.nsu,
      tipo: "resumo",
      numero: partes.numero || null,
      serie: partes.serie || null,
      emitCnpj: r.CNPJ || null,
      emitNome: r.xNome || null,
      emitUf: partes.uf || null,
      destCnpj: null,
      dhEmi: r.dhEmi || null,
      vNf: r.vNF != null ? Number(r.vNF) : null,
      situacao: SITUACOES[r.cSitNFe] || `código ${r.cSitNFe}`,
      xmlCompleto: null,
    };
  }

  if (obj.resEvento) {
    const r = obj.resEvento;
    return {
      categoria: "evento",
      chNFe: r.chNFe,
      tpEvento: r.tpEvento,
      nSeqEvento: r.nSeqEvento ? Number(r.nSeqEvento) : 1,
      xml: item.xml,
      dhEvento: r.dhEvento || null,
    };
  }

  // procNFe / procEventoNFe (XML completo, normalmente só após
  // manifestação — Fase 3) — guardamos o XML bruto mas sem parsing fino
  // dos campos ainda.
  if (obj.nfeProc) {
    const inf = obj.nfeProc.NFe && obj.nfeProc.NFe.infNFe;
    const chNFe = inf && inf["@_Id"] ? String(inf["@_Id"]).replace(/^NFe/, "") : null;
    return {
      categoria: "documento",
      chNFe,
      nsu: item.nsu,
      tipo: "completa",
      numero: inf && inf.ide ? inf.ide.nNF : null,
      serie: inf && inf.ide ? inf.ide.serie : null,
      emitCnpj: inf && inf.emit ? inf.emit.CNPJ : null,
      emitNome: inf && inf.emit ? inf.emit.xNome : null,
      emitUf: inf && inf.emit && inf.emit.enderEmit ? inf.emit.enderEmit.UF : null,
      destCnpj: inf && inf.dest ? inf.dest.CNPJ : null,
      dhEmi: inf && inf.ide ? inf.ide.dhEmi : null,
      vNf: inf && inf.total && inf.total.ICMSTot ? Number(inf.total.ICMSTot.vNF) : null,
      situacao: "autorizada",
      xmlCompleto: item.xml,
    };
  }

  return null;
}

/**
 * Consulta um lote de documentos a partir do ultNSU informado.
 * @returns {{cStat: string, xMotivo: string, ultNSU: string, maxNSU: string, documentos: object[], eventos: object[]}}
 */
async function distribuirDfe({ ambiente, uf, cnpj, ultNsu, certPem, keyPem }) {
  const url = ENDPOINTS[ambiente] || ENDPOINTS[2];
  const cUFAutor = UF_PARA_CODIGO[uf] || UF_PARA_CODIGO.DF; // fallback neutro se a UF não veio do certificado
  const envelope = montarEnvelope({ tpAmb: ambiente, cUFAutor, cnpj, ultNsu });

  const resposta = await enviarSoap({ url, certPem, keyPem, envelopeXml: envelope });
  if (resposta.statusCode >= 400 && resposta.statusCode !== 500) {
    // A SEFAZ frequentemente devolve SOAP Fault com status 500 mesmo para
    // erros "normais" (ex.: certificado não habilitado) — só trata como
    // falha de transporte genuína o que não for nem 2xx nem 500.
    throw new ErroSefaz(`SEFAZ respondeu HTTP ${resposta.statusCode}.`);
  }

  const analisada = parsearEnvelopeResposta(resposta.body);
  const documentos = [];
  const eventos = [];
  for (const item of analisada.docs) {
    const doc = normalizarDocumento(item);
    if (!doc) continue;
    if (doc.categoria === "evento") eventos.push(doc);
    else documentos.push(doc);
  }

  return {
    cStat: analisada.cStat,
    xMotivo: analisada.xMotivo,
    ultNSU: analisada.ultNSU,
    maxNSU: analisada.maxNSU,
    documentos,
    eventos,
  };
}

module.exports = { distribuirDfe, ErroSefaz, UF_PARA_CODIGO };
