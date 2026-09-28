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
const { SignedXml } = require("xml-crypto");

const ENDPOINTS = {
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};
const ENDPOINTS_EVENTO = {
  2: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  1: "https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

const SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";
const SOAP_ACTION_EVENTO = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

// Código IBGE da UF — usado em cUFAutor (UF da base do CNPJ consultante).
const UF_PARA_CODIGO = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};
const CODIGO_PARA_UF = Object.fromEntries(Object.entries(UF_PARA_CODIGO).map(([sigla, cod]) => [String(cod), sigla]));

// Domínio oficial do campo cSitNFe do resNFe (schema resNFe_v1.01.xsd): só
// existem os valores 1 e 2 — "cancelada" NÃO é um valor de cSitNFe, ela chega
// depois via um resEvento (tpEvento 110111), tratado à parte em _nfeSync.js.
const SITUACOES = {
  1: "autorizada",
  2: "denegada",
};

class ErroSefaz extends Error {}

// SOAP 1.2 Fault não tem "faultstring" (isso é SOAP 1.1) — o texto vem em
// Fault.Reason.Text, que o parser (com removeNSPrefix) devolve como objeto
// ({Text: "..."} ou, se tiver atributo xml:lang, {Text: {"#text": "..."}}),
// nunca como string direto. Sem isto, o template literal que monta a
// mensagem de erro imprimia literalmente "[object Object]".
function extrairMotivoFault(fault) {
  if (!fault) return "Erro SOAP desconhecido.";
  if (typeof fault.faultstring === "string") return fault.faultstring;
  const reason = fault.Reason;
  if (typeof reason === "string") return reason;
  const texto = reason && (typeof reason.Text === "string" ? reason.Text : reason.Text && reason.Text["#text"]);
  return texto || "Erro SOAP desconhecido.";
}

// distDFeInt (e o evento, mais abaixo) exigem OU <CNPJ> OU <CPF> — nunca os
// dois — dependendo se o consultante é pessoa jurídica ou física. `cnpj`
// aqui é só o nome histórico do parâmetro; o valor pode ter 11 dígitos
// (CPF, certificado e-CPF) ou 14 (CNPJ, certificado e-CNPJ).
function tagDocumento(cnpj) {
  return cnpj && String(cnpj).length === 11 ? `<CPF>${cnpj}</CPF>` : `<CNPJ>${cnpj}</CNPJ>`;
}

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
    tagDocumento(cnpj) +
    `<distNSU><ultNSU>${ultNsuFormatado}</ultNSU></distNSU>` +
    `</distDFeInt>` +
    `</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function enviarSoap({ url, certPem, keyPem, envelopeXml, soapAction = SOAP_ACTION, timeoutMs = 25000 }) {
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
          "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
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
    throw new ErroSefaz(`SEFAZ retornou um erro SOAP: ${extrairMotivoFault(body.Fault)}`);
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

// --- Manifestação do Destinatário (evento 210210 — Ciência da Operação) ---
//
// Ao contrário da consulta distDFeInt (que só lê), enviar este evento GRAVA
// um registro permanente no sistema da SEFAZ associado ao CNPJ/certificado
// — por isso só é disparado por ação explícita do usuário (botão "Dar
// ciência" por nota), nunca automaticamente.

const DESCRICOES_EVENTO = { 210210: "Ciencia da Operacao" };

function montarXmlEvento({ tpAmb, cOrgao, cnpj, chNFe, tpEvento, nSeqEvento }) {
  const dh = new Date().toISOString().replace(/\.\d{3}Z$/, "-03:00"); // aproximação; SEFAZ aceita o offset local
  const id = `ID${tpEvento}${chNFe}${String(nSeqEvento).padStart(2, "0")}`;
  const descEvento = DESCRICOES_EVENTO[tpEvento] || "Evento";
  return {
    id,
    xml:
      `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
      `<infEvento Id="${id}">` +
      `<cOrgao>${cOrgao}</cOrgao>` +
      `<tpAmb>${tpAmb}</tpAmb>` +
      tagDocumento(cnpj) +
      `<chNFe>${chNFe}</chNFe>` +
      `<dhEvento>${dh}</dhEvento>` +
      `<tpEvento>${tpEvento}</tpEvento>` +
      `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
      `<verEvento>1.00</verEvento>` +
      `<detEvento versao="1.00"><descEvento>${descEvento}</descEvento></detEvento>` +
      `</infEvento>` +
      `</evento>`,
  };
}

// A NF-e ainda exige SHA-1 no XMLDSig (padrão legado do schema oficial,
// não é escolha nossa) — RSA-SHA1 + digest SHA1, canonicalização C14N.
function assinarEvento(xmlEvento, certPem, keyPem) {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xmlEvento, {
    location: { reference: "//*[local-name(.)='infEvento']", action: "after" },
  });
  return sig.getSignedXml();
}

function montarEnvelopeEvento({ idLote, eventoAssinadoXml }) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
    `<nfeDadosMsg>` +
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<idLote>${idLote}</idLote>` +
    eventoAssinadoXml +
    `</envEvento>` +
    `</nfeDadosMsg>` +
    `</nfeRecepcaoEvento>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function parsearRespostaEvento(xmlTexto) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
  let obj;
  try {
    obj = parser.parse(xmlTexto);
  } catch (e) {
    throw new ErroSefaz("Resposta da SEFAZ não é um XML válido.");
  }
  const body = obj.Envelope && obj.Envelope.Body;
  if (body && body.Fault) {
    throw new ErroSefaz(`SEFAZ retornou um erro SOAP: ${extrairMotivoFault(body.Fault)}`);
  }
  const result = body && body.nfeRecepcaoEventoResponse && body.nfeRecepcaoEventoResponse.nfeRecepcaoEventoResult;
  const ret = result && result.retEnvEvento;
  if (!ret) throw new ErroSefaz("Resposta da SEFAZ em formato inesperado (retEnvEvento não encontrado).");

  const retEventoBruto = ret.retEvento;
  const infEvento = Array.isArray(retEventoBruto)
    ? retEventoBruto[0] && retEventoBruto[0].infEvento
    : retEventoBruto && retEventoBruto.infEvento;

  return {
    cStatLote: String(ret.cStat || ""),
    xMotivoLote: ret.xMotivo || "",
    cStat: infEvento ? String(infEvento.cStat) : String(ret.cStat || ""),
    xMotivo: infEvento ? infEvento.xMotivo : ret.xMotivo || "",
  };
}

// cStat 573 = "Duplicidade de Evento": a SEFAZ já tem essa Ciência da
// Operação registrada para esta chave (ex.: manifestada antes por outra
// ferramenta, ou manualmente no site da Receita) — não é uma falha de
// verdade, é a confirmação de que a manifestação já existe.
const CSTAT_DUPLICIDADE_EVENTO = "573";

/**
 * Envia o evento 210210 (Ciência da Operação) para uma NF-e específica.
 *
 * cStat 135 = "Evento registrado e vinculado a NF-e" — sucesso real, o XML
 * completo passa a ficar disponível. cStat 136 = "registrado, mas NÃO
 * vinculado" — a SEFAZ aceitou o evento mas NÃO conseguiu linká-lo à nota
 * (não deve ser tratado como sucesso: o XML completo não vai ser liberado só
 * com isso, então deixamos cair pra "falha" e ser tentado de novo depois).
 *
 * @returns {{cStat: string, xMotivo: string, sucesso: boolean, jaManifestada: boolean}}
 */
async function enviarManifestacaoCiencia({ ambiente, uf, cnpj, chNFe, certPem, keyPem, nSeqEvento = 1 }) {
  const url = ENDPOINTS_EVENTO[ambiente] || ENDPOINTS_EVENTO[2];
  const cOrgao = UF_PARA_CODIGO[uf] || UF_PARA_CODIGO.DF;
  const { xml } = montarXmlEvento({ tpAmb: ambiente, cOrgao, cnpj, chNFe, tpEvento: 210210, nSeqEvento });
  const eventoAssinado = assinarEvento(xml, certPem, keyPem);
  const idLote = String(Date.now()).slice(-15).padStart(15, "0");
  const envelope = montarEnvelopeEvento({ idLote, eventoAssinadoXml: eventoAssinado });

  const resposta = await enviarSoap({ url, certPem, keyPem, envelopeXml: envelope, soapAction: SOAP_ACTION_EVENTO });
  if (resposta.statusCode >= 400 && resposta.statusCode !== 500) {
    throw new ErroSefaz(`SEFAZ respondeu HTTP ${resposta.statusCode}.`);
  }

  const analisada = parsearRespostaEvento(resposta.body);
  const sucesso = analisada.cStat === "135";
  const jaManifestada = analisada.cStat === CSTAT_DUPLICIDADE_EVENTO;
  return {
    cStat: analisada.cStat,
    xMotivo: analisada.xMotivo,
    sucesso,
    jaManifestada,
    eventoAssinadoXml: eventoAssinado,
  };
}

module.exports = { distribuirDfe, enviarManifestacaoCiencia, ErroSefaz, UF_PARA_CODIGO };
