import { gerarTexto, semChave } from "@/lib/gemini";
import type { Atividade } from "@/lib/tipos";

const INSTRUCOES = `Você lê o que uma turma inteira produziu em uma micro-atividade de sala de aula
e devolve uma síntese coletiva, para ser projetada na tela da sala e discutida com todos.

Regras:
- No máximo 4 frases.
- Fale da TURMA, nunca de um aluno específico, e nunca em tom de correção individual.
- Aponte o que apareceu em comum e o que apareceu de diferente entre as respostas.
- Termine com UMA pergunta aberta que o professor pode usar para puxar a discussão.
- Português do Brasil, linguagem acessível para a educação básica.`;

export async function POST(request: Request) {
  if (semChave()) {
    return Response.json({ erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
  }

  const { atividade, respostas } = (await request.json()) as {
    atividade: Atividade;
    respostas: string[];
  };

  if (!respostas?.length) {
    return Response.json({ erro: "Nenhuma entrega ainda." }, { status: 400 });
  }

  try {
    const sintese = await gerarTexto({
      contents: `Atividade: ${atividade.instrucao}

Respostas da turma:
${respostas.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
      config: { systemInstruction: INSTRUCOES, maxOutputTokens: 2000 },
    });

    return Response.json({ sintese });
  } catch (erro) {
    console.error(erro);
    return Response.json({ erro: "Não consegui gerar a síntese." }, { status: 502 });
  }
}
