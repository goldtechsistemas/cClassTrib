const { query } = require("./_db");
const { lerSessaoUsuario } = require("./_lib");

/**
 * Confere a sessão (mesmo login do resto do site) e devolve o id numérico
 * do usuário — reconsultado a cada chamada (não fica no cookie) para
 * respeitar bloqueio por admin, igual a api/session.js já faz.
 * Em caso de falha, já escreve a resposta 401 e devolve null.
 */
async function exigirUsuario(req, res) {
  const sessao = lerSessaoUsuario(req);
  if (!sessao) {
    res.status(401).json({ ok: false, erro: "Não autenticado." });
    return null;
  }
  const r = await query("SELECT id, bloqueado FROM usuarios WHERE email = $1", [sessao.email]);
  const registro = r.rows[0];
  if (!registro || registro.bloqueado) {
    res.status(401).json({ ok: false, erro: "Não autenticado." });
    return null;
  }
  return registro.id;
}

function empresaParaSaida(row) {
  return {
    id: row.id,
    cnpj: row.cnpj,
    razaoSocial: row.razao_social,
    ambiente: row.ambiente,
    temCertificado: !!row.cert_encrypted,
    certValidUntil: row.cert_valid_until,
    ultimaSincronizacao: row.ultima_sincronizacao,
    manifestacaoAutomatica: row.manifestacao_automatica,
  };
}

module.exports = { exigirUsuario, empresaParaSaida };
