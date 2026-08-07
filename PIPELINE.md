# Pipeline

1. `app.js` carrega `config.json` e conecta os controles.
2. `src/dxf.js` lê os pares de códigos DXF ou GeoJSON e valida entidades suportadas.
3. `src/geotiff.js` decodifica GeoTIFF RGBA e extrai o bounding box geográfico para posicionamento espacial.
4. `src/geometry.js` identifica extensão, coleta todas as strings, cria buffers planares contínuos, une as sobreposições e testa a interseção das áreas.
5. `src/render.js` compõe a prancha de conferência em canvas, sem substituir dados inválidos por fallback.
5. `src/pdf.js` transforma a mesma prancha em um PDF local.
7. `tests/validate.mjs` valida o DXF de referência, a união dos raios, as extremidades, o GeoJSON, a interseção e o nome do arquivo.
7. Antes da publicação, executar testes, `node --check` nos módulos, `git diff --check`, smoke test em navegador e verificação do HTML/JS/CSS servidos.
