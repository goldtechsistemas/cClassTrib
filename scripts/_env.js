// Lê .env.local (gerado por `vercel env pull`) e preenche process.env — só
// pra scripts de desenvolvimento locais, nunca usado em produção (lá as
// env vars já vêm do próprio Vercel). Nunca sobrescreve uma variável que já
// esteja definida no ambiente (respeita o shell do dev).
const fs = require("fs");
const path = require("path");

function carregarEnvLocal() {
  const arquivo = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(arquivo)) return;
  const conteudo = fs.readFileSync(arquivo, "utf8");
  conteudo.split("\n").forEach((linha) => {
    const l = linha.trim();
    if (!l || l.startsWith("#")) return;
    const idx = l.indexOf("=");
    if (idx === -1) return;
    const chave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!(chave in process.env)) process.env[chave] = valor;
  });
}

module.exports = { carregarEnvLocal };
