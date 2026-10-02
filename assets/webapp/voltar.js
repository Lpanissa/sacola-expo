// voltar.js
// Botão "voltar" do celular (e do navegador) dentro do app:
// 1. se tem algo aberto por cima (modal, aviso, menuzinho), fecha;
// 2. senão, volta para a página anterior (Mercado, Lista, Histórico);
// 3. na página inicial, pede para tocar de novo para sair (2 segundos).
//
// Funciona com o histórico do navegador: cada camada aberta e cada troca
// de página empurra uma entrada; o voltar tira a última.

import { irParaPagina } from "./navegacao.js";

const SELETOR_CAMADAS = ".modal, .menu-foto";
const TEMPO_PARA_SAIR_MS = 2000;

let pilha = [];          // espelho das entradas que o app empurrou
let camadasAbertas = []; // elementos abertos, na ordem em que abriram
let paginaAtual = "mercado";
let avisoSairAte = 0;

function visivel(el) {
  return !el.classList.contains("oculto");
}

// ===== Camadas (modais e menus) =====
new MutationObserver((mudancas) => {
  mudancas.forEach(({ target: el }) => {
    if (!(el instanceof Element) || !el.matches(SELETOR_CAMADAS)) return;
    const estaAberta = camadasAbertas.includes(el);

    if (visivel(el) && !estaAberta) {
      camadasAbertas.push(el);
      pilha.push({ tipo: "camada" });
      history.pushState({ sacola: "camada" }, "");
    } else if (!visivel(el) && estaAberta) {
      // Fechou pelo X, tocando fora etc.: a entrada dela fica "sobrando" e
      // é pulada no próximo voltar
      camadasAbertas = camadasAbertas.filter((c) => c !== el);
    }
  });
}).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });

// ===== Páginas =====
document.addEventListener("pagina-mudou", (evento) => {
  const { pagina, doVoltar, restaurando } = evento.detail;
  if (!doVoltar && !restaurando && pagina !== paginaAtual) {
    pilha.push({ tipo: "pagina", anterior: paginaAtual });
    history.pushState({ sacola: "pagina", pagina }, "");
  }
  paginaAtual = pagina;
});

// ===== O voltar =====
window.addEventListener("popstate", () => {
  const saiu = pilha.pop();

  // Chegou na base: é o voltar "da página inicial"
  if (!saiu) {
    voltarNaBase();
    return;
  }

  if (saiu.tipo === "camada") {
    const topo = camadasAbertas.pop();
    if (topo) {
      topo.classList.add("oculto");
    } else {
      // A camada já tinha sido fechada pelo X: pula para o próximo passo
      history.back();
    }
    return;
  }

  if (saiu.tipo === "pagina") {
    // Se ainda tem algo aberto por cima, fecha junto
    camadasAbertas.splice(0).forEach((c) => c.classList.add("oculto"));
    irParaPagina(saiu.anterior, { doVoltar: true });
  }
});

function voltarNaBase() {
  // Fora do Mercado: volta para ele antes de pensar em sair
  if (paginaAtual !== "mercado") {
    irParaPagina("mercado", { doVoltar: true });
    empurrarGuarda();
    return;
  }

  if (Date.now() < avisoSairAte) {
    // Segundo toque em menos de 2 s: deixa sair
    history.back();
    return;
  }

  avisoSairAte = Date.now() + TEMPO_PARA_SAIR_MS;
  mostrarAvisoSair();
  empurrarGuarda();
}

// Entrada extra no começo do histórico: o primeiro voltar cai nela em vez
// de fechar o app
function empurrarGuarda() {
  history.pushState({ sacola: "guarda" }, "");
}

let balaoSairEl = null;
function mostrarAvisoSair() {
  if (!balaoSairEl) {
    balaoSairEl = document.createElement("div");
    balaoSairEl.className = "balao-aviso balao-sair";
    balaoSairEl.setAttribute("role", "status");
    balaoSairEl.textContent = "Toque em voltar de novo para sair";
    document.body.appendChild(balaoSairEl);
  }
  balaoSairEl.classList.remove("visivel");
  void balaoSairEl.offsetWidth;
  balaoSairEl.classList.add("visivel");
  setTimeout(() => balaoSairEl.classList.remove("visivel"), TEMPO_PARA_SAIR_MS);
}

/**
 * Chamar uma vez ao iniciar o app, depois de restaurar a última página.
 */
export function iniciarVoltar() {
  const ativa = document.querySelector(".pagina.ativa");
  paginaAtual = ativa ? ativa.id.replace("pagina-", "") : "mercado";
  history.replaceState({ sacola: "base" }, "");
  empurrarGuarda();
}
