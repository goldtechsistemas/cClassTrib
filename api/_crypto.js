const crypto = require("crypto");

// Criptografia simétrica (AES-256-GCM) usada só pelo módulo de Notas
// Fiscais, para guardar o certificado digital (.pfx) e a senha dele em
// repouso no banco. Nunca gravar esses dois campos em texto puro.
function chave() {
  const b64 = process.env.CERT_ENCRYPTION_KEY;
  if (!b64) throw new Error("CERT_ENCRYPTION_KEY não configurado.");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) throw new Error("CERT_ENCRYPTION_KEY precisa decodificar para 32 bytes (AES-256).");
  return buf;
}

function encryptSecret(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const enc = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptSecret(base64Token) {
  const raw = Buffer.from(base64Token, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", chave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

module.exports = { encryptSecret, decryptSecret };
