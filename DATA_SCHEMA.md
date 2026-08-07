# Modelo de dados

```text
ReportModel {
  meta: { company, date: YYYY-MM-DD, time: HH:mm, location, observation },
  baseImage: Image | null,
  string: { name, sourceType, entities[], unsupported[] } | null,
  areas: [{ id, name, label, status: "evacuar" | "liberado", entities[], sourceType }],
  radii: { people: number, machine: number },
  boundsMode: "auto" | "manual",
  manualBounds: { minX, minY, maxX, maxY } | null
}
```

Cada entidade geométrica usa `{ type, points: [{ x, y }], closed, layer }`. Círculos também possuem `radius`.

No relatório, a lista lateral exibe apenas os arquivos de área carregados e seus rótulos editáveis. O nome sugerido vem do nome do arquivo; o status inicial é `liberado` quando o nome contém “liberad” e `evacuar` nos demais casos, sempre podendo ser corrigido pelo usuário.
