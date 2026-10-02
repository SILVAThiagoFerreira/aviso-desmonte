# Pipeline

1. `app.js` carrega `config.json` e conecta os controles.
2. `src/dxf.js` lê os pares de códigos DXF ou GeoJSON e valida entidades suportadas.
3. `src/geotiff.js` decodifica GeoTIFF RGBA e extrai o bounding box geográfico para posicionamento espacial.
4. `src/geometry.js` identifica extensão, coleta todas as strings, cria buffers planares contínuos, une as sobreposições e testa a interseção das áreas.
5. `src/render.js` compõe a prancha de conferência em canvas, sem substituir dados inválidos por fallback.
   - O deslocamento da seta do norte é lido de `report.northArrow` para preservar a margem da moldura.
   - A legenda deriva o rótulo PDO/PDE pela estrutura sob o ponto de disparo, ajusta a fonte dos raios e tenta posições livres antes de compactar a caixa.
   - A importação de um arquivo de projeto atualiza o indicador de progresso entre a leitura, a validação, a aplicação dos dados e o redesenho.
5. `src/pdf.js` transforma a mesma prancha em um PDF local.
7. `tests/validate.mjs` valida o DXF de referência, a união dos raios, as extremidades, o GeoJSON, a interseção e o nome do arquivo.
7. Antes da publicação, executar testes, `node --check` nos módulos, `git diff --check`, smoke test em navegador e verificação do HTML/JS/CSS servidos.
