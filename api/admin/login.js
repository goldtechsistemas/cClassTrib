// Login do admin (e-mail + senha) e, na mesma função (a Vercel Hobby limita o
// número de funções), a troca de senha já logado (etapa "alterar").
const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, iniciarSessaoAdmin, lerSessaoAdmin } = require("../_lib");
const { minutosBloqueado, registrarFalha, limparFalhas, mensagemBloqueio } = require("../_limite");

const HASH_FALSO = "$2a$12$dPQp9WPlrOWpdt5.DNN2qeu9IPW/wj2mdyM4dcN.lGlFgE8LWgcHG"; // iguala o tempo de resposta quando o e-mail não existe

const TAMANHO_MINIMO_SENHA = 8;

async function alterarSenha(req, res, corpo) {
  const sessao = lerSessaoAdmin(req);
  if (!sessao) return res.status(401).json({ ok: false, erro: "Não autorizado." });
  const email = sessao.email;
  const novaSenha = String(corpo.novaSenha || "");
  if (novaSenha.length < TAMANHO_MINIMO_SENHA) {
    return res.status(400).json({ ok: false, erro: `A nova senha precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.` });
  }
  if (novaSenha !== String(corpo.confirmarSenha || "")) {
    return res.status(400).json({ ok: false, erro: "A confirmação da nova senha não confere." });
  }
  const minutos = await minutosBloqueado(req, "admin", email);
  if (minutos) return res.status(429).json({ ok: false, erro: mensagemBloqueio(minutos) });

  const r = await query("SELECT senha_hash FROM admins WHERE email = $1", [email]);
  if (!r.rows[0]) return res.status(401).json({ ok: false, erro: "Não autorizado." });
  if (!(await bcrypt.compare(String(corpo.senhaAtual || ""), r.rows[0].senha_hash))) {
    await registrarFalha(req, "admin", email);
    return res.status(401).json({ ok: false, erro: "A senha atual está incorreta." });
  }
  if (await bcrypt.compare(novaSenha, r.rows[0].senha_hash)) {
    return res.status(400).json({ ok: false, erro: "A nova senha precisa ser diferente da atual." });
  }
  await query("UPDATE admins SET senha_hash = $2 WHERE email = $1", [email, await bcrypt.hash(novaSenha, 12)]);
  await limparFalhas(req, "admin", email);
  res.status(200).json({ ok: true });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }

  const corpo = corpoJson(req);
  if (corpo.etapa === "alterar") {
    try {
      await alterarSenha(req, res, corpo);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");

  try {
    const minutos = await minutosBloqueado(req, "admin", email);
    if (minutos) {
      res.status(429).json({ ok: false, erro: mensagemBloqueio(minutos) });
      return;
    }

    const resultado = await query("SELECT senha_hash FROM admins WHERE email = $1", [email]);
    const registro = resultado.rows[0];
    const erroGenerico = { ok: false, erro: "E-mail ou senha incorretos." };
    if (!registro) {
      await bcrypt.compare(senha, HASH_FALSO);
      await registrarFalha(req, "admin", email);
      res.status(401).json(erroGenerico);
      return;
    }
    const senhaCorreta = await bcrypt.compare(senha, registro.senha_hash);
    if (!senhaCorreta) {
      await registrarFalha(req, "admin", email);
      res.status(401).json(erroGenerico);
      return;
    }
    await limparFalhas(req, "admin", email);

    iniciarSessaoAdmin(res, { email });
    res.status(200).json({ ok: true, email });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno ao entrar." });
  }
};
