// deslizar.js
// Arrastar para o lado, usado nos itens da compra e no Histórico:
// para a esquerda = apagar, para a direita = editar/abrir.
// Funciona com dedo e com mouse.

const DISTANCIA_ACAO = 90;   // quanto precisa arrastar para disparar
const DISTANCIA_MAXIMA = 140;

/**
 * linhaEl: o <li class="item-deslizavel"> (com os fundos .item-acao dentro)
 * frenteEl: a parte que se move com o dedo
 * aoApagar / aoEditar: chamados quando arrasta o suficiente
 * aoTocar (opcional): chamado num toque/clique sem arrastar
 * funcionaEmConsulta: se true, continua funcionando quando o grupo em uso
 *   já terminou (modo consulta); senão, lá só o toque para "abrir" vale
 * permitirArrastar: false = só o toque vale (ex: lista que a pessoa pode
 *   ver e marcar "quem leva", mas não editar)
 */
export function ativarDeslizar(linhaEl, frenteEl, { aoApagar, aoEditar, aoTocar, funcionaEmConsulta = false, tocarEmConsulta = false, permitirArrastar = true }) {
  const bloqueado = () => !permitirArrastar || (!funcionaEmConsulta && document.body.classList.contains("modo-consulta"));

  let inicioX = null;
  let inicioY = null;
  let deslocamento = 0;
  let arrastando = false;

  frenteEl.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    if (bloqueado() && !tocarEmConsulta && permitirArrastar) return;
    inicioX = evento.clientX;
    inicioY = evento.clientY;
    deslocamento = 0;
    arrastando = false;
  });

  frenteEl.addEventListener("pointermove", (evento) => {
    if (inicioX === null) return;
    const dx = evento.clientX - inicioX;
    const dy = evento.clientY - inicioY;

    if (!arrastando) {
      // Movimento mais vertical que horizontal = a pessoa está rolando a tela
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        inicioX = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      if (bloqueado()) {
        // Em consulta não arrasta (nada de apagar/editar); só o toque vale
        inicioX = null;
        return;
      }
      arrastando = true;
      frenteEl.setPointerCapture(evento.pointerId);
      frenteEl.style.transition = "none";
    }

    // Sem ação de um lado, não arrasta para esse lado
    const minimo = aoApagar ? -DISTANCIA_MAXIMA : 0;
    const maximo = aoEditar ? DISTANCIA_MAXIMA : 0;
    deslocamento = Math.max(minimo, Math.min(maximo, dx));
    frenteEl.style.transform = `translateX(${deslocamento}px)`;
    linhaEl.dataset.direcao = deslocamento < 0 ? "apagar" : "editar";
    linhaEl.classList.toggle("pronto", Math.abs(deslocamento) >= DISTANCIA_ACAO);
  });

  const terminar = (evento) => {
    if (inicioX === null) return;
    inicioX = null;
    frenteEl.style.transition = "";
    frenteEl.style.transform = "";
    linhaEl.classList.remove("pronto");

    if (!arrastando) {
      const emControle = evento.target.closest && evento.target.closest("button, input, a, label");
      if (aoTocar && evento.type === "pointerup" && !emControle) aoTocar();
      return;
    }
    arrastando = false;

    if (deslocamento <= -DISTANCIA_ACAO && aoApagar) {
      aoApagar();
    } else if (deslocamento >= DISTANCIA_ACAO && aoEditar) {
      aoEditar();
    }
  };

  frenteEl.addEventListener("pointerup", terminar);
  frenteEl.addEventListener("pointercancel", terminar);
}

// Ícones sólidos que aparecem atrás do item ao arrastar (cor vem do CSS)
const ICONES = {
  lapis: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>',
  lixeira: '<path d="M9 3h6l1 1h4v2H4V4h4l1-1zM5 8h14l-1.1 12.1A2 2 0 0 1 15.9 22H8.1a2 2 0 0 1-2-1.9L5 8z"/>',
  lupa: '<path d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.39-1.42 1.42-5.39-5.39A8 8 0 1 1 10 2zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
  link: '<path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.4-3.4a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM7.05 11.54l-2.12 2.12a4 4 0 0 0 5.66 5.66l2.12-2.12-1.41-1.42-2.13 2.13a2 2 0 1 1-2.83-2.83l2.13-2.12-1.42-1.42zm9.9.92 2.12-2.12a4 4 0 0 0-5.66-5.66l-2.12 2.12 1.41 1.42 2.13-2.13a2 2 0 1 1 2.83 2.83l-2.13 2.12 1.42 1.42z"/>',
  camera: '<path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
  imagem: '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3.5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 19h14l-4.5-6-3.5 4.5-2.5-3L5 19z"/>',
  desfazer: '<path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62A7.95 7.95 0 0 1 12.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>',
  grupo: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM9 13c-3.3 0-7 1.6-7 4.5V20h14v-2.5C16 14.6 12.3 13 9 13zm7.3.1c1.9.6 3.7 1.9 3.7 4.4V20h4v-2.5c0-2.6-3.6-4.1-7.7-4.4z"/>',
  pessoa: '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-9 2-9 5.5V22h18v-2.5C21 16 16 14 12 14z"/>',
  sino: '<path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z"/>',
  compartilhar: '<path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8a3 3 0 1 0-3-3c0 .2 0 .5.1.7L8 9.8A3 3 0 1 0 8 14.2l7.1 4.2-.1.6a3 3 0 1 0 3-2.9z"/>',
  mais: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
  chave: '<path d="M7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm5.65-4A6 6 0 1 0 12.65 14H15v3h3v-3h3v-4h-8.35z"/>',
  relogio: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 5v6l5.2 3.1 1-1.6-4.2-2.5V7h-2z"/>',
  removerPessoa: '<path d="M10 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-9 2-9 5.5V22h13.3A6.5 6.5 0 0 1 16 14.3 14 14 0 0 0 10 14zm7 1.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM14.5 19h5v1.5h-5z"/>',
  sair: '<path d="M5 3h9a2 2 0 0 1 2 2v3h-2V5H5v14h9v-3h2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm11.59 5.59L20 12l-3.41 3.41L15.17 14l1-1H9v-2h7.17l-1-1 1.42-1.41z"/>'
};

/**
 * Ícone sólido (SVG na cor do texto). Também usado no lápis de editar
 * foto/nome do perfil e dos grupos.
 */
export function iconeSVG(nome, classe = "item-acao-icone") {
  return `<svg class="${classe}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONES[nome]}</svg>`;
}

/**
 * Monta um <li> deslizável com os fundos de ação (ícones sólidos) e uma
 * "frente" vazia. Direita = iconeEditar, esquerda = iconeApagar
 * (null = sem ação daquele lado).
 */
export function criarLinhaDeslizavel({ classeExtra = "", iconeEditar = "lapis", iconeApagar = "lixeira" } = {}) {
  const linha = document.createElement("li");
  linha.className = `item-linha item-deslizavel ${classeExtra}`.trim();
  linha.innerHTML = `
    ${iconeEditar ? `<div class="item-acao item-acao-editar">${iconeSVG(iconeEditar)}</div>` : ""}
    ${iconeApagar ? `<div class="item-acao item-acao-apagar">${iconeSVG(iconeApagar)}</div>` : ""}
  `;

  const frente = document.createElement("div");
  frente.className = "item-frente";
  linha.appendChild(frente);
  return { linha, frente };
}
