import { gerarTexto, semChave } from "@/lib/gemini";
import type { TipoAtividade } from "@/lib/tipos";

const comuns = {
  titulo: { type: "string" },
  instrucao: { type: "string" },
  duracaoMin: { type: "integer" },
  ferramentas: {
    type: "array",
    items: { type: "string", enum: ["calculadora", "notas", "cronometro"] },
  },
};

const ESQUEMAS: Record<TipoAtividade, object> = {
  quiz: {
    type: "object",
    properties: {
      ...comuns,
      perguntas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            enunciado: { type: "string" },
            alternativas: { type: "array", items: { type: "string" } },
            correta: { type: "integer" },
          },
          required: ["enunciado", "alternativas", "correta"],
          additionalProperties: false,
        },
      },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "perguntas"],
    additionalProperties: false,
  },
  formulario: {
    type: "object",
    properties: {
      ...comuns,
      campos: { type: "array", items: { type: "string" } },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "campos"],
    additionalProperties: false,
  },
  entrega: {
    type: "object",
    properties: {
      ...comuns,
      tipoResposta: { type: "string", enum: ["texto", "foto"] },
      criterio: { type: "string" },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "tipoResposta", "criterio"],
    additionalProperties: false,
  },
  enquete: {
    type: "object",
    properties: {
      ...comuns,
      opcoes: { type: "array", items: { type: "string" } },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "opcoes"],
    additionalProperties: false,
  },
  nuvem: {
    type: "object",
    properties: {
      ...comuns,
      palavrasPedidas: { type: "integer" },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "palavrasPedidas"],
    additionalProperties: false,
  },
  coletiva: {
    type: "object",
    properties: {
      ...comuns,
      criterio: { type: "string" },
    },
    required: ["titulo", "instrucao", "duracaoMin", "ferramentas", "criterio"],
    additionalProperties: false,
  },
};

const BASE = `Você ajuda professores da educação básica brasileira a transformar um pedido em uma
atividade que o aluno faz no PRÓPRIO CELULAR, dentro da sala de aula.

Regras sempre válidas:
- A atividade dura entre 5 e 15 minutos.
- Nunca peça dado pessoal, localização ou qualquer informação que identifique o aluno.
- Nunca peça para instalar app, criar conta ou acessar site externo.
- A instrução é lida pelo aluno no celular: escreva direto para ele, em no máximo 2 frases curtas.
- "ferramentas" lista só o que a atividade exige, e fica vazio quando nada é necessário:
  "calculadora" para conta que não dá para fazer de cabeça, "notas" para rascunhar, "cronometro"
  quando envolve medir tempo.`;

const POR_TIPO: Record<TipoAtividade, string> = {
  quiz: `Monte um quiz de 4 a 6 perguntas de múltipla escolha.
- Cada pergunta tem exatamente 4 alternativas curtas e uma única correta.
- "correta" é o índice da alternativa certa, começando em 0.
- Os distratores precisam ser plausíveis, refletindo erros que alunos realmente cometem.
- Nada de pegadinha de linguagem: o que se avalia é o conteúdo.`,
  formulario: `Monte de 2 a 4 perguntas abertas, em "campos".
- Cada pergunta cabe em uma linha e pede elaboração própria, não resposta de uma palavra.
- Evite perguntas cuja resposta se acha pronta em uma busca.`,
  entrega: `Monte uma entrega única em que o aluno produz algo: observar, fotografar, explicar com
as próprias palavras.
- "tipoResposta" é "foto" quando a entrega natural é uma imagem do mundo real; caso contrário "texto".
- "criterio" descreve, em uma frase, o que caracteriza uma boa resposta. Só o professor vê.`,
  enquete: `Monte UMA pergunta de opinião ou de sondagem, com 3 a 5 opções em "opcoes".
- Não existe resposta certa: serve para a turma se enxergar e o professor abrir a discussão.
- Evite opções que exponham o aluno ou revelem algo íntimo sobre ele.
- A instrução é a própria pergunta que o aluno lê na tela.`,
  nuvem: `Monte um pedido de palavras soltas que formará uma nuvem coletiva da turma.
- "palavrasPedidas" é quantas palavras cada aluno envia, entre 1 e 3.
- A instrução precisa deixar claro que é palavra solta, não frase.
- Escolha um pedido em que a repetição entre alunos seja significativa, porque o que se repete
  aparece maior na nuvem.`,
  coletiva: `Monte uma construção coletiva: cada aluno contribui UMA peça e a turma monta um
artefato único, que todos veem crescer ao vivo.
- A instrução diz exatamente qual é a peça de cada um (um verso, um exemplo, uma hipótese, um dado).
- A peça precisa fazer sentido sozinha e também somada às outras.
- "criterio" descreve, em uma frase, o que faz o conjunto ficar bom. Só o professor vê.`,
};

export async function POST(request: Request) {
  if (semChave()) {
    return Response.json({ erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
  }

  const { pedido, tipo, materia } = (await request.json()) as {
    pedido: string;
    tipo: TipoAtividade;
    materia?: string;
  };

  if (typeof pedido !== "string" || pedido.trim().length < 3) {
    return Response.json({ erro: "Descreva o que a turma deve fazer." }, { status: 400 });
  }
  if (!ESQUEMAS[tipo]) {
    return Response.json({ erro: "Tipo de atividade inválido." }, { status: 400 });
  }

  try {
    const texto = await gerarTexto({
      contents: [
        materia?.trim() ? `Disciplina: ${materia.trim()}` : "",
        `Pedido do professor: ${pedido.trim()}`,
      ]
        .filter(Boolean)
        .join("\n"),
      config: {
        systemInstruction: `${BASE}\n\n${POR_TIPO[tipo]}`,
        responseMimeType: "application/json",
        responseJsonSchema: ESQUEMAS[tipo],
      },
    });

    return Response.json({ ...JSON.parse(texto), tipo });
  } catch (erro) {
    console.error(erro);
    return Response.json({ erro: "Não consegui gerar a atividade. Tente de novo." }, { status: 502 });
  }
}
