const bcrypt = require("bcryptjs");
const { query } = require("./_db");
const { corpoJson, lerSessaoAdmin } = require("./_lib");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, erro: "Método não permitido." });
    return;
  }

  // Cadastro fechado ao público: esta rota é acessível por qualquer pessoa
  // na internet (mesmo sem o link na tela de login), então só quem está
  // logado como administrador pode criar contas.
  const adminCriando = !!lerSessaoAdmin(req);
  if (!adminCriando) {
    res.status(403).json({ ok: false, erro: "Cadastro fechado. As contas são criadas pelo administrador." });
    return;
  }

  const corpo = corpoJson(req);
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");
  const nome = String(corpo.nome || "").trim();

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ ok: false, erro: "Preencha um e-mail válido." });
    return;
  }
  if (senha.length < 6) {
    res.status(400).json({ ok: false, erro: "A senha precisa ter no mínimo 6 caracteres." });
    return;
  }
  if (!nome) {
    res.status(400).json({ ok: false, erro: "Preencha o nome." });
    return;
  }

  try {
    const existente = await query("SELECT id FROM usuarios WHERE email = $1", [email]);
    if (existente.rows.length) {
      res.status(409).json({ ok: false, erro: "Já existe uma conta com este e-mail." });
      return;
    }

    const hash = await bcrypt.hash(senha, 12);
    await query(
      "INSERT INTO usuarios (email, nome, senha_hash) VALUES ($1, $2, $3)",
      [email, nome, hash]
    );

    // Quem cria a conta é o administrador, não o dono dela — não abre
    // sessão do novo usuário no navegador do administrador.
    res.status(201).json({ ok: true, email, nome });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno ao criar a conta." });
  }
};
