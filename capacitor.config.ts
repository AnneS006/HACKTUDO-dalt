import type { CapacitorConfig } from "@capacitor/cli";

// A casca nativa não carrega uma cópia do app: ela abre o site que já está no
// ar. Assim o aluno recebe toda correção publicada na Vercel sem instalar APK
// novo, e existe um só código para as duas plataformas.
const config: CapacitorConfig = {
  appId: "app.modoaula",
  appName: "Modo Aula",
  // Não apontar para public/: o Capacitor copia essa pasta inteira para dentro
  // do APK, e é de lá que o APK é distribuído.
  webDir: "capacitor-web",
  server: {
    url: "https://modo-aula-dalt.vercel.app",
    cleartext: false,
  },
  android: {
    // Mesmo fundo do app, para não piscar branco enquanto a página carrega.
    backgroundColor: "#0a0f14",
  },
};

export default config;
