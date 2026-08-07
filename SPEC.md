# Especificação

## Entrada

- Metadados: empresa/operação, data, horário, local e observação de rodapé.
- Uma string DXF contendo entidades lineares suportadas.
- Raios numéricos em metros para pessoas e máquinas; valor vazio significa que o raio não será desenhado.
- Zero ou mais arquivos DXF/GeoJSON de área, cada um classificado como `evacuar` ou `liberado`.
- Imagem de fundo opcional e, quando necessário, limites X/Y manuais.

## Regras

- O DXF é validado antes do desenho. Arquivo vazio, entidade sem coordenadas ou extensão inválida gera erro visível.
- As extremidades são o primeiro e o último vértice de cada string linear; pontos duplicados são removidos.
- Um raio informado é desenhado em cada extremidade, em metros, usando a escala da extensão do mapa.
- Áreas `evacuar` usam contorno/preenchimento hachurado vermelho. Áreas `liberado` usam contorno/preenchimento hachurado azul.
- A extensão automática usa todas as geometrias e uma margem de 8%. A extensão manual é obrigatória para sobreposição espacial confiável com um ortomosaico georreferenciado.
- O PDF é uma única prancha horizontal na proporção do exemplo fornecido, com mapa, legenda, norte, escala, título e listas laterais.

## Não faz

- Não infere sistema de coordenadas, datum, posicionamento do ortomosaico ou nomes de áreas a partir de dados ausentes.
- Não altera arquivos enviados pelo usuário.
- Não envia dados para API externa.
