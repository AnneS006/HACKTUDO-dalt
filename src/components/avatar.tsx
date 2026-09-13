import { iniciais, type Pessoa } from "@/lib/tipos";

const TAMANHOS = {
  p: "h-10 w-10 text-xs",
  m: "h-14 w-14 text-sm",
  g: "h-20 w-20 text-lg",
};

const ENFEITE = {
  p: "-top-1 -right-1 text-sm",
  m: "-top-1.5 -right-1.5 text-lg",
  g: "-top-2 -right-2 text-2xl",
};

export function Avatar({
  pessoa,
  tamanho = "m",
  apagado = false,
}: {
  pessoa: Pick<Pessoa, "nome" | "cor" | "foto" | "enfeite">;
  tamanho?: keyof typeof TAMANHOS;
  apagado?: boolean;
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${apagado ? "opacity-35" : ""}`}>
      <span
        className={`${TAMANHOS[tamanho]} flex items-center justify-center rounded-full font-bold transition`}
        style={{ backgroundColor: `${pessoa.cor}22`, color: pessoa.cor }}
      >
        {pessoa.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pessoa.foto}
            alt={pessoa.nome}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          iniciais(pessoa.nome)
        )}
      </span>

      {pessoa.enfeite && (
        <span className={`absolute ${ENFEITE[tamanho]} leading-none`} aria-hidden="true">
          {pessoa.enfeite}
        </span>
      )}
    </span>
  );
}
