"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Avatar } from "@/components/avatar";
import { Camera } from "@/components/camera";
import { GavetaFerramentas } from "@/components/ferramentas";
import { VistaColetiva } from "@/components/coletivo";
import {
  CONVITES_DE_PAUSA,
  ESTADOS,
  calcularCiclo,
  contarPalavras,
  formatarTempo,
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
    getDoc(doc(db, "turmas", turmaId)).then((s) => setTurma({ id: s.id, ...s.data() } as Turma));
    getDoc(doc(db, "turmas", turmaId, "pessoas", pessoaId)).then((s) =>
      setEu({ id: s.id, ...s.data() } as Pessoa),
    );
  }, [turmaId, pessoaId]);

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

  // Tela cheia e tela acesa duram enquanto o foco da turma estiver ligado.
  // O navegador exige um toque para entrar em tela cheia, então é o próprio
  // botão de começar que dispara — depois disso o app se mantém sozinho.
  const entrarEmFoco = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {}
    try {
      trava.current = await navigator.wakeLock?.request("screen");
    } catch {}
    setTravado(true);
    setForaDoFoco(false);
  }, []);

  const soltarFoco = useCallback(async () => {
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
      ...dados,
      criadaEm: serverTimestamp(),
    }).catch((e) => console.error("entrega pendente de sincronização", e));

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

  if (!sessao.focoAtivo || liberado) {
    return (
      <Centro>
        <div className="flex flex-col items-center gap-4">
          <Avatar pessoa={eu} tamanho="g" />
          <p className="text-lg">{eu.nome}</p>
        </div>
        <h1 className="mt-8 text-2xl font-bold">
          {liberado ? "Você está fora do modo aula" : "A aula ainda não começou"}
        </h1>
        <p className="mt-3 text-suave">
          {liberado
            ? "Quem está dando a aula te liberou desta atividade. Pode guardar o celular."
            : `${turma.nome} · a aula começa quando a turma estiver pronta.`}
        </p>
        {/* Só aqui: trocar de perfil no meio do foco esvaziaria o sentido dele. */}
        <button
          onClick={() => router.push("/")}
          className="mt-10 text-sm text-suave underline-offset-4 hover:underline"
        >
          Não é você?
        </button>
      </Centro>
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
        <p className="mt-6 text-xs leading-relaxed text-suave/60">
          Para travar de vez no aparelho: {instrucaoDeTravar()}
        </p>
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
      aoEnviar({ acertos, total: perguntas.length, respostas: [] });
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
