import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Archivo carrega os títulos, Plex Sans o texto e Plex Mono os códigos de
// turma e os relógios. É o mesmo trio do deck: produto e apresentação passam a
// parecer a mesma coisa.
const titulo = Archivo({
  variable: "--fonte-titulo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const corpo = IBM_Plex_Sans({
  variable: "--fonte-corpo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--fonte-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Modo Aula",
  description:
    "O celular do aluno vira ferramenta da aula: sem app, sem login e sem rastreamento.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${titulo.variable} ${corpo.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
