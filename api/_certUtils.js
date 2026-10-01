/*
 * Leitura e validação de certificados digitais A1 (.pfx / PKCS#12), usando
 * node-forge (puro JS, sem dependência nativa — importante para rodar em
 * Vercel Functions).
 *
 * Extrai o CNPJ do campo Subject/CN do certificado, que no padrão ICP-Brasil
 * para e-CNPJ costuma vir como "RAZAO SOCIAL:12345678000100". Também tenta,
 * de forma best-effort, a extensão SubjectAlternativeName com OtherName OID
 * 2.16.76.1.3.3 (outro local onde a ICP-Brasil registra o CNPJ) — se a
 * extração falhar por qualquer motivo, isso é ignorado silenciosamente e o
 * CN continua sendo a fonte confiável.
 */
const forge = require("node-forge");

class CertificadoInvalido extends Error {}

const CNPJ_OTHERNAME_OID = "2.16.76.1.3.3";
const CPF_OTHERNAME_OID = "2.16.76.1.3.1";

function somenteDigitos(s) {
  return String(s || "").replace(/\D/g, "");
}

// Fallback pra e-CNPJ: no padrao ICP-Brasil o CN vem como "RAZAO SOCIAL:CNPJ"
// — exige os 14 digitos logo apos o primeiro ":" (nao "quaisquer 14 digitos
// soltos no texto", que em certificados de pessoa fisica pode pegar lixo de
// outro campo e mandar um "CNPJ" invalido pra SEFAZ sem avisar ninguem).
function extrairCnpjDoSubject(cert) {
  const cn = cert.subject.getField("CN");
  const texto = cn ? cn.value : cert.subject.attributes.map((a) => a.value).join(" ");
  const idx = texto.indexOf(":");
  const apos = idx === -1 ? texto : texto.slice(idx + 1);
  const digitos = somenteDigitos(apos);
  return digitos.length === 14 ? digitos : null;
}

// Alguns emissores de e-CPF gravam o CPF por extenso e rotulado no CN (ex.:
// "JOSE LUIZ VIEIRA CPF 234.440.296-91"), fora do padrao "NOME:documento" —
// pega isso explicitamente em vez de arriscar casar dígitos de outro campo.
function extrairCpfRotuladoDoCn(cert) {
  const cn = cert.subject.getField("CN");
  const texto = cn ? cn.value : cert.subject.attributes.map((a) => a.value).join(" ");
  const m = texto.match(/CPF[:\s]*?(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  return m ? somenteDigitos(m[1]) : null;
}

// No padrao ICP-Brasil para e-CNPJ, o CN vem como "RAZAO SOCIAL:CNPJ" — a
// razao social "de verdade" e so a parte antes dos dois-pontos, nao o
// Subject inteiro (que tambem tem C=, O=, OU=, ST=, L= etc., irrelevantes
// para exibir como nome da empresa/pessoa).
function extrairRazaoSocial(cert) {
  const cn = cert.subject.getField("CN");
  if (!cn || !cn.value) return null;
  const idx = cn.value.indexOf(":");
  let nome = (idx === -1 ? cn.value : cn.value.slice(0, idx)).trim();
  // Tira o CPF rotulado por extenso do fallback acima, se estiver colado no
  // nome (ex.: "JOSE LUIZ VIEIRA CPF 234.440.296-91" -> "JOSE LUIZ VIEIRA").
  nome = nome.replace(/\s*CPF[:\s]*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\s*$/i, "").trim();
  return nome || null;
}

function extrairUf(cert) {
  const campo = cert.subject.getField("ST") || cert.subject.getField("stateOrProvinceName");
  const uf = campo && campo.value ? String(campo.value).trim().toUpperCase() : null;
  return uf && /^[A-Z]{2}$/.test(uf) ? uf : null;
}

// Tentativa best-effort — a estrutura interna do node-forge para otherName
// (tipo 0 do SAN) não é totalmente documentada; qualquer erro aqui é
// silencioso e cai para os fallbacks pelo CN. Reconhece tanto e-CNPJ (OID
// 2.16.76.1.3.3, documento vem no meio de um campo composto, offset 8)
// quanto e-CPF (OID 2.16.76.1.3.1, CPF vem no início do campo, offset 0).
function extrairDocumentoDoSan(cert) {
  try {
    const ext = cert.getExtension("subjectAltName");
    if (!ext || !Array.isArray(ext.altNames)) return null;
    for (const alt of ext.altNames) {
      if (alt.type !== 0 || !alt.value) continue;
      const asn1 = forge.asn1.fromDer(alt.value);
      const oidNode = asn1.value && asn1.value[0];
      if (!oidNode) continue;
      const oid = forge.asn1.derToOid(oidNode.value);
      if (oid !== CNPJ_OTHERNAME_OID && oid !== CPF_OTHERNAME_OID) continue;
      const tagged = asn1.value[1];
      const inner = tagged && tagged.value && tagged.value[0];
      const bruto = inner && inner.value;
      if (!bruto) continue;
      const digitos = somenteDigitos(bruto);
      if (oid === CNPJ_OTHERNAME_OID) {
        if (digitos.length >= 22) return { documento: digitos.slice(8, 22), tipoDocumento: "CNPJ" };
        if (digitos.length === 14) return { documento: digitos, tipoDocumento: "CNPJ" };
      } else if (digitos.length >= 11) {
        return { documento: digitos.slice(0, 11), tipoDocumento: "CPF" };
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

// "NOME:CPF" — o e-CPF padrão ICP-Brasil (11 dígitos logo após o ":").
function extrairCpfDoSubject(cert) {
  const cn = cert.subject.getField("CN");
  const texto = cn ? cn.value : "";
  const idx = texto.indexOf(":");
  if (idx === -1) return null;
  const digitos = somenteDigitos(texto.slice(idx + 1));
  return digitos.length === 11 ? digitos : null;
}

// Ordem: SAN (mais confiável, estrutura tipada) -> CNPJ logo após ":" no CN
// -> CPF. O CNPJ vem antes do CPF rotulado de propósito: certificado de
// empresa (e-CNPJ) de empresário individual traz o CPF do titular escrito no
// nome ("JOSE LUIZ VIEIRA CPF 234440296-91:02694338000116") e quem consulta
// a SEFAZ é o CNPJ, não o CPF — usar o CPF ali faz a SEFAZ rejeitar com
// "CNPJ-Base consultado difere do CNPJ-Base do Certificado Digital". Se
// nada bater, não inventa nada — melhor recusar o certificado do que mandar
// um documento errado pra SEFAZ.
function extrairDocumento(cert) {
  const doSan = extrairDocumentoDoSan(cert);
  if (doSan) return doSan;
  const cnpj = extrairCnpjDoSubject(cert);
  if (cnpj) return { documento: cnpj, tipoDocumento: "CNPJ" };
  const cpf = extrairCpfDoSubject(cert) || extrairCpfRotuladoDoCn(cert);
  if (cpf && cpf.length === 11) return { documento: cpf, tipoDocumento: "CPF" };
  return null;
}

function _abrirP12(pfxBuffer, senha) {
  let p12;
  try {
    const p12Der = forge.util.createBuffer(pfxBuffer.toString("binary"));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);
  } catch (e) {
    throw new CertificadoInvalido("Senha do certificado incorreta ou arquivo .pfx inválido/corrompido.");
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBagList = certBags[forge.pki.oids.certBag] || [];
  if (!certBagList.length) {
    throw new CertificadoInvalido("Não foi possível ler o certificado dentro do arquivo .pfx.");
  }
  const cert = certBagList[0].cert;

  const keyBagTypes = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag];
  let privateKey = null;
  for (const tipo of keyBagTypes) {
    const bags = (p12.getBags({ bagType: tipo })[tipo] || []);
    if (bags.length) {
      privateKey = bags[0].key;
      break;
    }
  }
  if (!privateKey) {
    throw new CertificadoInvalido(
      "O arquivo não contém uma chave privada exportável — isso indica um certificado A3 (cartão/token). " +
        "Apenas certificados A1 (arquivo) são suportados."
    );
  }

  return { p12, cert, privateKey, certBagList };
}

/**
 * @param {Buffer} pfxBuffer conteúdo bruto do .pfx
 * @param {string} senha
 * @returns {{cnpj: string, subject: string, validFrom: Date, validUntil: Date}}
 */
function carregarCertificado(pfxBuffer, senha) {
  const { cert } = _abrirP12(pfxBuffer, senha);

  const agora = new Date();
  if (agora > cert.validity.notAfter) {
    throw new CertificadoInvalido(
      `Certificado vencido em ${cert.validity.notAfter.toLocaleDateString("pt-BR")}.`
    );
  }
  if (agora < cert.validity.notBefore) {
    throw new CertificadoInvalido(
      `Certificado ainda não é válido (válido a partir de ${cert.validity.notBefore.toLocaleDateString("pt-BR")}).`
    );
  }

  const info = extrairDocumento(cert);
  if (!info) {
    throw new CertificadoInvalido("Não foi possível identificar o CNPJ/CPF no certificado.");
  }

  return {
    cnpj: info.documento,
    tipoDocumento: info.tipoDocumento,
    razaoSocial: extrairRazaoSocial(cert) || info.documento,
    uf: extrairUf(cert),
    subject: cert.subject.attributes.map((a) => `${a.shortName || a.name}=${a.value}`).join(", "),
    validFrom: cert.validity.notBefore,
    validUntil: cert.validity.notAfter,
  };
}

/**
 * Extrai o certificado e a chave privada em PEM, para autenticação mTLS
 * nas chamadas SOAP à SEFAZ (distDFeInt). Inclui, quando presentes no .pfx,
 * certificados intermediários adicionais (cadeia), concatenados após o
 * certificado principal — alguns emissores incluem a cadeia da AC no .pfx.
 *
 * @param {Buffer} pfxBuffer
 * @param {string} senha
 * @returns {{certPem: string, keyPem: string, cnpj: string}}
 */
function extrairParaMtls(pfxBuffer, senha) {
  const { cert, privateKey, certBagList } = _abrirP12(pfxBuffer, senha);

  const outrosCerts = certBagList
    .slice(1)
    .map((bag) => bag.cert)
    .filter(Boolean);

  const certPem = [cert, ...outrosCerts].map((c) => forge.pki.certificateToPem(c)).join("\n");
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  const info = extrairDocumento(cert);

  return { certPem, keyPem, cnpj: info ? info.documento : null };
}

module.exports = { carregarCertificado, extrairParaMtls, CertificadoInvalido };
