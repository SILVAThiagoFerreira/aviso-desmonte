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
- Strings são preenchidas com a cor do seu tipo e `report.stringFillOpacity` (0,6, ou seja 40% de transparência) quando têm três ou mais vértices, fechadas ou não; o traço segue a forma original.
- Uma string de Pré-Corte ou Regularização que se sobrepõe a uma poligonal de Produção (mesma geometria, cruzamento de segmentos ou vértice dentro do preenchimento) recebe preenchimento vermelho de Produção, na opacidade configurada, e contorno sólido na sua cor (verde ou amarelo) desenhado por cima. Strings sem sobreposição são desenhadas como antes. Pré-Corte e Regularização sobrepostas, sem Produção, mantêm as próprias cores. A legenda e o painel continuam listando cada string.
- O raio é calculado sobre as geometrias sem duplicatas idênticas: a mesma string adicionada duas vezes produz o mesmo cerco de uma cópia.
- Um raio informado é desenhado em cada extremidade, em metros, usando a escala da extensão do mapa.
- Áreas `evacuar` usam contorno/preenchimento hachurado vermelho. Áreas `liberado` usam contorno/preenchimento hachurado azul.
- A extensão automática usa todas as geometrias e uma margem de 8%. A extensão manual é obrigatória para sobreposição espacial confiável com um ortomosaico georreferenciado.
- O PDF é uma única prancha horizontal na proporção do exemplo fornecido, com mapa, legenda, norte, escala, título e listas laterais.
- A seta do norte mantém uma margem visual confortável em relação à moldura do mapa, com posicionamento configurado em `report.northArrow`.
- A legenda procura posições livres para não cobrir áreas hachuradas de evacuação ou liberação. Se necessário, reduz fonte e espaçamento para caber sem ampliar a caixa. Rótulos longos de raios são ajustados pela fonte.
- Um raio marcado como reduzido (caixa `Raio reduzido` ao lado de `Importar DXF`) recebe na legenda o rótulo `… · RAIO DE SEGURANÇA REDUZIDO · …` em negrito e na cor `report.colors.reducedHighlight`, sem fundo; a amostra de cor e o restante da legenda não mudam.
- Um ponto de disparo que cai sobre uma estrutura identificada inclui a estrutura na linha da legenda. A pilha de oxidado usa o rótulo `PDO`; a pilha de estéril usa `PDE`. O rótulo é calculado da geometria e não altera os pontos salvos.
- Cada ponto de bloqueio recebe, ao ser inserido, uma cor de `report.blockingPointColors` escolhida entre as que se destacam da área que o ícone cobre no croqui: ΔE CIELAB de pelo menos `report.blockingPointContrast.minimumDeltaE` em pelo menos `requiredShare` das amostras dessa área. Entre as adequadas, prefere cores que ainda não estejam em uso por outro ponto de bloqueio. Se nenhuma se destaca, usa a de maior contraste e avisa o usuário. A cor é revalidada ao inserir o ponto, ao mover um ponto (arrastando ou pelo botão Mover) e ao importar um projeto; a cor atual é mantida enquanto continuar adequada e não repetir a de outro ponto quando houver alternativa livre. A cor fica salva no ponto. O cavalete é desenhado em vetor na cor do ponto, com listras brancas diagonais, contorno fino de `report.blockingIcon.outline`, halo branco de `report.blockingIcon.halo` e a geometria de `report.blockingIcon`, que é validada antes do desenho. Uma sombra discreta (`report.blockingIcon.shadow`: cor, desfoque e deslocamento) sai da silhueta externa do cavalete, no croqui e na legenda, para destacá-lo do satélite sem alterar a cor escolhida. A paleta padrão tem cores com distância perceptual (CIELAB ΔE76) de pelo menos 40 entre si e de 30 em relação às cores fixas do croqui; o teste de validação garante isso.
- A legenda mostra sempre as entradas de símbolos `PONTO DE DISPARO (PDE)`, `PONTOS DE BLOQUEIO` e `ENTREGA DE CARTÕES DE BLOQUEIO`, com seus ícones, mesmo sem pontos inseridos (o rótulo `PONTO DE DISPARO (PDE)` vem de `report.legend.firingPointDefaultLabel` e é usado também quando o ponto de disparo não cai sobre estrutura identificada). Os rótulos vêm de `report.legend.blockingPointDefaultLabel` e `cardPointLabel`. Com pontos de disparo, o rótulo deriva da estrutura; com pontos de bloqueio, a entrada genérica é substituída pelas linhas numeradas.
- A prancha mantém a moldura externa fina, a moldura do painel lateral, as caixas vermelha (EVACUAR) e azul (LIBERADO) sob os cabeçalhos, a moldura da legenda e as caixas do rodapé. A grade tracejada do mapa não faz parte da prancha.
- O rodapé esquerdo mostra `report.footer.locationLabel` seguido do local informado no campo de ponto de entrega dos cartões. Sem local, mostra `report.footer.missingLocationText`.
- A legenda lista cada ponto de bloqueio em uma linha própria, com o ícone na cor do ponto e o rótulo `report.legend.blockingPointLabel` (`Ponto de Bloqueio #1`, `#2`…), numerado pela ordem de inserção.
- Na importação de um projeto, pontos de bloqueio sem cor recebem cor e todos os pontos são revalidados contra o fundo atual; o usuário é avisado das trocas e dos pontos que continuam com pouco contraste. Uma cor com formato inválido interrompe a importação antes de qualquer alteração na tela.
- A importação do projeto informa visualmente as etapas de leitura, validação, aplicação e atualização da prancha, inclusive em caso de erro.

## Não faz

- Não infere sistema de coordenadas, datum, posicionamento do ortomosaico ou nomes de áreas a partir de dados ausentes.
- Não altera arquivos enviados pelo usuário.
- Não envia dados para API externa.
