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
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  Sparkles,
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

const TIPOS: { chave: TipoAtividade; rotulo: string; dica: string }[] = [
  { chave: "quiz", rotulo: "Quiz", dica: "Múltipla escolha com correção na hora" },
  { chave: "formulario", rotulo: "Formulário", dica: "Perguntas abertas que voltam para você" },
  { chave: "entrega", rotulo: "Entrega", dica: "Produção única, por texto ou foto" },
  { chave: "enquete", rotulo: "Enquete", dica: "Uma pergunta, o retrato da turma na hora" },
  { chave: "nuvem", rotulo: "Nuvem de palavras", dica: "O que se repete aparece maior" },
  { chave: "coletiva", rotulo: "Construção coletiva", dica: "Cada um traz uma peça do mesmo painel" },
];

const COLETIVOS = ["enquete", "nuvem", "coletiva"];

const ABAS = [
  { chave: "dashboard", rotulo: "Painel da turma", icone: LayoutDashboard },
  { chave: "tarefa", rotulo: "Criar tarefa", icone: Sparkles },
  { chave: "desempenho", rotulo: "Desempenho", icone: BarChart3 },
  { chave: "medalhas", rotulo: "Atribuir medalha", icone: Award },
  { chave: "lojinha", rotulo: "Lojinha", icone: ShoppingBag },
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
  const [aba, setAba] = useState<AbaProfessor>("dashboard");
  const [alunoParaMedalha, setAlunoParaMedalha] = useState<Pessoa | null>(null);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [novaRecompensa, setNovaRecompensa] = useState({ titulo: "", custo: "200", enfeite: "🎁" });
  const [editandoMateria, setEditandoMateria] = useState(false);
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
    await updateDoc(doc(db, "turmas", turmaId), { recompensas: lista });
  }

  async function removerRecompensa(id: string) {
    const lista = recompensas.filter((r) => r.id !== id);
    setRecompensas(lista);
    await updateDoc(doc(db, "turmas", turmaId), { recompensas: lista });
  }

  async function salvarMateria() {
    const limpa = materia.trim();
    setEditandoMateria(false);
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
      setRascunho(dados as Atividade);
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

  return (
    <div className="flex min-h-dvh">
      {/* Lateral no computador, barra rolável no celular. */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-borda bg-superficie md:flex">
        <div>
          <div className="flex items-center gap-3 border-b border-borda p-5">
            <Avatar pessoa={eu} tamanho="m" />
            <div className="min-w-0">
              <p className="truncate text-xs text-suave">{eu.nome}</p>
              <p className="truncate font-titulo text-base font-bold">{turma.nome}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <span className="font-mono text-sm tracking-[0.2em] text-foco">{turma.codigo}</span>
            {editandoMateria ? (
              <input
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                onBlur={salvarMateria}
                onKeyDown={(e) => e.key === "Enter" && salvarMateria()}
                placeholder="Matemática"
                autoFocus
                className="w-28 rounded-lg border border-foco bg-fundo px-2 py-1 text-xs text-texto outline-none"
              />
            ) : (
              <button
                onClick={() => setEditandoMateria(true)}
                className="text-xs text-suave transition hover:text-texto"
              >
                {eu.materia || "+ matéria"}
              </button>
            )}
          </div>

          <nav className="flex flex-col gap-1 px-3">
            {ABAS.map(({ chave, rotulo, icone: Icone }) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  aba === chave
                    ? "bg-foco/10 text-foco"
                    : "text-suave hover:bg-superficie-alta hover:text-texto"
                }`}
              >
                <Icone size={18} strokeWidth={1.75} aria-hidden="true" />
                {rotulo}
              </button>
            ))}
          </nav>
        </div>

        <button
          onClick={sair}
          className="m-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-suave transition hover:bg-superficie-alta hover:text-alerta"
        >
          <LogOut size={16} aria-hidden="true" />
          Encerrar sessão
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8">
        <header className="mb-6 flex items-center gap-3 md:hidden">
          <Avatar pessoa={eu} tamanho="p" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-suave">{eu.nome}</p>
            <p className="truncate font-titulo text-lg font-bold">{turma.nome}</p>
          </div>
          <span className="font-mono text-sm tracking-[0.2em] text-foco">{turma.codigo}</span>
          <button onClick={sair} className="text-sm text-suave" title="Sair">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="-mx-6 mb-8 flex gap-1 overflow-x-auto px-6 md:hidden">
          {ABAS.map(({ chave, rotulo, icone: Icone }) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                aba === chave ? "bg-foco/10 text-foco" : "text-suave"
              }`}
            >
              <Icone size={16} strokeWidth={1.75} aria-hidden="true" />
              {rotulo}
            </button>
          ))}
        </nav>

      <section className={`rounded-3xl border border-borda bg-superficie p-6 ${aba === "dashboard" ? "" : "hidden"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-suave">
              {!sessao.focoAtivo ? "Turma livre" : ciclo.fase}
            </p>
            <p
              className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
                ciclo.fase === "pausa" ? "text-pausa" : "text-foco"
              }`}
            >
              {sessao.focoAtivo ? formatarTempo(ciclo.restanteSeg) : "--:--"}
            </p>
          </div>
          {sessao.focoAtivo ? (
            <button
              onClick={encerrarFoco}
              className="rounded-2xl border border-alerta/50 px-6 py-3 font-semibold text-alerta"
            >
              Tirar todos do modo aula
            </button>
          ) : (
            <button
              onClick={ativarFoco}
              className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo"
            >
              Colocar turma em foco
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <Campo rotulo="Foco (min)" valor={sessao.focoMin} ao={(v) => ajustarTempo("focoMin", v)} />
          <Campo rotulo="Pausa (min)" valor={sessao.pausaMin} ao={(v) => ajustarTempo("pausaMin", v)} />
          <Campo rotulo="Período (min)" valor={turma.periodoMin} ao={ajustarPeriodo} />
        </div>
      </section>

      <section className={`mt-8 ${aba === "dashboard" ? "" : "hidden"}`}>
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Turma ({alunos.length})
        </h2>
        <p className="mb-4 mt-1 text-xs text-suave">
          Passe o código {turma.codigo} no quadro e entregue a cada aluno o PIN dele.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {alunos.map((a) => {
            const liberado = sessao.liberados.includes(a.id);
            const emFoco = sessao.focoAtivo && !liberado;
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-3"
              >
                <Avatar pessoa={a} tamanho="p" apagado={!emFoco} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {a.nome}
                    {(a.medalhas?.length ?? 0) > 0 && (
                      <span className="ml-2" title={`${a.medalhas!.length} reconhecimentos`}>
                        {a.medalhas!.map((id) => medalhaPor(id)?.enfeite).join("")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-suave">
                    {a.pin && <span className="font-mono text-foco">{a.pin}</span>}
                    {a.pin && " · "}
                    {!sessao.focoAtivo ? "livre" : liberado ? "fora do foco" : "em foco"}
                    {responderam.has(a.id) && " · entregou"}
                  </p>
                </div>
                <button
                  onClick={() => setAlunoParaMedalha(a)}
                  className="rounded-lg border border-borda px-2.5 py-1.5 text-xs text-suave transition hover:border-foco hover:text-texto"
                  title="Reconhecer"
                >
                  ★
                </button>
                {sessao.focoAtivo && (
                  <button
                    onClick={() => alternarLiberado(a.id)}
                    className="rounded-lg border border-borda px-3 py-1.5 text-xs text-suave transition hover:border-foco hover:text-texto"
                  >
                    {liberado ? "Voltar" : "Liberar"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {alunoParaMedalha && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-fundo/80 p-4 sm:items-center"
          onClick={() => setAlunoParaMedalha(null)}
        >
          <div
            className="surgir w-full max-w-md rounded-3xl border border-borda bg-superficie p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.15em] text-suave">Reconhecer</p>
            <h3 className="mt-1 text-xl font-bold">{alunoParaMedalha.nome}</h3>

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

      <section className={`mt-2 ${aba === "tarefa" ? "" : "hidden"}`}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Criar tarefa
        </h2>

        {sessao.atividade && (
          <div
            className={`mb-5 rounded-2xl border bg-superficie p-5 ${
              sessao.focoAtivo ? "border-foco/30" : "border-pausa/40"
            }`}
          >
            <p
              className={`text-xs uppercase tracking-[0.15em] ${
                sessao.focoAtivo ? "text-foco" : "text-pausa"
              }`}
            >
              {sessao.focoAtivo ? "no ar" : "aguardando o foco"} · {sessao.atividade.tipo}
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
            <p className="mb-3 text-xs uppercase tracking-[0.15em] text-suave">
              Já usadas nesta turma
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

        <div className="grid gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t.chave}
              onClick={() => setTipo(t.chave)}
              className={`rounded-2xl border p-4 text-left transition ${
                tipo === t.chave
                  ? "border-foco bg-superficie"
                  : "border-borda bg-superficie text-suave hover:border-foco/40"
              }`}
            >
              <p className="font-semibold">{t.rotulo}</p>
              <p className="mt-1 text-xs text-suave">{t.dica}</p>
            </button>
          ))}
        </div>

        <textarea
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          rows={3}
          placeholder="Ex.: revisar equações do primeiro grau com a turma"
          className="mt-4 w-full rounded-2xl border border-borda bg-superficie p-4 outline-none transition focus:border-foco"
        />
        <button
          onClick={gerarAtividade}
          disabled={ocupado || pedido.trim().length < 3}
          className="mt-3 rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo disabled:opacity-30"
        >
          {ocupado ? "Gerando..." : "Gerar atividade"}
        </button>
        {erro && <p className="mt-3 text-sm text-alerta">{erro}</p>}

        {rascunho && (
          <div className="surgir mt-5 rounded-2xl border border-borda bg-superficie p-5">
            <p className="text-lg font-semibold">{rascunho.titulo}</p>
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
                  <li key={i}>{i + 1}. {c}</li>
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

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => publicar(rascunho)}
                className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo"
              >
                Enviar para a turma
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
      </section>

      {respostas.length > 0 && (
        <section className={`mt-10 ${aba === "tarefa" ? "" : "hidden"}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-suave">
              Respostas ({respostas.length})
            </h2>
            <button
              onClick={gerarSintese}
              disabled={ocupado}
              className="rounded-xl border border-borda px-4 py-2 text-sm disabled:opacity-30"
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

          <ul className="mt-4 space-y-2">
            {!COLETIVOS.includes(sessao.atividade?.tipo ?? "") &&
            respostas.map((r) => (
              <li key={r.id} className="rounded-2xl border border-borda bg-superficie p-4">
                <p className="text-sm font-medium">{r.nome}</p>
                {r.total !== undefined && (
                  <p className="mt-1 text-sm text-foco">
                    {r.acertos} de {r.total} certas
                  </p>
                )}
                {r.texto && <p className="mt-1 text-sm text-suave">{r.texto}</p>}
                {r.respostas?.map((t, i) => (
                  <p key={i} className="mt-1 text-sm text-suave">{t}</p>
                ))}
                {r.imagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imagem} alt="" className="mt-2 w-40 rounded-xl" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`mt-2 ${aba === "lojinha" ? "" : "hidden"}`}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Lojinha da turma
        </h2>
        <p className="mb-5 text-sm text-suave">
          O aluno ganha {XP_POR_ENTREGA} XP por entrega e troca aqui. Quem cumpre a recompensa em
          sala é você — o app só registra o pedido.
        </p>

        <form onSubmit={publicarRecompensa} className="flex flex-wrap items-end gap-3">
          <label className="flex-1 text-xs text-suave">
            Recompensa
            <input
              value={novaRecompensa.titulo}
              onChange={(e) => setNovaRecompensa((n) => ({ ...n, titulo: e.target.value }))}
              placeholder="15 minutos livres"
              className="mt-1 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-foco"
            />
          </label>
          <label className="w-24 text-xs text-suave">
            Custo
            <input
              type="number"
              min={0}
              value={novaRecompensa.custo}
              onChange={(e) => setNovaRecompensa((n) => ({ ...n, custo: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-foco"
            />
          </label>
          <label className="w-20 text-xs text-suave">
            Ícone
            <input
              value={novaRecompensa.enfeite}
              onChange={(e) => setNovaRecompensa((n) => ({ ...n, enfeite: e.target.value }))}
              maxLength={2}
              className="mt-1 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-center text-base text-texto outline-none focus:border-foco"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-foco px-5 py-2.5 text-sm font-semibold text-fundo"
          >
            Publicar
          </button>
        </form>

        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {recompensas.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-3"
            >
              <span className="text-2xl" aria-hidden="true">
                {r.enfeite}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.titulo}</span>
                <span className="font-mono text-xs text-foco">{r.custo} XP</span>
              </span>
              <button
                onClick={() => removerRecompensa(r.id)}
                className="rounded-lg border border-borda px-2.5 py-1.5 text-xs text-suave transition hover:border-alerta hover:text-alerta"
                title="Tirar da lojinha"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={`mt-10 ${aba === "dashboard" ? "" : "hidden"}`}>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Como a turma chegou
        </h2>
        {totalCheckins === 0 ? (
          <p className="text-sm text-suave/70">Aguardando os primeiros check-ins.</p>
        ) : (
          <ul className="space-y-3">
            {ESTADOS.map(({ chave, rotulo }) => {
              const n = checkins[chave] ?? 0;
              return (
                <li key={chave} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-suave">{rotulo}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-alta">
                    <span
                      className="block h-full rounded-full bg-foco"
                      style={{ width: `${(n / totalCheckins) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 text-right tabular-nums text-suave">{n}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-suave/70">
          Só o total da turma existe no banco. Não há registro de humor por aluno.
        </p>
      </section>

      <section className={`mt-10 ${aba === "dashboard" ? "" : "hidden"}`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Engajamento
        </h2>
        <p className="mb-4 text-xs text-suave">
          Quem vem entregando, para você saber quem reconhecer.
        </p>
        <ol className="space-y-1.5">
          {[...alunos]
            .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))
            .map((a, posicao) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm">
                <span className="w-5 shrink-0 text-center font-mono text-xs text-suave">
                  {posicao + 1}
                </span>
                <Avatar pessoa={a} tamanho="p" />
                <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                <span className="shrink-0 font-mono text-xs text-foco">{a.xp ?? 0} XP</span>
              </li>
            ))}
        </ol>
      </section>

      <section className={`mt-2 ${aba === "desempenho" ? "" : "hidden"}`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Desempenho da turma
        </h2>
        <p className="mb-5 text-xs text-suave">
          Acertos dos quizzes já aplicados. Serve para decidir o que revisar.
        </p>
        <Desempenho alunos={alunos} respostas={respostas} atividade={sessao.atividade} />
      </section>

      <section className={`mt-2 ${aba === "medalhas" ? "" : "hidden"}`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Atribuir medalha
        </h2>
        <p className="mb-5 text-xs text-suave">
          Reconhecimento que só você vê em sala. Entrega e bom desempenho o app já dá sozinho.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {alunos.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setAlunoParaMedalha(a)}
                className="flex w-full items-center gap-3 rounded-2xl border border-borda bg-superficie p-3 text-left transition hover:border-foco"
              >
                <Avatar pessoa={a} tamanho="p" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{a.nome}</span>
                  <span className="block text-xs text-suave">
                    {(a.medalhas?.length ?? 0) === 0
                      ? "sem reconhecimento ainda"
                      : a.medalhas!.map((id) => medalhaPor(id)?.enfeite).join(" ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      </main>
    </div>
  );
}

// Acertos reais dos quizzes, não estimativa: o que a turma errou é o que
// merece revisão na próxima aula.
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
        Ainda sem quiz respondido. Aplique um quiz e os acertos da turma aparecem aqui.
      </p>
    );
  }

  const acertos = comNota.reduce((soma, r) => soma + (r.acertos ?? 0), 0);
  const total = comNota.reduce((soma, r) => soma + (r.total ?? 0), 0);
  const media = Math.round((acertos / total) * 100);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-borda bg-superficie p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-suave">
          {atividade?.titulo ?? "Último quiz"}
        </p>
        <p className="mt-2 font-mono text-4xl font-bold text-foco">{media}%</p>
        <p className="mt-1 text-xs text-suave">
          média da turma · {comNota.length} de {alunos.length} responderam
        </p>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-superficie-alta">
          <div className="bg-foco" style={{ width: `${media}%` }} />
          <div className="bg-alerta/70" style={{ width: `${100 - media}%` }} />
        </div>
      </div>

      <ul className="space-y-2">
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
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  ao,
}: {
  rotulo: string;
  valor: number;
  ao: (n: number) => void;
}) {
  return (
    <label className="flex-1 text-xs text-suave">
      {rotulo}
      <input
        type="number"
        min={1}
        max={120}
        value={valor}
        onChange={(e) => ao(Number(e.target.value) || 1)}
        className="mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-base text-texto outline-none focus:border-foco"
      />
    </label>
  );
}
