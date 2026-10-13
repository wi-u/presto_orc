# Orçamento PRESTO

App web (funciona offline) para montar orçamentos PRESTO com a política comercial de cada região.
Os preços vêm da planilha de preços brutos; os descontos vêm da política (`data/politica.json`).
O pedido em si continua sendo lançado no FULLSOFT.

## Como o app abre
1. `index.html` — a pessoa escolhe o **estado (UF)**. A escolha fica salva no aparelho.
2. `app/?uf=SP` — o orçamento, já configurado para a região. **Esse endereço pode ser salvo nos favoritos.**
   Nas próximas visitas, abrir o endereço raiz já leva direto para o último estado (o botão com a sigla do estado, no topo, volta para a escolha).
3. Marca opcional no PDF: `app/?uf=SP&rep=vidal` (ver *Representantes*, abaixo).

## Publicar no GitHub Pages
1. Crie um repositório e suba **todos** os arquivos desta pasta (inclusive `.github` e `.nojekyll`).
2. No GitHub: *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. O endereço será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. Abra uma vez com internet: a partir daí o app funciona offline.

## Atualizar a tabela de preços
1. Em `dados/`, **apague a planilha antiga e suba a nova** (`.xlsx`, mesmo formato; só pode haver uma). O nome pode ser como `P_Lista_Preco_NOV26_bruto.xlsx` — o trecho `NOV26` vira o nome da tabela mostrado no PDF.
2. Pelo site do GitHub: *Add file → Upload files → Commit*.
3. Um robô (aba **Actions**) converte a planilha, confere os dados, roda os testes e publica `data/precos.json`.
   - ✅ verde = preços novos no ar (em alguns minutos). Veja o que mudou em `data/ultimo_relatorio.txt`.
   - ❌ vermelho = a planilha tem um problema (preço inválido, código repetido com dados diferentes…). **Nada é publicado**; abra o log para ver a linha com erro.

Para conferir antes de subir (no seu computador): `python scripts/importar.py` e `npm test`.

### Itens com desconto de linha (caixas de ferramentas de metal)
Estão em `data/ajustes_itens.csv` (colunas `cod,linha`). Para incluir um novo item, adicione uma linha, por exemplo `91807,caixa_ferramentas`. Não precisa mexer na planilha.

## Mudou a política comercial?
Edite `data/politica.json` (percentuais por região, desconto de pagamento, atacado, gerencial, linhas) e rode `npm test`. Os testes em `tests/calc.test.js` guardam as regras de cálculo.

Ordem do cálculo (multiplicativo): preço bruto → base da política (revenda / uso e consumo; consumo de importado tem base própria) → adicional de importados (só revenda) → desconto de linha → atacado → pagamento → gerencial.

## Representantes (marca no PDF)
`data/representantes.json`: `"id": {"nome": "...", "logo": "assets/reps/arquivo.jpg"}`. Quem usar `&rep=id` no endereço sai com a marca no PDF.

## Estrutura
```
index.html              escolha de região
app/index.html          o orçamento
assets/calc.js          motor de cálculo (testado)
assets/app.js, app.css  interface
data/precos.json        GERADO a partir da planilha (não editar à mão)
data/politica.json      regras por região
data/ajustes_itens.csv  itens com desconto de linha
data/codigos_antigos.json  busca por código antigo
dados/*.xlsx            planilha de preços brutos
scripts/importar.py     planilha -> precos.json (com validação)
sw.js, manifest         offline e instalação no celular
```
