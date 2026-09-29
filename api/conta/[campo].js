// Rota dinâmica: /api/conta/nome, /api/conta/senha e /api/conta/senha-inicial
// — consolidadas num arquivo só (Vercel Hobby limita a 12 Serverless
// Functions por deploy). Não há rota de e-mail de propósito: o e-mail é o
// login e só o administrador cria/gerencia as contas.
const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const {
  corpoJson,
  lerSessaoUsuario,
  iniciarSessaoUsuario,
  lerTrocaSenha,
  encerrarTrocaSenha,
} = require("../_lib");

// Único passo que NÃO exige sessão normal: é o que cria a sessão. Vale só
// pra quem acabou de entrar com a senha provisória dada pelo administrador
// (permissão curta de api/login.js) e a conta ainda estar marcada como
// "precisa trocar a senha" — depois de usada, a permissão não funciona mais.
async function definirSenhaInicial(req, res) {
  const troca = lerTrocaSenha(req);
  if (!troca) {
    res.status(401).json({
      ok: false,
      erro: "O tempo para definir a senha acabou. Volte e entre de novo com a senha provisória.",
    });
    return;
  }

  const novaSenha = String(corpoJson(req).novaSenha || "");
  if (novaSenha.length < 6) {
    res.status(400).json({ ok: false, erro: "A nova senha precisa ter no mínimo 6 caracteres." });
    return;
  }

  const r = await query("SELECT nome, senha_hash, bloqueado, precisa_trocar_senha FROM usuarios WHERE email = $1", [
    troca.email,
  ]);
  const registro = r.rows[0];
  if (!registro || registro.bloqueado || !registro.precisa_trocar_senha) {
    res.status(401).json({ ok: false, erro: "Não foi possível definir a senha. Volte e entre de novo." });
    return;
  }
  if (await bcrypt.compare(novaSenha, registro.senha_hash)) {
    res.status(400).json({ ok: false, erro: "A nova senha precisa ser diferente da senha provisória." });
    return;
  }

  const novoHash = await bcrypt.hash(novaSenha, 12);
  await query(
    "UPDATE usuarios SET senha_hash = $1, precisa_trocar_senha = false WHERE email = $2 AND precisa_trocar_senha = true",
    [novoHash, troca.email]
  );
  encerrarTrocaSenha(res);
  iniciarSessaoUsuario(res, { email: troca.email, nome: registro.nome }, troca.lembrar);
  res.status(200).json({ ok: true, email: troca.email, nome: registro.nome });
}

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

const ACOES = { nome: alterarNome, senha: alterarSenha };

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }

  if (req.query && req.query.campo === "senha-inicial") {
    try {
      await definirSenhaInicial(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
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
