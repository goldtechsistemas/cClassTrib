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
  const r = await query("SELECT id, bloqueado, precisa_trocar_senha FROM usuarios WHERE email = $1", [sessao.email]);
  const registro = r.rows[0];
  if (!registro || registro.bloqueado || registro.precisa_trocar_senha) {
    res.status(401).json({ ok: false, erro: "Não autenticado." });
    return null;
  }
  return registro.id;
}

/**
 * Confere que a empresa existe E pertence ao usuário logado — a barreira
 * que impede um usuário de baixar/sincronizar/excluir dados de outro. Usada
 * por toda rota que recebe um empresaId. Em caso de falha, já escreve a
 * resposta 404 e devolve null.
 */
async function exigirEmpresaDoUsuario(req, res, usuarioId, empresaId, colunas = "*") {
  if (!empresaId) {
    res.status(400).json({ ok: false, erro: "Informe a empresa." });
    return null;
  }
  // id que não é número inteiro (adulterado/lixo) viraria erro de banco (500).
  if (!/^\d{1,9}$/.test(String(empresaId))) {
    res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
    return null;
  }
  const r = await query(`SELECT ${colunas} FROM nfe_empresas WHERE id = $1 AND usuario_id = $2`, [empresaId, usuarioId]);
  if (!r.rows.length) {
    res.status(404).json({ ok: false, erro: "Empresa não encontrada." });
    return null;
  }
  return r.rows[0];
}

const DIAS_ALERTA_CERTIFICADO = 30;

function diasRestantesCertificado(certValidUntil) {
  if (!certValidUntil) return null;
  const ms = new Date(certValidUntil).getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function empresaParaSaida(row) {
  const diasRestantes = diasRestantesCertificado(row.cert_valid_until);
  return {
    id: row.id,
    cnpj: row.cnpj,
    razaoSocial: row.razao_social,
    uf: row.uf,
    ambiente: row.ambiente,
    temCertificado: !!row.cert_encrypted,
    certValidUntil: row.cert_valid_until,
    certDiasRestantes: diasRestantes,
    certVencido: diasRestantes != null && diasRestantes < 0,
    certPrestesAVencer: diasRestantes != null && diasRestantes >= 0 && diasRestantes <= DIAS_ALERTA_CERTIFICADO,
    ultimaSincronizacao: row.ultima_sincronizacao,
    proximaConsultaPermitidaEm: row.proxima_consulta_permitida_em,
    manifestacaoAutomatica: row.manifestacao_automatica,
  };
}

module.exports = { exigirUsuario, exigirEmpresaDoUsuario, empresaParaSaida };
