# Aviso de Desmonte

Gerador local de pranchas de área de influência para avisos de desmonte. O site recebe os dados do aviso, uma GeoTIFF georreferenciada, várias strings de desmonte em DXF e áreas em DXF/GeoJSON; depois calcula buffers contínuos ao longo das poligonais, classifica cada ponto de estrutura e baixa uma prancha em PDF.

## Uso

1. Abra o site publicado no GitHub Pages ou rode um servidor local na raiz (`python -m http.server 8000`).
2. Informe data, horário, empresa/operação e local.
3. Escolha um dos ortomosaicos do catálogo (Mina, Estoque ou Pilha de estéril) e clique em `Carregar`, ou use `Carregar todas no mapa` para exibir as quatro camadas georreferenciadas em conjunto. O botão `Substituir / atualizar ortomosaico` grava uma versão local no navegador, sem alterar o TIFF original; `Restaurar original` remove essa substituição.
4. Carregue uma imagem de fundo quando houver outro ortomosaico ou use a imagem de referência apenas para conferência visual.
5. Use `Importar poligonais do projeto` para carregar os DXF já catalogados ou adicione uma ou várias poligonais DXF e renomeie cada entrada.
6. Informe os raios para pessoas e máquinas. O sistema percorre cada segmento continuamente, une as áreas sobrepostas e exibe apenas o contorno final de cada raio.
7. O catálogo `data/structures.json` foi extraído da prancha PDF mais recente em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.pdf`. Ele contém os 54 pontos numerados e seus nomes; cada ponto é reclassificado automaticamente a cada alteração dos raios. Pontos dentro de qualquer raio ficam vermelhos (`EVACUAR`) e os demais ficam azuis (`LIBERADO`).
8. Use a GeoTIFF do projeto ou carregue outra GeoTIFF georreferenciada. Com o ajuste automático ativo, a prancha enquadra toda a extensão dos ortomosaicos georreferenciados; os limites X/Y manuais continuam disponíveis para conferência.
9. Em `Pontos operacionais`, escolha ponto de disparo, ponto de bloqueio ou entrega de cartões e clique no croqui para posicionar e nomear o símbolo.
10. Confira a prancha e clique em `Gerar aviso em PDF`.

Os dados e os arquivos ficam no navegador. Substituições de ortomosaicos persistem no IndexedDB desta máquina para permitir atualização entre sessões; o original publicado permanece intacto. O projeto não envia DXF, imagens ou informações operacionais para um servidor.

O fundo satelital automático usa o serviço World Imagery da Esri, com uma extensão calculada na mesma proporção do quadro cartográfico para cobrir todo o mapa. Não exige chave Google Maps nem configuração manual. Se a rede não responder, o aplicativo mantém a prancha funcionando com os GeoTIFFs locais já carregados.

As áreas sólidas são renderizadas em duas partes: a diferença em relação aos raios fica azul e somente a interseção geométrica com qualquer cerco recebe hachura vermelha. A legenda procura primeiro o canto inferior esquerdo e rejeita posições que cruzem sólidos, pontos operacionais, norte ou escala.

## Desenvolvimento

```powershell
python -m http.server 8000
node tests/validate.mjs
```

O arquivo `app.js` orquestra a interface. A leitura/validação de DXF e GeoJSON está em `src/dxf.js`, a leitura de GeoTIFF em `src/geotiff.js`, as regras geométricas em `src/geometry.js`, a composição da prancha em `src/render.js` e a exportação em `src/pdf.js`.

## Referência

`assets/referencia-base.jpg` é um recorte cartográfico otimizado do aviso fornecido em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.jpg`. O botão de referência não preenche dados operacionais nem altera camadas.
