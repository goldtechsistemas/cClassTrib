const bcrypt = require("bcryptjs");
const { query } = require("../_db");
const { corpoJson, lerSessaoAdmin, gerarSenhaProvisoria } = require("../_lib");
const { SQL_COBRANCA, linhaCobranca } = require("../_cobranca");

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
      `SELECT u.id, u.email, u.nome, u.bloqueado, u.precisa_trocar_senha, u.criado_em,
              ${SQL_COBRANCA}
         FROM usuarios u
        ORDER BY u.criado_em DESC`
    );

    // Resumo financeiro do mês (fuso de Brasília): o que já entrou, o que está
    // previsto até o fim do mês e o que está atrasado.
    const resumo = await query(
      `WITH h AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje)
       SELECT to_char(h.hoje, 'YYYY-MM') AS mes,
              COALESCE((SELECT sum(p.valor) FROM pagamentos_assinatura p WHERE to_char(p.pago_em, 'YYYY-MM') = to_char(h.hoje, 'YYYY-MM')), 0) AS recebido_mes,
              COALESCE((SELECT count(*) FROM pagamentos_assinatura p WHERE to_char(p.pago_em, 'YYYY-MM') = to_char(h.hoje, 'YYYY-MM')), 0)::int AS pagamentos_mes,
              COALESCE((SELECT sum(u.valor_cobranca) FROM usuarios u WHERE u.proximo_vencimento >= h.hoje AND to_char(u.proximo_vencimento, 'YYYY-MM') = to_char(h.hoje, 'YYYY-MM')), 0) AS previsto_mes,
              COALESCE((SELECT sum(u.valor_cobranca) FROM usuarios u WHERE u.proximo_vencimento < h.hoje), 0) AS atrasado_valor
         FROM h`
    );
    const rs = resumo.rows[0];
    const resumoCobranca = {
      mes: rs.mes,
      recebidoNoMes: Number(rs.recebido_mes),
      pagamentosNoMes: rs.pagamentos_mes,
      previstoNoMes: Number(rs.previsto_mes),
      atrasadoValor: Number(rs.atrasado_valor),
    };

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
      const { assinatura_inicio, valor_cobranca, periodicidade_meses, proximo_vencimento, dias_para_vencer, ultimo_pagamento, ...basico } = u;
      return {
        ...basico,
        qtdCertificados: certificados.length,
        certificados,
        cobranca: linhaCobranca({ assinatura_inicio, valor_cobranca, periodicidade_meses, proximo_vencimento, dias_para_vencer, ultimo_pagamento }),
      };
    });
    res.status(200).json({ ok: true, usuarios, resumoCobranca });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};
