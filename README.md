# Aviso de Desmonte

Gerador de pranchas de área de influência para avisos de desmonte. O site recebe os dados do aviso, uma GeoTIFF georreferenciada, várias strings de desmonte em DXF e áreas em DXF/GeoJSON; depois calcula buffers contínuos ao longo das poligonais, classifica cada ponto de estrutura e baixa uma prancha em PDF. O catálogo de estruturas é lido do catálogo online e as publicações administrativas ficam disponíveis para todos os usuários; o catálogo embutido no Pages permanece como fallback quando o serviço online não responde.

## Uso

1. Abra o site publicado no GitHub Pages ou rode um servidor local na raiz (`python -m http.server 8000`).
2. Informe data, horário, empresa/operação e local.
3. Escolha um dos ortomosaicos do catálogo (Mina, PDE ou Eetoques) e clique em `Carregar`, ou use `Carregar todas no mapa` para exibir as quatro camadas georreferenciadas em conjunto. O botão `Substituir / atualizar ortomosaico` grava uma versão local no navegador, sem alterar o TIFF original; `Restaurar original` remove essa substituição.
4. Carregue uma imagem de fundo quando houver outro ortomosaico ou use a imagem de referência apenas para conferência visual.
5. Use `Importar poligonais do projeto` para carregar os DXF já catalogados ou adicione uma ou várias poligonais DXF e renomeie cada entrada.
6. Confirme os raios para pessoas e máquinas (o preset inicial é 500 m para pessoas e 300 m para máquinas e equipamentos, definido em `defaultPreset` no `config.json`). As regiões de desmonte são preenchidas com a cor do próprio contorno e opacidade `report.stringFillOpacity` (0,6 por padrão, ou seja 40% de transparência), tanto no croqui quanto nos ícones da legenda; polilinhas com três ou mais vértices recebem preenchimento mesmo sem fechamento formal. Strings com a mesma geometria e tipos diferentes dividem o preenchimento em faixas iguais e alternam as cores do contorno tracejado, de modo que a mesma linha mostre todas as classificações; os círculos de raio usam o traço e o halo de `report.radiusStroke`. O sistema percorre cada segmento continuamente, une as áreas sobrepostas e exibe apenas o contorno final de cada raio.
7. O catálogo `data/structures.json` foi extraído da prancha PDF mais recente em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.pdf`. Ele contém os 54 pontos numerados e seus nomes; cada ponto é reclassificado automaticamente a cada alteração dos raios. Pontos dentro de qualquer raio ficam vermelhos (`EVACUAR`) e os demais ficam azuis (`LIBERADO`).
8. Use a GeoTIFF do projeto ou carregue outra GeoTIFF georreferenciada. Com o ajuste automático ativo, a prancha enquadra toda a extensão dos ortomosaicos georreferenciados; os limites X/Y manuais continuam disponíveis para conferência.
9. Em `Pontos operacionais`, escolha ponto de disparo, ponto de bloqueio ou entrega de cartões e clique no croqui para posicionar e nomear o símbolo. Depois, arraste qualquer símbolo já inserido ou use `Mover` na sua linha para reposicioná-lo sem excluir o registro. Cada ponto de bloqueio recebe uma cor da paleta `report.blockingPointColors` do `config.json`, escolhida entre as que se destacam da área que o ícone cobre no croqui (`report.blockingPointContrast`), preferindo cores que ainda não estejam em uso. O cavalete leva um halo branco e um contorno fino para continuar legível sobre o satélite. O cavalete ganha uma sombra discreta configurada em `report.blockingIcon.shadow` (cor, desfoque e deslocamento), que o destaca do satélite no croqui e na legenda. O cavalete é desenhado em vetor na cor do ponto, com a geometria de `report.blockingIcon`, e aparece na legenda como `Ponto de Bloqueio #1`, `#2` e assim por diante, na ordem de inserção. Projetos salvos antes dessa mudança recebem cores ao serem importados.
10. Em `Strings de desmonte`, use `Desenhar string no croqui`, informe nome/tipo e clique para adicionar os vértices; finalize com duplo clique no último ponto ou `Concluir string`.
11. Confira a prancha e clique em `Gerar aviso em PDF`.

Os dados e os arquivos ficam no navegador. Substituições de ortomosaicos persistem no IndexedDB desta máquina para permitir atualização entre sessões; o original publicado permanece intacto. O projeto não envia DXF, imagens ou informações operacionais para um servidor.

O fundo satelital automático usa o serviço World Imagery da Esri, com uma extensão calculada na mesma proporção do quadro cartográfico para cobrir todo o mapa. Não exige chave Google Maps nem configuração manual. Se a rede não responder, o aplicativo mantém a prancha funcionando com os GeoTIFFs locais já carregados.

As áreas sólidas são renderizadas em duas partes: a diferença em relação aos raios fica azul e somente a interseção geométrica com qualquer cerco recebe hachura vermelha. A legenda percorre posições do mapa para evitar as áreas hachuradas e reduz o conjunto quando precisa caber em uma região livre. Os nomes longos dos raios diminuem a fonte para caber na largura disponível. Quando um ponto de disparo fica sobre a pilha de oxidado ou a pilha de estéril, a legenda identifica o ponto como `PONTO DE DISPARO (PDO)` ou `PONTO DE DISPARO (PDE)`, respectivamente. A importação de um projeto mostra o avanço da leitura, validação, aplicação dos dados e atualização da prancha.

A prancha tem moldura externa, moldura do painel lateral, caixas vermelha e azul sob EVACUAR e LIBERADO, e moldura na legenda e no rodapé. A legenda mostra as entradas PDE, pontos de bloqueio e entrega de cartões mesmo sem pontos inseridos. Os textos dessas entradas e o rótulo do rodapé (`Ponto de Entrega dos Cartões:`) ficam em `report.legend` e `report.footer` no `config.json`.

A seta do norte mantém um recuo superior mais amplo em relação à moldura do mapa; os deslocamentos ficam em `report.northArrow` no `config.json`.

## Desenvolvimento

```powershell
python -m http.server 8000
node tests/validate.mjs
```

O arquivo `app.js` orquestra a interface. A leitura/validação de DXF e GeoJSON está em `src/dxf.js`, a leitura de GeoTIFF em `src/geotiff.js`, as regras geométricas em `src/geometry.js`, a composição da prancha em `src/render.js` e a exportação em `src/pdf.js`.

## Referência

`assets/referencia-base.jpg` é um recorte cartográfico otimizado do aviso fornecido em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.jpg`. O botão de referência não preenche dados operacionais nem altera camadas.
