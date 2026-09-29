const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoAdmin, gerarSenhaProvisoria } = require("../_lib");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MINIMO_SENHA = 6;

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

    // Certificados importados por usuário (módulo Notas Fiscais): só o que o
    // admin precisa pra controle — nome, CNPJ, validade e última
    // sincronização. O conteúdo do certificado e a senha nunca saem daqui.
    const empresas = await query(
      `SELECT usuario_id, razao_social, cnpj, cert_valid_until, ultima_sincronizacao
         FROM nfe_empresas
        WHERE cert_encrypted IS NOT NULL
        ORDER BY razao_social`
    );
    const porUsuario = new Map();
    for (const e of empresas.rows) {
      if (!porUsuario.has(e.usuario_id)) porUsuario.set(e.usuario_id, []);
      porUsuario.get(e.usuario_id).push({
        razaoSocial: e.razao_social,
        cnpj: e.cnpj,
        certValidUntil: e.cert_valid_until,
        ultimaSincronizacao: e.ultima_sincronizacao,
      });
    }
    const usuarios = resultado.rows.map((u) => {
      const certificados = porUsuario.get(u.id) || [];
      return { ...u, qtdCertificados: certificados.length, certificados };
    });
    res.status(200).json({ ok: true, usuarios });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
