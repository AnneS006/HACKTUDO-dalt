"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ChevronRight,
  GraduationCap,
  Plus,
  UserSquare2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { Avatar } from "@/components/avatar";
import {
  RECOMPENSAS_INICIAIS,
  codigoDeTurma,
  identificador,
  pinDaPosicao,
  type Escola,
  type Papel,
  type Pessoa,
  type Turma,
} from "@/lib/tipos";

// O aparelho do aluno guarda a turma. Ele não escolhe de novo a cada aula:
// só sai dali quem tiver o código de outra turma, que a escola fornece.
const MEMORIA = "modo-aula:turma";

const CORES = ["#5fd3a0", "#f0b05d", "#f2766b", "#9d8cf5", "#5db8f0", "#f08fb8"];

type Etapa = "escolha" | "escola" | "docente" | "turmas" | "codigo" | "pin" | "pessoas";

export default function Entrada() {
  const router = useRouter();

  const [etapa, setEtapa] = useState<Etapa>("escolha");
  const [papel, setPapel] = useState<Papel>("aluno");

  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const [escola, setEscola] = useState<Escola | null>(null);
  const [turma, setTurma] = useState<Turma | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  const [docente, setDocente] = useState({ nome: "", materia: "" });
  const [minhasTurmas, setMinhasTurmas] = useState<Turma[]>([]);
  const [nova, setNova] = useState({ nome: "", quantos: "10" });
  const [criando, setCriando] = useState(false);

  const buscarTurma = useCallback(async (procurado: string) => {
    const achadas = await getDocs(
      query(collection(db, "turmas"), where("codigo", "==", procurado.toUpperCase()), limit(1)),
    );
    const turmaEncontrada = achadas.docs[0];
    return turmaEncontrada
      ? ({ id: turmaEncontrada.id, ...turmaEncontrada.data() } as Turma)
      : null;
  }, []);

  const abrirTurma = useCallback(
    async (alvo: Turma, comoPapel: Papel) => {
      setTurma(alvo);

      const [escolasSnap, pessoasSnap] = await Promise.all([
        getDocs(collection(db, "escolas")),
        getDocs(collection(db, "turmas", alvo.id, "pessoas")),
      ]);

      setEscola(
        escolasSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Escola)
          .find((e) => e.id === alvo.escolaId) ?? null,
      );
      setPessoas(pessoasSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pessoa));
      setEtapa(comoPapel === "aluno" ? "pin" : "pessoas");
    },
    [],
  );

  // Aluno que já usou este aparelho entra direto na turma dele.
  useEffect(() => {
    const guardado = localStorage.getItem(MEMORIA);
    if (!guardado) return;

    buscarTurma(guardado).then((achada) => {
      if (!achada) return localStorage.removeItem(MEMORIA);
      setPapel("aluno");
      abrirTurma(achada, "aluno");
    });
  }, [buscarTurma, abrirTurma]);

  async function confirmarCodigoEscola() {
    setOcupado(true);
    setErro("");
    try {
      const achadas = await getDocs(
        query(collection(db, "escolas"), where("codigo", "==", codigo.trim().toUpperCase()), limit(1)),
      );
      const encontrada = achadas.docs[0];
      if (!encontrada) return setErro("Não achei nenhuma escola com esse código.");

      setEscola({ id: encontrada.id, ...encontrada.data() } as Escola);
      setCodigo("");
      setEtapa("docente");
    } finally {
      setOcupado(false);
    }
  }

  async function entrarComoDocente() {
    if (!escola || docente.nome.trim().length < 3) return;
    setOcupado(true);
    try {
      const meuId = identificador(docente.nome);

      // Só array-contains: combinar com escolaId exigiria índice composto, que
      // quebraria em produção sem ninguém perceber no build.
      const achadas = await getDocs(
        query(collection(db, "turmas"), where("professorIds", "array-contains", meuId)),
      );

      setMinhasTurmas(
        achadas.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Turma)
          .filter((t) => t.escolaId === escola.id),
      );
      setEtapa("turmas");
    } finally {
      setOcupado(false);
    }
  }

  // Cria a turma e já gera um perfil com PIN para cada aluno: ninguém precisa
  // se cadastrar nem ter e-mail.
  async function criarTurma() {
    if (!escola || nova.nome.trim().length < 2) return;
    setOcupado(true);

    try {
      const quantos = Math.min(40, Math.max(1, Number(nova.quantos) || 10));
      const meuId = identificador(docente.nome);
      const turmaId = `${escola.id}-${identificador(nova.nome)}-${Date.now().toString(36)}`;
      const codigoNovo = codigoDeTurma(nova.nome);

      const lote = writeBatch(db);

      lote.set(doc(db, "turmas", turmaId), {
        escolaId: escola.id,
        nome: nova.nome.trim(),
        codigo: codigoNovo,
        professorIds: [meuId],
        periodoMin: 50,
        focoMin: 12,
        pausaMin: 3,
        recompensas: RECOMPENSAS_INICIAIS,
      });

      lote.set(doc(db, "turmas", turmaId, "sessao", "atual"), {
        atividade: null,
        focoAtivo: false,
        iniciadaEm: null,
        publicadaEm: null,
        focoMin: 12,
        pausaMin: 3,
        liberados: [],
        checkins: {},
      });

      lote.set(doc(db, "turmas", turmaId, "pessoas", meuId), {
        nome: docente.nome.trim(),
        papel: "professor",
        materia: docente.materia.trim(),
        cor: CORES[0],
      });

      for (let posicao = 0; posicao < quantos; posicao += 1) {
        const numero = String(posicao + 1).padStart(2, "0");
        lote.set(doc(db, "turmas", turmaId, "pessoas", `aluno-${numero}`), {
          nome: `Estudante ${numero}`,
          papel: "aluno",
          pin: pinDaPosicao(posicao),
          cor: CORES[posicao % CORES.length],
          entregas: 0,
          xp: 0,
          medalhas: [],
        });
      }

      await lote.commit();
      router.push(`/t/${turmaId}/p/${meuId}`);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarCodigoTurma() {
    setOcupado(true);
    setErro("");
    try {
      const achada = await buscarTurma(codigo);
      if (!achada) return setErro("Não achei nenhuma turma com esse código.");
      localStorage.setItem(MEMORIA, achada.codigo);
      await abrirTurma(achada, "aluno");
    } finally {
      setOcupado(false);
    }
  }

  function entrar(pessoa: Pessoa) {
    router.push(`/t/${turma!.id}/${pessoa.papel === "professor" ? "p" : "a"}/${pessoa.id}`);
  }

  function confirmarPin() {
    const aluno = pessoas.find((p) => p.papel === "aluno" && p.pin === pin.trim());
    if (!aluno) return setErro("PIN não confere. Confirme com quem dá a aula.");
    entrar(aluno);
  }

  function voltarAoInicio() {
    setEtapa("escolha");
    setCodigo("");
    setPin("");
    setErro("");
    setTurma(null);
    setEscola(null);
    setPessoas([]);
    setCriando(false);
  }

  if (etapa === "escolha") {
    return (
      <Moldura>
        <div className="surgir text-center">
          <span className="inline-flex rounded-3xl border border-foco/20 bg-foco/10 p-5 text-foco">
            <GraduationCap size={36} strokeWidth={1.75} aria-hidden="true" />
          </span>

          <h1 className="mt-7 text-4xl font-extrabold sm:text-5xl">Modo Aula DALT</h1>
          <p className="mt-3 text-lg text-suave">Ambiente interativo e gamificado</p>

          <div className="mt-12 grid gap-4 text-left">
            <Porta
              icone={UserSquare2}
              titulo="Sou professor(a)"
              descricao="Acessar com o código da escola"
              aoClicar={() => {
                setPapel("professor");
                setEtapa("escola");
              }}
            />
            <Porta
              icone={Users}
              titulo="Sou aluno(a)"
              descricao="Entrar com o código da turma e o seu PIN"
              aoClicar={() => {
                setPapel("aluno");
                setEtapa("codigo");
              }}
            />
          </div>

          <ul className="mt-14 space-y-3 text-left text-sm leading-relaxed text-suave">
            {[
              "Sem cadastro e sem e-mail: seu acesso é um código que a escola entrega.",
              "O que você sente no check-in vira número da turma, nunca registro seu.",
              "Funciona em qualquer celular, mesmo com internet fraca.",
            ].map((fato) => (
              <li key={fato} className="flex gap-3">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foco" />
                {fato}
              </li>
            ))}
          </ul>
        </div>
      </Moldura>
    );
  }

  if (etapa === "escola" || etapa === "codigo") {
    const daEscola = etapa === "escola";
    return (
      <Moldura>
        <div className="surgir w-full max-w-sm">
          <button onClick={voltarAoInicio} className="text-sm text-suave hover:text-texto">
            voltar
          </button>

          <h1 className="mt-6 text-3xl font-bold">
            {daEscola ? "Código da escola" : "Código da turma"}
          </h1>
          <p className="mt-3 text-suave">
            {daEscola
              ? "O código institucional que a secretaria da escola entrega."
              : "O código que está no quadro, passado por quem dá a aula."}
          </p>

          <input
            value={codigo}
            onChange={(e) => {
              setCodigo(e.target.value.toUpperCase().slice(0, 10));
              setErro("");
            }}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              codigo.length >= 4 &&
              (daEscola ? confirmarCodigoEscola() : confirmarCodigoTurma())
            }
            placeholder={daEscola ? "ESC-8842" : "9AML"}
            autoFocus
            className="mt-8 w-full rounded-2xl border border-borda bg-superficie px-6 py-5 text-center font-mono text-2xl tracking-[0.25em] outline-none transition focus:border-foco"
          />

          {erro && <p className="mt-4 text-sm text-alerta">{erro}</p>}

          <button
            onClick={daEscola ? confirmarCodigoEscola : confirmarCodigoTurma}
            disabled={ocupado || codigo.trim().length < 4}
            className="mt-5 w-full rounded-2xl bg-foco px-6 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
          >
            {ocupado ? "Procurando..." : "Entrar"}
          </button>

          <p className="mt-8 border-t border-borda pt-5 text-xs leading-relaxed text-suave">
            {daEscola ? (
              <>
                Escola de demonstração: <span className="font-mono text-foco">ESC-8842</span>
              </>
            ) : (
              <>
                Turmas de demonstração: <span className="font-mono text-foco">9AML</span>,{" "}
                <span className="font-mono text-foco">9BML</span> e{" "}
                <span className="font-mono text-foco">8ACA</span>
              </>
            )}
          </p>
        </div>
      </Moldura>
    );
  }

  if (etapa === "docente") {
    return (
      <Moldura>
        <div className="surgir w-full max-w-sm">
          <button onClick={voltarAoInicio} className="text-sm text-suave hover:text-texto">
            voltar
          </button>

          <p className="mt-6 text-sm text-suave">{escola?.nome}</p>
          <h1 className="mt-1 text-3xl font-bold">Quem é você?</h1>
          <p className="mt-3 text-suave">
            Seu nome identifica suas turmas. Não há senha nem e-mail.
          </p>

          <label className="mt-8 block text-xs text-suave">
            Seu nome
            <input
              value={docente.nome}
              onChange={(e) => setDocente((d) => ({ ...d, nome: e.target.value }))}
              placeholder="Marina Duarte"
              autoFocus
              className="mt-1 w-full rounded-2xl border border-borda bg-superficie px-5 py-4 text-base text-texto outline-none focus:border-foco"
            />
          </label>

          <label className="mt-4 block text-xs text-suave">
            Disciplina
            <input
              value={docente.materia}
              onChange={(e) => setDocente((d) => ({ ...d, materia: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && entrarComoDocente()}
              placeholder="Matemática"
              className="mt-1 w-full rounded-2xl border border-borda bg-superficie px-5 py-4 text-base text-texto outline-none focus:border-foco"
            />
          </label>

          <button
            onClick={entrarComoDocente}
            disabled={ocupado || docente.nome.trim().length < 3}
            className="mt-6 w-full rounded-2xl bg-foco px-6 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
          >
            {ocupado ? "Procurando..." : "Continuar"}
          </button>

          <p className="mt-8 border-t border-borda pt-5 text-xs leading-relaxed text-suave">
            Para ver as turmas já prontas da demonstração, entre como{" "}
            <span className="text-foco">Marina Duarte</span>.
          </p>
        </div>
      </Moldura>
    );
  }

  if (etapa === "turmas") {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-14">
        <header className="surgir mb-10">
          <button onClick={voltarAoInicio} className="text-sm text-suave hover:text-texto">
            voltar
          </button>
          <p className="mt-6 text-sm text-suave">{escola?.nome}</p>
          <h1 className="mt-1 font-titulo text-3xl font-bold">Suas turmas</h1>
          <p className="mt-2 text-sm text-suave">
            {docente.nome}
            {docente.materia && ` · ${docente.materia}`}
          </p>
        </header>

        {minhasTurmas.length > 0 && (
          <ul className="surgir mb-4 grid gap-3">
            {minhasTurmas.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => router.push(`/t/${t.id}/p/${identificador(docente.nome)}`)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-borda bg-superficie p-5 text-left transition hover:border-foco"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-titulo text-lg font-semibold">{t.nome}</span>
                    <span className="font-mono text-sm tracking-[0.15em] text-foco">{t.codigo}</span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-suave" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {criando ? (
          <div className="surgir rounded-2xl border border-borda bg-superficie p-5">
            <p className="font-titulo text-lg font-semibold">Nova turma</p>
            <p className="mt-1 text-xs text-suave">
              O app gera o código da turma e um PIN para cada aluno. Ninguém cria conta.
            </p>

            <label className="mt-5 block text-xs text-suave">
              Nome da turma
              <input
                value={nova.nome}
                onChange={(e) => setNova((n) => ({ ...n, nome: e.target.value }))}
                placeholder="9º ano C"
                autoFocus
                className="mt-1 w-full rounded-xl border border-borda bg-fundo px-4 py-3 text-base text-texto outline-none focus:border-foco"
              />
            </label>

            <label className="mt-4 block text-xs text-suave">
              Quantos alunos
              <input
                type="number"
                min={1}
                max={40}
                value={nova.quantos}
                onChange={(e) => setNova((n) => ({ ...n, quantos: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-borda bg-fundo px-4 py-3 text-base text-texto outline-none focus:border-foco"
              />
            </label>

            <div className="mt-5 flex gap-3">
              <button
                onClick={criarTurma}
                disabled={ocupado || nova.nome.trim().length < 2}
                className="flex-1 rounded-xl bg-foco px-5 py-3 font-semibold text-fundo disabled:opacity-30"
              >
                {ocupado ? "Criando..." : "Criar turma"}
              </button>
              <button
                onClick={() => setCriando(false)}
                className="rounded-xl border border-borda px-5 py-3 text-sm text-suave"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCriando(true)}
            className="surgir flex w-full items-center gap-3 rounded-2xl border border-dashed border-borda p-5 text-left text-suave transition hover:border-foco hover:text-texto"
          >
            <Plus size={20} aria-hidden="true" />
            Criar nova turma
          </button>
        )}
      </main>
    );
  }

  if (etapa === "pin") {
    return (
      <Moldura>
        <div className="surgir w-full max-w-sm">
          <button
            onClick={() => {
              setEtapa("codigo");
              setPin("");
              setErro("");
            }}
            className="text-sm text-suave hover:text-texto"
          >
            voltar
          </button>

          <p className="mt-6 text-sm text-suave">{escola?.nome}</p>
          <h1 className="mt-1 text-3xl font-bold">{turma?.nome}</h1>
          <p className="mt-3 text-suave">
            Digite o seu PIN pessoal, o de quatro dígitos que a escola te entregou.
          </p>

          <input
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setErro("");
            }}
            onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && confirmarPin()}
            inputMode="numeric"
            placeholder="0000"
            autoFocus
            className="mt-8 w-full rounded-2xl border border-borda bg-superficie px-6 py-5 text-center font-mono text-3xl tracking-[0.5em] outline-none transition focus:border-foco"
          />

          {erro && <p className="mt-4 text-sm text-alerta">{erro}</p>}

          <button
            onClick={confirmarPin}
            disabled={pin.length < 4}
            className="mt-5 w-full rounded-2xl bg-foco px-6 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
          >
            Entrar
          </button>

          <p className="mt-8 border-t border-borda pt-5 text-xs leading-relaxed text-suave">
            Turma de demonstração: os PINs são <span className="font-mono text-foco">0101</span>,{" "}
            <span className="font-mono text-foco">0202</span>,{" "}
            <span className="font-mono text-foco">0303</span> e assim por diante.
          </p>
        </div>
      </Moldura>
    );
  }

  const professores = pessoas.filter((p) => p.papel === "professor");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <header className="surgir mb-10">
        <p className="text-sm text-suave">{escola?.nome}</p>
        <h1 className="mt-1 font-titulo text-3xl font-bold">{turma?.nome}</h1>
        <p className="mt-2 font-mono text-sm tracking-[0.25em] text-foco">{turma?.codigo}</p>
      </header>

      <h2 className="mb-5 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
        Quem está dando esta aula?
      </h2>

      <ul className="surgir grid grid-cols-2 gap-3 sm:grid-cols-3">
        {professores.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => entrar(p)}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border border-borda bg-superficie p-5 text-center transition hover:border-foco"
            >
              <Avatar pessoa={p} tamanho="g" />
              <span className="text-sm leading-tight">{p.nome}</span>
            </button>
          </li>
        ))}
      </ul>

      <button onClick={voltarAoInicio} className="mt-12 text-sm text-suave hover:text-texto">
        Não é você?
      </button>
    </main>
  );
}

function Porta({
  icone: Icone,
  titulo,
  descricao,
  aoClicar,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  aoClicar: () => void;
}) {
  return (
    <button
      onClick={aoClicar}
      className="group flex items-center gap-4 rounded-2xl border border-borda bg-superficie p-5 text-left transition hover:border-foco/50 hover:bg-superficie-alta"
    >
      <span className="rounded-xl bg-foco/10 p-3 text-foco">
        <Icone size={24} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-titulo text-lg font-semibold transition group-hover:text-foco">
          {titulo}
        </span>
        <span className="block text-sm text-suave">{descricao}</span>
      </span>
      <ChevronRight
        size={20}
        className="shrink-0 text-suave/60 transition group-hover:text-foco"
        aria-hidden="true"
      />
    </button>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="ambiente mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-14">
      {children}
    </main>
  );
}
