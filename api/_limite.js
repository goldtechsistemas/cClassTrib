// Limite de tentativas de login (força bruta): depois de algumas senhas erradas
// seguidas, o mesmo e-mail + mesmo IP fica bloqueado por um tempo. Sem isso
// qualquer pessoa podia tentar senhas sem parar. Guarda o contador no banco
// (a função serverless não tem memória entre uma chamada e outra).
//
// Duas chaves por tentativa:
//   - e-mail + IP: bloqueia quem insiste numa conta específica sem deixar um
//     terceiro travar a conta de outra pessoa a partir de outro lugar;
//   - só o IP (limite maior): bloqueia quem testa muitos e-mails diferentes.
const { query } = require("./_db");

const JANELA_MINUTOS = 15;
const MAX_FALHAS_POR_EMAIL_E_IP = 5;
const MAX_FALHAS_POR_IP = 25;

let tabelaGarantida = false;
async function garantirTabela() {
  if (tabelaGarantida) return;
  await query(`
    CREATE TABLE IF NOT EXISTS login_tentativas (
      chave TEXT PRIMARY KEY,
      falhas INTEGER NOT NULL DEFAULT 0,
      primeira_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      bloqueado_ate TIMESTAMPTZ
    );
  `);
  tabelaGarantida = true;
}

function ipDaRequisicao(req) {
  const encaminhado = String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim();
  return encaminhado || (req.socket && req.socket.remoteAddress) || "desconhecido";
}

function chavesDaTentativa(req, escopo, email) {
  const ip = ipDaRequisicao(req);
  return [
    { chave: `${escopo}|${String(email || "").slice(0, 120)}|${ip}`, limite: MAX_FALHAS_POR_EMAIL_E_IP },
    { chave: `${escopo}|ip|${ip}`, limite: MAX_FALHAS_POR_IP },
  ];
}

// Devolve os minutos restantes de bloqueio (0 = pode tentar).
async function minutosBloqueado(req, escopo, email) {
  await garantirTabela();
  const chaves = chavesDaTentativa(req, escopo, email).map((c) => c.chave);
  const r = await query(
    "SELECT max(bloqueado_ate) AS ate FROM login_tentativas WHERE chave = ANY($1) AND bloqueado_ate > now()",
    [chaves]
  );
  const ate = r.rows[0] && r.rows[0].ate;
  return ate ? Math.max(1, Math.round((new Date(ate).getTime() - Date.now()) / 60000)) : 0;
}

async function registrarFalha(req, escopo, email) {
  await garantirTabela();
  for (const { chave, limite } of chavesDaTentativa(req, escopo, email)) {
    await query(
      `INSERT INTO login_tentativas (chave, falhas, primeira_em, bloqueado_ate)
       VALUES ($1, 1, now(), NULL)
       ON CONFLICT (chave) DO UPDATE SET
         falhas = CASE WHEN login_tentativas.primeira_em < now() - ($3 || ' minutes')::interval THEN 1 ELSE login_tentativas.falhas + 1 END,
         primeira_em = CASE WHEN login_tentativas.primeira_em < now() - ($3 || ' minutes')::interval THEN now() ELSE login_tentativas.primeira_em END,
         bloqueado_ate = CASE
           WHEN (CASE WHEN login_tentativas.primeira_em < now() - ($3 || ' minutes')::interval THEN 1 ELSE login_tentativas.falhas + 1 END) >= $2
           THEN now() + ($3 || ' minutes')::interval
           ELSE NULL END`,
      [chave, limite, String(JANELA_MINUTOS)]
    );
  }
}

// Entrou com sucesso: zera o contador daquele e-mail + IP.
async function limparFalhas(req, escopo, email) {
  await garantirTabela();
  const [porEmail] = chavesDaTentativa(req, escopo, email);
  await query("DELETE FROM login_tentativas WHERE chave = $1", [porEmail.chave]);
}

function mensagemBloqueio(minutos) {
  return `Muitas tentativas de entrada. Aguarde ${minutos} minuto(s) e tente de novo.`;
}

module.exports = { minutosBloqueado, registrarFalha, limparFalhas, mensagemBloqueio };
