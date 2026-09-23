// Validação de arquivos enviados para uma campanha (imagem ou vídeo),
// de acordo com os formatos que o ponto aceita.

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB já decodificado (base64 -> binário)

function validarArquivo({ tipoMime, tamanhoBytes, formatosAceitos }) {
  const erros = [];
  const ehImagem = typeof tipoMime === "string" && tipoMime.startsWith("image/");
  const ehVideo = tipoMime === "video/mp4";
  const aceitaPNG = formatosAceitos.includes("PNG");
  const aceitaMP4 = formatosAceitos.includes("MP4");

  if (!ehImagem && !ehVideo) {
    erros.push("Formato de arquivo não reconhecido. Envie uma imagem ou um vídeo MP4.");
  } else if (!((ehImagem && aceitaPNG) || (ehVideo && aceitaMP4))) {
    erros.push(`Este ponto aceita apenas ${formatosAceitos.join(" e ")}.`);
  }
  if (tamanhoBytes > MAX_BYTES) {
    erros.push("Arquivo maior que 20 MB. Comprima antes de enviar.");
  }
  return { valido: erros.length === 0, erros };
}

/** Extrai {tipoMime, bytesBuffer} de uma data URL ("data:image/png;base64,AAAA..."). */
function decodificarDataURL(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  const tipoMime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { tipoMime, buffer };
}

module.exports = { validarArquivo, decodificarDataURL, MAX_BYTES };
