// dialogo.js
// Janelas de aviso e de confirmação com a cara do app, no lugar do
// alert() e do confirm() do navegador ("sacola-theta.vercel.app diz...").
//
// Uso:
//   if (await confirmar({ titulo: "Encerrar compra?", mensagem: "..." })) { ... }
//   await avisar({ titulo: "Pronto!", mensagem: "..." });

let elementos = null;
let resolverAtual = null;

function criarElementos() {
  const fundo = document.createElement("div");
  fundo.className = "modal modal-dialogo oculto";
  fundo.innerHTML = `
    <div class="dialogo-conteudo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo">
      <div class="dialogo-emoji" aria-hidden="true"></div>
      <h2 id="dialogo-titulo" class="dialogo-titulo"></h2>
      <p class="dialogo-mensagem"></p>
      <div class="dialogo-botoes">
        <button type="button" class="botao-secundario dialogo-cancelar"></button>
        <button type="button" class="botao-primario dialogo-ok"></button>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  // Fechado de fora (ex: botão voltar do celular) = cancelar
  new MutationObserver(() => {
    if (fundo.classList.contains("oculto") && resolverAtual) fechar(false);
  }).observe(fundo, { attributes: true, attributeFilter: ["class"] });

  const els = {
    fundo,
    emoji: fundo.querySelector(".dialogo-emoji"),
    titulo: fundo.querySelector(".dialogo-titulo"),
    mensagem: fundo.querySelector(".dialogo-mensagem"),
    cancelar: fundo.querySelector(".dialogo-cancelar"),
    ok: fundo.querySelector(".dialogo-ok")
  };

  els.ok.addEventListener("click", () => fechar(true));
  els.cancelar.addEventListener("click", () => fechar(false));
  // Clicar fora do cartão = cancelar
  fundo.addEventListener("click", (evento) => {
    if (evento.target === fundo) fechar(false);
  });
  document.addEventListener("keydown", (evento) => {
    if (fundo.classList.contains("oculto")) return;
    if (evento.key === "Escape") fechar(false);
  });

  return els;
}

function fechar(resposta) {
  if (!elementos) return;
  elementos.fundo.classList.add("oculto");
  const resolver = resolverAtual;
  resolverAtual = null;
  if (resolver) resolver(resposta);
}

function abrir({ titulo, mensagem, emoji, textoOk, textoCancelar, perigo }) {
  if (!elementos) elementos = criarElementos();
  // Se já havia um diálogo aberto, ele conta como cancelado
  if (resolverAtual) fechar(false);

  elementos.emoji.textContent = emoji;
  elementos.titulo.textContent = titulo || "";
  elementos.titulo.classList.toggle("oculto", !titulo);
  elementos.mensagem.textContent = mensagem || "";
  elementos.mensagem.classList.toggle("oculto", !mensagem);
  elementos.ok.textContent = textoOk;
  elementos.ok.className = perigo ? "botao-perigo dialogo-ok" : "botao-primario dialogo-ok";
  elementos.cancelar.textContent = textoCancelar || "";
  elementos.cancelar.classList.toggle("oculto", !textoCancelar);

  elementos.fundo.classList.remove("oculto");
  elementos.ok.focus();

  return new Promise((resolver) => {
    resolverAtual = resolver;
  });
}

/**
 * Pergunta sim/não. Resolve true se a pessoa confirmar.
 */
export function confirmar({
  titulo,
  mensagem,
  emoji = "🤔",
  textoOk = "Confirmar",
  textoCancelar = "Cancelar",
  perigo = false
}) {
  return abrir({ titulo, mensagem, emoji, textoOk, textoCancelar, perigo });
}

/**
 * Só avisa alguma coisa, com um botão para fechar.
 */
export async function avisar({ titulo, mensagem, emoji = "💬", textoOk = "Entendi" }) {
  await abrir({ titulo, mensagem, emoji, textoOk, textoCancelar: null, perigo: false });
}
