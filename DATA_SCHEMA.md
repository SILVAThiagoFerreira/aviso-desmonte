# Modelo de dados

```text
ReportModel {
  meta: { company, date: YYYY-MM-DD, time: HH:mm, location, observation },
  baseImage: { image, name, bounds: { minX, minY, maxX, maxY } | null } | null,
  logoImage: Image | null,
  strings: [{ id, name, label, sourceType, entities[], unsupported[] }],
  areas: [{ id, name, label, status: "evacuar" | "liberado", entities[], sourceType }],
  radii: { people: number, machine: number },
  radiusContours: [{ radius, polygons[] }],
  boundsMode: "auto" | "manual",
  manualBounds: { minX, minY, maxX, maxY } | null
}
```

Cada entidade geométrica usa `{ type, points: [{ x, y }], closed, layer }`. Círculos também possuem `radius`.

As strings podem ser carregadas em quantidade ilimitada, cada uma com nome editável. O raio é calculado como buffer planar contínuo em toda a geometria linear; as geometrias resultantes são unidas por raio e somente seus contornos são renderizados. O status da área é calculado automaticamente: `evacuar` quando a área intercepta um contorno e `liberado` quando fica fora.
