// Servidor de desenvolvimento local que serve o site estático e roda as
// rotas api/*.js (sem precisar do `vercel dev` / CLI autenticado). Cada
// arquivo em api/ já exporta `module.exports = async (req, res) => {...}`
// no formato do runtime Node da Vercel — aqui só criamos um req/res mínimo
// compatível para poder chamar a mesma função localmente.
// Uso: node scripts/dev-server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { carregarEnvLocal } = require("./_env");
carregarEnvLocal();

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3010;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function lerCorpoJson(req) {
  return new Promise((resolve) => {
    let dados = "";
    req.on("data", (chunk) => (dados += chunk));
    req.on("end", () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch (e) {
        resolve({});
      }
    });
  });
}

// Espelha os "rewrites" do vercel.json (sem o prefixo /api/) — lá é o que
// vale em produção, aqui é só pra simular localmente sem `vercel dev`. Se
// mudar um, muda o outro também.
const REESCRITAS = {
  "nfe-empresas": { rota: "empresas" },
  "nfe-certificado": { rota: "certificado" },
  "nfe-empresa-excluir": { rota: "empresa-excluir" },
  "nfe-sincronizar": { rota: "sincronizar" },
  "nfe-cron-sincronizar": { rota: "cron-sincronizar" },
  "nfe-manifestar": { rota: "manifestar" },
  "nfe-documentos": { rota: "documentos" },
  "nfe-exportar-xml": { rota: "exportar-xml" },
  "nfe-exportar-excel": { rota: "exportar-excel" },
  "nfe-exportar-pdf-lote": { rota: "exportar-pdf-lote" },
  "nfe-exportar-pdf": { rota: "exportar-pdf" },
};

function resolverHandler(pathname) {
  if (REESCRITAS[pathname]) {
    return { arquivo: path.join(ROOT, "api", "nfe.js"), params: REESCRITAS[pathname] };
  }

  const partes = pathname.split("/").filter(Boolean);
  const candidatoExato = path.join(ROOT, "api", ...partes) + ".js";
  if (fs.existsSync(candidatoExato)) {
    return { arquivo: candidatoExato, params: {} };
  }
  if (partes.length) {
    const dirPai = path.join(ROOT, "api", ...partes.slice(0, -1));
    if (fs.existsSync(dirPai)) {
      const arquivoDinamico = fs.readdirSync(dirPai).find((f) => /^\[.+\]\.js$/.test(f));
      if (arquivoDinamico) {
        const nomeParam = arquivoDinamico.slice(1, arquivoDinamico.indexOf("]"));
        return { arquivo: path.join(dirPai, arquivoDinamico), params: { [nomeParam]: partes[partes.length - 1] } };
      }
    }
  }
  return null;
}

async function tratarApi(req, res, pathname, searchParams) {
  const encontrado = resolverHandler(pathname.replace(/^\/api\//, ""));
  if (!encontrado) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, erro: "Rota não encontrada." }));
    return;
  }

  // Limpa do cache o handler E qualquer módulo api/_*.js que ele importa
  // (senão uma edição num helper compartilhado só valeria depois de
  // reiniciar o processo inteiro).
  const pastaApi = path.join(ROOT, "api");
  Object.keys(require.cache)
    .filter((p) => p.startsWith(pastaApi))
    .forEach((p) => delete require.cache[p]);
  const handler = require(encontrado.arquivo);
  req.body = ["POST", "PUT", "PATCH"].includes(req.method) ? await lerCorpoJson(req) : {};
  req.query = { ...Object.fromEntries(searchParams.entries()), ...encontrado.params };

  const respostaFalsa = {
    _status: 200,
    _headers: {},
    setHeader(nome, valor) {
      this._headers[nome] = valor;
    },
    getHeader(nome) {
      return this._headers[nome];
    },
    status(codigo) {
      this._status = codigo;
      return this;
    },
    json(obj) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      this._enviar(JSON.stringify(obj));
    },
    end(dados) {
      this._enviar(dados);
    },
    _enviar(corpo) {
      res.writeHead(this._status, this._headers);
      res.end(corpo);
    },
  };

  try {
    await handler(req, respostaFalsa);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, erro: "Erro interno." }));
    }
  }
}

// Em produção os scripts de dados/regras ficam em api/_conteudo e só são
// entregues a quem tem sessão (vercel.json reescreve /js/<arquivo> para
// api/_nfe/conteudo.js). Localmente servem direto da pasta, sem login — a menos
// que DEV_PROTEGIDO=1, que usa o mesmo caminho da produção (com marca d'água,
// gzip e ETag) para um usuário fictício.
function servirConteudoProtegido(req, res, pathname) {
  const m = pathname.match(/^\/(?:tests\/\.\.\/)?js\/([A-Za-z0-9.-]+\.js)$/);
  if (!m) return false;
  if (fs.existsSync(path.join(ROOT, "js", m[1]))) return false; // arquivo público de verdade
  const arquivo = path.join(ROOT, "api", "_conteudo", m[1]);
  if (!fs.existsSync(arquivo)) return false;
  if (process.env.DEV_PROTEGIDO === "1") {
    const { servirConteudo } = require(path.join(ROOT, "api", "_nfe", "conteudo.js"));
    const adaptada = {
      _status: 200,
      _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      end(d) { res.writeHead(this._status, this._headers); res.end(d); },
    };
    servirConteudo(req, adaptada, m[1], "dev@local");
  } else {
    res.writeHead(200, { "Content-Type": MIME[".js"] });
    res.end(fs.readFileSync(arquivo));
  }
  return true;
}

function servirEstatico(req, res, pathname) {
  if (servirConteudoProtegido(req, res, pathname)) return;
  const caminho = pathname === "/" ? "/index.html" : pathname;
  const arquivo = path.join(ROOT, decodeURIComponent(caminho));
  if (!arquivo.startsWith(ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(arquivo, (err, dados) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Não encontrado");
      return;
    }
    const ext = path.extname(arquivo);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(dados);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    await tratarApi(req, res, url.pathname, url.searchParams);
    return;
  }
  servirEstatico(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Servidor de desenvolvimento (sem Vercel CLI) em http://localhost:${PORT}`);
});
