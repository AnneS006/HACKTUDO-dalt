import { gerarTexto, semChave } from "@/lib/gemini";
import type { Atividade } from "@/lib/tipos";

const INSTRUCOES = `Você devolve a um estudante da educação básica um retorno imediato sobre a
atividade que ele acabou de entregar pelo celular.

Regras:
- No máximo 2 frases, no máximo 220 caracteres no total.
- Fale direto com o aluno, em português do Brasil, tom de quem apoia, nunca de quem julga.
- Comece reconhecendo algo concreto do que ele entregou.
- Termine com um convite a avançar um passo ("repara que...", "e se você...").
- Nunca dê nota, conceito, porcentagem ou qualquer forma de classificação.
- Nunca mencione a foto ou o texto de outro aluno.
- Se a entrega estiver claramente fora do pedido, aponte isso com gentileza e diga o próximo passo.`;

type Parte = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function POST(request: Request) {
  if (semChave()) {
    return Response.json({ erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
  }

  const { atividade, texto, imagem } = (await request.json()) as {
    atividade: Atividade;
    texto?: string;
    imagem?: string;
  };

  const partes: Parte[] = [
    {
      text: `Atividade proposta: ${atividade.instrucao}\nO que caracteriza uma boa resposta: ${atividade.criterio}`,
    },
  ];

  if (imagem?.startsWith("data:image/")) {
    partes.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imagem.split(",")[1] ?? "",
      },
    });
  }

  if (texto?.trim()) {
    partes.push({ text: `Resposta escrita pelo aluno: ${texto.trim()}` });
  }

  try {
    const feedback = await gerarTexto({
      contents: [{ role: "user", parts: partes }],
      config: { systemInstruction: INSTRUCOES, maxOutputTokens: 2000 },
    });

    return Response.json({ feedback });
  } catch (erro) {
    console.error(erro);
    // O feedback é um bônus: se falhar, a entrega do aluno continua valendo.
    return Response.json({ feedback: "" });
  }
}
