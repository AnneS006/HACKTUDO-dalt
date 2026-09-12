import { gerarTexto, semChave } from "@/lib/gemini";

const esquema = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    instrucao: { type: "string" },
    tipoResposta: { type: "string", enum: ["texto", "foto"] },
    duracaoMin: { type: "integer" },
    criterio: { type: "string" },
    ferramentas: {
      type: "array",
      items: { type: "string", enum: ["calculadora", "notas", "cronometro"] },
    },
  },
  required: [
    "titulo",
    "instrucao",
    "tipoResposta",
    "duracaoMin",
    "criterio",
    "ferramentas",
  ],
  additionalProperties: false,
};

const INSTRUCOES = `Você ajuda professores da educação básica brasileira a transformar um pedido
em uma micro-atividade que o aluno faz no PRÓPRIO CELULAR, dentro da sala de aula.

Regras da atividade:
- Deve durar entre 5 e 10 minutos.
- Deve exigir que o aluno produza algo (observar, fotografar, explicar com as próprias palavras).
- Nunca deve pedir dado pessoal, nome, localização ou qualquer informação que identifique o aluno.
- Nunca deve pedir que o aluno instale app, crie conta ou acesse site externo.
- A instrução é lida pelo aluno no celular: escreva direto para ele, em no máximo 2 frases curtas.
- "tipoResposta" é "foto" quando a entrega natural é uma imagem do mundo real; caso contrário "texto".
- "criterio" descreve, em uma frase, o que caracteriza uma boa resposta. Só o professor vê.
- "ferramentas" lista só o que a atividade realmente exige, e fica vazio quando nada é necessário:
  "calculadora" para conta que não dá para fazer de cabeça, "notas" para rascunhar antes de
  responder, "cronometro" quando a atividade envolve medir tempo.`;

export async function POST(request: Request) {
  if (semChave()) {
    return Response.json(
      { erro: "GEMINI_API_KEY não configurada no .env.local" },
      { status: 500 },
    );
  }

  const { pedido } = await request.json();
  if (typeof pedido !== "string" || pedido.trim().length < 3) {
    return Response.json({ erro: "Descreva o que a turma deve fazer." }, { status: 400 });
  }

  try {
    const texto = await gerarTexto({
      contents: `Pedido do professor: ${pedido.trim()}`,
      config: {
        systemInstruction: INSTRUCOES,
        responseMimeType: "application/json",
        responseJsonSchema: esquema,
      },
    });

    return Response.json(JSON.parse(texto));
  } catch (erro) {
    console.error(erro);
    return Response.json({ erro: "Não consegui gerar a atividade. Tente de novo." }, { status: 502 });
  }
}
