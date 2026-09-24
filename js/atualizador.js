/*
 * Verificador de atualização automática — mesma ideia do atualizador.py do
 * Validador Sintegra (checagem em segundo plano ao abrir, sem travar a
 * tela, "Sim"/"Depois", nunca reclama se algo estiver indisponível), só que
 * adaptada para um site estático, onde os conceitos originais não existem:
 *
 *   Validador Sintegra (.exe local)          cClassTrib (site estático)
 *   -----------------------------------      -----------------------------------
 *   Escanear letras de A: a Z: procurando     Não existe — o "compartilhamento" é
 *   o Google Drive montado                    o próprio servidor HTTP do site
 *   versao.json DENTRO da pasta do Drive      versao.json na raiz do site
 *   Versão embutida no .exe (main.__version__) Constante VERSAO_ATUAL abaixo
 *   "Instalar" = rodar o instalador e fechar  "Instalar" = recarregar a página —
 *   o programa atual                          o servidor já entrega os arquivos novos,
 *                                              não existe um instalador para rodar
 *
 * Processo de lançar uma atualização (equivalente ao "1. O que eu faço aqui
 * pra lançar uma atualização" do Sintegra) — ver README, seção própria:
 *   1. Sobe o número da versão em dois lugares só: VERSAO_ATUAL aqui embaixo
 *      e o campo "versao" de versao.json (o próprio código tem um teste
 *      automático que os compara).
 *   2. Publica o site (Netlify Drop ou onde for) — não tem "instalador" pra
 *      copiar, o deploy já É a distribuição.
 *
 * Se o servidor estiver offline, o arquivo não existir ou vier mal
 * formado — não pergunta nada. Nunca trava nem mostra erro por causa disso
 * (mesma garantia do original).
 */
(function (global) {
  "use strict";

  // Versão embutida nesta página no momento em que ela foi carregada —
  // equivalente a main.__version__ embutida no .exe. Só isso e o campo
  // "versao" de versao.json precisam subir a cada lançamento.
  const VERSAO_ATUAL = "1.0.1";

  const INTERVALO_RECHECAGEM_MS = 30 * 60 * 1000; // 30 min — para quem deixa a aba aberta o dia todo

  // Compara "1.2.10" com "1.2.9" numericamente por partes (não como string —
  // como string, "1.2.10" < "1.2.9" porque "1" < "9" no terceiro segmento,
  // o que estaria errado). Só considera atualização quando o servidor tem
  // uma versão MAIOR — nunca sugere downgrade, igual ao original.
  function compararVersoes(a, b) {
    const pa = String(a == null ? "" : a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b == null ? "" : b).split(".").map((n) => parseInt(n, 10) || 0);
    const tamanho = Math.max(pa.length, pb.length);
    for (let i = 0; i < tamanho; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  function mostrarAviso(versaoNova, notas) {
    if (document.getElementById("aviso-atualizacao")) return; // já mostrado nesta sessão
    if (!document.body) return;

    const div = document.createElement("div");
    div.id = "aviso-atualizacao";
    div.className = "aviso-atualizacao";
    div.innerHTML = `
      <span class="aviso-atualizacao-texto">🔄 Nova versão do site disponível (${versaoNova})${notas ? " — " + notas : ""}. Deseja atualizar agora?</span>
      <span class="aviso-atualizacao-botoes">
        <button type="button" class="btn btn-sm" id="btn-atualizar-sim">Sim</button>
        <button type="button" class="btn secondary btn-sm" id="btn-atualizar-depois">Depois</button>
      </span>`;
    document.body.appendChild(div);

    document.getElementById("btn-atualizar-sim").addEventListener("click", () => {
      // "Instalar" aqui é só recarregar — não existe instalador para rodar;
      // o servidor já está com os arquivos novos prontos para servir.
      location.reload();
    });
    document.getElementById("btn-atualizar-depois").addEventListener("click", () => {
      div.remove();
    });
  }

  async function verificarAtualizacao() {
    try {
      // Caminho absoluto (raiz do site), não relativo — assim funciona
      // igual em qualquer página, inclusive as que ficam em subpastas
      // (ex.: tests/tests.html), sem cada uma precisar calcular "../".
      const resposta = await global.fetch("/versao.json?_=" + Date.now(), { cache: "no-store" });
      if (!resposta.ok) return;
      const dados = await resposta.json();
      if (!dados || typeof dados.versao !== "string") return;
      if (compararVersoes(dados.versao, VERSAO_ATUAL) > 0) {
        mostrarAviso(dados.versao, dados.notas);
      }
    } catch (e) {
      // Servidor offline, arquivo ausente, JSON quebrado — silencioso,
      // exatamente como "se o Drive estiver offline... não pergunta nada".
    }
  }

  function iniciar() {
    verificarAtualizacao();
    global.setInterval(verificarAtualizacao, INTERVALO_RECHECAGEM_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  global.Atualizador = { compararVersoes, VERSAO_ATUAL, verificarAtualizacao };
})(window);
