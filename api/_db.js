const { Pool } = require("pg");

// POSTGRES_URL é a connection string com pooling (PgBouncer) que a integração
// Neon/Vercel Postgres injeta automaticamente no projeto — a certa para usar
// dentro de funções serverless (cada invocação é curta, não vale a pena abrir
// conexão direta sem pooler).
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function query(texto, parametros) {
  return getPool().query(texto, parametros);
}

module.exports = { query, getPool };
