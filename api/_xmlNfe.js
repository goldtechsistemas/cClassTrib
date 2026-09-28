/*
 * Lê o XML completo (nfeProc) recebido da SEFAZ e devolve um objeto
 * estruturado com tudo que o DANFE precisa: identificação, emitente,
 * destinatário, itens, totais de impostos e protocolo de autorização.
 */
const { XMLParser } = require("fast-xml-parser");

function paraArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function txt(v) {
  return v == null ? "" : String(v);
}

// O grupo <ICMS> tem um filho só, cujo nome varia conforme o CST/CSOSN
// (ICMS00, ICMS10, ICMS20, ICMS40, ICMS51, ICMS60, ICMS70, ICMS90,
// ICMSSN101, ICMSSN102...). Pegamos o que existir, seja qual for o nome.
function grupoUnico(obj) {
  if (!obj) return {};
  const chaves = Object.keys(obj);
  return chaves.length ? obj[chaves[0]] : {};
}

function extrairEndereco(ender) {
  if (!ender) return null;
  return {
    logradouro: txt(ender.xLgr),
    numero: txt(ender.nro),
    bairro: txt(ender.xBairro),
    municipio: txt(ender.xMun),
    uf: txt(ender.UF),
    cep: txt(ender.CEP),
    fone: txt(ender.fone),
  };
}

/**
 * @param {string} xmlTexto conteúdo bruto do nfeProc (ou só NFe, se vier sem o protocolo)
 */
function interpretarXmlCompleto(xmlTexto) {
  // parseTagValue:false é essencial aqui — senão CNPJ/CEP/códigos com zero à
  // esquerda perdem o zero (viram número), e um CST "00" vira 0 (falsy),
  // quebrando o fallback "icms.CST || icms.CSOSN".
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false });
  const obj = parser.parse(xmlTexto);

  const nfe = obj.nfeProc ? obj.nfeProc.NFe : obj.NFe;
  const infNFe = nfe && nfe.infNFe;
  if (!infNFe) return null;

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = (infNFe.total && infNFe.total.ICMSTot) || {};
  const infAdic = infNFe.infAdic || {};
  const protNFe = obj.nfeProc && obj.nfeProc.protNFe;
  const infProt = protNFe && protNFe.infProt;

  const itens = paraArray(infNFe.det).map((det) => {
    const prod = det.prod || {};
    const imposto = det.imposto || {};
    const icms = grupoUnico(imposto.ICMS);
    const ipiTrib = (imposto.IPI && imposto.IPI.IPITrib) || {};
    return {
      numero: det["@_nItem"],
      codigo: txt(prod.cProd),
      descricao: txt(prod.xProd),
      ncm: txt(prod.NCM),
      origem: txt(icms.orig),
      cst: txt(icms.CST || icms.CSOSN),
      cfop: txt(prod.CFOP),
      unidade: txt(prod.uCom),
      quantidade: num(prod.qCom),
      valorUnitario: num(prod.vUnCom),
      valorTotal: num(prod.vProd),
      baseIcms: num(icms.vBC),
      aliquotaIcms: num(icms.pICMS),
      valorIcms: num(icms.vICMS),
      baseIcmsSt: num(icms.vBCST),
      aliquotaIcmsSt: num(icms.pICMSST),
      valorIcmsSt: num(icms.vICMSST),
      aliquotaIpi: num(ipiTrib.pIPI),
      valorIpi: num(ipiTrib.vIPI),
    };
  });

  const cobr = infNFe.cobr || {};
  const fat = cobr.fat || null;
  const duplicatas = paraArray(cobr.dup).map((d) => ({
    numero: txt(d.nDup),
    vencimento: d.dVenc ? new Date(`${d.dVenc}T00:00:00`) : null,
    valor: num(d.vDup),
  }));

  const transp = infNFe.transp || {};
  const transporta = transp.transporta || {};
  const volumes = paraArray(transp.vol).map((v) => ({
    quantidade: txt(v.qVol),
    especie: txt(v.esp),
    marca: txt(v.marca),
    numeracao: txt(v.nVol),
    pesoBruto: txt(v.pesoB),
    pesoLiquido: txt(v.pesoL),
  }));
  const MOD_FRETE = { 0: "0 - Emitente", 1: "1 - Destinatário", 2: "2 - Terceiros", 3: "3 - Próprio por conta remetente", 4: "4 - Próprio por conta destinatário", 9: "9 - Sem frete" };

  return {
    chave: (infNFe["@_Id"] || "").replace(/^NFe/, ""),
    numero: txt(ide.nNF),
    serie: txt(ide.serie),
    naturezaOperacao: txt(ide.natOp),
    dataEmissao: ide.dhEmi ? new Date(ide.dhEmi) : null,
    dataSaidaEntrada: ide.dhSaiEnt ? new Date(ide.dhSaiEnt) : null,
    tipoOperacao: String(ide.tpNF) === "1" ? "Saída" : "Entrada",
    tipoAmbiente: String(ide.tpAmb) === "1" ? "Produção" : "Homologação",

    emitente: {
      cnpj: txt(emit.CNPJ),
      nome: txt(emit.xNome),
      fantasia: txt(emit.xFant),
      ie: txt(emit.IE),
      ieSt: txt(emit.IEST),
      endereco: extrairEndereco(emit.enderEmit),
    },
    destinatario: {
      cnpj: txt(dest.CNPJ || dest.CPF),
      nome: txt(dest.xNome),
      ie: txt(dest.IE),
      endereco: extrairEndereco(dest.enderDest),
    },

    itens,

    fatura: fat ? { numero: txt(fat.nFat), valorOriginal: num(fat.vOrig), valorDesconto: num(fat.vDesc), valorLiquido: num(fat.vLiq) } : null,
    duplicatas,

    transportador: {
      modalidadeFrete: MOD_FRETE[String(transp.modFrete)] || txt(transp.modFrete),
      nome: txt(transporta.xNome),
      cnpj: txt(transporta.CNPJ || transporta.CPF),
      ie: txt(transporta.IE),
      endereco: txt(transporta.xEnder),
      municipio: txt(transporta.xMun),
      uf: txt(transporta.UF),
      volumes,
    },

    totais: {
      baseIcms: num(total.vBC),
      valorIcms: num(total.vICMS),
      baseIcmsSt: num(total.vBCST),
      valorIcmsSt: num(total.vST),
      valorImportacao: num(total.vII),
      valorCofins: num(total.vCOFINS),
      valorPis: num(total.vPIS),
      valorIcmsUfRemetente: num(total.vICMSUFRemet),
      valorIcmsUfDestino: num(total.vICMSUFDest),
      valorFcp: num(total.vFCP),
      valorTotalTributos: num(total.vTotTrib),
      valorProdutos: num(total.vProd),
      valorFrete: num(total.vFrete),
      valorSeguro: num(total.vSeg),
      valorDesconto: num(total.vDesc),
      valorOutrasDespesas: num(total.vOutro),
      valorIpi: num(total.vIPI),
      valorTotalNota: num(total.vNF),
    },

    informacoesComplementares: txt(infAdic.infCpl),

    protocolo: infProt
      ? {
          numero: txt(infProt.nProt),
          dataRecebimento: infProt.dhRecbto ? new Date(infProt.dhRecbto) : null,
          situacao: txt(infProt.xMotivo),
        }
      : null,
  };
}

module.exports = { interpretarXmlCompleto };
