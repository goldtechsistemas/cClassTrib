// Rota dinâmica: /api/conta/nome, /api/conta/email, /api/conta/senha —
// consolidadas num arquivo só (Vercel Hobby limita a 12 Serverless
// Functions por deploy; eram 3 arquivos separados, agora contam como 1).
const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoUsuario, iniciarSessaoUsuario } = require("../_lib");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function alterarNome(req, res, sessao) {
  const novoNome = String(corpoJson(req).nome || "").trim();
  if (!novoNome) {
    res.status(400).json({ ok: false, erro: "Preencha o nome." });
    return;
  }
  await query("UPDATE usuarios SET nome = $1 WHERE email = $2", [novoNome, sessao.email]);
  iniciarSessaoUsuario(res, { email: sessao.email, nome: novoNome }, sessao.lembrar);
  res.status(200).json({ ok: true });
}

async function alterarEmail(req, res, sessao) {
  const corpo = corpoJson(req);
  const novoEmail = String(corpo.novoEmail || "").trim().toLowerCase();
  const senhaAtual = String(corpo.senhaAtual || "");

  if (!EMAIL_REGEX.test(novoEmail)) {
    res.status(400).json({ ok: false, erro: "Preencha um e-mail válido." });
    return;
  }
  if (novoEmail === sessao.email) {
    res.status(400).json({ ok: false, erro: "Esse já é o e-mail atual." });
    return;
  }

  const atual = await query("SELECT senha_hash FROM usuarios WHERE email = $1", [sessao.email]);
  if (!atual.rows.length || !(await bcrypt.compare(senhaAtual, atual.rows[0].senha_hash))) {
    res.status(401).json({ ok: false, erro: "Senha atual incorreta." });
    return;
  }

  const existente = await query("SELECT id FROM usuarios WHERE email = $1", [novoEmail]);
  if (existente.rows.length) {
    res.status(409).json({ ok: false, erro: "Já existe uma conta com este e-mail." });
    return;
  }

  await query("UPDATE usuarios SET email = $1 WHERE email = $2", [novoEmail, sessao.email]);
  iniciarSessaoUsuario(res, { email: novoEmail, nome: sessao.nome }, sessao.lembrar);
  res.status(200).json({ ok: true, email: novoEmail });
}

async function alterarSenha(req, res, sessao) {
  const corpo = corpoJson(req);
  const senhaAtual = String(corpo.senhaAtual || "");
  const novaSenha = String(corpo.novaSenha || "");

  if (novaSenha.length < 6) {
    res.status(400).json({ ok: false, erro: "A nova senha precisa ter no mínimo 6 caracteres." });
    return;
  }

  const atual = await query("SELECT senha_hash FROM usuarios WHERE email = $1", [sessao.email]);
  if (!atual.rows.length || !(await bcrypt.compare(senhaAtual, atual.rows[0].senha_hash))) {
    res.status(401).json({ ok: false, erro: "Senha atual incorreta." });
    return;
  }

  const novoHash = await bcrypt.hash(novaSenha, 12);
  await query("UPDATE usuarios SET senha_hash = $1 WHERE email = $2", [novoHash, sessao.email]);
  res.status(200).json({ ok: true });
}

const ACOES = { nome: alterarNome, email: alterarEmail, senha: alterarSenha };

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }
  const sessao = lerSessaoUsuario(req);
  if (!sessao) {
    res.status(401).json({ ok: false, erro: "Sessão expirada. Entre novamente." });
    return;
  }

  const acao = ACOES[req.query && req.query.campo];
  if (!acao) {
    res.status(404).json({ ok: false, erro: "Rota não encontrada." });
    return;
  }

  try {
    await acao(req, res, sessao);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
