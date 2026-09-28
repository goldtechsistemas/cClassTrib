const { query } = require("./_db");
const { sincronizarEmpresa } = require("./_nfeSync");

// Disparado pelo Vercel Cron (vercel.json) — varre todas as empresas com
// certificado cadastrado cuja janela de espera da SEFAZ (se houver) já
// passou, e sincroniza cada uma. Protegido por CRON_SECRET: só o próprio
// Vercel Cron (que envia esse header automaticamente) ou alguém com o
// segredo consegue disparar.
module.exports = async (req, res) => {
  const segredoEsperado = process.env.CRON_SECRET;
  const autorizacao = req.headers && req.headers.authorization;
  if (segredoEsperado && autorizacao !== `Bearer ${segredoEsperado}`) {
    res.status(401).json({ ok: false, erro: "Não autorizado." });
    return;
  }

  const r = await query(
    `SELECT * FROM nfe_empresas
     WHERE cert_encrypted IS NOT NULL
       AND (proxima_consulta_permitida_em IS NULL OR proxima_consulta_permitida_em <= now())`
  );

  const resultados = [];
  for (const empresa of r.rows) {
    try {
      const resultado = await sincronizarEmpresa(empresa);
      resultados.push({ empresaId: empresa.id, cnpj: empresa.cnpj, ...resultado });
    } catch (e) {
      console.error(`Falha ao sincronizar empresa #${empresa.id}:`, e);
      resultados.push({ empresaId: empresa.id, cnpj: empresa.cnpj, ok: false, erro: "Erro interno." });
    }
  }

  res.status(200).json({ ok: true, totalEmpresas: r.rows.length, resultados });
};
