const { query } = require("./_db");
const { decryptSecret } = require("./_crypto");
const { extrairParaMtls } = require("./_certUtils");
const { distribuirDfe, enviarManifestacaoCiencia, ErroSefaz } = require("./_sefazClient");

const UMA_HORA_MS = 60 * 60 * 1000;
const LIMITE_CICLOS_DISTRIBUICAO = 15; // trava de segurança — cada ciclo é um lote (~50 docs) da SEFAZ
const LIMITE_MANIFESTACOES_POR_CHAMADA = 30; // idem, pra não deixar a chamada eterna num backlog gigante
const PAUSA_ENTRE_CHAMADAS_MS = 1500; // a SEFAZ pede um intervalo mínimo entre chamadas do mesmo lote

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertLote(empresaId, documentos, eventos) {
  let docsNovos = 0;
  for (const doc of documentos) {
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
        empresaId, doc.chNFe, doc.nsu, doc.tipo, doc.numero, doc.serie,
        doc.emitCnpj, doc.emitNome, doc.emitUf, doc.destCnpj, doc.dhEmi, doc.vNf, doc.situacao, doc.xmlCompleto,
      ]
    );
    if (ins.rows[0] && ins.rows[0].inserida) docsNovos++;
  }
  for (const ev of eventos) {
    if (!ev.chNFe) continue;
    await query(
      `INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,$6)`,
      [empresaId, ev.chNFe, ev.tpEvento, ev.nSeqEvento, ev.xml, ev.dhEvento]
    );
  }
  return docsNovos;
}

/**
 * Consulta distDFeInt em looping (respeitando o ritmo pedido pela SEFAZ) até
 * não ter mais nada pendente (ultNSU === maxNSU) ou até a SEFAZ pedir espera
 * (cStat 137/656) ou até a trava de segurança de ciclos.
 */
async function distribuirAteCaughtUp({ empresa, ultNsuInicial, certPem, keyPem }) {
  let ultNsuAtual = ultNsuInicial;
  let docsNovosTotal = 0;
  let ultimoCStat = null;
  let ultimoXMotivo = "";
  let pararPorSefaz = false;
  let atingiuLimiteCiclos = false;

  for (let ciclo = 0; ciclo < LIMITE_CICLOS_DISTRIBUICAO; ciclo++) {
    const resultado = await distribuirDfe({
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      cnpj: empresa.cnpj,
      ultNsu: ultNsuAtual,
      certPem,
      keyPem,
    });

    docsNovosTotal += await upsertLote(empresa.id, resultado.documentos, resultado.eventos);
    await query(
      "INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, $4)",
      [empresa.id, resultado.cStat, resultado.xMotivo, docsNovosTotal]
    );

    ultimoCStat = resultado.cStat;
    ultimoXMotivo = resultado.xMotivo;
    ultNsuAtual = resultado.ultNSU || ultNsuAtual;

    if (resultado.cStat === "137" || resultado.cStat === "656") {
      pararPorSefaz = true;
      break;
    }
    const temMais = resultado.ultNSU && resultado.maxNSU && resultado.ultNSU !== resultado.maxNSU;
    if (!temMais) break;
    if (ciclo === LIMITE_CICLOS_DISTRIBUICAO - 1) {
      atingiuLimiteCiclos = true;
      break;
    }
    await esperar(PAUSA_ENTRE_CHAMADAS_MS);
  }

  return { ultNsuFinal: ultNsuAtual, docsNovosTotal, ultimoCStat, ultimoXMotivo, pararPorSefaz, atingiuLimiteCiclos };
}

/**
 * Sincroniza UMA empresa por completo num único clique/chamada:
 *  1) puxa todos os lotes pendentes da distDFeInt (looping, não só um lote);
 *  2) dá Ciência da Operação automaticamente em toda nota que ainda só tem
 *     resumo (sem isso o XML completo nunca chega — é assim que a SEFAZ
 *     funciona: resumo até o destinatário manifestar);
 *  3) puxa mais um ciclo pra tentar já trazer o XML completo resultante.
 *
 * Não lança para erros "esperados" (SEFAZ fora do ar, cStat de negócio) —
 * eles voltam dentro do objeto de retorno (`ok: false` ou `aguardando`).
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

  // --- Fase 1: puxar tudo que estiver pendente ---
  let fase1;
  try {
    fase1 = await distribuirAteCaughtUp({ empresa, ultNsuInicial: empresa.ult_nsu, certPem, keyPem });
  } catch (e) {
    const mensagem = e instanceof ErroSefaz ? e.message : "Erro inesperado ao consultar a SEFAZ.";
    if (!(e instanceof ErroSefaz)) console.error(e);
    await query("INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, 0)", [empresa.id, null, mensagem]);
    return { ok: false, erro: mensagem };
  }

  let docsNovosTotal = fase1.docsNovosTotal;
  let manifestadas = 0;
  let ultNsuAtual = fase1.ultNsuFinal;
  let ultimoCStat = fase1.ultimoCStat;
  let ultimoXMotivo = fase1.ultimoXMotivo;

  // --- Fase 2: manifestação automática das notas que só têm resumo ---
  if (!fase1.pararPorSefaz) {
    const pendentes = await query(
      "SELECT ch_nfe FROM nfe_documentos WHERE empresa_id = $1 AND tipo = 'resumo' AND manifestacao = 'nenhuma' LIMIT $2",
      [empresa.id, LIMITE_MANIFESTACOES_POR_CHAMADA]
    );

    for (const doc of pendentes.rows) {
      try {
        const resEvento = await enviarManifestacaoCiencia({
          ambiente: empresa.ambiente,
          uf: empresa.uf,
          cnpj: empresa.cnpj,
          chNFe: doc.ch_nfe,
          certPem,
          keyPem,
        });
        if (resEvento.sucesso) {
          await query("UPDATE nfe_documentos SET manifestacao = 'ciencia' WHERE empresa_id = $1 AND ch_nfe = $2", [empresa.id, doc.ch_nfe]);
          await query(
            "INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,now())",
            [empresa.id, doc.ch_nfe, "210210", 1, resEvento.eventoAssinadoXml]
          );
          manifestadas++;
        }
      } catch (e) {
        console.error(`Falha ao manifestar ${doc.ch_nfe}:`, e.message || e);
      }
      await esperar(PAUSA_ENTRE_CHAMADAS_MS);
    }

    // --- Fase 3: mais ciclos pra tentar já trazer o XML completo resultante.
    // A SEFAZ às vezes demora alguns segundos a mais pra processar UM evento
    // específico (mesmo com os outros já prontos) — por isso tenta de novo
    // com uma pausa maior se ainda sobrar alguma nota manifestada sem XML.
    if (manifestadas > 0 && !fase1.pararPorSefaz) {
      for (const esperaMs of [2000, 4000]) {
        await esperar(esperaMs);
        try {
          const faseExtra = await distribuirAteCaughtUp({ empresa, ultNsuInicial: ultNsuAtual, certPem, keyPem });
          docsNovosTotal += faseExtra.docsNovosTotal;
          ultNsuAtual = faseExtra.ultNsuFinal;
          ultimoCStat = faseExtra.ultimoCStat;
          ultimoXMotivo = faseExtra.ultimoXMotivo;
          if (faseExtra.pararPorSefaz) {
            fase1.pararPorSefaz = true;
            break;
          }
        } catch (e) {
          console.error("Falha no ciclo pós-manifestação:", e.message || e);
          break;
        }

        const aindaFaltando = await query(
          "SELECT count(*) FROM nfe_documentos WHERE empresa_id = $1 AND tipo = 'resumo' AND manifestacao = 'ciencia'",
          [empresa.id]
        );
        if (Number(aindaFaltando.rows[0].count) === 0) break;
      }
    }
  }

  const agora = new Date();
  const proximaConsulta = fase1.pararPorSefaz ? new Date(agora.getTime() + UMA_HORA_MS) : null;
  await query(
    `UPDATE nfe_empresas SET ult_nsu = $1, ultima_sincronizacao = $2, proxima_consulta_permitida_em = $3 WHERE id = $4`,
    [ultNsuAtual, agora, proximaConsulta, empresa.id]
  );

  return {
    ok: true,
    cStat: ultimoCStat,
    xMotivo: ultimoXMotivo,
    docsNovos: docsNovosTotal,
    manifestadas,
    aguardandoSefaz: fase1.pararPorSefaz,
    atingiuLimiteCiclos: fase1.atingiuLimiteCiclos,
  };
}

module.exports = { sincronizarEmpresa };
