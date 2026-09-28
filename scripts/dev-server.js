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

function carregarEnvLocal() {
  const arquivo = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(arquivo)) return;
  const conteudo = fs.readFileSync(arquivo, "utf8");
  conteudo.split("\n").forEach((linha) => {
    const l = linha.trim();
    if (!l || l.startsWith("#")) return;
    const idx = l.indexOf("=");
    if (idx === -1) return;
    const chave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    if (!(chave in process.env)) process.env[chave] = valor;
  });
}
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

function resolverHandler(pathname) {
  const partes = pathname.split("/").filter(Boolean);
  const candidatoExato = path.join(ROOT, "api", ...partes) + ".js";
  if (fs.existsSync(candidatoExato)) {
    return { arquivo: candidatoExato, params: {} };
  }
  if (partes.length) {
    const semUltimo = partes.slice(0, -1);
    const candidatoDinamico = path.join(ROOT, "api", ...semUltimo, "[id].js");
    if (fs.existsSync(candidatoDinamico)) {
      return { arquivo: candidatoDinamico, params: { id: partes[partes.length - 1] } };
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

function servirEstatico(req, res, pathname) {
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
