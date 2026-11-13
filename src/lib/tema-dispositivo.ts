export const CHAVE_TEMA = "avilaops-auth-tema";
export const EVENTO_TEMA = "avilaops-auth-tema";

export type PreferenciaTema = "system" | "light" | "dark";

export function scriptTemaDispositivo(): string {
  return `(() => {
    const chave = ${JSON.stringify(CHAVE_TEMA)};
    const evento = ${JSON.stringify(EVENTO_TEMA)};
    const raiz = document.documentElement;
    const sistema = window.matchMedia("(prefers-color-scheme: dark)");

    function lerPreferencia() {
      try {
        return localStorage.getItem(chave);
      } catch {
        return null;
      }
    }

    function aplicar(valor) {
      const preferencia = valor === "light" || valor === "dark" ? valor : "system";
      const tema = preferencia === "system" ? (sistema.matches ? "dark" : "light") : preferencia;
      raiz.dataset.themePreference = preferencia;
      raiz.dataset.theme = tema;
      raiz.classList.toggle("dark", tema === "dark");
    }

    aplicar(lerPreferencia());
    sistema.addEventListener("change", () => aplicar(raiz.dataset.themePreference));
    window.addEventListener(evento, (mudanca) => aplicar(mudanca.detail));
    window.addEventListener("storage", (mudanca) => {
      if (mudanca.key === chave || mudanca.key === null) aplicar(lerPreferencia());
    });
  })();`;
}
