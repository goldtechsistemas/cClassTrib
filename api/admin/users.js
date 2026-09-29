const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoAdmin } = require("../_lib");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MINIMO_SENHA = 6;

// Sem caracteres que se confundem ao ler/copiar (0/O, 1/l/I).
const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function gerarSenhaProvisoria(tamanho = 12) {
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += ALFABETO_SENHA[crypto.randomInt(ALFABETO_SENHA.length)];
  return senha;
}

async function criarUsuario(req, res) {
  const corpo = corpoJson(req);
  const email = String(corpo.email || "").trim().toLowerCase();
  const nome = String(corpo.nome || "").trim();
  const senhaDigitada = String(corpo.senhaProvisoria || "");

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ ok: false, erro: "Preencha um e-mail válido." });
    return;
  }
  if (!nome) {
    res.status(400).json({ ok: false, erro: "Preencha o nome." });
    return;
  }
  if (senhaDigitada && senhaDigitada.length < TAMANHO_MINIMO_SENHA) {
    res.status(400).json({ ok: false, erro: `A senha provisória precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.` });
    return;
  }

  const existente = await query("SELECT id FROM usuarios WHERE email = $1", [email]);
  if (existente.rows.length) {
    res.status(409).json({ ok: false, erro: "Já existe uma conta com este e-mail." });
    return;
  }

  // Em branco = gera uma senha aleatória. Ela só é devolvida agora, nesta
  // resposta — no banco fica apenas o hash.
  const senhaProvisoria = senhaDigitada || gerarSenhaProvisoria();
  const hash = await bcrypt.hash(senhaProvisoria, 12);
  const criado = await query(
    `INSERT INTO usuarios (email, nome, senha_hash, precisa_trocar_senha)
     VALUES ($1, $2, $3, true)
     RETURNING id, email, nome, bloqueado, precisa_trocar_senha, criado_em`,
    [email, nome, hash]
  );
  res.status(201).json({ ok: true, usuario: criado.rows[0], senhaProvisoria });
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  if (!lerSessaoAdmin(req)) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  try {
    if (req.method === "POST") {
      await criarUsuario(req, res);
      return;
    }
    const resultado = await query(
      "SELECT id, email, nome, bloqueado, precisa_trocar_senha, criado_em FROM usuarios ORDER BY criado_em DESC"
    );
    res.status(200).json({ ok: true, usuarios: resultado.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
