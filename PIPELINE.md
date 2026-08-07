# Pipeline

1. `app.js` carrega `config.json` e conecta os controles.
2. `src/dxf.js` lê os pares de códigos DXF ou GeoJSON e valida entidades suportadas.
3. `src/geometry.js` identifica extensão, margem e extremidades.
4. `src/render.js` compõe a prancha de conferência em canvas, sem substituir dados inválidos por fallback.
5. `src/pdf.js` transforma a mesma prancha em um PDF local.
6. `tests/validate.mjs` valida o DXF de referência, as extremidades, o GeoJSON e o nome do arquivo.
7. Antes da publicação, executar testes, `node --check` nos módulos, `git diff --check`, smoke test em navegador e verificação do HTML/JS/CSS servidos.
