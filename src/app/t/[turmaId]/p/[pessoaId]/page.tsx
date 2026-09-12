"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import { Avatar } from "@/components/avatar";
import { VistaColetiva } from "@/components/coletivo";
import {
  ESTADOS,
  calcularCiclo,
  formatarTempo,
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

export default function PainelProfessor() {
  const { turmaId, pessoaId } = useParams<{ turmaId: string; pessoaId: string }>();

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
  const [sintese, setSintese] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const sessaoRef = useMemo(() => doc(db, "turmas", turmaId, "sessao", "atual"), [turmaId]);

  useEffect(() => {
    getDoc(doc(db, "turmas", turmaId)).then((s) => {
      setTurma({ id: s.id, ...s.data() } as Turma);
      setSalvas(((s.data()?.salvas as Atividade[]) ?? []).slice().reverse());
    });
    getDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId)).then((s) =>
      setEu({ id: s.id, ...s.data() } as Pessoa),
    );
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
    await updateDoc(sessaoRef, { focoAtivo: true, iniciadaEm: serverTimestamp(), liberados: [] });
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
        body: JSON.stringify({ pedido, tipo }),
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
    await updateDoc(sessaoRef, { atividade });

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
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center gap-4">
        <Avatar pessoa={eu} tamanho="m" />
        <div>
          <p className="text-sm text-suave">{eu.nome}</p>
          <h1 className="text-2xl font-bold">{turma.nome}</h1>
        </div>
        <span className="ml-auto rounded-xl border border-borda px-3 py-2 font-mono text-sm tracking-[0.2em] text-foco">
          {turma.codigo}
        </span>
      </header>

      <section className="rounded-3xl border border-borda bg-superficie p-6">
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

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Turma ({alunos.length})
        </h2>
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
                  <p className="truncate text-sm">{a.nome}</p>
                  <p className="text-xs text-suave">
                    {!sessao.focoAtivo ? "livre" : liberado ? "fora do foco" : "em foco"}
                    {responderam.has(a.id) && " · entregou"}
                  </p>
                </div>
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

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
          Atividade
        </h2>

        {sessao.atividade && (
          <div className="mb-5 rounded-2xl border border-foco/30 bg-superficie p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-foco">
              no ar · {sessao.atividade.tipo}
            </p>
            <p className="mt-2 text-lg font-semibold">{sessao.atividade.titulo}</p>
            <p className="mt-1 text-sm text-suave">{sessao.atividade.instrucao}</p>
            <p className="mt-3 text-sm text-suave">
              {respostas.length} de {alunos.length} entregaram
            </p>
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
        <section className="mt-10">
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

      <section className="mt-10">
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
    </main>
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
