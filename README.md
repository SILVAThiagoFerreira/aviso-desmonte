# Aviso de Desmonte

Gerador local de pranchas de área de influência para avisos de desmonte. O site recebe os dados do aviso, uma imagem cartográfica, a string de desmonte em DXF e áreas em DXF/GeoJSON; depois calcula os círculos de segurança nas extremidades da string e baixa uma prancha em PDF.

## Uso

1. Abra o site publicado no GitHub Pages ou rode um servidor local na raiz (`python -m http.server 8000`).
2. Informe data, horário, empresa/operação e local.
3. Carregue uma imagem de fundo quando houver ortomosaico ou use a imagem de referência apenas para conferência visual.
4. Carregue a poligonal DXF da string de desmonte.
5. Informe os raios para pessoas e máquinas. Cada círculo é centralizado nas extremidades identificadas pela regra documentada em `DATA_SCHEMA.md`.
6. Carregue as áreas e marque cada arquivo como `Evacuar` ou `Liberado`.
7. Use extensão automática para uma conferência rápida ou informe os limites X/Y quando a imagem de fundo estiver georreferenciada.
8. Confira a prancha e clique em `Gerar aviso em PDF`.

Os dados e os arquivos ficam no navegador durante a sessão. O projeto não envia DXF, imagens ou informações operacionais para um servidor.

## Desenvolvimento

```powershell
python -m http.server 8000
node tests/validate.mjs
```

O arquivo `app.js` orquestra a interface. A leitura/validação de DXF e GeoJSON está em `src/dxf.js`, as regras geométricas em `src/geometry.js`, a composição da prancha em `src/render.js` e a exportação em `src/pdf.js`.

## Referência

`assets/referencia-base.jpg` é um recorte cartográfico otimizado do aviso fornecido em `PDF/2026/08. Agosto/20260804 - Aviso de Detonação.jpg`. O botão de referência não preenche dados operacionais nem altera camadas.
