"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BookOpen,
  Check,
  ListChecks,
  Lock,
  LogOut,
  PieChart,
  ShoppingBag,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Camera } from "@/components/camera";
import { destravarNativo, temCascaNativa, travarNativo } from "@/lib/foco-nativo";
import { GavetaFerramentas } from "@/components/ferramentas";
import { VistaColetiva } from "@/components/coletivo";
import {
  CONVITES_DE_PAUSA,
  ENFEITES,
  ESTADOS,
  RECOMPENSAS_INICIAIS,
  calcularCiclo,
  xpDaEntrega,
  chaveDeMateria,
  formatarTempo,
  medalhaPor,
  type Recompensa,
  type Atividade,
  type Estado,
  type Pessoa,
  type Resposta,
  type Sessao,
  type Turma,
} from "@/lib/tipos";

// Tipos em que o valor está no conjunto: depois de responder, o aluno vê a turma.
const COLETIVOS = ["enquete", "nuvem", "coletiva"];

export default function TelaDoAluno() {
  const { turmaId, pessoaId } = useParams<{ turmaId: string; pessoaId: string }>();
  const router = useRouter();

  const [turma, setTurma] = useState<Turma | null>(null);
  const [eu, setEu] = useState<Pessoa | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const [checkinFeito, setCheckinFeito] = useState(false);
  const [travado, setTravado] = useState(false);
  const [foraDoFoco, setForaDoFoco] = useState(false);
  const trava = useRef<WakeLockSentinel | null>(null);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [colegas, setColegas] = useState<Pessoa[]>([]);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [entregue, setEntregue] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const sessaoRef = useMemo(() => doc(db, "turmas", turmaId, "sessao", "atual"), [turmaId]);

  // O celular mata aba em segundo plano o tempo todo. Sem marcar no aparelho
  // qual aula ja foi respondida, recarregar soma o check-in de novo e o
  // termometro da turma passa a mentir.
  const chaveCheckin = sessao?.iniciadaEm
    ? `modo-aula:checkin:${turmaId}:${sessao.iniciadaEm.getTime()}`
    : null;

  useEffect(() => {
    getDoc(doc(db, "turmas", turmaId)).then((s) => {
      setTurma({ id: s.id, ...s.data() } as Turma);
      setRecompensas((s.data()?.recompensas as Recompensa[]) ?? RECOMPENSAS_INICIAIS);
    });
    getDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId)).then((s) =>
      setEu({ id: s.id, ...s.data() } as Pessoa),
    );
  }, [turmaId, pessoaId]);

  // Só carrega a turma inteira quando o aluno está parado, esperando a aula:
  // durante o foco isso não tem uso e só gastaria dados dele.
  const paradoEsperando = !sessao?.focoAtivo || Boolean(sessao?.liberados.includes(pessoaId));

  useEffect(() => {
    if (!paradoEsperando) return;
    getDocs(collection(db, "turmas", turmaId, "pessoas")).then((s) =>
      setColegas(
        s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pessoa).filter((p) => p.papel === "aluno"),
      ),
    );
  }, [turmaId, paradoEsperando]);

  useEffect(() => {
    return onSnapshot(sessaoRef, (s) => {
      const d = s.data();
      if (!d) return;
      const nova: Sessao = {
        atividade: (d.atividade as Atividade) ?? null,
        focoAtivo: Boolean(d.focoAtivo),
        iniciadaEm: d.iniciadaEm?.toDate?.() ?? null,
        focoMin: d.focoMin ?? 10,
        pausaMin: d.pausaMin ?? 3,
        liberados: (d.liberados as string[]) ?? [],
        publicadaEm: d.publicadaEm?.toDate?.() ?? null,
        materia: (d.materia as string) ?? "",
      };
      setSessao((antiga) => {
        if (antiga?.focoAtivo && !nova.focoAtivo) {
          setCheckinFeito(false);
          setTravado(false);
        }
        if (antiga?.publicadaEm?.getTime() !== nova.publicadaEm?.getTime()) {
          setEntregue(false);
          setFeedback("");
        }
        return nova;
      });
    });
  }, [sessaoRef]);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (chaveCheckin && localStorage.getItem(chaveCheckin)) setCheckinFeito(true);
  }, [chaveCheckin]);

  const tipoAtual = sessao?.atividade?.tipo;
  const rodadaAtual = sessao?.publicadaEm?.getTime();

  // Recarregar nao pode devolver a atividade para quem ja entregou: no quiz,
  // isso seria refazer a prova sabendo as respostas.
  useEffect(() => {
    if (!rodadaAtual) return;
    getDoc(doc(sessaoRef, "respostas", pessoaId)).then((s) => {
      if (s.exists()) setEntregue(true);
    });
  }, [sessaoRef, pessoaId, rodadaAtual]);

  useEffect(() => {
    if (!tipoAtual || !COLETIVOS.includes(tipoAtual)) return;
    return onSnapshot(collection(sessaoRef, "respostas"), (s) =>
      setRespostas(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Resposta)),
    );
  }, [sessaoRef, tipoAtual]);

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

  const convite = useMemo(
    () => CONVITES_DE_PAUSA[Math.floor(agora.getTime() / 60000) % CONVITES_DE_PAUSA.length],
    [agora],
  );

  // Com a casca Android instalada, o sistema prende o aparelho no app de
  // verdade. No navegador o máximo é tela cheia, e o toque no botão é exigência
  // dele: nenhum site entra em tela cheia sem gesto do usuário.
  const entrarEmFoco = useCallback(async () => {
    const nativo = await travarNativo();

    if (!nativo?.travado) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      } catch {}
    }

    try {
      trava.current = await navigator.wakeLock?.request("screen");
    } catch {}

    setTravado(true);
    setForaDoFoco(false);
  }, []);

  const soltarFoco = useCallback(async () => {
    await destravarNativo();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
    try {
      await trava.current?.release();
    } catch {}
    trava.current = null;
    setForaDoFoco(false);
  }, []);

  const emFoco = Boolean(sessao?.focoAtivo) && !sessao?.liberados.includes(pessoaId);

  useEffect(() => {
    if (!emFoco) {
      setTravado(false);
      soltarFoco();
    }
  }, [emFoco, soltarFoco]);

  useEffect(() => {
    if (!travado) return;

    const saiuDaTelaCheia = () => {
      if (!document.fullscreenElement) setForaDoFoco(true);
    };
    const trocouDeApp = () => {
      if (document.visibilityState === "hidden") setForaDoFoco(true);
    };

    document.addEventListener("fullscreenchange", saiuDaTelaCheia);
    document.addEventListener("visibilitychange", trocouDeApp);
    return () => {
      document.removeEventListener("fullscreenchange", saiuDaTelaCheia);
      document.removeEventListener("visibilitychange", trocouDeApp);
    };
  }, [travado]);

  useEffect(() => {
    return () => {
      soltarFoco();
    };
  }, [soltarFoco]);

  async function resgatar(recompensa: Recompensa) {
    if (!eu || (eu.xp ?? 0) < recompensa.custo) return;

    setEu((p) =>
      p
        ? { ...p, xp: (p.xp ?? 0) - recompensa.custo, resgates: [...(p.resgates ?? []), recompensa.titulo] }
        : p,
    );
    await updateDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId), {
      xp: increment(-recompensa.custo),
      resgates: arrayUnion(recompensa.titulo),
    });
  }

  // Sair tem que sair de verdade: sem limpar a turma guardada no aparelho, a
  // tela inicial reconhecia o aluno e o devolvia direto para o PIN.
  function sairDaSessao() {
    localStorage.removeItem("modo-aula:turma");
    router.push("/");
  }

  async function equiparEnfeite(enfeite: string) {
    const novo = eu?.enfeite === enfeite ? "" : enfeite;
    setEu((p) => (p ? { ...p, enfeite: novo } : p));
    await updateDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId), { enfeite: novo });
  }

  async function registrarCheckin(estado: Estado | null) {
    setCheckinFeito(true);
    if (chaveCheckin) localStorage.setItem(chaveCheckin, "1");
    if (estado) await updateDoc(sessaoRef, { [`checkins.${estado}`]: increment(1) });
  }

  async function enviar(dados: {
    texto?: string;
    imagem?: string;
    respostas?: string[];
    acertos?: number;
    total?: number;
    opcao?: number;
    palavras?: string[];
    peca?: string;
  }) {
    if (!eu || !sessao?.atividade) return;
    setOcupado(true);

    setDoc(doc(sessaoRef, "respostas", pessoaId), {
      pessoaId,
      nome: eu.nome,
      tipo: sessao.atividade.tipo,
      ...(sessao.materia ? { materia: sessao.materia } : {}),
      ...dados,
      criadaEm: serverTimestamp(),
    }).catch((e) => console.error("entrega pendente de sincronização", e));

    // Conta o percurso do aluno: entregas liberam enfeite, XP compra recompensa.
    const ganho = xpDaEntrega(dados.acertos, dados.total, sessao.atividade.xp);
    const entregasAgora = (eu.entregas ?? 0) + 1;

    // Medalhas que o app dá sozinho, por fato registrado.
    const automaticas: string[] = [];
    if (entregasAgora >= 5) automaticas.push("assiduo");
    if (dados.total && (dados.acertos ?? 0) / dados.total >= 0.8) automaticas.push("desempenho");

    const novas = automaticas.filter((id) => !eu.medalhas?.includes(id));

    updateDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId), {
      entregas: increment(1),
      xp: increment(ganho),
      [`porMateria.${chaveDeMateria(sessao.materia ?? "")}`]: increment(1),
      ...(novas.length ? { medalhas: arrayUnion(...novas) } : {}),
    })
      .then(() =>
        setEu((p) =>
          p
            ? {
                ...p,
                entregas: entregasAgora,
                xp: (p.xp ?? 0) + ganho,
                medalhas: [...(p.medalhas ?? []), ...novas],
              }
            : p,
        ),
      )
      .catch((e) => console.error("contagem de entrega pendente", e));

    if (dados.texto || dados.respostas?.length) {
      try {
        const r = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            atividade: sessao.atividade,
            texto: dados.texto ?? dados.respostas?.join(" | "),
            imagem: dados.imagem,
          }),
        });
        setFeedback((await r.json()).feedback ?? "");
      } catch {
        setFeedback("");
      }
    }

    setOcupado(false);
    setEntregue(true);
  }

  if (!turma || !eu || !sessao) return <Centro><p className="text-suave">Carregando...</p></Centro>;

  const liberado = sessao.liberados.includes(pessoaId);

  // O menu só existe fora do foco. Quando a aula abre, o app toma a tela e
  // navegação nenhuma sobrevive — é esse o ponto do produto.
  if (!sessao.focoAtivo || liberado) {
    return (
      <PainelDoAluno
        eu={eu}
        turma={turma}
        liberado={liberado}
        focoAtivo={sessao.focoAtivo}
        colegas={colegas}
        recompensas={recompensas}
        aoEquipar={equiparEnfeite}
        aoResgatar={resgatar}
        aoSair={sairDaSessao}
      />
    );
  }

  if (!checkinFeito) {
    return (
      <Centro>
        <h1 className="text-2xl font-bold">Como você chega para esta aula?</h1>
        <p className="mt-3 text-sm text-suave">
          Ninguém vê a sua resposta. Só aparece o total da turma.
        </p>
        <div className="mt-8 grid w-full gap-3">
          {ESTADOS.map(({ chave, rotulo }) => (
            <button
              key={chave}
              onClick={() => registrarCheckin(chave)}
              className="rounded-2xl border border-borda bg-superficie px-5 py-4 text-lg transition hover:border-foco"
            >
              {rotulo}
            </button>
          ))}
          <button onClick={() => registrarCheckin(null)} className="py-2 text-sm text-suave">
            Prefiro não responder
          </button>
        </div>
      </Centro>
    );
  }

  if (!travado) {
    return (
      <Centro>
        <h1 className="text-3xl font-bold">A aula foi aberta</h1>
        <p className="mt-4 leading-relaxed text-suave">
          Ao entrar, o Modo Aula ocupa a tela inteira e ela não apaga enquanto a aula durar. Sai
          sozinho quando a aula for encerrada.
        </p>
        <p className="mt-5 text-sm text-suave/70">
          Tudo que a atividade pede acontece aqui dentro, câmera inclusive.
        </p>
        <button
          onClick={entrarEmFoco}
          className="mt-10 w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo"
        >
          Entrar no foco
        </button>
        {/* Com a casca nativa quem trava é o sistema, então não faz sentido
            pedir ao aluno o gesto manual. */}
        {!temCascaNativa() && (
          <p className="mt-6 text-xs leading-relaxed text-suave/60">
            Para travar de vez no aparelho: {instrucaoDeTravar()}
          </p>
        )}

        {/* Antes de entrar no foco ainda dá para sair. Depois de entrar, não:
            seria uma porta de fuga dentro do próprio modo foco. */}
        <button
          onClick={sairDaSessao}
          className="mt-8 text-sm text-suave underline-offset-4 hover:underline"
        >
          Não é você? Sair
        </button>
      </Centro>
    );
  }

  if (foraDoFoco) {
    return (
      <Centro>
        <p className="text-sm uppercase tracking-[0.2em] text-pausa">Você saiu do Modo Aula</p>
        <h1 className="mt-6 text-3xl font-bold">A aula ainda está acontecendo</h1>
        <p className="mt-4 text-suave">
          Ninguém foi avisado. É só voltar quando quiser continuar.
        </p>
        <button
          onClick={entrarEmFoco}
          className="mt-10 w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo"
        >
          Voltar ao foco
        </button>
      </Centro>
    );
  }

  // A pausa cobre a tela em vez de substituí-la: trocar de tela desmontaria a
  // atividade, e o aluno voltaria da pausa na pergunta 1 de um quiz que já
  // estava na 4.
  const pausa =
    ciclo.fase === "pausa" ? (
      <div className="surgir fixed inset-0 z-50 flex flex-col items-center justify-center bg-fundo px-6 text-center">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-pausa">Pausa</p>
        <p className="respirar mt-6 font-mono text-7xl font-bold tabular-nums text-pausa">
          {formatarTempo(ciclo.restanteSeg)}
        </p>
        <p className="mt-8 max-w-xs text-2xl leading-snug">{convite}</p>
        <p className="mt-8 text-sm text-suave">Guarda o celular até a aula voltar.</p>
      </div>
    ) : null;

  if (entregue && sessao.atividade && COLETIVOS.includes(sessao.atividade.tipo)) {
    return (
      <>
        <main className="mx-auto w-full max-w-lg px-5 py-8">
          <p className="text-xs uppercase tracking-[0.2em] text-foco">A turma até agora</p>
          <h1 className="mt-2 text-2xl font-bold">{sessao.atividade.titulo}</h1>
          <div className="mt-8">
            <VistaColetiva atividade={sessao.atividade} respostas={respostas} />
          </div>
        </main>
        {pausa}
      </>
    );
  }

  if (entregue) {
    return (
      <>
        <Centro>
          <p className="text-sm uppercase tracking-[0.2em] text-foco">Entregue</p>
          {feedback && <p className="mt-6 text-lg leading-relaxed">{feedback}</p>}
          <p className="mt-8 text-suave">Espere a próxima atividade da aula.</p>
        </Centro>
        {pausa}
      </>
    );
  }

  if (!sessao.atividade) {
    return (
      <>
        <Centro>
          <p className="font-mono text-4xl font-bold tabular-nums text-foco">
            {formatarTempo(ciclo.restanteSeg)}
          </p>
          <h1 className="mt-6 text-2xl font-bold">Modo aula ligado</h1>
          <p className="mt-3 text-suave">A atividade ainda não foi enviada.</p>
        </Centro>
        {pausa}
      </>
    );
  }

  return (
    <>
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 pt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-foco">Foco</span>
        <span className="font-mono text-lg tabular-nums text-suave">
          {formatarTempo(ciclo.restanteSeg)}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-superficie-alta">
        <div
          className="h-full rounded-full bg-foco transition-[width] duration-1000 ease-linear"
          style={{
            width: `${Math.min(100, (1 - ciclo.restanteSeg / Math.max(1, sessao.focoMin * 60)) * 100)}%`,
          }}
        />
      </div>

      <h1 className="mt-8 text-2xl font-bold">{sessao.atividade.titulo}</h1>
      <p className="mt-3 text-lg leading-relaxed text-texto/85">{sessao.atividade.instrucao}</p>

      <div className="mt-8 flex-1">
        {sessao.atividade.tipo === "quiz" && (
          <Quiz atividade={sessao.atividade} ocupado={ocupado} aoEnviar={enviar} />
        )}
        {sessao.atividade.tipo === "formulario" && (
          <Formulario atividade={sessao.atividade} ocupado={ocupado} aoEnviar={enviar} />
        )}
        {sessao.atividade.tipo === "entrega" && (
          <Entrega atividade={sessao.atividade} ocupado={ocupado} aoEnviar={enviar} />
        )}
        {sessao.atividade.tipo === "enquete" && (
          <Enquete atividade={sessao.atividade} ocupado={ocupado} aoEnviar={enviar} />
        )}
        {sessao.atividade.tipo === "nuvem" && (
          <Nuvem atividade={sessao.atividade} ocupado={ocupado} aoEnviar={enviar} />
        )}
        {sessao.atividade.tipo === "coletiva" && (
          <Coletiva ocupado={ocupado} aoEnviar={enviar} />
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Tutor atividade={sessao.atividade} />
        <GavetaFerramentas
          disponiveis={sessao.atividade.ferramentas ?? []}
          duracaoMin={sessao.atividade.duracaoMin}
        />
      </div>
    </main>
    {pausa}
    </>
  );
}

type AoEnviar = (d: {
  texto?: string;
  imagem?: string;
  respostas?: string[];
  acertos?: number;
  total?: number;
  opcao?: number;
  palavras?: string[];
  peca?: string;
}) => void;

function Quiz({
  atividade,
  ocupado,
  aoEnviar,
}: {
  atividade: Atividade;
  ocupado: boolean;
  aoEnviar: AoEnviar;
}) {
  const perguntas = atividade.perguntas ?? [];
  const [indice, setIndice] = useState(0);
  const [escolhas, setEscolhas] = useState<number[]>([]);
  const [escolhida, setEscolhida] = useState<number | null>(null);

  const pergunta = perguntas[indice];
  if (!pergunta) return null;

  function responder(opcao: number) {
    if (escolhida !== null) return;
    setEscolhida(opcao);

    const novas = [...escolhas, opcao];
    setEscolhas(novas);

    setTimeout(() => {
      if (indice + 1 < perguntas.length) {
        setIndice(indice + 1);
        setEscolhida(null);
        return;
      }
      const acertos = novas.filter((e, i) => e === perguntas[i].correta).length;
      aoEnviar({ acertos, total: perguntas.length, respostas: novas.map(String) });
    }, 900);
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-suave">
        Pergunta {indice + 1} de {perguntas.length}
      </p>
      <p className="mt-3 text-xl leading-snug">{pergunta.enunciado}</p>

      <ul className="mt-6 space-y-3">
        {pergunta.alternativas.map((alt, i) => {
          const certa = i === pergunta.correta;
          const revelado = escolhida !== null;
          const cor = !revelado
            ? "border-borda bg-superficie"
            : certa
              ? "border-foco bg-foco/10 text-foco"
              : i === escolhida
                ? "border-alerta bg-alerta/10 text-alerta"
                : "border-borda bg-superficie opacity-40";
          return (
            <li key={i}>
              <button
                onClick={() => responder(i)}
                disabled={revelado || ocupado}
                className={`w-full rounded-2xl border px-5 py-4 text-left text-base transition ${cor}`}
              >
                {alt}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Formulario({
  atividade,
  ocupado,
  aoEnviar,
}: {
  atividade: Atividade;
  ocupado: boolean;
  aoEnviar: AoEnviar;
}) {
  const campos = atividade.campos ?? [];
  const [valores, setValores] = useState<string[]>(() => campos.map(() => ""));

  return (
    <div className="space-y-5">
      {campos.map((campo, i) => (
        <label key={i} className="block">
          <span className="text-sm text-suave">{campo}</span>
          <textarea
            value={valores[i]}
            onChange={(e) =>
              setValores((v) => v.map((atual, j) => (j === i ? e.target.value : atual)))
            }
            rows={3}
            className="mt-2 w-full rounded-2xl border border-borda bg-superficie p-4 outline-none transition focus:border-foco"
          />
        </label>
      ))}
      <button
        onClick={() => aoEnviar({ respostas: valores })}
        disabled={ocupado || valores.every((v) => !v.trim())}
        className="w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo disabled:opacity-30"
      >
        {ocupado ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}

function Entrega({
  atividade,
  ocupado,
  aoEnviar,
}: {
  atividade: Atividade;
  ocupado: boolean;
  aoEnviar: AoEnviar;
}) {
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState("");
  const [dadosBaixos, setDadosBaixos] = useState(false);
  const pedeFoto = atividade.tipoResposta === "foto" && !dadosBaixos;

  return (
    <div className="space-y-4">
      {pedeFoto &&
        (imagem ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagem} alt="Sua resposta" className="w-full rounded-2xl" />
            <button
              onClick={() => setImagem("")}
              className="mt-3 w-full rounded-2xl border border-borda py-3 text-sm text-suave"
            >
              Tirar outra
            </button>
          </div>
        ) : (
          <Camera aoCapturar={setImagem} />
        ))}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={pedeFoto ? 3 : 6}
        placeholder={pedeFoto ? "Explique em uma frase" : "Escreva sua resposta"}
        className="w-full rounded-2xl border border-borda bg-superficie p-4 outline-none transition focus:border-foco"
      />

      <label className="flex items-center gap-2 text-sm text-suave">
        <input
          type="checkbox"
          checked={dadosBaixos}
          onChange={(e) => setDadosBaixos(e.target.checked)}
          className="accent-foco"
        />
        Estou com pouca internet (responder só por texto)
      </label>

      <button
        onClick={() => aoEnviar({ texto, imagem: dadosBaixos ? undefined : imagem })}
        disabled={ocupado || (!texto.trim() && !imagem)}
        className="w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo disabled:opacity-30"
      >
        {ocupado ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}

function Enquete({
  atividade,
  ocupado,
  aoEnviar,
}: {
  atividade: Atividade;
  ocupado: boolean;
  aoEnviar: AoEnviar;
}) {
  return (
    <ul className="space-y-3">
      {(atividade.opcoes ?? []).map((opcao, i) => (
        <li key={i}>
          <button
            onClick={() => aoEnviar({ opcao: i })}
            disabled={ocupado}
            className="w-full rounded-2xl border border-borda bg-superficie px-5 py-4 text-left text-base transition hover:border-foco disabled:opacity-40"
          >
            {opcao}
          </button>
        </li>
      ))}
      <li className="pt-2 text-xs text-suave">Não tem resposta certa. É pra turma se enxergar.</li>
    </ul>
  );
}

function Nuvem({
  atividade,
  ocupado,
  aoEnviar,
}: {
  atividade: Atividade;
  ocupado: boolean;
  aoEnviar: AoEnviar;
}) {
  const quantas = Math.min(3, Math.max(1, atividade.palavrasPedidas ?? 1));
  const [palavras, setPalavras] = useState<string[]>(() => Array(quantas).fill(""));

  return (
    <div className="space-y-3">
      {palavras.map((valor, i) => (
        <input
          key={i}
          value={valor}
          onChange={(e) =>
            setPalavras((p) => p.map((atual, j) => (j === i ? e.target.value : atual)))
          }
          placeholder={quantas === 1 ? "Uma palavra" : `Palavra ${i + 1}`}
          maxLength={24}
          className="w-full rounded-2xl border border-borda bg-superficie px-5 py-4 text-center text-xl outline-none transition focus:border-foco"
        />
      ))}
      <button
        onClick={() => aoEnviar({ palavras: palavras.filter((p) => p.trim()) })}
        disabled={ocupado || palavras.every((p) => !p.trim())}
        className="w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo disabled:opacity-30"
      >
        {ocupado ? "Enviando..." : "Enviar"}
      </button>
    </div>
  );
}

function Coletiva({ ocupado, aoEnviar }: { ocupado: boolean; aoEnviar: AoEnviar }) {
  const [peca, setPeca] = useState("");

  return (
    <div className="space-y-3">
      <textarea
        value={peca}
        onChange={(e) => setPeca(e.target.value)}
        rows={4}
        placeholder="Sua parte"
        className="w-full rounded-2xl border border-borda bg-superficie p-4 text-base outline-none transition focus:border-foco"
      />
      <p className="text-xs text-suave">
        A sua peça entra num painel único com a de todo mundo. Você vê montando.
      </p>
      <button
        onClick={() => aoEnviar({ peca: peca.trim() })}
        disabled={ocupado || !peca.trim()}
        className="w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo disabled:opacity-30"
      >
        {ocupado ? "Enviando..." : "Somar à turma"}
      </button>
    </div>
  );
}

const ABAS = [
  {
    chave: "voce",
    rotulo: "Minhas Tarefas",
    curto: "Tarefas",
    icone: ListChecks,
    titulo: "Atividades Lançadas",
    subtitulo: "Entregue as tarefas para acumular XP e liberar acessórios de avatar",
  },
  {
    chave: "avatar",
    rotulo: "Personalizar Avatar",
    curto: "Avatar",
    icone: UserRound,
    titulo: "Personalizar Avatar",
    subtitulo: "Itens que você desbloqueia entregando atividades",
  },
  {
    chave: "lojinha",
    rotulo: "Lojinha de Prêmios",
    curto: "Lojinha",
    icone: ShoppingBag,
    titulo: "Lojinha de Recompensas",
    subtitulo: "Troque seus XP por vantagens reais postadas por quem dá a aula",
  },
  {
    chave: "turma",
    rotulo: "Ver Ranking",
    curto: "Ranking",
    icone: Trophy,
    titulo: "Ranking de XP da Turma",
    subtitulo: "Acompanhe seu percurso em relação aos colegas",
  },
  {
    chave: "entregas",
    rotulo: "Relatório de Entrega",
    curto: "Relatório",
    icone: PieChart,
    titulo: "Relatório de Atividades Entregues",
    subtitulo: "Resumo do que você entregou, por matéria",
  },
] as const;

/** Número grande com rótulo em cima, para as três caixas do relatório. */
function Estatistica({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-suave">{rotulo}</p>
      <p className={`mt-2 font-titulo text-3xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

/** Etiqueta pequena: selo da marca, medalha recebida, tipo de atividade. */
function Selo({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: "neutro" | "foco" | "realce";
}) {
  const tons = {
    neutro: "border-borda bg-superficie-alta text-suave",
    foco: "border-foco/30 bg-foco/10 text-foco",
    realce: "border-realce/30 bg-realce/10 text-realce",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${tons[tom]}`}
    >
      {children}
    </span>
  );
}

/** Quadrado com emoji ou ícone que abre cada linha de lista. */
function Quadro({
  children,
  tom = "realce",
}: {
  children: React.ReactNode;
  tom?: "realce" | "pausa" | "foco" | "apagado";
}) {
  const tons = {
    realce: "bg-realce/10 text-realce",
    pausa: "bg-pausa/10 text-pausa",
    foco: "bg-foco/10 text-foco",
    apagado: "bg-superficie-alta text-suave",
  };
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tons[tom]}`}
    >
      {children}
    </span>
  );
}

function PainelDoAluno({
  eu,
  turma,
  liberado,
  focoAtivo,
  colegas,
  recompensas,
  aoEquipar,
  aoResgatar,
  aoSair,
}: {
  eu: Pessoa;
  turma: Turma;
  liberado: boolean;
  focoAtivo: boolean;
  colegas: Pessoa[];
  recompensas: Recompensa[];
  aoEquipar: (enfeite: string) => void;
  aoResgatar: (r: Recompensa) => void;
  aoSair: () => void;
}) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["chave"]>("voce");

  const entregas = eu.entregas ?? 0;
  const xp = eu.xp ?? 0;
  const medalhas = (eu.medalhas ?? []).map(medalhaPor).filter(Boolean);
  const porMateria = Object.entries(eu.porMateria ?? {}).sort((a, b) => b[1] - a[1]);
  // O total das matérias pode ser menor que `entregas`: quem entregou antes de
  // a disciplina passar a ser gravada na resposta não tem matéria registrada.
  const totalPorMateria = porMateria.reduce((soma, [, quantas]) => soma + quantas, 0) || 1;
  const proximoEnfeite = ENFEITES.find((item) => entregas < item.exige);
  const ranking = [...colegas].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0));
  const cabecalho = ABAS.find((a) => a.chave === aba)!;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Faixa da marca. Some no celular, onde cada pixel de altura conta. */}
      <header className="hidden items-center justify-between border-b border-borda bg-superficie px-5 py-3 md:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foco font-titulo text-lg font-bold text-fundo">
            d
          </span>
          <div>
            <p className="flex items-center gap-2 font-titulo text-sm font-bold leading-none">
              DALT
              <Selo tom="foco">EDTECH</Selo>
            </p>
            <p className="mt-1 text-[11px] leading-none text-suave">Aprendizado vivo e focado</p>
          </div>
        </div>

        <button
          onClick={aoSair}
          className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2 text-xs text-suave transition hover:border-realce/40 hover:text-texto"
        >
          <LogOut size={14} aria-hidden="true" />
          Trocar usuário / Sair
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-borda bg-superficie md:flex">
          <div className="p-3">
            <div className="flex items-center gap-3 rounded-2xl border border-realce/25 bg-realce/5 p-3">
              <Avatar pessoa={eu} tamanho="m" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{eu.nome}</p>
                <p className="font-mono text-xs text-foco">{xp} XP</p>
              </div>
            </div>

            <p className="mt-6 px-3 text-[10px] uppercase tracking-[0.18em] text-suave">
              Painel do aluno
            </p>

            <nav className="mt-2 flex flex-col gap-1">
              {ABAS.map(({ chave, rotulo, icone: IconeDaAba }) => (
                <button
                  key={chave}
                  onClick={() => setAba(chave)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    aba === chave
                      ? "bg-realce font-semibold text-fundo"
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
            <EstadoDoFoco focoAtivo={focoAtivo} liberado={liberado} compacto />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-8 pb-28 md:pb-10">
          {/* No celular a faixa da marca não existe, então o avatar e a saída
              voltam para cá: sem isso não haveria como trocar de perfil. */}
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <Avatar pessoa={eu} tamanho="m" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-titulo text-lg font-bold">{eu.nome}</p>
              <p className="font-mono text-xs text-foco">{xp} XP</p>
            </div>
            <button onClick={aoSair} className="text-suave" title="Trocar perfil">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>

          <header className="mb-8">
            <h1 className="font-titulo text-2xl font-bold sm:text-3xl">{cabecalho.titulo}</h1>
            <p className="mt-1.5 text-sm text-suave">
              {cabecalho.subtitulo}
              {aba === "turma" && (
                <>
                  {" na turma "}
                  <span className="font-semibold text-texto">{turma.nome}</span>
                </>
              )}
            </p>
          </header>

          {aba === "voce" && (
            <>
              <div className="rounded-2xl border border-borda bg-superficie p-6">
                <p className="text-[10px] uppercase tracking-[0.18em] text-suave">
                  {liberado ? "Fora do modo aula" : "Aguardando"}
                </p>
                <h2 className="mt-2 font-titulo text-xl font-bold">
                  {liberado ? "Você está liberado desta atividade" : "A aula ainda não começou"}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-suave">
                  {liberado
                    ? "Quem está dando a aula te tirou do foco. Pode guardar o celular."
                    : "Quando quem dá a aula abrir o foco, esta tela vira o Modo Aula sozinha e a tarefa aparece aqui."}
                </p>
              </div>

              <h2 className="mt-8 text-[10px] uppercase tracking-[0.18em] text-suave">
                Seus reconhecimentos
              </h2>
              {medalhas.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {medalhas.map((medalha) => (
                    <li
                      key={medalha!.id}
                      className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-4"
                    >
                      <Quadro tom="pausa">{medalha!.enfeite}</Quadro>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{medalha!.nome}</span>
                        <span className="block text-xs text-suave">{medalha!.descricao}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-suave">
                  Ainda nenhum. Uns vêm de quem dá a aula, outros o app dá sozinho conforme você
                  entrega.
                </p>
              )}

              <div className="mt-8 md:hidden">
                <EstadoDoFoco focoAtivo={focoAtivo} liberado={liberado} />
              </div>
            </>
          )}

          {aba === "avatar" && (
            <>
              <p className="flex gap-3 rounded-2xl border border-pausa/25 bg-pausa/5 p-4 text-sm leading-relaxed">
                <span aria-hidden="true">💡</span>
                <span>
                  <span className="font-semibold">Regra especial:</span> os acessórios do avatar{" "}
                  <span className="font-semibold">não gastam XP</span>. Eles são liberados sozinhos
                  a cada duas atividades entregues.
                </span>
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
                <div className="flex flex-col items-center rounded-2xl border border-borda bg-superficie p-6">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-suave">Seu avatar</p>
                  <span className="mt-5 rounded-full ring-2 ring-realce ring-offset-4 ring-offset-superficie">
                    <Avatar pessoa={eu} tamanho="gg" />
                  </span>
                  <p className="mt-6 font-mono text-xs text-foco">Entregas: {entregas}</p>
                </div>

                <ul className="space-y-3">
                  {ENFEITES.map((item) => {
                    const temItem = entregas >= item.exige;
                    const usando = eu.enfeite === item.enfeite;
                    return (
                      <li key={item.enfeite}>
                        <button
                          onClick={() => temItem && aoEquipar(item.enfeite)}
                          disabled={!temItem}
                          className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                            usando
                              ? "border-foco bg-foco/5"
                              : temItem
                                ? "border-borda bg-superficie hover:border-realce/40"
                                : "border-borda bg-superficie"
                          }`}
                        >
                          <Quadro tom={temItem ? "realce" : "apagado"}>{item.enfeite}</Quadro>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-sm font-semibold ${temItem ? "" : "text-suave"}`}
                            >
                              {item.nome}
                            </span>
                            <span className="block text-xs text-suave">
                              Requisito: {item.exige} atividades entregues
                            </span>
                          </span>
                          <span
                            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                              usando
                                ? "bg-foco/10 text-foco"
                                : temItem
                                  ? "bg-realce/10 text-realce"
                                  : "bg-superficie-alta text-suave"
                            }`}
                          >
                            {usando ? (
                              <>
                                <Check size={13} aria-hidden="true" />
                                Equipado
                              </>
                            ) : temItem ? (
                              "Equipar"
                            ) : (
                              <>
                                <Lock size={13} aria-hidden="true" />
                                Bloqueado
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {aba === "lojinha" && (
            <>
              <div className="mb-6 inline-flex flex-col rounded-2xl border border-pausa/30 bg-pausa/5 px-4 py-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-suave">Seu saldo</span>
                <span className="font-mono text-lg font-bold text-pausa">{xp} XP</span>
              </div>

              {recompensas.length === 0 ? (
                <p className="text-sm text-suave">Quem dá a aula ainda não colocou prêmios aqui.</p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {recompensas.map((r) => {
                    const podePagar = xp >= r.custo;
                    const jaResgatou = eu.resgates?.includes(r.titulo) ?? false;
                    return (
                      <li
                        key={r.id}
                        className="flex flex-col justify-between rounded-2xl border border-borda bg-superficie p-5"
                      >
                        <div className="flex items-start gap-3">
                          <Quadro tom="pausa">{r.enfeite}</Quadro>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug">{r.titulo}</p>
                            <p className="mt-1 text-xs text-suave">
                              {jaResgatou
                                ? "Já resgatado. Combine com quem dá a aula quando usar."
                                : "Combine com quem dá a aula quando for usar."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <span className="font-mono text-sm font-bold text-pausa">
                            {r.custo} XP
                          </span>
                          <button
                            onClick={() => aoResgatar(r)}
                            disabled={!podePagar}
                            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                              podePagar
                                ? "bg-pausa text-fundo hover:brightness-110"
                                : "bg-superficie-alta text-suave"
                            }`}
                          >
                            {podePagar ? "Resgatar" : `Faltam ${r.custo - xp} XP`}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {aba === "turma" && (
            <ol className="space-y-3">
              {ranking.map((colega, posicao) => {
                const souEu = colega.id === eu.id;
                const seus = (colega.medalhas ?? []).map(medalhaPor).filter(Boolean);
                const feitas = colega.entregas ?? 0;
                return (
                  <li
                    key={colega.id}
                    className={`flex items-center gap-4 rounded-2xl border p-4 ${
                      souEu ? "border-realce bg-realce/5" : "border-borda bg-superficie"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        posicao === 0
                          ? "bg-pausa text-fundo"
                          : posicao === 1
                            ? "bg-suave text-fundo"
                            : posicao === 2
                              ? "bg-alerta text-fundo"
                              : "bg-superficie-alta text-suave"
                      }`}
                    >
                      {posicao + 1}º
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${souEu ? "text-realce" : ""}`}>
                        {colega.nome}
                        {souEu && " (você)"}
                      </p>
                      {seus.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {seus.map((m) => (
                            <Selo key={m!.id} tom="foco">
                              {m!.nome}
                            </Selo>
                          ))}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-foco">{colega.xp ?? 0} XP</p>
                      <p className="mt-0.5 text-[11px] text-suave">
                        {feitas} {feitas === 1 ? "entrega" : "entregas"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {aba === "entregas" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Estatistica rotulo="Total de entregas" valor={String(entregas)} cor="text-texto" />
                <Estatistica rotulo="XP acumulado" valor={`${xp} XP`} cor="text-foco" />
                <Estatistica
                  rotulo="Medalhas recebidas"
                  valor={String(medalhas.length)}
                  cor="text-pausa"
                />
              </div>

              {porMateria.length > 0 ? (
                <section className="mt-6 rounded-2xl border border-borda bg-superficie p-5">
                  <h2 className="text-[10px] uppercase tracking-[0.18em] text-suave">
                    Onde você entregou
                  </h2>
                  {/* A porcentagem é a fatia do seu próprio total, não uma meta:
                      com uma matéria só ela dá 100%, e isso está certo. */}
                  <ul className="mt-4 space-y-3">
                    {porMateria.map(([materia, quantas]) => (
                      <li
                        key={materia}
                        className="flex items-center gap-4 rounded-xl border border-borda bg-superficie-alta p-4"
                      >
                        <Quadro tom="realce">
                          <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
                        </Quadro>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{materia}</span>
                          <span className="block text-xs text-suave">
                            {quantas} {quantas === 1 ? "atividade entregue" : "atividades entregues"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-foco">
                          {Math.round((quantas / totalPorMateria) * 100)}% do seu total
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="mt-6 text-sm text-suave">
                  Assim que você enviar sua primeira atividade, ela aparece aqui — e continua aqui
                  depois que a aula acabar.
                </p>
              )}

              {proximoEnfeite && (
                <p className="mt-6 text-sm text-suave">
                  Faltam {proximoEnfeite.exige - entregas}{" "}
                  {proximoEnfeite.exige - entregas === 1 ? "entrega" : "entregas"} para liberar{" "}
                  <span className="text-texto">
                    {proximoEnfeite.enfeite} {proximoEnfeite.nome}
                  </span>{" "}
                  no avatar.
                </p>
              )}

              <div className="mt-8">
                <EstadoDoFoco focoAtivo={focoAtivo} liberado={liberado} />
              </div>
            </>
          )}
        </main>
      </div>

      {/* No celular a lateral não cabe, então o menu vira barra fixa embaixo. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-borda bg-superficie md:hidden">
        {ABAS.map(({ chave, curto, rotulo, icone: IconeDaAba }) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            aria-label={rotulo}
            className={`flex flex-1 flex-col items-center gap-1 px-1 py-3 text-[10px] leading-tight transition ${
              aba === chave ? "text-realce" : "text-suave"
            }`}
          >
            <IconeDaAba size={20} strokeWidth={1.75} aria-hidden="true" />
            {curto}
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * Quem abre o foco é quem dá a aula, nunca o aluno: a turma inteira entra e sai
 * junto, e é isso que faz o Modo Aula valer como combinado de sala. Então aqui
 * não existe botão que ligue o foco — existe o estado, dito com todas as letras,
 * para o aluno saber o que esperar da própria tela.
 */
function EstadoDoFoco({
  focoAtivo,
  liberado,
  compacto = false,
}: {
  focoAtivo: boolean;
  liberado: boolean;
  compacto?: boolean;
}) {
  const ligado = focoAtivo && !liberado;

  if (compacto) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-superficie-alta px-3 py-2.5 text-xs text-suave">
        <Target
          size={15}
          className={ligado ? "text-foco" : ""}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {liberado ? "Você está liberado" : ligado ? "Modo Foco ligado" : "Aguardando a aula abrir"}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-6 text-center">
      <h2 className="font-titulo text-lg font-bold">
        {liberado ? "Você está fora do foco" : "O Modo Foco começa na aula"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-suave">
        {liberado
          ? "Quem dá a aula te liberou desta atividade. Quando a próxima abrir, esta tela volta sozinha para o foco."
          : "Quem dá a aula liga o foco e o app toma a tela de todos os celulares da turma ao mesmo tempo. Você não precisa fazer nada: esta tela muda sozinha."}
      </p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-superficie-alta px-4 py-2.5 text-xs text-suave">
        <Target size={15} strokeWidth={1.75} aria-hidden="true" />
        Aguardando quem dá a aula
      </p>
    </div>
  );
}

function Tutor({ atividade }: { atividade: Atividade }) {
  const [aberto, setAberto] = useState(false);
  const [duvida, setDuvida] = useState("");
  const [dica, setDica] = useState("");
  const [pensando, setPensando] = useState(false);

  async function perguntar() {
    setPensando(true);
    setDica("");
    try {
      const r = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade, duvida }),
      });
      const dados = await r.json();
      setDica(dados.dica ?? dados.erro ?? "");
    } finally {
      setPensando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full rounded-2xl border border-borda bg-superficie px-4 py-3 text-sm text-suave transition hover:border-foco"
      >
        Travei nessa atividade
      </button>
    );
  }

  return (
    <div className="surgir rounded-2xl border border-borda bg-superficie p-4">
      <p className="text-sm text-suave">Conta onde travou. A dica vem, a resposta não — ela é sua.</p>
      <textarea
        value={duvida}
        onChange={(e) => setDuvida(e.target.value)}
        rows={2}
        placeholder="Não entendi o que é para fazer"
        className="mt-3 w-full rounded-xl border border-borda bg-fundo p-3 text-sm outline-none focus:border-foco"
      />
      <button
        onClick={perguntar}
        disabled={pensando || !duvida.trim()}
        className="mt-2 w-full rounded-xl bg-superficie-alta py-3 text-sm font-medium disabled:opacity-40"
      >
        {pensando ? "Pensando..." : "Pedir uma dica"}
      </button>
      {dica && <p className="mt-3 leading-relaxed text-foco">{dica}</p>}
    </div>
  );
}

// Travar usa o recurso nativo do próprio sistema, ativado pelo aluno. O app não
// controla o aparelho dele: o passo a passo só muda conforme o sistema.
function instrucaoDeTravar() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

  if (/android/i.test(ua)) {
    return "Abra os apps recentes, toque no ícone do Modo Aula e escolha Fixar. Se não aparecer, ligue antes em Configurações, Segurança, Fixar tela.";
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    return "Clique três vezes no botão lateral para ligar o Acesso Guiado. Se não acontecer nada, ative antes em Ajustes, Acessibilidade, Acesso Guiado.";
  }
  return "Feche as outras abas e deixe só esta aula aberta.";
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <main className="surgir mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-8 text-center">
      {children}
    </main>
  );
}
