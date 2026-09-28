// Gera um certificado .pfx autoassinado (com CNPJ no CN, no padrão
// "RAZAO SOCIAL:CNPJ" usado pela ICP-Brasil) só para testes locais do
// módulo de Notas Fiscais — NÃO é um certificado real de verdade.
// Uso: node scripts/gerar-certificado-teste.js [cnpj] [senha] [caminhoSaida]
const fs = require("fs");
const forge = require("node-forge");

function gerar(cnpj, senha) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const attrs = [{ name: "commonName", value: `EMPRESA TESTE LTDA:${cnpj}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: "3des" });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, "binary");
}

if (require.main === module) {
  const cnpj = process.argv[2] || "11222333000181";
  const senha = process.argv[3] || "senha-teste-123";
  const saida = process.argv[4] || "scratchpad-certificado-teste.pfx";
  fs.writeFileSync(saida, gerar(cnpj, senha));
  console.log(`Gerado ${saida} (CNPJ ${cnpj}, senha "${senha}")`);
}

module.exports = { gerar };
