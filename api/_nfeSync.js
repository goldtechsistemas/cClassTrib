const { query } = require("./_db");
const { decryptSecret } = require("./_crypto");
const { extrairParaMtls } = require("./_certUtils");
const { distribuirDfe, enviarManifestacaoDestinatario, ErroSefaz, TP_EVENTO_CIENCIA, TP_EVENTO_CONFIRMACAO } = require("./_sefazClient");

const TP_EVENTO_CANCELAMENTO = "110111";
const UMA_HORA_MS = 60 * 60 * 1000;
const PAUSA_LIMITE_CICLOS_MS = 2 * 60 * 1000; // trava própria (não é exigência da SEFAZ) pra não deixar reclique imediato martelar um backlog gigante
const LIMITE_CICLOS_DISTRIBUICAO = 15; // trava de segurança — cada ciclo é um lote (~50 docs) da SEFAZ
const LIMITE_MANIFESTACOES_POR_CHAMADA = 30; // idem, pra não deixar a chamada eterna num backlog gigante
const PAUSA_ENTRE_CHAMADAS_MS = 1500; // a SEFAZ pede um intervalo mínimo entre chamadas do mesmo lote
// A função serverless morre em 60s (maxDuration em vercel.json) sem chance
// de limpar nada — a sincronização inteira para de começar trabalho novo
// depois desse orçamento e cada chamada à SEFAZ tem timeout próprio curto,
// pra que o pior caso (última chamada começando no fim do orçamento e
// estourando o timeout) ainda termine antes dos 60s.
const ORCAMENTO_SINCRONIZACAO_MS = 40000;
const TIMEOUT_DISTRIBUICAO_MS = 12000;
const TIMEOUT_MANIFESTACAO_MS = 10000;

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
    // Cancelamento não vem como um valor de cSitNFe no resNFe (que só tem
    // autorizada/denegada) — chega depois como um resEvento à parte. Sem
    // isto, uma nota cancelada depois de já sincronizada como "autorizada"
    // ficava com a situação desatualizada pra sempre.
    if (ev.tpEvento === TP_EVENTO_CANCELAMENTO) {
      await query(
        `UPDATE nfe_documentos SET situacao = 'cancelada' WHERE empresa_id = $1 AND ch_nfe = $2`,
        [empresaId, ev.chNFe]
      );
    }
  }
  return docsNovos;
}

/**
 * Consulta distDFeInt em looping (respeitando o ritmo pedido pela SEFAZ) até
 * não ter mais nada pendente (ultNSU === maxNSU) ou até a SEFAZ pedir espera
 * (cStat 137/656) ou até a trava de segurança de ciclos.
 */
async function distribuirAteCaughtUp({ empresa, ultNsuInicial, certPem, keyPem, prazoFinal }) {
  let ultNsuAtual = ultNsuInicial;
  let docsNovosTotal = 0;
  let ultimoCStat = null;
  let ultimoXMotivo = "";
  let pararPorSefaz = false;
  let atingiuLimiteCiclos = false;

  for (let ciclo = 0; ciclo < LIMITE_CICLOS_DISTRIBUICAO; ciclo++) {
    if (Date.now() >= prazoFinal) {
      atingiuLimiteCiclos = true;
      break;
    }
    const resultado = await distribuirDfe({
      ambiente: empresa.ambiente,
      uf: empresa.uf,
      cnpj: empresa.cnpj,
      ultNsu: ultNsuAtual,
      certPem,
      keyPem,
      timeoutMs: TIMEOUT_DISTRIBUICAO_MS,
    });

    // docsNovosDoCiclo é só o delta deste lote — nfe_sync_logs.docs_novos
    // precisa registrar quantos vieram NESSE lote, não o total acumulado,
    // senão qualquer relatório que somar essa coluna conta em dobro/triplo.
    const docsNovosDoCiclo = await upsertLote(empresa.id, resultado.documentos, resultado.eventos);
    docsNovosTotal += docsNovosDoCiclo;
    await query(
      "INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, $4)",
      [empresa.id, resultado.cStat, resultado.xMotivo, docsNovosDoCiclo]
    );

    ultimoCStat = resultado.cStat;
    ultimoXMotivo = resultado.xMotivo;
    ultNsuAtual = resultado.ultNSU || ultNsuAtual;
    // Grava o progresso a cada lote: se a chamada seguinte falhar (SEFAZ
    // instável) ou a função for encerrada, a próxima sincronização continua
    // daqui em vez de rebaixar o backlog inteiro desde o NSU inicial.
    await query("UPDATE nfe_empresas SET ult_nsu = $1 WHERE id = $2", [ultNsuAtual, empresa.id]);

    // cStat 137 (nada novo) e 656 (consumo indevido) são os dois casos em
    // que a própria SEFAZ exige aguardar 1h antes de consultar de novo —
    // não é opcional, é regra do serviço (ver Nota Técnica da Distribuição).
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
 * Dá Ciência da Operação em todas as notas ainda só-resumo dessa empresa
 * (até o limite por chamada). Reivindica cada nota atomicamente
 * (UPDATE ... WHERE manifestacao = 'nenhuma') antes de chamar a SEFAZ, pra
 * evitar manifestar a mesma nota duas vezes se o cron e um clique manual
 * rodarem ao mesmo tempo — sem isso, os dois processos podem ler
 * "manifestacao = nenhuma" antes de qualquer um gravar o resultado.
 */
async function manifestarPendentes({ empresa, certPem, keyPem, prazoFinal }) {
  const pendentes = await query(
    "SELECT id, ch_nfe FROM nfe_documentos WHERE empresa_id = $1 AND tipo = 'resumo' AND manifestacao = 'nenhuma' AND COALESCE(situacao, '') NOT IN ('denegada', 'cancelada') ORDER BY dh_emi DESC NULLS LAST LIMIT $2",
    [empresa.id, LIMITE_MANIFESTACOES_POR_CHAMADA]
  );

  let manifestadas = 0;
  let restantes = 0;
  for (const [n, doc] of pendentes.rows.entries()) {
    if (Date.now() >= prazoFinal) {
      restantes = pendentes.rows.length - n;
      break;
    }
    const reivindicada = await query(
      "UPDATE nfe_documentos SET manifestacao = 'enviando' WHERE id = $1 AND manifestacao = 'nenhuma' RETURNING id",
      [doc.id]
    );
    if (!reivindicada.rows.length) continue; // outra sincronização já pegou essa nota

    try {
      let resEvento = await enviarManifestacaoDestinatario({
        ambiente: empresa.ambiente,
        cnpj: empresa.cnpj,
        chNFe: doc.ch_nfe,
        certPem,
        keyPem,
        tpEvento: TP_EVENTO_CIENCIA,
        timeoutMs: TIMEOUT_MANIFESTACAO_MS,
      });
      // Ciência da Operação só vale até 10 dias após a autorização da NF-e
      // (cStat 596 depois disso, comum em backlogs antigos) — Confirmação da
      // Operação cobre o mesmo propósito (libera o XML completo) com prazo
      // bem maior, só tentada como fallback quando a Ciência é rejeitada
      // especificamente por prazo.
      if (resEvento.prazoExpirado) {
        resEvento = await enviarManifestacaoDestinatario({
          ambiente: empresa.ambiente,
          cnpj: empresa.cnpj,
          chNFe: doc.ch_nfe,
          certPem,
          keyPem,
          tpEvento: TP_EVENTO_CONFIRMACAO,
          timeoutMs: TIMEOUT_MANIFESTACAO_MS,
        });
      }
      const statusManifestacao = resEvento.tpEvento === TP_EVENTO_CONFIRMACAO ? "confirmacao" : "ciencia";
      if (resEvento.sucesso) {
        await Promise.all([
          query("UPDATE nfe_documentos SET manifestacao = $2 WHERE id = $1", [doc.id, statusManifestacao]),
          query(
            "INSERT INTO nfe_eventos (empresa_id, ch_nfe, tp_evento, n_seq_evento, xml, dh_evento) VALUES ($1,$2,$3,$4,$5,now())",
            [empresa.id, doc.ch_nfe, String(resEvento.tpEvento), 1, resEvento.eventoAssinadoXml]
          ),
        ]);
        manifestadas++;
      } else if (resEvento.jaManifestada) {
        // cStat 573 (Duplicidade de Evento): a manifestação já existe na
        // SEFAZ (ex.: dada antes por outra ferramenta ou manualmente no site
        // da Receita). Não é uma rejeição de verdade — se voltasse pra
        // 'nenhuma' essa nota tentaria manifestar de novo (e falharia de
        // novo) em toda sincronização futura, pra sempre. Não temos o XML
        // do evento original pra gravar em nfe_eventos, então só marcamos a
        // manifestação como dada e deixamos a Fase 3 tentar buscar o XML
        // completo normalmente.
        await query("UPDATE nfe_documentos SET manifestacao = $2 WHERE id = $1", [doc.id, statusManifestacao]);
        manifestadas++;
      } else {
        await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE id = $1", [doc.id]);
      }
    } catch (e) {
      console.error(`Falha ao manifestar ${doc.ch_nfe}:`, e.message || e);
      await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE id = $1", [doc.id]).catch(() => {});
    }
    await esperar(PAUSA_ENTRE_CHAMADAS_MS);
  }
  return { manifestadas, restantes };
}

/**
 * Busca pela chave o XML completo das notas já manifestadas que ainda estão
 * só com resumo — em vez de esperar o feed por NSU, que fica bloqueado por
 * 1h depois de um cStat 137. Para na primeira falha (serviço de distribuição
 * lento/fora do ar: as seguintes falhariam igual) ou no fim do orçamento.
 */
async function completarManifestadasPorChave(empresa, cert, prazoFinal) {
  const docs = await query(
    "SELECT * FROM nfe_documentos WHERE empresa_id = $1 AND tipo = 'resumo' AND manifestacao IN ('ciencia', 'confirmacao') LIMIT $2",
    [empresa.id, LIMITE_MANIFESTACOES_POR_CHAMADA]
  );
  let completados = 0;
  for (const [n, doc] of docs.rows.entries()) {
    if (Date.now() >= prazoFinal) break;
    if (n > 0) await esperar(PAUSA_ENTRE_CHAMADAS_MS);
    try {
      if (await buscarXmlPorChave(empresa, doc, cert)) completados++;
    } catch (e) {
      console.error(`Falha ao buscar XML completo por chave (${doc.ch_nfe}):`, e.message || e);
      break;
    }
  }
  return completados;
}

/**
 * Sincroniza UMA empresa por completo num único clique/chamada:
 *  1) puxa todos os lotes pendentes da distDFeInt (looping, não só um lote);
 *  2) se `manifestarAutomaticamente`, dá Ciência da Operação automaticamente
 *     em toda nota que ainda só tem resumo (sem isso o XML completo nunca
 *     chega — é assim que a SEFAZ funciona: resumo até o destinatário
 *     manifestar);
 *  3) busca pela chave o XML completo das notas já manifestadas.
 *
 * As etapas são independentes: a espera de 1h que a SEFAZ impõe após um
 * cStat 137/656 (ou uma falha do serviço de distribuição) só bloqueia a
 * etapa 1 — a manifestação usa outro serviço e a busca por chave não entra
 * nessa regra, então continuam rodando.
 *
 * `manifestarAutomaticamente` (padrão true) existe pra diferenciar clique
 * manual do usuário (que pediu explicitamente essa automação) de uma
 * chamada desatendida (cron) — nesse segundo caso, o chamador deve passar
 * `empresa.manifestacao_automatica` (que por padrão é false no banco),
 * porque manifestação é um evento oficial e irreversível junto à SEFAZ e
 * não deveria disparar sozinha sem ninguém presente, a menos que a empresa
 * tenha ligado essa opção explicitamente.
 *
 * Não lança para erros "esperados" (SEFAZ fora do ar, cStat de negócio) —
 * eles voltam dentro do objeto de retorno (`ok: false` ou `aguardando`).
 */
async function sincronizarEmpresa(empresa, { manifestarAutomaticamente = true } = {}) {
  if (!empresa.cert_encrypted || !empresa.cert_password_encrypted) {
    return { ok: false, erro: "Empresa sem certificado cadastrado." };
  }
  const emEspera = !!empresa.proxima_consulta_permitida_em && new Date(empresa.proxima_consulta_permitida_em) > new Date();
  const avisoEspera = emEspera
    ? `A SEFAZ pede para aguardar antes de buscar notas novas. Próxima busca permitida às ${new Date(
        empresa.proxima_consulta_permitida_em
      ).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
    : null;
  // Sem manifestação automática (cron padrão) não há mais nada a fazer
  // durante a espera.
  if (emEspera && !manifestarAutomaticamente) {
    return { ok: false, erro: avisoEspera, aguardando: true };
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

  // Reivindicações órfãs: se uma sincronização anterior for encerrada no meio
  // (ex.: limite de tempo da função serverless, crash) enquanto manifestava
  // uma nota, ela fica travada para sempre em 'enviando' — nada mais a
  // reivindica de volta, já que manifestarPendentes só pega 'nenhuma'. Como
  // sincronizarEmpresa nunca roda em paralelo pra uma mesma empresa vindo da
  // UI (clique manual) ou do cron isoladamente, qualquer 'enviando' que ainda
  // exista no início de uma nova chamada só pode ser resíduo de uma chamada
  // anterior que não terminou — devolve pra 'nenhuma' pra ser tentada de
  // novo (reenviar é seguro: a SEFAZ já trata reenvio com cStat 573).
  await query("UPDATE nfe_documentos SET manifestacao = 'nenhuma' WHERE empresa_id = $1 AND manifestacao = 'enviando'", [
    empresa.id,
  ]).catch((e) => console.error("Falha ao reivindicar manifestacoes orfas:", e));

  const inicio = Date.now();
  const prazoFinal = inicio + ORCAMENTO_SINCRONIZACAO_MS;
  // Metade do orçamento pra etapa 1 — num backlog grande ela sozinha
  // consumiria tudo e a manifestação nunca rodaria; o que sobrar de notas
  // novas continua na próxima sincronização (o progresso é salvo por lote).
  const prazoDistribuicao = inicio + ORCAMENTO_SINCRONIZACAO_MS / 2;

  // --- Etapa 1: notas novas pelo feed por NSU (bloqueada durante a espera) ---
  let fase1 = null;
  let erroDistribuicao = null;
  if (!emEspera) {
    try {
      fase1 = await distribuirAteCaughtUp({
        empresa,
        ultNsuInicial: empresa.ult_nsu,
        certPem,
        keyPem,
        prazoFinal: prazoDistribuicao,
      });
    } catch (e) {
      erroDistribuicao = e instanceof ErroSefaz ? e.message : "Erro inesperado ao buscar notas novas.";
      if (!(e instanceof ErroSefaz)) console.error(e);
      await query("INSERT INTO nfe_sync_logs (empresa_id, c_stat, x_motivo, docs_novos) VALUES ($1, $2, $3, 0)", [
        empresa.id,
        null,
        erroDistribuicao,
      ]).catch((erroLog) => console.error("Falha ao gravar log de sincronização:", erroLog));
    }
  }

  // --- Etapas 2 e 3: manifestação + XML completo por chave ---
  let manifestadas = 0;
  let pendentesDeManifestacao = 0;
  let xmlsCompletados = 0;
  if (manifestarAutomaticamente) {
    try {
      const resultadoManifestacao = await manifestarPendentes({ empresa, certPem, keyPem, prazoFinal });
      manifestadas = resultadoManifestacao.manifestadas;
      pendentesDeManifestacao = resultadoManifestacao.restantes;
      xmlsCompletados = await completarManifestadasPorChave(empresa, { certPem, keyPem }, prazoFinal);
    } catch (e) {
      console.error("Falha na manifestação/busca de XML durante a sincronização:", e);
    }
  }

  if (fase1) {
    // proxima_consulta_permitida_em: 1h quando a própria SEFAZ pediu (regra
    // dela, não é opcional); alguns minutos quando fomos NÓS que paramos por
    // segurança (limite de ciclos/tempo) — evita reclique imediato
    // martelando um backlog grande, sem impor a espera de 1h que não foi
    // exigida pela SEFAZ.
    const agora = new Date();
    let proximaConsulta = null;
    if (fase1.pararPorSefaz) proximaConsulta = new Date(agora.getTime() + UMA_HORA_MS);
    else if (fase1.atingiuLimiteCiclos) proximaConsulta = new Date(agora.getTime() + PAUSA_LIMITE_CICLOS_MS);
    await query(
      `UPDATE nfe_empresas SET ult_nsu = $1, ultima_sincronizacao = $2, proxima_consulta_permitida_em = $3 WHERE id = $4`,
      [fase1.ultNsuFinal, agora, proximaConsulta, empresa.id]
    );
  }

  if (erroDistribuicao && !manifestadas && !xmlsCompletados) {
    return { ok: false, erro: erroDistribuicao };
  }

  return {
    ok: true,
    cStat: fase1 ? fase1.ultimoCStat : null,
    xMotivo: fase1 ? fase1.ultimoXMotivo : null,
    docsNovos: fase1 ? fase1.docsNovosTotal : 0,
    manifestadas,
    pendentesDeManifestacao,
    xmlsCompletados,
    aguardandoSefaz: emEspera || !!(fase1 && fase1.pararPorSefaz),
    atingiuLimiteCiclos: !!(fase1 && fase1.atingiuLimiteCiclos),
    avisoDistribuicao: avisoEspera || (erroDistribuicao ? `Não foi possível buscar notas novas agora (${erroDistribuicao}).` : null),
  };
}

const MANIFESTACOES_QUE_LIBERAM_XML = ["ciencia", "confirmacao"];
// Quando o serviço de distribuição da SEFAZ está saudável a consulta por
// chave responde em 1-2s; quando está instável ele simplesmente não responde.
// Como essa busca é um "bônus" (sem ela o PDF só sai como resumo), não vale
// prender o usuário nos 25s do timeout padrão — desiste cedo.
const TIMEOUT_BUSCA_POR_CHAVE_MS = 6000;

function certificadoDaEmpresa(empresa) {
  const pfxBuffer = decryptSecret(empresa.cert_encrypted);
  const senha = decryptSecret(empresa.cert_password_encrypted).toString("utf8");
  const { certPem, keyPem } = extrairParaMtls(pfxBuffer, senha);
  return { certPem, keyPem };
}

/**
 * Busca o XML completo de UMA nota já manifestada direto pela chave
 * (consChNFe), sem depender do feed por NSU — que só entrega o XML numa
 * sincronização posterior e fica bloqueado por até 1h quando a SEFAZ devolve
 * "nenhum documento". Nunca lança: se não der (nota não manifestada, SEFAZ
 * fora, consumo indevido), devolve o documento como estava e quem chamou cai
 * no PDF resumo.
 */
async function completarXmlPorChave(empresa, doc, cert) {
  if (doc.xml_completo || !MANIFESTACOES_QUE_LIBERAM_XML.includes(doc.manifestacao)) return doc;
  try {
    return (await buscarXmlPorChave(empresa, doc, cert)) || doc;
  } catch (e) {
    console.error(`Falha ao buscar XML completo por chave (${doc.ch_nfe}):`, e.message || e);
    return doc;
  }
}

// Lança em falha de comunicação com a SEFAZ; devolve null se a SEFAZ
// respondeu mas o XML completo ainda não está disponível pra essa chave.
async function buscarXmlPorChave(empresa, doc, cert) {
  const { certPem, keyPem } = cert || certificadoDaEmpresa(empresa);
  const resultado = await distribuirDfe({
    ambiente: empresa.ambiente,
    uf: empresa.uf,
    cnpj: empresa.cnpj,
    chNFe: doc.ch_nfe,
    certPem,
    keyPem,
    timeoutMs: TIMEOUT_BUSCA_POR_CHAVE_MS,
  });
  const completa = resultado.documentos.find((d) => d.tipo === "completa" && d.chNFe === doc.ch_nfe && d.xmlCompleto);
  if (!completa) return null;
  const r = await query(
    "UPDATE nfe_documentos SET xml_completo = $2, tipo = 'completa', dest_cnpj = COALESCE(dest_cnpj, $3) WHERE id = $1 RETURNING *",
    [doc.id, completa.xmlCompleto, completa.destCnpj]
  );
  return r.rows[0] || null;
}

module.exports = { sincronizarEmpresa, completarXmlPorChave, certificadoDaEmpresa, esperar };
