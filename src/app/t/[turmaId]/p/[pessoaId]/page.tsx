"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Award,
  BarChart3,
  CircleCheck,
  Cloud,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Puzzle,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { VistaColetiva } from "@/components/coletivo";
import {
  ESTADOS,
  MEDALHAS,
  RECOMPENSAS_INICIAIS,
  XP_POR_ENTREGA,
  calcularCiclo,
  formatarTempo,
  medalhaPor,
  type Recompensa,
  type Atividade,
  type Checkins,
  type Pessoa,
  type Resposta,
  type Sessao,
  type TipoAtividade,
  type Turma,
} from "@/lib/tipos";

// Cada formato ganha uma cor própria: na hora de escolher, a cor distingue
// mais rápido que o texto.
const TIPOS: {
  chave: TipoAtividade;
  rotulo: string;
  dica: string;
  icone: LucideIcon;
  tom: string;
}[] = [
  {
    chave: "quiz",
    rotulo: "Quiz",
    dica: "Múltipla escolha com correção na hora.",
    icone: ListChecks,
    tom: "bg-violet-400/10 text-violet-300",
  },
  {
    chave: "formulario",
    rotulo: "Formulário",
    dica: "Perguntas abertas de reflexão que voltam para você.",
    icone: FileText,
    tom: "bg-sky-400/10 text-sky-300",
  },
  {
    chave: "entrega",
    rotulo: "Entrega",
    dica: "Produção única, por texto ou foto.",
    icone: ImageIcon,
    tom: "bg-rose-400/10 text-rose-300",
  },
  {
    chave: "enquete",
    rotulo: "Enquete",
    dica: "Uma pergunta, o retrato da turma na hora.",
    icone: Vote,
    tom: "bg-teal-400/10 text-teal-300",
  },
  {
    chave: "nuvem",
    rotulo: "Nuvem de Palavras",
    dica: "Uma pergunta provocativa: o que se repete aparece maior.",
    icone: Cloud,
    tom: "bg-cyan-400/10 text-cyan-300",
  },
  {
    chave: "coletiva",
    rotulo: "Construção Coletiva",
    dica: "Cada aluno traz uma peça do mesmo painel de conhecimento.",
    icone: Puzzle,
    tom: "bg-amber-400/10 text-amber-300",
  },
];

const COLETIVOS = ["enquete", "nuvem", "coletiva"];

// Rosto e cor de cada estado do check-in, só para a leitura do termômetro.
const HUMOR: Record<string, { emoji: string; cor: string }> = {
  animado: { emoji: "😄", cor: "bg-foco" },
  tranquilo: { emoji: "😌", cor: "bg-realce" },
  cansado: { emoji: "😴", cor: "bg-pausa" },
  ansioso: { emoji: "😟", cor: "bg-alerta" },
};

const ABAS = [
  {
    chave: "turmas",
    rotulo: "Minhas Turmas",
    icone: Users,
    titulo: "Suas Turmas e Salas de Aula",
    subtitulo: "Gerencie seus alunos e o código de acesso da turma",
  },
  {
    chave: "tarefa",
    rotulo: "Criar Tarefa",
    icone: Sparkles,
    titulo: "Criar Tarefa",
    subtitulo: "Escolha o formato interativo para engajar a turma",
  },
  {
    chave: "dashboard",
    rotulo: "Dashboard & Ranking",
    icone: LayoutDashboard,
    titulo: "Dashboard & Síntese da Turma",
    subtitulo: "Engajamento, estado emocional e ranking de XP da turma",
  },
  {
    chave: "desempenho",
    rotulo: "Desempenho da Turma",
    icone: BarChart3,
    titulo: "Desempenho da Turma por Conteúdo",
    subtitulo: "Média de rendimento e os pontos onde a turma acerta e erra",
  },
  {
    chave: "medalhas",
    rotulo: "Atribuir Medalha",
    icone: Award,
    titulo: "Atribuir Medalha Manual",
    subtitulo: "Reconheça atitudes de sala como proatividade, boas perguntas e evolução",
  },
  {
    chave: "lojinha",
    rotulo: "Lojinha de Prêmios",
    icone: ShoppingBag,
    titulo: "Lojinha de Recompensas",
    subtitulo: "Cadastre os prêmios que os alunos podem trocar pelos XP acumulados",
  },
] as const;

type AbaProfessor = (typeof ABAS)[number]["chave"];

export default function PainelProfessor() {
  const { turmaId, pessoaId } = useParams<{ turmaId: string; pessoaId: string }>();
  const router = useRouter();

  const [turma, setTurma] = useState<Turma | null>(null);
  const [eu, setEu] = useState<Pessoa | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [checkins, setCheckins] = useState<Checkins>({});
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [agora, setAgora] = useState(() => new Date());

  const [tipo, setTipo] = useState<TipoAtividade>("quiz");
  const [pedido, setPedido] = useState("");
  const [rascunho, setRascunho] = useState<Atividade | null>(null);
  const [salvas, setSalvas] = useState<Atividade[]>([]);
  const [aba, setAba] = useState<AbaProfessor>("turmas");
  const [alunoParaMedalha, setAlunoParaMedalha] = useState<Pessoa | null>(null);
  const [idParaMedalha, setIdParaMedalha] = useState("");
  const [medalhaEscolhida, setMedalhaEscolhida] = useState<string>(MEDALHAS[0].id);
  const [xpDaTarefa, setXpDaTarefa] = useState(String(XP_POR_ENTREGA));
  const [criandoPremio, setCriandoPremio] = useState(false);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [novaRecompensa, setNovaRecompensa] = useState({ titulo: "", custo: "200", enfeite: "🎁" });
  const [materia, setMateria] = useState("");
  const [sintese, setSintese] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const sessaoRef = useMemo(() => doc(db, "turmas", turmaId, "sessao", "atual"), [turmaId]);

  useEffect(() => {
    getDoc(doc(db, "turmas", turmaId)).then((s) => {
      setTurma({ id: s.id, ...s.data() } as Turma);
      setSalvas(((s.data()?.salvas as Atividade[]) ?? []).slice().reverse());
      setRecompensas((s.data()?.recompensas as Recompensa[]) ?? RECOMPENSAS_INICIAIS);
    });
    getDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId)).then((s) => {
      const pessoa = { id: s.id, ...s.data() } as Pessoa;
      setEu(pessoa);
      setMateria(pessoa.materia ?? "");
    });
    getDocs(collection(db, "turmas", turmaId, "pessoas")).then((s) =>
      setPessoas(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pessoa)),
    );
  }, [turmaId, pessoaId]);

  useEffect(() => {
    const naSessao = onSnapshot(sessaoRef, (s) => {
      const d = s.data();
      if (!d) return;
      setSessao({
        atividade: (d.atividade as Atividade) ?? null,
        focoAtivo: Boolean(d.focoAtivo),
        iniciadaEm: d.iniciadaEm?.toDate?.() ?? null,
        focoMin: d.focoMin ?? 10,
        pausaMin: d.pausaMin ?? 3,
        liberados: (d.liberados as string[]) ?? [],
        publicadaEm: d.publicadaEm?.toDate?.() ?? null,
        materia: (d.materia as string) ?? "",
      });
      setCheckins((d.checkins as Checkins) ?? {});
    });

    const nasRespostas = onSnapshot(collection(sessaoRef, "respostas"), (s) =>
      setRespostas(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Resposta)),
    );

    return () => {
      naSessao();
      nasRespostas();
    };
  }, [sessaoRef]);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const ciclo = useMemo(
    () =>
      calcularCiclo(
        sessao?.focoAtivo ? sessao.iniciadaEm : null,
        sessao?.focoMin ?? 10,
        sessao?.pausaMin ?? 3,
        agora,
      ),
    [sessao, agora],
  );

  const alunos = pessoas.filter((p) => p.papel === "aluno");
  const quantosResgataram = (titulo: string) =>
    alunos.filter((a) => a.resgates?.includes(titulo)).length;
  const totalCheckins = Object.values(checkins).reduce((a, b) => a + b, 0);
  const responderam = new Set(respostas.map((r) => r.pessoaId));

  async function ativarFoco() {
    // Cada aula comeca com o termometro limpo: somar os check-ins de ontem
    // transformaria "como a turma chegou hoje" em historico sem sentido.
    await updateDoc(sessaoRef, {
      focoAtivo: true,
      iniciadaEm: serverTimestamp(),
      liberados: [],
      checkins: {},
    });
  }

  async function encerrarFoco() {
    await updateDoc(sessaoRef, { focoAtivo: false, liberados: [] });
  }

  async function alternarLiberado(alunoId: string) {
    if (!sessao) return;
    const liberados = sessao.liberados.includes(alunoId)
      ? sessao.liberados.filter((i) => i !== alunoId)
      : [...sessao.liberados, alunoId];
    await updateDoc(sessaoRef, { liberados });
  }

  // Sair com a turma em foco deixaria os celulares presos sem ninguém para
  // liberar, então a saída encerra a aula junto.
  async function sair() {
    if (sessao?.focoAtivo) {
      const encerrar = confirm(
        "A turma ainda está em foco. Sair sem encerrar deixa os celulares presos na aula.\n\nEncerrar a aula e sair?",
      );
      if (!encerrar) return;
      await encerrarFoco();
    }
    router.push("/");
  }

  // Reconhecimento vai direto no perfil do aluno, sem passar por pontuação:
  // é a professora dizendo o que viu, não o sistema medindo.
  async function darMedalha(aluno: Pessoa, medalhaId: string) {
    setAlunoParaMedalha(null);
    setIdParaMedalha(aluno.id);
    setPessoas((lista) =>
      lista.map((p) =>
        p.id === aluno.id
          ? { ...p, medalhas: [...new Set([...(p.medalhas ?? []), medalhaId])] }
          : p,
      ),
    );
    await updateDoc(doc(db, "turmas", turmaId, "pessoas", aluno.id), {
      medalhas: arrayUnion(medalhaId),
    });
  }

  async function publicarRecompensa(evento: React.FormEvent) {
    evento.preventDefault();
    const titulo = novaRecompensa.titulo.trim();
    if (!titulo) return;

    const item: Recompensa = {
      id: `r${Date.now()}`,
      titulo,
      custo: Math.max(0, Number(novaRecompensa.custo) || 0),
      enfeite: novaRecompensa.enfeite.trim() || "🎁",
    };

    const lista = [...recompensas, item];
    setRecompensas(lista);
    setNovaRecompensa({ titulo: "", custo: "200", enfeite: "🎁" });
    setCriandoPremio(false);
    await updateDoc(doc(db, "turmas", turmaId), { recompensas: lista });
  }

  async function removerRecompensa(id: string) {
    const lista = recompensas.filter((r) => r.id !== id);
    setRecompensas(lista);
    await updateDoc(doc(db, "turmas", turmaId), { recompensas: lista });
  }

  async function salvarMateria() {
    const limpa = materia.trim();
    if (limpa === (eu?.materia ?? "")) return;
    setEu((p) => (p ? { ...p, materia: limpa } : p));
    await updateDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId), { materia: limpa });
  }

  async function ajustarTempo(campo: "focoMin" | "pausaMin", valor: number) {
    await updateDoc(sessaoRef, { [campo]: Math.max(1, valor) });
  }

  async function ajustarPeriodo(valor: number) {
    await updateDoc(doc(db, "turmas", turmaId), { periodoMin: Math.max(1, valor) });
    setTurma((t) => (t ? { ...t, periodoMin: Math.max(1, valor) } : t));
  }

  async function gerarAtividade() {
    setOcupado(true);
    setErro("");
    try {
      const r = await fetch("/api/atividade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, tipo, materia: eu?.materia }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro);
      setRascunho({ ...(dados as Atividade), xp: Math.max(10, Number(xpDaTarefa) || XP_POR_ENTREGA) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function publicar(atividade: Atividade) {
    const antigas = await getDocs(collection(sessaoRef, "respostas"));
    await Promise.all(antigas.docs.map((d) => deleteDoc(d.ref)));
    await updateDoc(sessaoRef, {
      atividade,
      publicadaEm: serverTimestamp(),
      materia: eu?.materia ?? "",
    });

    // Guardar na própria turma deixa a atividade pronta para reenviar depois
    // sem depender da IA responder de novo.
    if (!salvas.some((s) => s.titulo === atividade.titulo)) {
      await updateDoc(doc(db, "turmas", turmaId), { salvas: arrayUnion(atividade) });
      setSalvas((atuais) => [atividade, ...atuais]);
    }

    setRascunho(null);
    setPedido("");
    setSintese("");
  }

  async function gerarSintese() {
    if (!sessao?.atividade) return;
    setOcupado(true);
    try {
      const textos = respostas
        .flatMap((r) => [r.texto, r.peca, ...(r.respostas ?? []), ...(r.palavras ?? [])])
        .filter((t): t is string => Boolean(t?.trim()));
      const r = await fetch("/api/sintese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade: sessao.atividade, respostas: textos }),
      });
      setSintese((await r.json()).sintese ?? "");
    } finally {
      setOcupado(false);
    }
  }

  if (!turma || !eu || !sessao) {
    return <p className="p-8 text-suave">Carregando...</p>;
  }

  const cabecalho = ABAS.find((a) => a.chave === aba)!;
  const alunoDaMedalha = alunos.find((a) => a.id === idParaMedalha) ?? alunos[0] ?? null;

  return (
    <div className="flex min-h-dvh">
      {/* Lateral no computador, barra rolável no celular. */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-borda bg-superficie md:flex">
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-2xl border border-foco/25 bg-foco/5 p-3">
            <Avatar pessoa={eu} tamanho="m" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Prof. {eu.nome}</p>
              <p className="truncate text-[11px] text-suave">
                Escola: <span className="font-mono text-foco">{turma.codigo}</span>
              </p>
            </div>
          </div>

          <p className="mt-6 px-3 text-[10px] uppercase tracking-[0.18em] text-suave">
            Gestão pedagógica
          </p>

          <nav className="mt-2 flex flex-col gap-1">
            {ABAS.map(({ chave, rotulo, icone: IconeDaAba }) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  aba === chave
                    ? "bg-foco font-semibold text-fundo"
                    : "text-suave hover:bg-superficie-alta hover:text-texto"
                }`}
              >
                <IconeDaAba size={18} strokeWidth={1.75} aria-hidden="true" />
                {rotulo}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-borda p-3">
          <button
            onClick={sair}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-suave transition hover:bg-superficie-alta hover:text-alerta"
          >
            <LogOut size={16} aria-hidden="true" />
            Encerrar sessão
          </button>
          <p className="mt-2 px-3 text-[10px] text-suave/60">Dalt System · Professor da sala</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8">
        <header className="mb-6 flex items-center gap-3 md:hidden">
          <Avatar pessoa={eu} tamanho="p" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-suave">Prof. {eu.nome}</p>
            <p className="truncate font-titulo text-lg font-bold">{turma.nome}</p>
          </div>
          <span className="font-mono text-sm tracking-[0.2em] text-foco">{turma.codigo}</span>
          <button onClick={sair} className="text-sm text-suave" title="Sair">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="-mx-6 mb-8 flex gap-1 overflow-x-auto px-6 md:hidden">
          {ABAS.map(({ chave, rotulo, icone: IconeDaAba }) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                aba === chave ? "bg-foco font-semibold text-fundo" : "text-suave"
              }`}
            >
              <IconeDaAba size={16} strokeWidth={1.75} aria-hidden="true" />
              {rotulo}
            </button>
          ))}
        </nav>

        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-titulo text-2xl font-bold sm:text-3xl">{cabecalho.titulo}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-suave">
              {cabecalho.subtitulo}
              {(aba === "tarefa" || aba === "dashboard") && (
                <>
                  {" "}
                  <span className="font-semibold text-texto">{turma.nome}</span>
                </>
              )}
            </p>
          </div>

          {aba === "lojinha" && (
            <button
              onClick={() => setCriandoPremio((v) => !v)}
              className="flex items-center gap-2 rounded-2xl bg-foco px-5 py-3 text-sm font-semibold text-fundo transition hover:brightness-110"
            >
              <Plus size={16} aria-hidden="true" />
              {criandoPremio ? "Fechar" : "Novo prêmio"}
            </button>
          )}
        </header>

        {/* ---------------------------------------------------------------- */}
        {aba === "turmas" && (
          <section className="rounded-3xl border border-borda bg-superficie p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foco/10 font-titulo text-lg font-bold text-foco">
                  {turma.nome.split(" ")[0]}
                </span>
                <div>
                  <p className="font-titulo text-xl font-bold">{turma.nome}</p>
                  <p className="mt-1 text-xs text-suave">
                    Código da turma para alunos:{" "}
                    <span className="rounded-md bg-foco/10 px-2 py-0.5 font-mono tracking-[0.15em] text-foco">
                      {turma.codigo}
                    </span>
                  </p>
                </div>
              </div>

              {sessao.focoAtivo ? (
                <button
                  onClick={encerrarFoco}
                  className="flex items-center gap-2 rounded-2xl border border-alerta/50 px-5 py-3 text-sm font-semibold text-alerta transition hover:bg-alerta/10"
                >
                  <Target size={16} aria-hidden="true" />
                  Tirar todos do modo aula
                </button>
              ) : (
                <button
                  onClick={ativarFoco}
                  className="flex items-center gap-2 rounded-2xl bg-foco px-5 py-3 text-sm font-semibold text-fundo transition hover:brightness-110"
                >
                  <Target size={16} aria-hidden="true" />
                  Colocar turma em foco
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-borda bg-superficie-alta p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-suave">
                  Status da turma
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      !sessao.focoAtivo
                        ? "bg-suave"
                        : ciclo.fase === "pausa"
                          ? "bg-pausa"
                          : "bg-foco"
                    }`}
                  />
                  {!sessao.focoAtivo
                    ? "Turma livre"
                    : ciclo.fase === "pausa"
                      ? `Pausa · ${formatarTempo(ciclo.restanteSeg)}`
                      : `Em foco · ${formatarTempo(ciclo.restanteSeg)}`}
                </p>
              </div>
              <Campo
                rotulo="Foco (min)"
                valor={sessao.focoMin}
                ao={(v) => ajustarTempo("focoMin", v)}
              />
              <Campo
                rotulo="Pausa (min)"
                valor={sessao.pausaMin}
                ao={(v) => ajustarTempo("pausaMin", v)}
              />
              <Campo rotulo="Período aula (min)" valor={turma.periodoMin} ao={ajustarPeriodo} />
            </div>

            <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Estudantes cadastrados ({alunos.length})</h2>
              <p className="text-xs text-suave">
                Passe o código no quadro e entregue a cada aluno o PIN dele
              </p>
            </div>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {alunos.map((a) => {
                const liberado = sessao.liberados.includes(a.id);
                const emFoco = sessao.focoAtivo && !liberado;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie-alta p-4"
                  >
                    <Avatar pessoa={a} tamanho="p" apagado={sessao.focoAtivo && !emFoco} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {a.nome}
                        {(a.medalhas?.length ?? 0) > 0 && (
                          <span className="ml-2" title={`${a.medalhas!.length} reconhecimentos`}>
                            {a.medalhas!.map((id) => medalhaPor(id)?.enfeite).join("")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-suave">
                        PIN: <span className="font-mono text-foco">{a.pin ?? "—"}</span>
                        {sessao.focoAtivo && (liberado ? " · fora do foco" : " · em foco")}
                        {responderam.has(a.id) && " · entregou"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-foco">{a.xp ?? 0} XP</p>
                      <p className="text-[11px] text-suave">{a.entregas ?? 0} tarefas</p>
                    </div>

                    {sessao.focoAtivo && (
                      <button
                        onClick={() => alternarLiberado(a.id)}
                        className="shrink-0 rounded-lg border border-borda px-3 py-1.5 text-xs text-suave transition hover:border-foco hover:text-texto"
                      >
                        {liberado ? "Voltar" : "Liberar"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {aba === "tarefa" && (
          <section>
            {sessao.atividade && (
              <div
                className={`mb-6 rounded-2xl border bg-superficie p-5 ${
                  sessao.focoAtivo ? "border-foco/30" : "border-pausa/40"
                }`}
              >
                <p
                  className={`text-[10px] uppercase tracking-[0.18em] ${
                    sessao.focoAtivo ? "text-foco" : "text-pausa"
                  }`}
                >
                  {sessao.focoAtivo ? "No ar" : "Aguardando o foco"} · {sessao.atividade.tipo}
                </p>
                <p className="mt-2 text-lg font-semibold">{sessao.atividade.titulo}</p>
                <p className="mt-1 text-sm text-suave">{sessao.atividade.instrucao}</p>

                {sessao.focoAtivo ? (
                  <p className="mt-3 text-sm text-suave">
                    {respostas.length} de {alunos.length} entregaram
                  </p>
                ) : (
                  // Publicar sem foco ligado nao chega em ninguem, e isso precisa
                  // ficar obvio: o professor nao tem como ver a tela dos alunos.
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-borda pt-4">
                    <p className="flex-1 text-sm text-pausa">
                      A turma não está em foco, então ninguém está vendo esta atividade.
                    </p>
                    <button
                      onClick={ativarFoco}
                      className="rounded-xl bg-foco px-5 py-2.5 text-sm font-semibold text-fundo"
                    >
                      Colocar turma em foco
                    </button>
                  </div>
                )}
              </div>
            )}

            {salvas.length > 0 && !rascunho && (
              <div className="mb-6">
                <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-suave">
                  Já usadas nesta turma · reenviar não chama a IA
                </p>
                <ul className="flex flex-wrap gap-2">
                  {salvas.slice(0, 8).map((s, i) => (
                    <li key={`${s.titulo}-${i}`}>
                      <button
                        onClick={() => publicar(s)}
                        className="rounded-xl border border-borda bg-superficie px-4 py-2 text-sm text-suave transition hover:border-foco hover:text-texto"
                      >
                        {s.titulo}
                        <span className="ml-2 text-xs opacity-60">{s.tipo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TIPOS.map((t) => (
                <li key={t.chave}>
                  <button
                    onClick={() => setTipo(t.chave)}
                    className={`flex h-full w-full flex-col rounded-2xl border p-5 text-left transition ${
                      tipo === t.chave
                        ? "border-foco bg-foco/5"
                        : "border-borda bg-superficie hover:border-foco/40"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.tom}`}
                    >
                      <t.icone size={20} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span className="mt-4 block font-semibold">{t.rotulo}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-suave">{t.dica}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-borda bg-superficie p-6">
              <label className="block text-xs text-suave">
                Sobre o que é a atividade
                <textarea
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  rows={2}
                  placeholder="Ex.: revisar equações do primeiro grau com a turma"
                  className="mt-1.5 w-full rounded-xl border border-borda bg-fundo p-3 text-base text-texto outline-none transition focus:border-foco"
                />
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-suave">
                  Matéria
                  <input
                    value={materia}
                    onChange={(e) => setMateria(e.target.value)}
                    onBlur={salvarMateria}
                    placeholder="Matemática"
                    className="mt-1.5 w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 text-base text-texto outline-none transition focus:border-foco"
                  />
                </label>
                <label className="block text-xs text-suave">
                  Recompensa em XP
                  <input
                    type="number"
                    min={10}
                    max={500}
                    step={10}
                    value={xpDaTarefa}
                    onChange={(e) => setXpDaTarefa(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 text-base text-texto outline-none transition focus:border-foco"
                  />
                </label>
              </div>

              <p className="mt-2 text-[11px] text-suave/70">
                Quem entrega leva esse valor. Em quiz, quem acerta tudo leva o dobro.
              </p>

              <button
                onClick={gerarAtividade}
                disabled={ocupado || pedido.trim().length < 3}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-foco px-6 py-3.5 font-semibold text-fundo transition hover:brightness-110 disabled:opacity-30"
              >
                <Sparkles size={18} aria-hidden="true" />
                {ocupado ? "Gerando..." : "Gerar atividade para a turma"}
              </button>
              {erro && <p className="mt-3 text-sm text-alerta">{erro}</p>}
            </div>

            {rascunho && (
              <div className="surgir mt-6 rounded-2xl border border-foco/30 bg-superficie p-6">
                <p className="text-[10px] uppercase tracking-[0.18em] text-foco">
                  Confira antes de postar
                </p>
                <p className="mt-2 text-lg font-semibold">{rascunho.titulo}</p>
                <p className="mt-1 text-sm text-suave">{rascunho.instrucao}</p>

                {rascunho.perguntas && (
                  <ol className="mt-4 space-y-3 text-sm">
                    {rascunho.perguntas.map((p, i) => (
                      <li key={i}>
                        <p>{p.enunciado}</p>
                        <ul className="mt-1 space-y-0.5 text-suave">
                          {p.alternativas.map((alt, j) => (
                            <li key={j} className={j === p.correta ? "text-foco" : ""}>
                              {alt}
                              {j === p.correta && " ✓"}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                )}

                {rascunho.campos && (
                  <ul className="mt-4 space-y-2 text-sm text-suave">
                    {rascunho.campos.map((c, i) => (
                      <li key={i}>
                        {i + 1}. {c}
                      </li>
                    ))}
                  </ul>
                )}

                {rascunho.opcoes && (
                  <ul className="mt-4 space-y-2 text-sm text-suave">
                    {rascunho.opcoes.map((o, i) => (
                      <li key={i}>· {o}</li>
                    ))}
                  </ul>
                )}

                {rascunho.palavrasPedidas !== undefined && (
                  <p className="mt-4 text-sm text-suave">
                    Cada aluno envia {rascunho.palavrasPedidas}{" "}
                    {rascunho.palavrasPedidas === 1 ? "palavra" : "palavras"}.
                  </p>
                )}

                {rascunho.criterio && (
                  <p className="mt-4 text-sm text-suave">
                    <span className="text-texto">Boa resposta:</span> {rascunho.criterio}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={() => publicar(rascunho)}
                    className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo transition hover:brightness-110"
                  >
                    Postar para a turma
                  </button>
                  <button
                    onClick={() => setRascunho(null)}
                    className="rounded-2xl border border-borda px-6 py-3"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}

            {respostas.length > 0 && (
              <div className="mt-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Respostas ({respostas.length})</h2>
                  <button
                    onClick={gerarSintese}
                    disabled={ocupado}
                    className="rounded-xl border border-borda px-4 py-2 text-sm transition hover:border-foco disabled:opacity-30"
                  >
                    {ocupado ? "Lendo a turma..." : "Síntese da turma"}
                  </button>
                </div>

                {sintese && (
                  <p className="surgir mt-4 rounded-2xl border border-foco/30 bg-superficie p-5 leading-relaxed">
                    {sintese}
                  </p>
                )}

                {sessao.atividade && COLETIVOS.includes(sessao.atividade.tipo) && (
                  <div className="mt-5 rounded-2xl border border-borda bg-superficie p-6">
                    <VistaColetiva atividade={sessao.atividade} respostas={respostas} />
                  </div>
                )}

                {!COLETIVOS.includes(sessao.atividade?.tipo ?? "") && (
                  <ul className="mt-4 space-y-2">
                    {respostas.map((r) => (
                      <li key={r.id} className="rounded-2xl border border-borda bg-superficie p-4">
                        <p className="text-sm font-semibold">{r.nome}</p>
                        {r.total !== undefined && (
                          <p className="mt-1 text-sm text-foco">
                            {r.acertos} de {r.total} certas
                          </p>
                        )}
                        {r.texto && <p className="mt-1 text-sm text-suave">{r.texto}</p>}
                        {r.respostas
                          ?.filter(() => r.total === undefined)
                          .map((t, i) => (
                            <p key={i} className="mt-1 text-sm text-suave">
                              {t}
                            </p>
                          ))}
                        {r.imagem && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.imagem} alt="" className="mt-2 w-40 rounded-xl" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {aba === "dashboard" && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-borda bg-superficie p-6">
              <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-suave">
                <span aria-hidden="true">🙂</span>
                Como a turma chegou hoje (check-in de humor)
              </h2>

              {totalCheckins === 0 ? (
                <p className="mt-4 text-sm text-suave/70">Aguardando os primeiros check-ins.</p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {ESTADOS.map(({ chave, rotulo }) => {
                    const n = checkins[chave] ?? 0;
                    const humor = HUMOR[chave];
                    return (
                      <li key={chave}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span>
                            {rotulo}{" "}
                            <span aria-hidden="true">{humor?.emoji}</span>
                          </span>
                          <span className="font-mono text-xs text-foco">
                            {n} {n === 1 ? "aluno" : "alunos"}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie-alta">
                          <div
                            className={`h-full rounded-full ${humor?.cor ?? "bg-foco"}`}
                            style={{ width: `${(n / totalCheckins) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-5 text-[11px] text-suave/70">
                Só o total da turma existe no banco. Não há registro de humor por aluno.
              </p>
            </div>

            <div className="rounded-2xl border border-borda bg-superficie p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-suave">
                  <span aria-hidden="true">🏆</span>
                  Ranking de engajamento por XP
                </h2>
                <p className="text-[11px] text-suave">Recompense os destaques</p>
              </div>

              <ol className="mt-5 space-y-2">
                {[...alunos]
                  .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))
                  .map((a, posicao) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie-alta p-3"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          posicao === 0
                            ? "bg-pausa text-fundo"
                            : posicao === 1
                              ? "bg-suave text-fundo"
                              : posicao === 2
                                ? "bg-alerta text-fundo"
                                : "bg-superficie text-suave"
                        }`}
                      >
                        {posicao + 1}º
                      </span>
                      <Avatar pessoa={a} tamanho="p" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.nome}</span>

                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-sm font-bold text-foco">
                          {a.xp ?? 0} XP
                        </span>
                        <span className="block text-[11px] text-suave">
                          {a.entregas ?? 0} tarefas prontas
                        </span>
                      </span>

                      <button
                        onClick={() => setAlunoParaMedalha(a)}
                        className="shrink-0 rounded-xl border border-foco/40 px-3 py-1.5 text-xs font-medium text-foco transition hover:bg-foco/10"
                      >
                        Premiar
                      </button>
                    </li>
                  ))}
              </ol>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {aba === "desempenho" && (
          <Desempenho alunos={alunos} respostas={respostas} atividade={sessao.atividade} />
        )}

        {/* ---------------------------------------------------------------- */}
        {aba === "medalhas" && (
          <section className="rounded-3xl border border-borda bg-superficie p-6">
            {alunos.length === 0 ? (
              <p className="text-sm text-suave">Esta turma ainda não tem alunos cadastrados.</p>
            ) : (
              <>
                <label className="block text-sm font-semibold">
                  1. Selecione o estudante
                  <select
                    value={alunoDaMedalha?.id ?? ""}
                    onChange={(e) => setIdParaMedalha(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-borda bg-fundo px-4 py-3 text-base text-texto outline-none transition focus:border-foco"
                  >
                    {alunos.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome} {a.pin ? `(PIN ${a.pin})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="mt-7 text-sm font-semibold">2. Escolha a medalha para atribuir</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {MEDALHAS.map((medalha) => {
                    const jaTem = alunoDaMedalha?.medalhas?.includes(medalha.id) ?? false;
                    const escolhida = medalhaEscolhida === medalha.id;
                    return (
                      <li key={medalha.id}>
                        <button
                          onClick={() => setMedalhaEscolhida(medalha.id)}
                          disabled={jaTem}
                          className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition disabled:opacity-40 ${
                            escolhida && !jaTem
                              ? "border-foco bg-foco/5"
                              : "border-borda bg-superficie-alta enabled:hover:border-foco/40"
                          }`}
                        >
                          <span className="text-xl" aria-hidden="true">
                            {medalha.enfeite}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{medalha.nome}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-suave">
                              {jaTem ? "Este aluno já recebeu." : medalha.descricao}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <button
                  onClick={() => alunoDaMedalha && darMedalha(alunoDaMedalha, medalhaEscolhida)}
                  disabled={!alunoDaMedalha || (alunoDaMedalha.medalhas?.includes(medalhaEscolhida) ?? false)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-foco px-6 py-3.5 font-semibold text-fundo transition hover:brightness-110 disabled:opacity-30"
                >
                  <Award size={18} aria-hidden="true" />
                  Conceder medalha ao aluno
                </button>

                <p className="mt-4 text-[11px] leading-relaxed text-suave/70">
                  O aluno vê o que recebeu. A turma não vê a lista dos outros, e não existe
                  classificação entre eles. Entrega e bom desempenho o app dá sozinho.
                </p>
              </>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------- */}
        {aba === "lojinha" && (
          <section>
            {criandoPremio && (
              <form
                onSubmit={publicarRecompensa}
                className="surgir mb-6 rounded-2xl border border-foco/30 bg-superficie p-5"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-48 flex-1 text-xs text-suave">
                    Prêmio
                    <input
                      value={novaRecompensa.titulo}
                      onChange={(e) => setNovaRecompensa((n) => ({ ...n, titulo: e.target.value }))}
                      placeholder="15 minutos livres"
                      className="mt-1.5 w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 text-base text-texto outline-none focus:border-foco"
                    />
                  </label>
                  <label className="w-28 text-xs text-suave">
                    Custo em XP
                    <input
                      type="number"
                      min={0}
                      value={novaRecompensa.custo}
                      onChange={(e) => setNovaRecompensa((n) => ({ ...n, custo: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 text-base text-texto outline-none focus:border-foco"
                    />
                  </label>
                  <label className="w-20 text-xs text-suave">
                    Ícone
                    <input
                      value={novaRecompensa.enfeite}
                      onChange={(e) => setNovaRecompensa((n) => ({ ...n, enfeite: e.target.value }))}
                      maxLength={2}
                      className="mt-1.5 w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 text-center text-base text-texto outline-none focus:border-foco"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-xl bg-foco px-5 py-2.5 text-sm font-semibold text-fundo"
                  >
                    Publicar
                  </button>
                </div>
              </form>
            )}

            <p className="mb-5 text-sm text-suave">
              Quem cumpre a recompensa em sala é você — o app só registra o pedido do aluno.
            </p>

            <ul className="grid gap-4 sm:grid-cols-2">
              {recompensas.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-3 rounded-2xl border border-borda bg-superficie p-5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pausa/10 text-lg">
                    {r.enfeite}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug">{r.titulo}</span>
                    <span className="mt-1 block text-xs text-suave">
                      {quantosResgataram(r.titulo)} resgate
                      {quantosResgataram(r.titulo) === 1 ? "" : "s"} até agora
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-bold text-pausa">{r.custo}</span>
                    <span className="block font-mono text-[10px] text-pausa/70">XP</span>
                  </span>
                  <button
                    onClick={() => removerRecompensa(r.id)}
                    className="shrink-0 rounded-lg border border-borda p-1.5 text-suave transition hover:border-alerta hover:text-alerta"
                    title="Tirar da lojinha"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {alunoParaMedalha && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-fundo/80 p-4 sm:items-center"
          onClick={() => setAlunoParaMedalha(null)}
        >
          <div
            className="surgir w-full max-w-md rounded-3xl border border-borda bg-superficie p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-suave">Reconhecer</p>
            <h3 className="mt-1 font-titulo text-xl font-bold">{alunoParaMedalha.nome}</h3>

            <ul className="mt-5 space-y-2">
              {MEDALHAS.map((medalha) => {
                const jaTem = alunoParaMedalha.medalhas?.includes(medalha.id);
                return (
                  <li key={medalha.id}>
                    <button
                      onClick={() => darMedalha(alunoParaMedalha, medalha.id)}
                      disabled={jaTem}
                      className="flex w-full items-center gap-4 rounded-2xl border border-borda bg-fundo p-4 text-left transition enabled:hover:border-foco disabled:opacity-40"
                    >
                      <span className="text-2xl" aria-hidden="true">
                        {medalha.enfeite}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{medalha.nome}</span>
                        <span className="block text-xs text-suave">{medalha.descricao}</span>
                      </span>
                      {jaTem && <span className="text-xs text-foco">já tem</span>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 text-xs leading-relaxed text-suave">
              O aluno vê o que recebeu. A turma não vê a lista dos outros, e não existe
              classificação entre eles.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Diagnóstico por conteúdo, não por aluno. Cada pergunta do quiz vira um tópico
 * e a taxa de acerto dela diz o que a turma domina e o que precisa de revisão —
 * que é a pergunta que quem dá a aula realmente faz depois da atividade.
 */
function Desempenho({
  alunos,
  respostas,
  atividade,
}: {
  alunos: Pessoa[];
  respostas: Resposta[];
  atividade: Atividade | null;
}) {
  const comNota = respostas.filter((r) => r.total);

  if (comNota.length === 0) {
    return (
      <p className="text-sm text-suave">
        Ainda sem quiz respondido. Aplique um quiz e o diagnóstico da turma aparece aqui.
      </p>
    );
  }

  const acertos = comNota.reduce((soma, r) => soma + (r.acertos ?? 0), 0);
  const total = comNota.reduce((soma, r) => soma + (r.total ?? 0), 0);
  const media = Math.round((acertos / total) * 100);

  // Só dá para separar por conteúdo quando a resposta guardou a alternativa de
  // cada pergunta. Quiz antigo, gravado antes disso, cai no resumo geral.
  const porPergunta = (atividade?.perguntas ?? [])
    .map((pergunta, i) => {
      const votos = comNota
        .map((r) => r.respostas?.[i])
        .filter((v): v is string => v !== undefined && v !== "");
      if (votos.length === 0) return null;
      const certas = votos.filter((v) => Number(v) === pergunta.correta).length;
      return {
        enunciado: pergunta.enunciado,
        parte: Math.round((certas / votos.length) * 100),
      };
    })
    .filter((p): p is { enunciado: string; parte: number } => p !== null);

  const fortes = porPergunta.filter((p) => p.parte >= 70);
  const fracos = porPergunta.filter((p) => p.parte < 70);

  const corDaMedia = media >= 80 ? "text-foco" : media >= 60 ? "text-pausa" : "text-alerta";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-borda bg-superficie p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-titulo text-xl font-bold">
              {atividade?.titulo ?? "Último quiz aplicado"}
            </h2>
            <p className="mt-1 text-xs text-suave">Diagnóstico de aprendizagem</p>
          </div>
          <div className="text-right">
            <p className={`font-titulo text-3xl font-bold ${corDaMedia}`}>{media}%</p>
            <p className="mt-0.5 text-[11px] text-suave">Precisão da turma</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-suave">
          {comNota.length} de {alunos.length} responderam
        </p>

        {porPergunta.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-foco/25 bg-foco/5 p-4">
              <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-foco">
                <CircleCheck size={13} aria-hidden="true" />
                Pontos fortes (acertos)
              </h3>
              {fortes.length === 0 ? (
                <p className="mt-3 text-xs text-suave">
                  Nenhum tópico passou de 70% de acerto nesta atividade.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {fortes.map((p) => (
                    <li key={p.enunciado} className="flex gap-2 text-xs leading-relaxed">
                      <span className="text-foco" aria-hidden="true">
                        ·
                      </span>
                      <span className="min-w-0 flex-1">{p.enunciado}</span>
                      <span className="shrink-0 font-mono text-foco">{p.parte}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-alerta/25 bg-alerta/5 p-4">
              <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-alerta">
                <TriangleAlert size={13} aria-hidden="true" />
                Tópicos com maior dificuldade (erros)
              </h3>
              {fracos.length === 0 ? (
                <p className="mt-3 text-xs text-suave">
                  A turma foi bem em todos os tópicos desta atividade.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {fracos.map((p) => (
                    <li key={p.enunciado} className="flex gap-2 text-xs leading-relaxed">
                      <span className="text-alerta" aria-hidden="true">
                        ·
                      </span>
                      <span className="min-w-0 flex-1">{p.enunciado}</span>
                      <span className="shrink-0 font-mono text-alerta">{p.parte}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-superficie-alta">
            <div className="bg-foco" style={{ width: `${media}%` }} />
            <div className="bg-alerta/70" style={{ width: `${100 - media}%` }} />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-borda bg-superficie p-6">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-suave">
          Aluno por aluno · quem precisa de você primeiro
        </h2>
        <ul className="mt-4 space-y-3">
          {comNota
            .slice()
            .sort((a, b) => (a.acertos ?? 0) / (a.total ?? 1) - (b.acertos ?? 0) / (b.total ?? 1))
            .map((r) => {
              const parte = Math.round(((r.acertos ?? 0) / (r.total ?? 1)) * 100);
              return (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-suave">{r.nome}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-alta">
                    <span
                      className={`block h-full rounded-full ${parte < 50 ? "bg-alerta" : "bg-foco"}`}
                      style={{ width: `${parte}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-suave">
                    {r.acertos}/{r.total}
                  </span>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}

function Campo({ rotulo, valor, ao }: { rotulo: string; valor: number; ao: (n: number) => void }) {
  return (
    <label className="block rounded-2xl border border-borda bg-superficie-alta p-4 text-[10px] uppercase tracking-[0.18em] text-suave">
      {rotulo}
      <input
        type="number"
        min={1}
        max={120}
        value={valor}
        onChange={(e) => ao(Number(e.target.value) || 1)}
        className="mt-1 w-full bg-transparent font-titulo text-xl font-bold tracking-normal text-texto outline-none"
      />
    </label>
  );
}
