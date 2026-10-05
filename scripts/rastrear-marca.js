// Descobre de qual conta vazou uma cópia dos scripts do site.
//
// Cada script entregue a um usuário logado leva uma impressão digital em
// caracteres invisíveis (ver api/_nfe/conteudo.js). Este script lê essa marca
// de um arquivo/trecho de texto copiado e a compara com a de cada usuário do
// banco — só quem tem o SESSION_SECRET consegue calcular essas marcas.
//
// Uso: node scripts/rastrear-marca.js caminho/do/arquivo-vazado.js
const fs = require("fs");
const path = require("path");
const { carregarEnvLocal } = require("./_env");
carregarEnvLocal();
const { query } = require("../api/_db");
const { impressaoDigital, BORDA, ZERO, UM } = require("../api/_nfe/conteudo");

(async () => {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.log("Uso: node scripts/rastrear-marca.js <arquivo-vazado>");
    process.exit(1);
  }
  const texto = fs.readFileSync(path.resolve(arquivo), "utf8");

  const marcas = [];
  const re = new RegExp(`${BORDA}([${ZERO}${UM}]{40})${BORDA}`, "g");
  let m;
  while ((m = re.exec(texto))) {
    const bits = m[1].split("").map((c) => (c === UM ? "1" : "0")).join("");
    marcas.push(Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))).toString("hex"));
  }
  const rotulo = (texto.match(/ref\. ([0-9a-f]{10})/) || [])[1];
  if (rotulo) marcas.push(rotulo);
  const unicas = [...new Set(marcas)];
  if (!unicas.length) {
    console.log("Nenhuma marca encontrada (o vazamento pode ter sido limpo ou vir de um arquivo sem marca).");
    process.exit(0);
  }
  console.log("Marca(s) encontrada(s):", unicas.join(", "));

  const usuarios = (await query("SELECT id, email, nome FROM usuarios")).rows;
  let achou = false;
  for (const u of usuarios) {
    const h = impressaoDigital(u.email).toString("hex");
    if (unicas.includes(h)) {
      achou = true;
      console.log(`=> Conta correspondente: #${u.id} ${u.email} (${u.nome})`);
    }
  }
  if (!achou) console.log("Nenhuma conta atual tem essa marca (conta apagada ou segredo diferente).");
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
