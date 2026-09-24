# cClassTrib — Consulta de Classificação Tributária (LC 214/2025)

Site de consulta de classificação tributária (cClassTrib) para a Reforma Tributária
brasileira, permitindo pesquisar por **NCM**, por **descrição do produto** (nos Anexos
com tratamento especial ou na **tabela NCM oficial completa**), por **tipo de operação**
ou em **lote via CSV** — inclusive descobrindo o NCM de uma lista de produtos só pelo
nome, um por um ou em lote — e descobrir o Anexo aplicável da Lei Complementar nº
214/2025, o percentual de redução de IBS/CBS e a alíquota estimada.

## Por que este projeto é um site estático (HTML/CSS/JS puro), e não Next.js?

A stack originalmente sugerida (Next.js + TypeScript + Node.js + SQLite) foi avaliada,
mas a máquina usada para desenvolver este projeto não tinha Node.js nem Python
instalados, o que impediria rodar `npm install`/dev server e **testar de fato**
a aplicação antes da entrega. Como todos os requisitos funcionais (busca por
NCM/descrição/operação, upload de CSV em lote, exportação, FAQ) não dependem de
nenhum segredo de servidor, foi possível implementá-los
inteiramente no navegador (client-side), com uma separação clara de camadas
(dados / regras / apresentação) — o que também simplifica o deploy (hospedagem
estática pura, sem servidor Node em produção).

Se no futuro você quiser migrar para Next.js/API routes/banco de dados real, a
lógica em `js/rules.js` foi escrita sem dependências de DOM e pode ser
reaproveitada quase sem alterações dentro de uma API route ou de um pacote
TypeScript.

## Estrutura do projeto (camadas)

```
cclasstrib-app/
├── index.html            # Consulta principal (NCM+descrição nos Anexos / Descobrir NCM / operação) — tela inicial do site
├── lote.html            # Consulta em lote via CSV — 2 abas: Classificar cClasstrib e Descobrir NCM por descrição
├── sobre.html            # Explicação IBS/CBS/IS + FAQ + aviso legal
├── login.html            # Login — obrigatório antes de index/lote/sobre (ver js/auth.js)
├── registro.html         # Criação de conta (nome, e-mail, senha, confirmar senha)
├── versao.json           # Versão publicada atual — lida por js/atualizador.js (ver seção própria)
├── css/styles.css        # Design system (paleta laranja, dark/light — ver js/tema.js)
├── js/
│   ├── auth.js                 # Login/conta client-side (PBKDF2 via SubtleCrypto, localStorage) — ver seção própria
│   ├── login.js                # Lógica da página login.html
│   ├── registro.js             # Lógica da página registro.html
│   ├── data.js                # CAMADA DE DADOS — Anexos I-XVII extraídos da LC 214/2025
│   ├── cclasstrib-oficial.js   # CAMADA DE DADOS — tabela oficial cClassTrib/CST (Portal NF-e)
│   ├── ncm-tabela.js           # CAMADA DE DADOS — tabela NCM oficial completa + contexto hierárquico (Siscomex/RFB, ~15 mil itens, ~6 MB)
│   ├── marcas-conhecidas.js    # CAMADA DE DADOS (NÃO OFICIAL) — dicionário curado marca→NCM, usado só como fallback heurístico
│   ├── servicos-sem-ncm.js     # CAMADA DE DADOS — termos de serviço de alimentação (sem NCM) → operação "bares_restaurantes"
│   ├── rules.js               # CAMADA DE REGRAS — motor de classificação (sem DOM)
│   ├── ncm-busca.js            # CAMADA DE REGRAS — busca por descrição na tabela NCM completa + fallback de marcas conhecidas (com tratamento de plural/stopwords em PT-BR)
│   ├── atualizador.js          # Verificador de atualização automática (compara VERSAO_ATUAL com versao.json) — carregado em toda página
│   ├── components.js          # CAMADA DE APRESENTAÇÃO — helpers de renderização HTML
│   ├── csv.js                 # Parsing/exportação de CSV (NCM→classificação e descrição→NCM) para a consulta em lote
│   ├── app.js                 # Lógica da página index.html
│   ├── lote.js                # Lógica da página lote.html (2 fluxos: classificar NCM e descobrir NCM por descrição; limite de produtos por envio em LIMITE_PRODUTOS_POR_LOTE)
│   └── sobre.js                # Lógica da página sobre.html (tabela de anexos + FAQ)
├── tests/
│   ├── tests.html          # Executa a suíte de testes no navegador
│   └── tests.js            # Testes automatizados (assert simples, sem framework)
├── scripts/
│   ├── serve.ps1            # Servidor HTTP estático em PowerShell (dev local, sem Node/Python)
│   ├── extract-anexos.ps1   # Baixa e fatia os Anexos da LC 214/2025 a partir do Planalto
│   ├── read-xlsx.ps1        # Leitor genérico de .xlsx (ZIP/XML) em PowerShell puro
│   ├── read-xlsx-cols.ps1   # Extrai colunas específicas de uma planilha .xlsx em TSV
│   └── transformar-tabela-ncm.ps1 # Converte o JSON do Siscomex em js/ncm-tabela.js
└── data/raw/                # (fora do deploy) fontes brutas para auditoria:
    ├── lcp214_plain.txt       #   texto integral da LC 214/2025 (Planalto)
    ├── anexos/anexo_*.txt     #   cada Anexo fatiado individualmente
    ├── cClassTrib 2026-06-22.xlsx              # arquivo oficial original (Portal NF-e)
    ├── CST_INDICADORES_20250514_PUBLICACAO.xlsx # versão anterior, não usada (ver nota acima)
    ├── cclasstrib_compact_extraido.tsv          # extração compacta usada para montar cclasstrib-oficial.js
    └── Tabela_NCM_Vigente_20260914.json          # arquivo oficial original (Siscomex/RFB) usado para ncm-tabela.js
```

## Fonte primária dos dados — como foi montada a base

Antes de estruturar qualquer banco de dados, pesquisamos as fontes públicas
brasileiras candidatas a fornecer dados estruturados sobre cClassTrib/IBS/CBS:

| Fonte | O que encontramos |
|---|---|
| **Portal Nacional da NF-e** (`nfe.fazenda.gov.br`) | Publica oficialmente, via **Informe Técnico 2025.002**, a tabela **cClassTrib** (código de 6 dígitos) e **cCredPres**, em conjunto com a Receita Federal e o Comitê Gestor do IBS. É a fonte mais próxima de "estruturada", mas é distribuída como arquivo (XLSX/PDF) versionado, não uma API REST. O acesso direto ao portal ficou instável durante a pesquisa inicial, mas o **usuário localizou e forneceu o arquivo "cClassTrib 2026-06-22.xlsx" diretamente**, que foi importado em `js/cclasstrib-oficial.js` (ver seção "Atualização" abaixo). Um arquivo mais antigo também foi encontrado (`CST_INDICADORES_20250514_PUBLICACAO.xlsx`, datado de 2025-05-14) — é uma versão anterior e mais simples da tabela de CST, **superada** pelo arquivo de 2026-06-22 e não utilizada neste projeto. |
| **Comitê Gestor do IBS** (`cgibs.gov.br`) | Portal institucional (notícias, resoluções, cartilhas em PDF). Não expõe API de dados abertos nem tabela estruturada de NCM/cClassTrib. |
| **SEFAZ estaduais** | Alguns estados (ex. RS) têm ferramentas de consulta de classificação tributária, mas não uma fonte de dados aberta/API. |
| **Diário Oficial / Planalto** (`planalto.gov.br`) | Texto oficial e consolidado da **LC 214/2025**, de domínio público. **Esta foi a fonte usada para montar `js/data.js`** — o HTML da lei foi baixado e os Anexos I a XVII foram extraídos com `scripts/extract-anexos.ps1` e depois revisados manualmente. O texto bruto de cada Anexo, do jeito que foi extraído, está preservado em `data/raw/` para auditoria. |
| **Tabela NCM oficial (Siscomex)** | API pública, sem autenticação: `GET https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO`. **Atualização (2026-09-14): incorporada.** O usuário forneceu o arquivo `Tabela_NCM_Vigente_20260914.json` (15.155 itens vigentes, ato normativo Resolução Gecex nº 926/2026), convertido para `js/ncm-tabela.js` com `scripts/transformar-tabela-ncm.ps1`. Alimenta a aba "Descobrir NCM", que busca por descrição em toda a tabela (não só nos Anexos com tratamento especial) e cruza automaticamente com `js/rules.js` para indicar quando um código encontrado tem redução/zero prevista. |

### Descobertas importantes durante a pesquisa (2026-09-12)

- A LC 214/2025 tem **17 Anexos relevantes à classificação tributária** (I a
  XVII) — não 15. Os Anexos XVIII a XX que aparecem no texto consolidado da
  lei são, na verdade, alterações ao **Simples Nacional** (LC 123/2006), sem
  relação com cClassTrib, e não foram incluídos aqui.
- **O Anexo XIV (medicamentos, alíquota zero) foi revogado pela Lei
  Complementar nº 227, de 2026.** O tratamento zero para medicamentos hoje
  depende do art. 146, §1º (medicamentos registrados na Anvisa, adquiridos por
  órgãos públicos ou entidades de saúde com CEBAS) — uma regra bem mais restrita
  que a lista antiga. Isso está refletido em `data.js` (`vigente: false`).
- A LC 227/2026 também alterou o art. 172 (tributação monofásica de
  combustíveis), confirmando que a regulamentação está em movimento ativo.

### Lições sobre busca textual na tabela NCM completa (2026-09-14)

Ao implementar a busca por descrição na tabela NCM inteira (`js/ncm-busca.js`)
e a busca de NCM em lote, três bugs reais de relevância apareceram e foram
corrigidos — vale documentar porque são armadilhas fáceis de reintroduzir:

1. **Match por substring solta gera falso positivo.** "água" batia com nomes
   científicos como "*Oncorhynchus aguabonita*" (uma truta) só porque
   "aguabonita" contém "agua" como substring. Corrigido comparando **palavras
   inteiras** tokenizadas, não substring livre.
2. **A tabela oficial só descreve cada nível hierárquico pela diferença em
   relação ao pai.** O código completo "1006.10.10" (arroz para semeadura)
   diz só `"Para semeadura"` — a palavra "Arroz" só aparece no capítulo/
   posição ANCESTRAL ("10.06 Arroz.", "1006.10 - Arroz com casca..."). Sem
   reconstruir esse contexto, buscar "arroz" não encontrava nenhum arroz de
   verdade. `scripts/transformar-tabela-ncm.ps1` agora pré-calcula um
   `textoBusca` por item, concatenando a descrição de todos os ancestrais (a
   ordem do JSON já é hierárquica/sequencial, então isso é feito com uma
   pilha simples). Um match no texto do **próprio** item ainda vale mais (6
   pontos) que um match que só aparece via herança do contexto ancestral (2
   pontos) — senão qualquer item cujo capítulo cite a palavra de passagem
   empataria com o produto certo.
3. **Plural irregular em português.** "mineral" → "minerais" troca o "l"
   final por "is" (não é só "+s" como em "água"→"águas") — a regra genérica
   de plural (prefixo + até 2 letras) não cobria isso, e "água mineral"
   perdia pontos. Há uma regra específica para palavras terminadas em "-al".
4. **Palavras genéricas demais inflam tudo.** "tipo" e "outros/outras"
   aparecem como conector estrutural em milhares de categorias sem relação
   nenhuma ("tipo aerogel", "tipo doméstico", "outros parafusos"...) — viram
   uma pequena lista de stopwords (`PALAVRAS_IGNORADAS` em `ncm-busca.js`),
   removidas da pontuação por palavra (mas não da busca por frase exata).

**Limitações aceitas conscientemente** (não são bugs, são o limite do que dá
pra fazer com busca textual sem inventar dados): termos genéricos de uma
palavra só (ex.: "água" sozinho) continuam retornando dezenas de candidatos
empatados sem uma ordem "perfeita" entre eles — não há como saber que água
mineral é mais comum que água pesada sem um critério artificial.

Nomes de marca (ex.: "BRAHMA") não aparecem na tabela oficial, que classifica
por categoria de produto, não por marca — então a busca textual pura, sozinha,
continua sem achar nada (ou pior: às vezes achava um homônimo errado, ver
seção seguinte). Isso deixou de ser tratado como limite aceito e passou a ter
uma camada de fallback dedicada — ver "Reconhecimento de marcas conhecidas"
abaixo.

### Reconhecimento de marcas conhecidas — fallback heurístico (2026-09-14)

Motivado por um teste real do usuário com uma planilha de bebidas: descrições
de PDV como "ORIGINAL 473ML" e "CORONA LONG NECK 330ML" não davam só "nenhum
candidato" — a busca textual pura **encontrava um candidato errado**, porque
"Original" e "Corona" também são nomes de produtos completamente diferentes na
tabela oficial (um homônimo de copiadora e de uma máquina, respectivamente).
"BRAHMA", "HEINEKEN 473ML" e "AMSTEL 473ML" já não achavam nada, pelo motivo
descrito acima (marca não é categoria).

A solução foi um dicionário curado manualmente,
[`js/marcas-conhecidas.js`](js/marcas-conhecidas.js), mapeando termos de marca
para o NCM da categoria correspondente (ex.: qualquer marca de cerveja →
`2203.00.00`). Ele é explicitamente **não oficial** — ao contrário de toda
outra fonte de dados deste site (Anexos da LC 214/2025, tabela cClassTrib,
tabela NCM da Receita Federal), esta lista é conhecimento geral sobre marcas,
sujeita a erro, e tratada como tal:

- Roda em `NcmBusca.buscarViaMarcaConhecida()` (`js/ncm-busca.js`), comparando
  **palavras inteiras tokenizadas** (não substring solta — "gin" não dispara
  dentro de "engine") contra a lista de termos de cada categoria.
- Em `buscarMelhorNcmCompleto()`, o fallback de marca roda **antes** da busca
  textual na tabela oficial (não só como último recurso) — é isso que corrige
  os casos de homônimo errado, não só os de "nenhum candidato".
- Todo resultado que vem desse caminho é marcado com `viaMarca: true` e nunca
  é exibido misturado com um resultado da tabela oficial sem aviso: tanto a
  busca única (`index.html`, aba "Descobrir NCM") quanto a busca em lote
  (`lote.html`, aba "Descobrir NCM por descrição") mostram um badge/aviso
  amarelo "Marca reconhecida (heurística — não é a tabela oficial)" com o
  termo e a categoria reconhecidos, para o usuário conferir antes de usar.
- Cobre só bebidas por enquanto (cerveja, refrigerante/água adicionada,
  energético/isotônico, água mineral engarrafada por marca, e destilados —
  cachaça, uísque, vodca, gim, licor, vinho), porque foi o caso de uso real
  testado. Cada NCM da lista foi conferido manualmente contra a tabela oficial
  antes de entrar no dicionário (comentários no próprio arquivo explicam o
  raciocínio de cada categoria).

### Atualização (2026-09-12): tabela oficial cClassTrib importada

O usuário localizou e forneceu o arquivo oficial **"cClassTrib 2026-06-22.xlsx"**
(Portal Nacional da NF-e / Receita Federal / Comitê Gestor do IBS, Informe
Técnico 2025.002), com as 164 hipóteses de cClassTrib e as 18 situações de
CST-IBS/CBS. Ele foi transcrito integralmente em `js/cclasstrib-oficial.js`
(sem depender de Node/Python/Excel — veja `scripts/read-xlsx.ps1` e
`scripts/read-xlsx-cols.ps1`, leitores de `.xlsx` em PowerShell puro, usados
para extrair os dados a partir do ZIP/XML do arquivo). `js/rules.js` cruza
cada Anexo com essa tabela pelo número do Anexo (convertendo romano→arábico) e
pelo percentual de redução, para lidar com Anexos que têm mais de uma hipótese
(ex.: Anexo IV tem uma redução geral de 60% e uma variante de alíquota zero
quando o comprador é órgão público/entidade CEBAS — ambas aparecem no
resultado).

**Correção importante feita nesse processo**: ao cruzar os artigos citados na
tabela oficial com os que este projeto já tinha, descobri que a primeira
versão deste `data.js` havia **estimado por dedução sequencial** (sem
confirmação direta no texto da lei) os artigos dos Anexos III, IV, V, VI, IX,
X, XI, XII e XIII — e dois deles (XII e XIII) usavam números **fabricados**
("146-A"/"146-B") que não existem na LC 214/2025. Um terceiro caso (Anexo XVI)
citava "133-A", também fabricado. Todos foram corrigidos para os valores reais
(confirmados pela tabela oficial ou, no caso dos Anexos XVI e XVII, por busca
direta no texto da lei — arts. 371, § 1º e 409, § 1º, respectivamente). Os
testes em `tests/tests.js` incluem uma checagem de regressão que falha se
"146-A"/"146-B" reaparecerem em `data.js`.

**Lição para quem for expandir a base**: nunca preencha o campo `artigo` de um
Anexo por dedução/sequência a partir de outros Anexos vizinhos — confirme
sempre com uma busca direta no texto da lei (`data/raw/lcp214_plain.txt`) ou
na tabela oficial cClassTrib antes de commitar o valor.

## Como atualizar a base de dados quando novos Anexos/regulamentações forem publicados

1. **Para atualizar a tabela oficial cClassTrib (6 dígitos) quando sair uma nova versão:**
   - Baixe o arquivo mais recente em nfe.fazenda.gov.br → Documentos → Diversos
     → "Informe Técnico 2025.00X" (cClassTrib/cCredPres), ou peça para alguém
     com acesso ao portal exportar/enviar o `.xlsx`.
   - Use `scripts/read-xlsx-cols.ps1` para extrair as colunas relevantes sem
     precisar de Excel/Node/Python (exemplo no próprio script — veja o
     comentário no topo de `js/cclasstrib-oficial.js` para o comando usado da
     última vez).
   - Atualize `js/cclasstrib-oficial.js` com os códigos novos/alterados e
     ajuste `meta.dataVersaoArquivo`. Se algum Anexo ganhar ou perder uma
     hipótese de cClassTrib, confira se `buscarCClassTribOficial()` em
     `js/rules.js` ainda desempata corretamente pelos Anexos com mais de uma
     hipótese (atualmente IV, V, VI e IX).

2. **Para atualizar um Anexo (nova redação, novo item, revogação):**
   - Baixe o texto consolidado mais recente em
     `https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm`.
   - Localize o Anexo alterado e atualize o array `itens` correspondente em
     `js/data.js`. Sempre cite o artigo de lei (`artigo`) e, se o Anexo tiver
     sido revogado/alterado, preencha `vigente: false` e `revogadoPor`.
   - Atualize `meta.alteracoesConhecidas` com a nova lei complementar.

3. **Para adicionar um novo tipo de operação** (ex.: uma nova hipótese de
   suspensão ou diferimento regulamentada pelo Comitê Gestor do IBS):
   - Adicione uma entrada ao array `operacoes` em `js/data.js`, com `id`,
     `label`, `tratamento`, `descricao` e `artigo`.

4. **Para atualizar a tabela NCM completa** (aba "Descobrir NCM" na consulta
   única e na consulta em lote), quando o Siscomex publicar uma nova versão:
   - Baixe o JSON público em
     `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO`
     (sem autenticação).
   - Rode `pwsh -File scripts/transformar-tabela-ncm.ps1 -Origem "caminho\para\o.json"`
     — ele filtra só os códigos vigentes, remove marcação HTML residual das
     descrições e regrava `js/ncm-tabela.js` (formato compacto `[codigo, descricao, ehCodigoCompleto]`).
   - Esse arquivo é independente de `js/data.js`/`js/cclasstrib-oficial.js`
     (fonte diferente, tabela NCM completa vs. Anexos com tratamento especial)
     — atualizar um não exige atualizar o outro.

5. **Sempre rode a suíte de testes depois de editar `data.js`** (veja abaixo)
   — os testes verificam a lógica de correspondência de NCM e o cálculo de
   alíquota, não o conteúdo da lei em si, mas ajudam a detectar erros de
   digitação que quebrem o formato esperado.

### Limite de produtos por envio na consulta em lote (2026-09-14)

`js/lote.js` trunca qualquer arquivo CSV em `LIMITE_PRODUTOS_POR_LOTE` (1.000)
linhas antes de processar, nas duas abas. Existe por dois motivos: dar uma
expectativa clara ao usuário *antes* do envio (aviso fixo acima da área de
upload em `lote.html`, classe `.limite-lote`) em vez de travar a aba no meio
do processamento; e porque tudo roda em JavaScript puro no navegador, sem
worker/servidor — a aba "Descobrir NCM por descrição" compara cada produto
contra ~15 mil itens da tabela oficial, um a um, então um arquivo muito
grande degrada a experiência. Quando o arquivo excede o limite, as linhas
processadas aparecem normalmente e a linha de progresso avisa quantas ficaram
de fora, pedindo para enviar o restante em um novo arquivo (nada é
descartado silenciosamente). É só uma constante local — ajuste livremente
conforme sua infraestrutura.

### "Descobrir NCM" para itens de cardápio (refeição, marmitex, porção) — 2026-09-16

Relato do usuário: buscar "Refeição", "Marmitex" ou "Porção" na aba "Descobrir
NCM" não achava nada. A causa não era um bug de busca — é que esses termos
descrevem um **serviço** de alimentação (item de cardápio de bar/restaurante/
lanchonete), não uma **mercadoria**, e NCM (Nomenclatura Comum do Mercosul)
só classifica bens físicos. Não existe, e não deveria existir, um código NCM
para "marmitex" — a tabela oficial de ~15 mil itens genuinamente não tem essa
resposta porque a pergunta parte de uma categoria errada.

O pedido original era resolver isso com busca ao vivo no Google — descartado
por dois motivos: (1) tecnicamente exigiria uma chave de API de busca paga
chamada de um servidor (não dá pra expor uma chave paga num site 100%
estático sem backend, e não teria como pagar essas chamadas), e (2)
principalmente, contrariaria o princípio central deste site ("não invente
classificações") — resultados de busca por essa exata confusão tendem a ser
inconsistentes/errados, e apresentar "o que o Google disse" como se fosse a
classificação oficial seria pior do que mostrar "não encontrado".

Em vez disso, a solução usa dado oficial que **já estava carregado no
site, só nunca conectado a essa busca**: a LC 214/2025 tem um regime
tributário específico para bares/restaurantes/lanchonetes (art. 273 a 276 —
redução de 40% nas alíquotas de IBS/CBS sobre o fornecimento de alimentação
preparada no próprio estabelecimento), com código cClassTrib oficial
`200047` já presente em `js/cclasstrib-oficial.js` desde a importação da
tabela original, mas nunca antes exposto como uma operação selecionável.

- `js/servicos-sem-ncm.js`: lista curta e conservadora de termos
  inequivocamente de cardápio ("refeição", "marmitex", "porção", "prato
  feito", "self service", "rodízio", "buffet", "prato do dia"). Termos mais
  genéricos (“lanche”, “combo”, “quilo”, “sanduíche”) ficaram de fora de
  propósito — podem legitimamente ser produtos embalados com NCM de
  verdade, e incluí-los arriscaria dizer isso errado para quem tem um
  produto real.
- `NcmBusca.buscarServicoSemNcm()` roda antes da busca textual (mesma
  posição de prioridade do fallback de marcas conhecidas) e, quando um
  termo bate, `buscarMelhorNcmCompleto()` devolve `melhor: null` +
  `semNcmServico` — de propósito **não é um NCM "encontrado"**, é a
  informação de que a pergunta certa é outra.
- Nova operação `bares_restaurantes` em `data.js` (`classificarPorOperacao`),
  usando o cClassTrib **oficial** 200047 — nenhum dado novo foi inventado,
  só conectado. Tanto a busca única (`index.html`) quanto a busca em
  lote (`lote.html`) mostram o card/linha com o tratamento tributário real
  (art. 273-276, CST 200, redução de 40%) no lugar de "não encontrado".

### Verificador de atualização automática (`js/atualizador.js`) — 2026-09-22

Mesma lógica do atualizador do Validador Sintegra (checagem silenciosa em
segundo plano ao abrir, pergunta "Sim"/"Depois", nunca trava nem reclama se
algo estiver indisponível), adaptada para um site estático — os dois
conceitos centrais do original (Google Drive montado localmente, instalador
`.exe`) não existem aqui e foram substituídos por equivalentes que fazem
sentido na web:

| Validador Sintegra (`.exe` local) | cClassTrib (site estático) |
|---|---|
| Escaneia letras de `A:` a `Z:` procurando o Google Drive | Não precisa — o "compartilhamento" já é o próprio servidor HTTP do site |
| `versao.json` **dentro da pasta do Drive** | [`versao.json`](versao.json) na **raiz do site** |
| Versão embutida no `.exe` (`main.__version__`) | Constante `VERSAO_ATUAL` no topo de `js/atualizador.js` |
| "Instalar" = rodar o instalador e fechar o programa atual | "Instalar" = `location.reload()` — o servidor já entrega os arquivos novos, não existe instalador para rodar |

Como funciona: toda página (`index.html`, `lote.html`, `sobre.html`) carrega
`js/atualizador.js`, que busca `/versao.json` (com cache-buster, path
absoluto — funciona igual em páginas de subpasta como `tests/tests.html`),
compara com `VERSAO_ATUAL` usando comparação **numérica por partes** (não
como string — como string "1.2.10" ficaria "menor" que "1.2.9", o que
esconderia uma atualização real) e só considera atualização quando a versão
do servidor é **maior** (nunca sugere downgrade). Se bater, mostra um aviso
discreto no rodapé da tela; "Sim" recarrega a página, "Depois" só fecha o
aviso. Recheca a cada 30 minutos, para quem deixa a aba aberta o dia
inteiro. Qualquer erro (servidor fora do ar, arquivo ausente, JSON quebrado)
é silencioso — nunca trava nem mostra erro pro usuário, igual ao original.

**Como lançar uma atualização** (equivalente ao processo do Sintegra — sem
Google Drive nem instalador, só dois arquivos e um deploy):

1. Suba o número da versão em **dois lugares só**: `VERSAO_ATUAL` em
   `js/atualizador.js` e o campo `"versao"` de [`versao.json`](versao.json)
   (o teste `Atualizador está exposto com VERSAO_ATUAL definida` em
   `tests/tests.js` não valida que os dois batem automaticamente — é uma
   checagem manual antes de publicar).
2. Publique o site (Netlify Drop ou o host que estiver usando). Não existe
   "instalador" para copiar — o próprio deploy já é a distribuição.

Quem já estava com uma aba aberta antes do deploy vê o aviso na próxima
rechecagem (até 30 min, ou na hora se recarregar a página); quem abre o
site depois do deploy já recebe a versão nova de cara, sem aviso nenhum
(não tem nada "desatualizado" para detectar).

## Login e criação de conta (2026-09-23)

Reintroduzido a pedido do usuário (tinha sido removido em 2026-09-18 "até
finalizar tudo"). É client-side — este site continua sem backend/servidor
de aplicação, então **não é um sistema de contas de verdade**: as contas
ficam salvas no `localStorage` do navegador/instalação, não num banco
compartilhado — cada máquina/navegador tem sua própria lista.

- `index.html`, `lote.html` e `sobre.html` têm um script inline no `<head>`
  (antes de qualquer conteúdo) que confere `localStorage['cclasstrib-sessao']`
  e redireciona pra `login.html` se não houver sessão — é assim que "abrir o
  site sem estar logado" sempre cai na tela de login primeiro, em vez de um
  flash do conteúdo protegido.
- `login.html`: e-mail + senha. Link "Criar conta" pra quem não tem.
- `registro.html`: nome, e-mail, senha, confirmar senha. Ao criar a conta,
  já loga automaticamente e manda pra `index.html`.
- `js/auth.js`: a senha nunca é salva em texto puro — só um hash PBKDF2
  (100.000 iterações, SHA-256) com salt aleatório por usuário, via
  `crypto.subtle` (SubtleCrypto). Isso só funciona em "contexto seguro"
  (`https://` ou `http://localhost`) — é por isso que o app desktop serve
  o site via servidor HTTP local em vez de abrir os arquivos direto
  (`file://`, que não conta como contexto seguro).
- Sessão fica em `localStorage['cclasstrib-sessao']` (não expira sozinha —
  permanece até clicar em "Sair", que `js/auth.js` liga automaticamente no
  botão injetado por `Components.renderHeader()` quando há sessão ativa).
- No cabeçalho, o nome do usuário e "Sair" ficam à direita do botão de
  tema (claro/escuro). Clicar no nome abre um menu suspenso (`js/conta.js`)
  com "Alterar nome de usuário" / "Alterar e-mail" / "Alterar senha", cada
  um abrindo um modal com abas (reaproveita o mesmo `.card`/`.tabs` do
  resto do site). Trocar e-mail ou senha exige confirmar a senha atual
  (`Auth.alterarEmail`/`Auth.alterarSenha`, em `js/auth.js`); trocar só o
  nome de exibição não exige senha. Qualquer alteração recarrega a página
  ao salvar (mais simples que re-renderizar o cabeçalho na hora).
- Testes em `tests/tests.js` usam um e-mail claramente de teste
  (`teste-automatizado-tests-js@example.invalid`) e removem essa conta ao
  final (sucesso ou falha) pra não deixar lixo misturado com contas reais.

## Como rodar localmente

Este projeto não precisa de build nem de `npm install`. Para testar localmente
sem abrir os arquivos diretamente como `file://` (o que bloqueia alguns
recursos do navegador), suba um servidor estático simples:

```bash
# Opção 1: com Node instalado
npx serve .

# Opção 2: com Python instalado
python -m http.server 8420

# Opção 3: com apenas PowerShell (sem dependências), incluído neste projeto
pwsh -File scripts/serve.ps1 -Port 8420
```

Depois acesse `http://localhost:8420/index.html`.

## Testes automatizados

Abra `tests/tests.html` no navegador (via um dos servidores acima — não abra
como `file://` direto pois módulos podem falhar dependendo do navegador). O
título da aba muda para "✔ OK" ou "✘ FALHOU" e a página lista cada asserção.

Os testes cobrem: normalização de NCM, correspondência hierárquica de código
(posição/subposição/capítulo), resolução de conflitos entre Anexos que se
"ressalvam" mutuamente, cálculo de alíquota estimada, busca textual, consulta
por tipo de operação e o tratamento correto do Anexo XIV revogado.

## Deploy (Vercel ou Netlify)

Por ser um site 100% estático, o deploy é direto — não há variáveis de
ambiente obrigatórias.

### Vercel

```bash
# Na raiz do projeto (cclasstrib-app/):
npx vercel --prod
```
Ou pelo painel da Vercel: "Add New Project" → importe a pasta/repositório →
Framework Preset: "Other" → Build Command: (vazio) → Output Directory: `.`
(raiz). Não é necessário configurar nenhuma variável de ambiente.

### Netlify

```bash
# Na raiz do projeto:
npx netlify deploy --prod
```
Ou pelo painel da Netlify: "Add new site" → "Deploy manually" (arraste a
pasta) ou conecte o repositório Git com Build Command vazio e Publish
directory `.`.

### Domínio próprio

Depois do primeiro deploy, tanto Vercel quanto Netlify permitem adicionar um
domínio customizado no painel do projeto (Settings → Domains), apontando o
DNS (CNAME ou registros A fornecidos pela plataforma) para o domínio desejado.

## Aviso legal

Este site é uma ferramenta de apoio construída a partir de fontes públicas.
**Não substitui** a consulta à Receita Federal, ao Comitê Gestor do IBS, à
SEFAZ do seu estado ou a um profissional de contabilidade/tributação. A
Reforma Tributária está em fase de regulamentação e pode sofrer alterações a
qualquer momento — sempre confirme a vigência das regras antes de tomar
decisões fiscais.
