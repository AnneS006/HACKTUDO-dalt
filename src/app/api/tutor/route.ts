import { gerarTexto, semChave } from "@/lib/gemini";
import type { Atividade } from "@/lib/tipos";

const INSTRUCOES = `Você é o apoio de estudo dentro da sala de aula. O aluno está no meio de uma
atividade e travou em alguma parte.

Regras inegociáveis:
- NUNCA entregue a resposta pronta da atividade, mesmo que o aluno peça, insista ou diga que já sabe.
- Devolva no máximo 2 frases curtas.
- Responda com uma pergunta que faça o aluno enxergar o próximo passo, ou com uma pista do caminho.
- Se ele pedir a resposta direto, diga com leveza que aqui a ideia é ele chegar lá, e dê a pista.
- Português do Brasil, linguagem da educação básica, tom de quem senta do lado.
- Se a dúvida não tiver nada a ver com a atividade, traga de volta para a aula em uma frase.`;

export async function POST(request: Request) {
  if (semChave()) {
    return Response.json({ erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
  }

  const { atividade, duvida, rascunho } = (await request.json()) as {
    atividade: Atividade;
    duvida: string;
    rascunho?: string;
  };

  if (!duvida?.trim()) {
    return Response.json({ erro: "Escreva sua dúvida." }, { status: 400 });
  }

  try {
    const dica = await gerarTexto({
      contents: `Atividade: ${atividade.instrucao}
${rascunho?.trim() ? `O que o aluno já escreveu: ${rascunho.trim()}` : "O aluno ainda não escreveu nada."}

Dúvida do aluno: ${duvida.trim()}`,
      config: { systemInstruction: INSTRUCOES, maxOutputTokens: 2000 },
    });

    return Response.json({ dica });
  } catch (erro) {
    console.error(erro);
    return Response.json({ erro: "Não consegui responder agora." }, { status: 502 });
  }
}
