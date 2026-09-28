// Roda uma vez (localmente) para criar as tabelas no Postgres e a conta
// admin inicial. Uso: node scripts/init-db.js
//
// Lê a connection string de .env.local (gerado por `vercel env pull`) — não
// tem segredo nenhum no código, só no .env.local (que está no .gitignore).
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { carregarEnvLocal } = require("./_env");

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

  // Módulo "Notas Fiscais de Compra" (NF-e recebidas) — usa o mesmo login
  // do site (usuarios.id), isolado por usuario_id em cada tabela.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfe_empresas (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      cnpj TEXT NOT NULL,
      razao_social TEXT NOT NULL DEFAULT '',
      uf CHAR(2),
      cert_encrypted TEXT,
      cert_password_encrypted TEXT,
      cert_valid_until TIMESTAMPTZ,
      cert_subject TEXT,
      ambiente SMALLINT NOT NULL DEFAULT 1,
      ult_nsu TEXT NOT NULL DEFAULT '0',
      ultima_sincronizacao TIMESTAMPTZ,
      proxima_consulta_permitida_em TIMESTAMPTZ,
      manifestacao_automatica BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (usuario_id, cnpj)
    );
  `);
  // ALTER idempotente — cobre bancos onde nfe_empresas já existia antes da
  // coluna uf ser adicionada (o CREATE TABLE IF NOT EXISTS acima não altera
  // uma tabela já existente).
  await pool.query(`ALTER TABLE nfe_empresas ADD COLUMN IF NOT EXISTS uf CHAR(2);`);
  // Padrão do módulo passou a ser produção (1) em vez de homologação (2) —
  // decisão explícita do usuário (não quer ficar alternando ambiente).
  await pool.query(`ALTER TABLE nfe_empresas ALTER COLUMN ambiente SET DEFAULT 1;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfe_documentos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES nfe_empresas(id) ON DELETE CASCADE,
      ch_nfe TEXT NOT NULL,
      nsu TEXT NOT NULL,
      tipo TEXT NOT NULL,
      numero TEXT,
      serie TEXT,
      emit_cnpj TEXT,
      emit_nome TEXT,
      emit_uf TEXT,
      dest_cnpj TEXT,
      dh_emi TIMESTAMPTZ,
      v_nf NUMERIC(14, 2),
      situacao TEXT,
      xml_completo TEXT,
      manifestacao TEXT NOT NULL DEFAULT 'nenhuma',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, ch_nfe)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfe_eventos (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES nfe_empresas(id) ON DELETE CASCADE,
      ch_nfe TEXT NOT NULL,
      tp_evento TEXT NOT NULL,
      n_seq_evento INTEGER NOT NULL DEFAULT 1,
      xml TEXT,
      dh_evento TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfe_sync_logs (
      id SERIAL PRIMARY KEY,
      empresa_id INTEGER NOT NULL REFERENCES nfe_empresas(id) ON DELETE CASCADE,
      iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      c_stat TEXT,
      x_motivo TEXT,
      docs_novos INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Índices — Postgres NÃO indexa colunas de chave estrangeira sozinho, e
  // toda consulta do módulo filtra por empresa_id; sem isso vira table scan
  // conforme as tabelas crescem.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nfe_documentos_empresa_dhemi ON nfe_documentos (empresa_id, dh_emi DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nfe_documentos_pendentes ON nfe_documentos (empresa_id, tipo, manifestacao);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nfe_eventos_empresa ON nfe_eventos (empresa_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nfe_sync_logs_empresa ON nfe_sync_logs (empresa_id, iniciado_em DESC);`);
  console.log("Tabelas e índices OK.");

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
