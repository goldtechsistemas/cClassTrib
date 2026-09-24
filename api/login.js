const bcrypt = require("bcryptjs");
const { query } = require("./_db");
const { corpoJson, iniciarSessaoUsuario } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }

  const corpo = corpoJson(req);
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");
  const lembrar = !!corpo.lembrar;

  try {
    const resultado = await query(
      "SELECT nome, senha_hash, bloqueado FROM usuarios WHERE email = $1",
      [email]
    );
    const registro = resultado.rows[0];

    // Mesma mensagem genérica pra e-mail inexistente e senha errada — não é
    // bom revelar pra quem está tentando entrar qual dos dois estava errado.
    const erroGenerico = { ok: false, erro: "E-mail ou senha incorretos." };
    if (!registro) {
      res.status(401).json(erroGenerico);
      return;
    }

    const senhaCorreta = await bcrypt.compare(senha, registro.senha_hash);
    if (!senhaCorreta) {
      res.status(401).json(erroGenerico);
      return;
    }

    if (registro.bloqueado) {
      res.status(403).json({ ok: false, erro: "Esta conta está bloqueada. Fale com o suporte." });
      return;
    }

    iniciarSessaoUsuario(res, { email, nome: registro.nome }, lembrar);
    res.status(200).json({ ok: true, email, nome: registro.nome });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno ao entrar." });
  }
};
