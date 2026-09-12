"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { comprimirImagem } from "@/lib/imagem";

// A câmera roda dentro da própria página. Chamar o app de câmera do sistema
// tiraria o aluno do Modo Aula justamente quando a tela está fixada.
export function Camera({ aoCapturar }: { aoCapturar: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ligada, setLigada] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);

  const desligar = useCallback(() => {
    const fluxo = video.current?.srcObject as MediaStream | null;
    fluxo?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
    setLigada(false);
  }, []);

  useEffect(() => desligar, [desligar]);

  async function ligar() {
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      if (video.current) {
        video.current.srcObject = fluxo;
        await video.current.play();
      }
      setLigada(true);
    } catch {
      setSemAcesso(true);
    }
  }

  function capturar() {
    const alvo = video.current;
    if (!alvo) return;

    const escala = Math.min(1, 900 / Math.max(alvo.videoWidth, alvo.videoHeight));
    const tela = document.createElement("canvas");
    tela.width = Math.round(alvo.videoWidth * escala);
    tela.height = Math.round(alvo.videoHeight * escala);
    tela.getContext("2d")?.drawImage(alvo, 0, 0, tela.width, tela.height);

    aoCapturar(tela.toDataURL("image/jpeg", 0.7));
    desligar();
  }

  // Aparelho antigo ou permissão negada: cai para o seletor de arquivo, que
  // sempre existe. Ninguém fica sem entregar por causa do celular que tem.
  if (semAcesso) {
    return (
      <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-borda bg-superficie px-4 py-6 text-suave">
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) aoCapturar(await comprimirImagem(arquivo));
          }}
          className="hidden"
        />
        Escolher foto do aparelho
      </label>
    );
  }

  return (
    <div>
      <video
        ref={video}
        playsInline
        muted
        className={`w-full rounded-2xl bg-superficie ${ligada ? "" : "hidden"}`}
      />

      {ligada ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={capturar}
            className="flex-1 rounded-2xl bg-foco py-4 font-semibold text-fundo"
          >
            Tirar foto
          </button>
          <button onClick={desligar} className="rounded-2xl border border-borda px-5 text-suave">
            Fechar
          </button>
        </div>
      ) : (
        <button
          onClick={ligar}
          className="w-full rounded-2xl border border-dashed border-borda bg-superficie px-4 py-6 text-suave transition hover:border-foco"
        >
          Abrir câmera
        </button>
      )}
    </div>
  );
}
