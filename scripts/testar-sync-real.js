// Teste manual (dev-only): chama a SEFAZ de verdade usando um certificado
// JÁ cadastrado no banco (decifra em memória, nunca imprime segredo).
// NÃO grava nada no banco (não avança ult_nsu) — só valida se o código do
// cliente SEFAZ funciona ponta a ponta. Uso: node scripts/testar-sync-real.js [empresaId]
const { carregarEnvLocal } = require("./_env");
carregarEnvLocal();

const { query, getPool } = require("../api/_db");
const { decryptSecret } = require("../api/_crypto");
const { extrairParaMtls } = require("../api/_certUtils");
const { distribuirDfe } = require("../api/_sefazClient");

async function main() {
  const empresaId = process.argv[2];

  const { rows } = empresaId
    ? await query("SELECT * FROM nfe_empresas WHERE id = $1", [empresaId])
    : await query("SELECT * FROM nfe_empresas ORDER BY id DESC LIMIT 1");
  const empresa = rows[0];
  if (!empresa) throw new Error("Nenhuma empresa encontrada.");

  console.log(`Empresa #${empresa.id} — CNPJ ${empresa.cnpj} — UF ${empresa.uf} — ambiente ${empresa.ambiente === 1 ? "PRODUÇÃO" : "homologação"}`);
  console.log(`ult_nsu atual (não será alterado por este teste): ${empresa.ult_nsu}`);

  const pfxBuffer = decryptSecret(empresa.cert_encrypted);
  const senha = decryptSecret(empresa.cert_password_encrypted).toString("utf8");
  const { certPem, keyPem, cnpj: cnpjDoCert } = extrairParaMtls(pfxBuffer, senha);
  console.log(`CNPJ extraído do certificado na hora: ${cnpjDoCert} (confere com o salvo: ${cnpjDoCert === empresa.cnpj})`);

  console.log("Chamando a SEFAZ (NFeDistribuicaoDFe / distDFeInt)...");
  const inicio = Date.now();
  const resultado = await distribuirDfe({
    ambiente: empresa.ambiente,
    uf: empresa.uf,
    cnpj: empresa.cnpj,
    ultNsu: empresa.ult_nsu,
    certPem,
    keyPem,
  });
  console.log(`Respondeu em ${Date.now() - inicio}ms`);
  console.log("cStat:", resultado.cStat, "-", resultado.xMotivo);
  console.log("ultNSU:", resultado.ultNSU, "maxNSU:", resultado.maxNSU);
  console.log("Documentos no lote:", resultado.documentos.length);
  console.log("Eventos no lote:", resultado.eventos.length);
  if (resultado.documentos.length) {
    console.log("Primeiro documento:", JSON.stringify(resultado.documentos[0], null, 2));
  }

  await getPool().end();
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
