export type TipoResposta = "texto" | "foto";

export const FERRAMENTAS = [
  { chave: "calculadora", rotulo: "Calculadora" },
  { chave: "notas", rotulo: "Rascunho" },
  { chave: "cronometro", rotulo: "Cronômetro" },
] as const;

export type Ferramenta = (typeof FERRAMENTAS)[number]["chave"];

export interface Atividade {
  titulo: string;
  instrucao: string;
  tipoResposta: TipoResposta;
  duracaoMin: number;
  criterio: string;
  // A atividade declara de que ferramentas ela precisa. O aluno não sai do Modo Aula
  // atrás de app nenhum, então não há o que bloquear.
  ferramentas: Ferramenta[];
}

export interface Entrega {
  id: string;
  tipo: TipoResposta;
  texto?: string;
  imagem?: string;
  feedback?: string;
}

export const ESTADOS = [
  { chave: "animado", rotulo: "Animado" },
  { chave: "tranquilo", rotulo: "Tranquilo" },
  { chave: "cansado", rotulo: "Cansado" },
  { chave: "ansioso", rotulo: "Ansioso" },
] as const;

export type Estado = (typeof ESTADOS)[number]["chave"];

// O check-in vive como contador agregado dentro da própria sessão.
// Não existe documento por aluno: identificar quem respondeu o quê é
// impossível pelo formato do dado, não por promessa de privacidade.
export type Checkins = Partial<Record<Estado, number>>;

export type Fase = "espera" | "foco" | "pausa";

export interface Ciclo {
  fase: Fase;
  restanteSeg: number;
}

// O relógio da aula é um só: fica na sessão, e cada celular calcula em que ponto
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

export const CONVITES_DE_PAUSA = [
  "Levanta e estica o corpo.",
  "Olha pela janela, o mais longe que der.",
  "Fecha os olhos e respira fundo três vezes.",
  "Bebe um gole de água.",
  "Conversa com quem está do teu lado.",
];

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function gerarCodigo(tamanho = 4): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export const DURACAO_SESSAO_MIN = 90;
