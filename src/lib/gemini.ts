import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";

// Se o modelo principal estiver congestionado no meio de uma aula, cair para o
// seguinte vale mais do que devolver erro para a turma inteira.
const MODELOS = [
  ...new Set([
    process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ]),
];

const SOBRECARGA = [429, 500, 502, 503, 504];

// Um modelo lento trava a aula tanto quanto um modelo fora do ar. Passou disso,
// desiste e tenta o próximo em vez de deixar a turma esperando.
const LIMITE_MS = 20_000;

export function semChave() {
  return !process.env.GEMINI_API_KEY;
}

export async function gerarTexto(
  params: Omit<GenerateContentParameters, "model">,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let ultimoErro: unknown = new Error("nenhum modelo disponível");

  for (const model of MODELOS) {
    const relogio = new AbortController();
    const alarme = setTimeout(() => relogio.abort(), LIMITE_MS);

    try {
      const resposta = await ai.models.generateContent({
        ...params,
        model,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: relogio.signal,
          ...params.config,
        },
      });

      const texto = resposta.text?.trim();
      if (texto) return texto;
      throw new Error("resposta vazia do modelo");
    } catch (erro) {
      ultimoErro = erro;

      const status = (erro as { status?: number }).status;
      const demorou = relogio.signal.aborted;
      if (!demorou && (!status || !SOBRECARGA.includes(status))) throw erro;

      console.warn(`modelo ${model} ${demorou ? "demorou demais" : `indisponível (${status})`}`);
    } finally {
      clearTimeout(alarme);
    }
  }

  throw ultimoErro;
}
