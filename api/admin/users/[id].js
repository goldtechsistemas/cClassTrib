const bcrypt = require("bcryptjs");
const { query } = require("../../_db");
const { corpoJson, lerSessaoAdmin, gerarSenhaProvisoria } = require("../../_lib");
const { PERIODICIDADES_VALIDAS, dataValida, dia, somarMeses, lerValor, linhaCobranca, SQL_COBRANCA } = require("../../_cobranca");

const TAMANHO_MINIMO_SENHA = 6;

async function listarPagamentos(id) {
  const r = await query(
    `SELECT id, pago_em::text AS pago_em, referente_a::text AS referente_a, valor, observacao
       FROM pagamentos_assinatura WHERE usuario_id = $1 ORDER BY pago_em DESC, id DESC LIMIT 60`,
    [id]
  );
  return r.rows.map((p) => ({ id: p.id, pagoEm: p.pago_em, referenteA: p.referente_a, valor: p.valor == null ? null : Number(p.valor), observacao: p.observacao }));
}

async function lerCobranca(id) {
  const r = await query(`SELECT u.id, u.dia_vencimento, ${SQL_COBRANCA} FROM usuarios u WHERE u.id = $1`, [id]);
  return r.rows[0] || null;
}

// Salvar/remover assinatura, dar baixa e estornar o último pagamento.
async function acaoCobranca(req, res, id, corpo) {
  const atual = await lerCobranca(id);
  if (!atual) {
    res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
    return;
  }
  const erro = (msg) => res.status(400).json({ ok: false, erro: msg });
  const responder = async () =>
    res.status(200).json({ ok: true, cobranca: linhaCobranca(await lerCobranca(id)), pagamentos: await listarPagamentos(id) });

  if (corpo.acao === "assinatura") {
    const inicio = String(corpo.assinaturaInicio || "");
    if (!dataValida(inicio)) return erro("Informe a data da assinatura (dia/mês/ano).");
    const periodicidade = Number(corpo.periodicidadeMeses || 1);
    if (!PERIODICIDADES_VALIDAS.includes(periodicidade)) return erro("Periodicidade inválida.");
    const valor = lerValor(corpo.valorCobranca);
    if (Number.isNaN(valor)) return erro("Valor inválido.");

    // Próximo vencimento: o que o admin digitar; senão (1ª vez) = assinatura + 1
    // período; senão mantém o atual.
    // O dia de cobrança é o do vencimento digitado (ou o da assinatura, quando o
    // vencimento é calculado) — não o dia já "encurtado" de um mês curto.
    let proximo = atual.proximo_vencimento;
    let diaCobranca = atual.dia_vencimento || (proximo ? dia(proximo) : null);
    if (corpo.proximoVencimento) {
      if (!dataValida(String(corpo.proximoVencimento))) return erro("Próximo vencimento inválido.");
      proximo = String(corpo.proximoVencimento);
      diaCobranca = dia(proximo);
    } else if (!proximo) {
      proximo = somarMeses(inicio, periodicidade, dia(inicio));
      diaCobranca = dia(inicio);
    }
    await query(
      `UPDATE usuarios SET assinatura_inicio = $2, valor_cobranca = $3, periodicidade_meses = $4,
              proximo_vencimento = $5, dia_vencimento = $6 WHERE id = $1`,
      [id, inicio, valor, periodicidade, proximo, diaCobranca]
    );
    return responder();
  }

  if (corpo.acao === "remover-assinatura") {
    // Mantém o histórico de pagamentos; só zera o controle de vencimento.
    await query(
      `UPDATE usuarios SET assinatura_inicio = NULL, valor_cobranca = NULL, periodicidade_meses = 1,
              proximo_vencimento = NULL, dia_vencimento = NULL WHERE id = $1`,
      [id]
    );
    return responder();
  }

  if (corpo.acao === "baixa") {
    if (!atual.proximo_vencimento) return erro("Este login ainda não tem assinatura cadastrada.");
    // A baixa não aceita data nem valor digitados: quita o vencimento cadastrado
    // pelo valor cadastrado, e o recebimento é registrado com a data de hoje
    // (Brasília). Para mudar valor ou datas, edita-se a assinatura.
    const valor = atual.valor_cobranca == null ? null : Number(atual.valor_cobranca);
    if (valor == null) return erro("Informe o valor da cobrança na assinatura antes de dar baixa.");
    const pagoEm = (await query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS hoje")).rows[0].hoje;
    const observacao = null;

    const vencimentoPago = atual.proximo_vencimento;
    // A tela manda o vencimento que o admin viu; se já mudou (duplo clique, outra aba), não baixa de novo.
    if (corpo.vencimento !== vencimentoPago) return erro("O vencimento mudou — atualize a tela e tente de novo.");
    const proximo = somarMeses(vencimentoPago, Number(atual.periodicidade_meses) || 1, atual.dia_vencimento || dia(vencimentoPago));
    // Troca atômica: só avança se o vencimento ainda é o que a tela mostrou (evita
    // baixa em duplicidade por duplo clique ou duas abas abertas).
    const avancou = await query(
      "UPDATE usuarios SET proximo_vencimento = $3 WHERE id = $1 AND proximo_vencimento = $2",
      [id, vencimentoPago, proximo]
    );
    if (!avancou.rowCount) return erro("O vencimento mudou — atualize a tela e tente de novo.");
    try {
      await query(
        "INSERT INTO pagamentos_assinatura (usuario_id, pago_em, valor, referente_a, observacao) VALUES ($1, $2, $3, $4, $5)",
        [id, pagoEm, valor, vencimentoPago, observacao]
      );
    } catch (e) {
      await query("UPDATE usuarios SET proximo_vencimento = $2 WHERE id = $1", [id, vencimentoPago]);
      throw e;
    }
    return responder();
  }

  if (corpo.acao === "estornar") {
    // Desfaz o último pagamento (erro de digitação, pagamento que não caiu...).
    const ultimo = await query(
      "SELECT id, referente_a::text AS referente_a FROM pagamentos_assinatura WHERE usuario_id = $1 ORDER BY id DESC LIMIT 1",
      [id]
    );
    if (!ultimo.rows.length) return erro("Não há pagamento para desfazer.");
    await query("DELETE FROM pagamentos_assinatura WHERE id = $1", [ultimo.rows[0].id]);
    await query("UPDATE usuarios SET proximo_vencimento = $2 WHERE id = $1 AND assinatura_inicio IS NOT NULL", [id, ultimo.rows[0].referente_a]);
    return responder();
  }
}

module.exports = async (req, res) => {
  if (!lerSessaoAdmin(req)) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ ok: false, erro: "Id inválido." });
    return;
  }

  // ---------- Assinatura / cobrança ----------
  if (req.method === "GET") {
    try {
      const r = await query(`SELECT u.id, u.email, u.nome, ${SQL_COBRANCA} FROM usuarios u WHERE u.id = $1`, [id]);
      if (!r.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      res.status(200).json({ ok: true, usuario: { id: r.rows[0].id, email: r.rows[0].email, nome: r.rows[0].nome }, cobranca: linhaCobranca(r.rows[0]), pagamentos: await listarPagamentos(id) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  if (req.method === "PATCH" && ["assinatura", "baixa", "estornar", "remover-assinatura"].includes(corpoJson(req).acao)) {
    try {
      await acaoCobranca(req, res, id, corpoJson(req));
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  if (req.method === "PATCH" && corpoJson(req).redefinirSenha) {
    // Esqueceu a senha (não há recuperação por e-mail): o admin gera uma nova
    // senha provisória e a conta volta ao estado de "primeiro acesso" — o
    // usuário é obrigado a criar a própria senha no próximo login. Também
    // derruba as sessões abertas (api/session.js e exigirUsuario tratam
    // "precisa trocar a senha" como deslogado), senão a sessão antiga
    // continuaria valendo por até 180 dias.
    const digitada = String(corpoJson(req).senhaProvisoria || "");
    if (digitada && digitada.length < TAMANHO_MINIMO_SENHA) {
      res.status(400).json({ ok: false, erro: `A senha provisória precisa ter no mínimo ${TAMANHO_MINIMO_SENHA} caracteres.` });
      return;
    }
    try {
      const senhaProvisoria = digitada || gerarSenhaProvisoria();
      const hash = await bcrypt.hash(senhaProvisoria, 12);
      const resultado = await query(
        `UPDATE usuarios SET senha_hash = $1, precisa_trocar_senha = true WHERE id = $2
         RETURNING id, email, nome, bloqueado, precisa_trocar_senha, criado_em`,
        [hash, id]
      );
      if (!resultado.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      res.status(200).json({ ok: true, usuario: resultado.rows[0], senhaProvisoria });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  if (req.method === "PATCH") {
    const corpo = corpoJson(req);
    const bloqueado = !!corpo.bloqueado;
    try {
      const resultado = await query(
        "UPDATE usuarios SET bloqueado = $1 WHERE id = $2 RETURNING id, email, nome, bloqueado, criado_em",
        [bloqueado, id]
      );
      if (!resultado.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      res.status(200).json({ ok: true, usuario: resultado.rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  if (req.method === "DELETE") {
    // Confirmação dupla: além do modal no front, exige que o e-mail exato
    // da conta seja enviado no corpo — trava contra excluir a linha errada
    // por um clique duplo ou requisição repetida sem querer.
    const corpo = corpoJson(req);
    const emailConfirmacao = String(corpo.emailConfirmacao || "").trim().toLowerCase();
    try {
      const atual = await query("SELECT email FROM usuarios WHERE id = $1", [id]);
      if (!atual.rows.length) {
        res.status(404).json({ ok: false, erro: "Usuário não encontrado." });
        return;
      }
      if (atual.rows[0].email !== emailConfirmacao) {
        res.status(400).json({ ok: false, erro: "E-mail de confirmação não confere." });
        return;
      }
      await query("DELETE FROM usuarios WHERE id = $1", [id]);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
    return;
  }

  res.status(405).json({ ok: false, erro: "Método não permitido." });
};
