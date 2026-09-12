// Comprime no próprio aparelho antes de subir: menos dado móvel gasto pelo aluno
// e a foto cabe no documento do Firestore (limite de 1 MB), sem precisar de Storage.
export async function comprimirImagem(
  arquivo: File,
  maiorLado = 900,
  qualidade = 0.7,
): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, maiorLado / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", qualidade);
}
