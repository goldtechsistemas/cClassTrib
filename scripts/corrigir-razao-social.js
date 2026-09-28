// Correção pontual: empresas cadastradas antes da correção da extração da
// razão social ficaram com o Subject inteiro do certificado (C=BR, O=...,
// CN=...) em vez de só o nome. Recalcula a partir de cert_subject (que já
// guarda o Subject completo) para as linhas existentes.
// Uso: node scripts/corrigir-razao-social.js
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
carregarEnvLocal();

const { Pool } = require("pg");

function extrairDoSubject(subject) {
  const mCn = subject.match(/CN=([^,]+)/);
  const mSt = subject.match(/ST=([^,]+)/);
  let razaoSocial = null;
  if (mCn) {
    const valor = mCn[1].trim();
    const idx = valor.indexOf(":");
    razaoSocial = (idx === -1 ? valor : valor.slice(0, idx)).trim();
  }
  const uf = mSt ? mSt[1].trim().toUpperCase() : null;
  return { razaoSocial, uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null };
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL não encontrado — rode `vercel env pull .env.local` antes.");
  }
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

  const { rows } = await pool.query("SELECT id, razao_social, uf, cert_subject FROM nfe_empresas WHERE cert_subject IS NOT NULL");
  let corrigidas = 0;
  for (const row of rows) {
    const { razaoSocial, uf } = extrairDoSubject(row.cert_subject);
    if (!razaoSocial) continue;
    const precisaCorrigir = row.razao_social !== razaoSocial || row.uf !== uf;
    if (!precisaCorrigir) continue;
    await pool.query("UPDATE nfe_empresas SET razao_social = $1, uf = $2 WHERE id = $3", [razaoSocial, uf, row.id]);
    console.log(`Empresa #${row.id}: "${row.razao_social}" -> "${razaoSocial}" (UF: ${uf || "?"})`);
    corrigidas++;
  }
  console.log(corrigidas ? `${corrigidas} empresa(s) corrigida(s).` : "Nenhuma empresa precisava de correção.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
