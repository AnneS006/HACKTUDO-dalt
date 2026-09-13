export type Papel = "professor" | "aluno";

export interface Escola {
  id: string;
  nome: string;
  cidade: string;
}

export interface Turma {
  id: string;
  escolaId: string;
  nome: string;
  codigo: string;
  recompensas?: Recompensa[];
  periodoMin: number;
  focoMin: number;
  pausaMin: number;
}

export interface Pessoa {
  id: string;
  nome: string;
  papel: Papel;
  cor: string;
  foto?: string;
  // Só para quem dá aula: contextualiza a atividade que a IA escreve.
  materia?: string;
  // Só para aluno: PIN de 4 dígitos que a escola entrega, reconhecimento e
  // progressão. O PIN não é conta: não tem e-mail, cadastro nem recuperação.
  pin?: string;
  medalhas?: string[];
  entregas?: number;
  enfeite?: string;
  xp?: number;
  resgates?: string[];
  // Entregas somadas por disciplina, para o relatório do aluno sobreviver ao
  // fim da aula: as respostas da sessão são apagadas a cada nova atividade.
  porMateria?: Record<string, number>;
}

/** Firestore trata ponto como separador de caminho dentro do documento. */
export function chaveDeMateria(materia: string): string {
  return materia.trim().replace(/[.~*/[\]]/g, "").slice(0, 40) || "Geral";
}

export const XP_POR_ENTREGA = 50;

export interface Recompensa {
  id: string;
  titulo: string;
  custo: number;
  enfeite: string;
}

export const RECOMPENSAS_INICIAIS: Recompensa[] = [
  { id: "livres", titulo: "10 minutos livres", custo: 300, enfeite: "⏱️" },
  { id: "pular", titulo: "Pular uma tarefa", custo: 500, enfeite: "⏭️" },
  { id: "musica", titulo: "Escolher a música", custo: 200, enfeite: "🎵" },
  { id: "dica", titulo: "Dica extra na prova", custo: 800, enfeite: "💡" },
];

// Reconhecimento que a professora dá na mão, por comportamento que nota em
// sala. Não são pontos e não se comparam entre alunos de propósito: ranking
// público castiga justamente quem já vai mal.
export const MEDALHAS = [
  { id: "proativo", nome: "Participação", enfeite: "🙋", descricao: "Participa e puxa a turma junto" },
  { id: "evolucao", nome: "Evolução", enfeite: "📈", descricao: "Avançou muito em relação a si mesmo" },
  { id: "perguntas", nome: "Boas perguntas", enfeite: "💡", descricao: "Pergunta o que ajuda a turma inteira" },
  { id: "cuidado", nome: "Cuidado", enfeite: "🤝", descricao: "Ajudou um colega sem ninguém pedir" },
] as const;

// Enfeites de avatar liberados por entrega feita. Não custam nada: a ideia é
// marcar percurso, não criar moeda dentro da aula.
export const ENFEITES = [
  { enfeite: "🧢", nome: "Boné", exige: 2 },
  { enfeite: "🕶️", nome: "Óculos", exige: 4 },
  { enfeite: "👑", nome: "Coroa", exige: 6 },
  { enfeite: "✨", nome: "Brilho", exige: 8 },
] as const;

export function medalhaPor(id: string) {
  return MEDALHAS.find((m) => m.id === id);
}

export type TipoAtividade =
  | "quiz"
  | "formulario"
  | "entrega"
  | "enquete"
  | "nuvem"
  | "coletiva";

export type TipoResposta = "texto" | "foto";

export interface Pergunta {
  enunciado: string;
  alternativas: string[];
  correta: number;
}

export interface Atividade {
  titulo: string;
  tipo: TipoAtividade;
  instrucao: string;
  duracaoMin: number;
  ferramentas: Ferramenta[];
  perguntas?: Pergunta[];
  campos?: string[];
  tipoResposta?: TipoResposta;
  criterio?: string;
  opcoes?: string[];
  palavrasPedidas?: number;
}

export interface Sessao {
  atividade: Atividade | null;
  focoAtivo: boolean;
  iniciadaEm: Date | null;
  focoMin: number;
  pausaMin: number;
  liberados: string[];
  // Muda a cada envio, inclusive quando a mesma atividade e reenviada. E o que
  // diz ao aluno que comecou uma rodada nova; o titulo nao serve, porque
  // reenviar uma atividade salva repete o titulo.
  publicadaEm: Date | null;
  // Disciplina de quem publicou, para a entrega do aluno saber a que materia
  // pertence sem ele precisar escolher nada.
  materia?: string;
}

export interface Resposta {
  id: string;
  pessoaId: string;
  nome: string;
  tipo: TipoAtividade;
  // Guardado na entrega para o relatório do aluno sair por matéria de verdade,
  // em vez de somar tudo num número só.
  materia?: string;
  texto?: string;
  imagem?: string;
  respostas?: string[];
  acertos?: number;
  total?: number;
  feedback?: string;
  opcao?: number;
  palavras?: string[];
  peca?: string;
}

// Conta quantas vezes cada palavra apareceu, para a nuvem da turma.
export function contarPalavras(listas: string[][]): { palavra: string; peso: number }[] {
  const contagem = new Map<string, number>();

  for (const palavra of listas.flat()) {
    const limpa = palavra.trim().toLowerCase();
    if (limpa) contagem.set(limpa, (contagem.get(limpa) ?? 0) + 1);
  }

  return [...contagem.entries()]
    .map(([palavra, peso]) => ({ palavra, peso }))
    .sort((a, b) => b.peso - a.peso);
}

export const FERRAMENTAS = [
  { chave: "calculadora", rotulo: "Calculadora" },
  { chave: "notas", rotulo: "Rascunho" },
  { chave: "cronometro", rotulo: "Cronômetro" },
] as const;

export type Ferramenta = (typeof FERRAMENTAS)[number]["chave"];

export const ESTADOS = [
  { chave: "animado", rotulo: "Animado" },
  { chave: "tranquilo", rotulo: "Tranquilo" },
  { chave: "cansado", rotulo: "Cansado" },
  { chave: "ansioso", rotulo: "Ansioso" },
] as const;

export type Estado = (typeof ESTADOS)[number]["chave"];

// O check-in emocional continua sendo só contador agregado na turma.
// A professora orquestra a sessão, mas nunca vê quem se sentiu o quê.
export type Checkins = Partial<Record<Estado, number>>;

export type Fase = "espera" | "foco" | "pausa";

export interface Ciclo {
  fase: Fase;
  restanteSeg: number;
}

// O relógio da aula é um só: fica na turma, e cada celular calcula em que ponto
// do ciclo está. Ninguém aperta play sozinho, a turma inteira entra e sai junto.
export function calcularCiclo(
  iniciadaEm: Date | null,
  focoMin: number,
  pausaMin: number,
  agora = new Date(),
): Ciclo {
  if (!iniciadaEm) return { fase: "espera", restanteSeg: focoMin * 60 };

  const focoSeg = Math.max(1, Math.round(focoMin * 60));
  const pausaSeg = Math.max(1, Math.round(pausaMin * 60));
  const decorrido = Math.max(0, Math.floor((agora.getTime() - iniciadaEm.getTime()) / 1000));
  const posicao = decorrido % (focoSeg + pausaSeg);

  return posicao < focoSeg
    ? { fase: "foco", restanteSeg: focoSeg - posicao }
    : { fase: "pausa", restanteSeg: focoSeg + pausaSeg - posicao };
}

export function formatarTempo(segundos: number): string {
  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export const CONVITES_DE_PAUSA = [
  "Levanta e estica o corpo.",
  "Olha pela janela, o mais longe que der.",
  "Fecha os olhos e respira fundo três vezes.",
  "Bebe um gole de água.",
  "Conversa com quem está do teu lado.",
];
