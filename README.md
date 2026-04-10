# i2Horti Nuvem

Painel web para visualizacao de dados da nuvem, previsoes meteorologicas, canteiros, culturas e decisoes de irrigacao publicadas na AWS.

O sistema foi construido como uma aplicacao frontend estatica, sem backend local, consumindo arquivos JSON publicados em buckets S3. A interface permite selecionar uma propriedade, acompanhar os topicos monitorados em tempo real e consultar o historico de irrigacoes RBS e RL.

## Objetivo

Este projeto centraliza a visualizacao de informacoes operacionais de irrigacao inteligente para unidades agricolas conectadas a nuvem. A proposta e oferecer uma tela unica para:

- acompanhar previsoes diarias e horarias
- visualizar canteiros cadastrados
- consultar culturas e fases de cultivo
- inspecionar decisoes de irrigacao baseadas em regras (`RBS`)
- inspecionar decisoes de irrigacao baseadas em aprendizado/reforco (`RL`)
- filtrar dados por data, horario e plantio
- exportar o historico filtrado

## Como o sistema funciona

O frontend carrega arquivos JSON diretamente da AWS em tempo de execucao. Nao existe API local, banco local ou processo de backend neste repositório.

Fluxo resumido:

1. O usuario acessa a landing page.
2. Escolhe uma propriedade ativa.
3. O sistema monta os cards dinamicamente no navegador.
4. Cada card consulta um JSON remoto no S3.
5. O painel interpreta os dados e renderiza uma visualizacao amigavel.
6. A aba de historico consulta arquivos acumulados por data para montar tabelas e graficos.

## Propriedades suportadas

Atualmente a interface possui duas propriedades ativas:

- `Dois Vizinhos` UC_ID: 4000
- `Miringuava - Luciane` UC_ID: 3003

## Tecnologias utilizadas

- `HTML5`
- `CSS3`
- `JavaScript` puro
- `Chart.js` para graficos
- `AWS S3` como origem dos arquivos JSON

## Estrutura do projeto

```text
i2Horti-Nuvem-main/
|- index.html
|- style.css
|- script.js
|- README.md
`- imagens/
   |- logo_cor.png
   `- .gitkeep
```

### Arquivos principais

#### `index.html`

Responsavel pela estrutura da pagina:

- landing page de selecao de propriedades
- cabecalho do dashboard
- area de cards monitorados
- secao de historico
- containers usados pela renderizacao dinamica

#### `style.css`

Define toda a identidade visual do sistema:

- layout da landing
- cards
- graficos
- tabelas
- responsividade
- botoes e filtros

#### `script.js`

Concentra toda a logica de negocio do frontend:

- definicao dos topicos monitorados
- mapeamento de propriedades
- filtros por data e horario
- carga dos JSONs remotos
- montagem dos cards
- filtragem por `UC_id`
- historico de irrigacoes
- exportacao CSV
- autoatualizacao

## Topicos monitorados

Os topicos configurados no sistema sao definidos em `TOPICS` 

Topicos atualmente usados:

- `previsao/simepar`
- `plugfield/forecast/daily`
- `plugfield/forecast/hourly`
- `canteiros/get`
- `cultures/get`
- `irrigationRBS/schedule`
- `irrigationRL/schedule`

## Fontes de dados na AWS

O sistema le os JSONs a partir de URLs publicas no S3.

### Dashboard atual

Exemplos de arquivos usados para a visao principal:

- `dashboard/previsao_simepar.json`
- `dashboard/plugfield_forecast_daily.json`
- `dashboard/plugfield_forecast_hourly.json`
- `dashboard/canteiros_get.json`
- `dashboard/cultures_get.json`
- `dashboard/irrigationRBS_schedule.json`
- `dashboard/irrigationRL_schedule.json`

### Historico

Para consultas historicas, o sistema tenta carregar arquivos por data.

Padrao usado para irrigacao:

- `Irrigacoes_Decisoes/irrigationRBS_schedule/acumulado/YYYYMMDD.json`
- `Irrigacoes_Decisoes/irrigationRL_schedule/acumulado/YYYYMMDD.json`

Padrao usado para outros topicos historicos:

- `dashboard/history/<topico>/<ano>/<mes>/<dia>/YYYYMMDD.json`

## Modos e areas da interface

### 1. Landing page

Tela inicial com selecao de propriedades.

Cada card informa:

- nome da propriedade
- status
- contexto resumido
- botao `Abrir dashboard`

### 2. Dashboard

Area principal de acompanhamento em tempo real.

Recursos:

- cards de topicos monitorados
- ultimas decisoes RBS e RL
- filtro global por data e horario
- atualizacao manual
- atualizacao automatica a cada 60 segundos

### 3. Historico e analises

Area voltada a consulta historica das irrigacoes.

Recursos:

- carregamento acumulado de dados por dia
- filtros por intervalo de datas
- filtros por horario
- filtro por metodo (`RBS`, `RL` ou ambos)
- selecao por plantio
- tabela de registros
- grafico comparativo
- exportacao para CSV

## Filtros do sistema

### Filtro global do dashboard

Aplica uma data e, opcionalmente, um horario aos cards do dashboard.

Uso esperado:

- ver um dia especifico
- recuperar um registro historico de previsao
- comparar a visao atual com um ponto do passado

### Filtro por plantio

Os plantios sao extraidos dinamicamente de `cultures/get`.

Cada plantio e montado a partir de:

- data de plantio
- data prevista de colheita
- cultura
- canteiros associados

Ao selecionar um plantio, a area de historico restringe os registros ao intervalo daquele cultivo.

### Filtros do historico

Disponiveis na aba de historico:

- data inicial
- data final
- horario inicial
- horario final
- metodo de irrigacao

## Decisoes de irrigacao

### RBS

`RBS` representa a logica baseada em regras.

O painel apresenta, quando disponivel:

- horario programado
- volume de irrigacao
- canteiro
- informacoes de balanco hidrico
- chuva real e prevista
- parametros de cultura e fase
- justificativa textual da decisao

### RL

`RL` representa a estrategia baseada em aprendizado/reforco.

O painel apresenta, quando disponivel:

- horario programado
- volume de irrigacao
- canteiro
- distribuicao da dose
- status da irrigacao
- motivacao da decisao
- parametros meteorologicos e operacionais

## Historico, grafico e exportacao

O sistema carrega o historico completo a partir de uma data inicial definida no codigo e agrega os registros no navegador.

Funcionalidades:

- tabela filtrada de eventos
- grafico diario com `Chuva`, `RBS` e `RL`
- resumo de totais
- exportacao do resultado filtrado para `CSV`

O nome do arquivo exportado varia conforme o filtro e o plantio selecionado.

## Como executar localmente

Como o projeto e estatico, basta abrir com um servidor HTTP simples.

### Opcao com Python

```powershell
cd "C:\Users\gabri\OneDrive\Documentos\UTFPR\WebNuvem\i2Horti-Nuvem-main\i2Horti-Nuvem-main"
python -m http.server 8000
```

Depois abra:

`http://localhost:8000`

### Alternativa no Windows

Se `python` nao estiver disponivel:

```powershell
py -m http.server 8000
```

## Fluxo de desenvolvimento

### Rodar localmente

1. Inicie um servidor HTTP.
2. Abra o navegador em `http://localhost:8000`.
3. Selecione a propriedade desejada.
4. Valide carregamento dos cards e do historico.

### Atualizar o codigo

Arquivos mais frequentes de manutencao:

- `index.html` para estrutura
- `style.css` para visual
- `script.js` para logica

### Publicar no Git

Exemplo de fluxo basico:

```powershell
git status
git add .
git commit -m "Atualiza painel i2Horti"
git push
```

## Configuracao de propriedades

As propriedades sao definidas em `FARM_CONFIG` no `script.js`.

Cada entrada pode conter:

- `label`
- `location`
- `unitLabel`
- `ucId`
- `strictUcId`

### Exemplo conceitual

```js
{
  label: "Miringuava - Luciane",
  location: "Miringuava",
  unitLabel: "Luciane",
  ucId: "3003",
  strictUcId: "3003"
}
```

`strictUcId` e o campo que faz o frontend esconder dados de outras unidades quando a propriedade exige isolamento.

## Configuracao de topicos

Cada topico e descrito com:

- `topic`
- `label`
- `url`
- `type`

Isso permite que o frontend:

- carregue o JSON
- identifique o tipo de renderizacao
- decida se ha historico
- mostre fallback adequado em caso de falta de dados

## Comportamentos importantes

### Auto refresh

Quando ativado, o sistema atualiza os dados a cada 60 segundos.

### Fallback de ultima decisao

Para algumas falhas em irrigacao, o sistema tenta usar dados salvos em `localStorage` para manter a ultima decisao visivel.

### Recarregamento ao trocar propriedade

Ao mudar de propriedade:

- o contexto visual e atualizado
- filtros locais podem ser resetados
- dados do dashboard sao recarregados
- historico e reprocessado conforme a unidade selecionada

## Solucao de problemas

### O dashboard nao carrega nada

Verifique:

- se a internet esta funcionando
- se as URLs do S3 estao acessiveis
- se o navegador nao esta bloqueando requests
- se existe JSON publicado para o topico esperado

### O historico aparece vazio

Possiveis causas:

- nao ha arquivo acumulado para a data consultada
- os filtros estao restritivos demais
- a propriedade atual exige `UC_id` especifico e os arquivos nao possuem registros dessa unidade

