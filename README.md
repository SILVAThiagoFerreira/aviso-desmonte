# Aviso de Desmonte

Gerador local de pranchas de área de influência para avisos de desmonte. O site recebe os dados do aviso, uma GeoTIFF georreferenciada, várias strings de desmonte em DXF e áreas em DXF/GeoJSON; depois calcula buffers contínuos ao longo das poligonais, une as sobreposições e baixa uma prancha em PDF.

## Uso

1. Abra o site publicado no GitHub Pages ou rode um servidor local na raiz (`python -m http.server 8000`).
2. Informe data, horário, empresa/operação e local.
3. Carregue uma imagem de fundo quando houver ortomosaico ou use a imagem de referência apenas para conferência visual.
4. Carregue uma ou várias poligonais DXF de desmonte e renomeie cada entrada.
5. Informe os raios para pessoas e máquinas. O sistema percorre cada segmento continuamente, une as áreas sobrepostas e exibe apenas o contorno final de cada raio.
6. Carregue as áreas e renomeie cada arquivo. A cor é automática: vermelho quando um raio intercepta a poligonal e azul quando fica fora.
7. Use a GeoTIFF do projeto ou carregue outra GeoTIFF georreferenciada. A extensão e a sobreposição usam os limites espaciais do TIFF; os limites X/Y manuais continuam disponíveis para conferência.
8. Confira a prancha e clique em `Gerar aviso em PDF`.

Os dados e os arquivos ficam no navegador durante a sessão. O projeto não envia DXF, imagens ou informações operacionais para um servidor.

## Desenvolvimento

```powershell
python -m http.server 8000
node tests/validate.mjs
```

O arquivo `app.js` orquestra a interface. A leitura/validação de DXF e GeoJSON está em `src/dxf.js`, a leitura de GeoTIFF em `src/geotiff.js`, as regras geométricas em `src/geometry.js`, a composição da prancha em `src/render.js` e a exportação em `src/pdf.js`.

## Referência

`assets/referencia-base.jpg` é um recorte cartográfico otimizado do aviso fornecido em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.jpg`. O botão de referência não preenche dados operacionais nem altera camadas.
