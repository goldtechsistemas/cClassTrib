const { query } = require("../_db");
const { sincronizarEmpresa } = require("../_nfeSync");

// Disparado de hora em hora pelo GitHub Actions (.github/workflows/
// sincronizar-notas.yml) e, como reserva, uma vez por dia pelo Vercel Cron
// (vercel.json) — varre todas as empresas com
// certificado cadastrado cuja janela de espera da SEFAZ (se houver) já
// passou, e sincroniza cada uma. Protegido por CRON_SECRET: só o próprio
// Vercel Cron (que envia esse header automaticamente) ou alguém com o
// segredo consegue disparar.
// A função serverless morre aos 60s (maxDuration em vercel.json). Para parar
// antes disso e deixar as empresas que não deu tempo pro próximo disparo,
// respeita um teto de tempo; as mais "esquecidas" (sincronizadas há mais
// tempo, ou nunca) vão primeiro, então todas acabam sendo atendidas em
// rodízio mesmo com muitas empresas cadastradas.
const ORCAMENTO_CRON_MS = 50000;
const FOLGA_MINIMA_POR_EMPRESA_MS = 12000;

module.exports = async (req, res) => {
  // Sem CRON_SECRET configurado a rota ficaria aberta a qualquer visitante
  // (que poderia disparar a sincronização de todas as empresas). Por isso
  // falha fechada: sem o segredo, ninguém executa.
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    console.error("CRON_SECRET não configurado — sincronização agendada desativada.");
    res.status(503).json({ ok: false, erro: "Sincronização agendada indisponível (segredo não configurado)." });
    return;
  }
  const autorizacao = req.headers && req.headers.authorization;
  if (autorizacao !== `Bearer ${segredoEsperado}`) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  const r = await query(
    // Empresa cujas 3 últimas consultas foram recusadas com 656 (quase sempre
    // outro sistema consultando o mesmo CNPJ) só é tentada de novo a cada 6h
    // pela rotina automática — insistir de hora em hora não adianta. O botão
    // "Sincronizar agora" continua liberado normalmente.
    `SELECT * FROM nfe_empresas e
     WHERE e.cert_encrypted IS NOT NULL
       AND (e.proxima_consulta_permitida_em IS NULL OR e.proxima_consulta_permitida_em <= now())
       AND NOT EXISTS (
         SELECT 1 FROM (
           SELECT c_stat, iniciado_em FROM nfe_sync_logs l
            WHERE l.empresa_id = e.id ORDER BY l.iniciado_em DESC LIMIT 3
         ) u
         HAVING count(*) = 3 AND bool_and(u.c_stat = '656') AND max(u.iniciado_em) > now() - interval '6 hours'
       )
     ORDER BY e.ultima_sincronizacao ASC NULLS FIRST, e.id ASC`
  );

  const inicio = Date.now();
  let adiadas = 0;
  const resultados = [];
  for (const empresa of r.rows) {
    if (Date.now() - inicio > ORCAMENTO_CRON_MS - FOLGA_MINIMA_POR_EMPRESA_MS) {
      adiadas++;
      continue;
    }
    try {
      // Chamada desatendida (ninguém está olhando) — só manifesta
      // automaticamente se a própria empresa ligou essa opção
      // explicitamente (manifestacao_automatica, padrão false no banco).
      // Manifestação é um evento oficial e irreversível junto à SEFAZ; não
      // deve disparar sozinha sem esse consentimento explícito.
      const resultado = await sincronizarEmpresa(empresa, { manifestarAutomaticamente: !!empresa.manifestacao_automatica });
      resultados.push({ empresaId: empresa.id, cnpj: empresa.cnpj, ...resultado });
    } catch (e) {
      console.error(`Falha ao sincronizar empresa #${empresa.id}:`, e);
      resultados.push({ empresaId: empresa.id, cnpj: empresa.cnpj, ok: false, erro: "Erro interno." });
    }
  }

  res.status(200).json({ ok: true, totalEmpresas: r.rows.length, adiadasParaOProximoDisparo: adiadas, resultados });
};
