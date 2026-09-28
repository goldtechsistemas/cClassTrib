// Dispatcher único para todas as rotas do módulo Notas Fiscais.
//
// O plano Hobby da Vercel limita a 12 Serverless Functions por deploy; o
// site já usava 12 rotas separadas antes deste módulo. Em vez de criar 11
// funções novas (uma por rota), este arquivo é a ÚNICA função nova — os
// handlers de verdade moram em api/_nfe/*.js (o "_" na frente da pasta faz
// a Vercel NÃO contar esses arquivos como funções). vercel.json reescreve
// cada URL antiga (ex.: /api/nfe-certificado) para /api/nfe?rota=certificado,
// então o frontend (js/notas-fiscais.js) não precisou mudar nada.
const rotas = {
  empresas: require("./_nfe/empresas"),
  certificado: require("./_nfe/certificado"),
  "empresa-excluir": require("./_nfe/empresa-excluir"),
  sincronizar: require("./_nfe/sincronizar"),
  "cron-sincronizar": require("./_nfe/cron-sincronizar"),
  manifestar: require("./_nfe/manifestar"),
  documentos: require("./_nfe/documentos"),
  "exportar-xml": require("./_nfe/exportar-xml"),
  "exportar-excel": require("./_nfe/exportar-excel"),
  "exportar-pdf": require("./_nfe/exportar-pdf"),
  "exportar-pdf-lote": require("./_nfe/exportar-pdf-lote"),
};

module.exports = async (req, res) => {
  const rota = req.query && req.query.rota;
  const handler = rotas[rota];
  if (!handler) {
    res.status(404).json({ ok: false, erro: "Rota não encontrada." });
    return;
  }
  // Nem toda rota interna tem try/catch próprio (ex.: exportar-pdf.js) — sem
  // isto, uma exceção não tratada vira a página crua "FUNCTION_INVOCATION_
  // FAILED" da própria Vercel em vez de um JSON de erro do site.
  try {
    await handler(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, erro: "Erro interno." });
    }
  }
};
