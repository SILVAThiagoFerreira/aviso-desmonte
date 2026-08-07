function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export async function decodeGeoTiff(source) {
  if (!globalThis.GeoTIFF) throw new Error('O leitor de GeoTIFF não carregou. Recarregue a página e tente novamente.');
  const blob = source instanceof Blob ? source : await fetch(source).then((response) => {
    if (!response.ok) throw new Error('A GeoTIFF do projeto não está disponível.');
    return response.blob();
  });
  const tiff = await globalThis.GeoTIFF.fromBlob(blob);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const raster = await image.readRasters({ interleave: false });
  const samples = raster.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  const pixels = context.createImageData(width, height);
  const red = raster[0];
  const green = raster[Math.min(1, samples - 1)];
  const blue = raster[Math.min(2, samples - 1)];
  const alpha = raster[3];
  for (let index = 0; index < width * height; index += 1) {
    pixels.data[index * 4] = clampByte(red[index]);
    pixels.data[index * 4 + 1] = clampByte(green[index]);
    pixels.data[index * 4 + 2] = clampByte(blue[index]);
    pixels.data[index * 4 + 3] = alpha ? clampByte(alpha[index]) : 255;
  }
  context.putImageData(pixels, 0, 0);
  const bbox = image.getBoundingBox();
  return {
    image: canvas,
    bounds: { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] },
    width,
    height,
    name: source instanceof File ? source.name : decodeURIComponent(String(source).split('/').pop() || 'ortomosaico.tif')
  };
}
