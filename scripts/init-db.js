// Roda uma vez (localmente) para criar as tabelas no Postgres e a conta
// admin inicial. Uso: node scripts/init-db.js
//
// Lê a connection string de .env.local (gerado por `vercel env pull`) — não
// tem segredo nenhum no código, só no .env.local (que está no .gitignore).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

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

async function main() {
  carregarEnvLocal();
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL não encontrado — rode `vercel env pull .env.local` antes.");
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Criando tabelas...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("Tabelas OK.");

  const emailAdmin = process.argv[2] || "goldtechsistemas@gmail.com";
  const { rows } = await pool.query("SELECT id FROM admins WHERE email = $1", [emailAdmin]);
  if (rows.length) {
    console.log(`Já existe um admin com o e-mail ${emailAdmin} — nada a fazer.`);
    await pool.end();
    return;
  }

  const senhaGerada = crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x");
  const hash = await bcrypt.hash(senhaGerada, 12);
  await pool.query("INSERT INTO admins (email, senha_hash) VALUES ($1, $2)", [emailAdmin, hash]);

  console.log("\n=== CONTA ADMIN CRIADA ===");
  console.log("E-mail:", emailAdmin);
  console.log("Senha :", senhaGerada);
  console.log("Guarde essa senha agora — ela não fica salva em nenhum lugar em texto puro.");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
