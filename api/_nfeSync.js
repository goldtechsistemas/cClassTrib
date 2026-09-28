const { query } = require("./_db");
const { decryptSecret } = require("./_crypto");
const { extrairParaMtls } = require("./_certUtils");
const { distribuirDfe, ErroSefaz } = require("./_sefazClient");

const UMA_HORA_MS = 60 * 60 * 1000;

/**
 * Sincroniza UMA empresa (linha de nfe_empresas) contra a SEFAZ e grava o
 * resultado no banco. Usado tanto pela rota manual (nfe-sincronizar.js,
 * um clique = uma empresa) quanto pelo cron (nfe-cron-sincronizar.js,
 * varre todas as empresas elegíveis).
 *
 * Não lança para erros "esperados" (SEFAZ fora do ar, cStat de negócio) —
 * eles voltam dentro do objeto de retorno (`ok: false` ou `cStat`).
 */
async function sincronizarEmpresa(empresa) {
  if (!empresa.cert_encrypted || !empresa.cert_password_encrypted) {
    return { ok: false, erro: "Empresa sem certificado cadastrado." };
  }
  if (empresa.proxima_consulta_permitida_em && new Date(empresa.proxima_consulta_permitida_em) > new Date()) {
    const espera = new Date(empresa.proxima_consulta_permitida_em);
    return {
      ok: false,
      erro: `A SEFAZ pede para aguardar antes de consultar de novo. Próxima tentativa permitida às ${espera.toLocaleString("pt-BR")}.`,
      aguardando: true,
    };
  }

  let certPem, keyPem;
  try {
    const pfxBuffer = decryptSecret(empresa.cert_encrypted);
    const senha = decryptSecret(empresa.cert_password_encrypted).toString("utf8");
    ({ certPem, keyPem } = extrairParaMtls(pfxBuffer, senha));
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível carregar o certificado salvo." };
  }

  let resultado;
  try {
    resultado = await distribuirDfe({
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      cnpj: empresa.cnpj,
      ultNsu: empresa.ult_nsu,
      certPem,
      keyPem,
    });
  } catch (e) {
    const mensagem = e instanceof ErroSefaz ? e.message : "Erro inesperado ao consultar a SEFAZ.";
    if (!(e instanceof ErroSefaz)) console.error(e);
    await query(
      "INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, 0)",
      [empresa.id, null, mensagem]
    );
    return { ok: false, erro: mensagem };
  }

  let docsNovos = 0;
  for (const doc of resultado.documentos) {
    if (!doc.chNFe) continue;
    const ins = await query(
      `INSERT INTO nfe_documentos
         (empresa_id, ch_nfe, nsu, tipo, numero, serie, emit_cnpj, emit_nome, emit_uf, dest_cnpj, dh_emi, v_nf, situacao, xml_completo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (empresa_id, ch_nfe) DO UPDATE SET
         situacao = EXCLUDED.situacao,
         xml_completo = COALESCE(EXCLUDED.xml_completo, nfe_documentos.xml_completo),
         tipo = CASE WHEN EXCLUDED.tipo = 'completa' THEN 'completa' ELSE nfe_documentos.tipo END
       RETURNING (xmax = 0) AS inserida`,
      [
        empresa.id, doc.chNFe, doc.nsu, doc.tipo, doc.numero, doc.serie,
        doc.emitCnpj, doc.emitNome, doc.emitUf, doc.destCnpj, doc.dhEmi, doc.vNf, doc.situacao, doc.xmlCompleto,
      ]
    );
    if (ins.rows[0] && ins.rows[0].inserida) docsNovos++;
  }

  for (const ev of resultado.eventos) {
    if (!ev.chNFe) continue;
    await query(
      `INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,$6)`,
      [empresa.id, ev.chNFe, ev.tpEvento, ev.nSeqEvento, ev.xml, ev.dhEvento]
    );
  }

  const agora = new Date();
  let proximaConsulta = null;
  if (resultado.cStat === "137" || resultado.cStat === "656") {
    proximaConsulta = new Date(agora.getTime() + UMA_HORA_MS);
  }

  await query(
    `UPDATE nfe_empresas SET ult_nsu = $1, ultima_sincronizacao = $2, proxima_consulta_permitida_em = $3 WHERE id = $4`,
    [resultado.ultNSU || empresa.ult_nsu, agora, proximaConsulta, empresa.id]
  );
  await query(
    "INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, $4)",
    [empresa.id, resultado.cStat, resultado.xMotivo, docsNovos]
  );

  return {
    ok: true,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    docsNovos,
    ultNSU: resultado.ultNSU,
    maxNSU: resultado.maxNSU,
    temMais: !!(resultado.ultNSU && resultado.maxNSU && resultado.ultNSU !== resultado.maxNSU),
  };
}

module.exports = { sincronizarEmpresa };
