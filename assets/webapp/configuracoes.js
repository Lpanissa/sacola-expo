// configuracoes.js
// Configurações do app: porcentagem de alerta do limite de orçamento
// e o tema (claro / escuro / automático). Fica salvo no localStorage
// do celular (não precisa de internet nem de login).

import { avisosLigados, definirAvisosLigados } from "./avisos.js";

const modalConfiguracoes = document.getElementById("modal-configuracoes");
const inputPercentualAlerta = document.getElementById("input-percentual-alerta");
const botoesTema = document.querySelectorAll(".botao-tema-opcao");
const chaveAvisos = document.getElementById("chave-avisos");

const CHAVE_PERCENTUAL = "sacola_percentual_alerta";
const CHAVE_TEMA = "sacola_tema";

// Chave Pix para quem quiser ajudar o app. Enquanto estiver vazia,
// a seção "Ajude o Sacola" fica escondida.
const CHAVE_PIX = "04e926e0-65f6-41a7-b0d2-2fa937a903ad";

export function iniciarConfiguracoes() {
  // Carrega a porcentagem salva (ou usa 85% como padrão)
  const percentualSalvo = localStorage.getItem(CHAVE_PERCENTUAL);
  const percentual = percentualSalvo ? Number(percentualSalvo) : 85;
  window.SACOLA_PERCENTUAL_ALERTA = percentual;
  inputPercentualAlerta.value = percentual;

  // Carrega o tema salvo (ou usa "automático")
  const temaSalvo = localStorage.getItem(CHAVE_TEMA) || "automatico";
  aplicarTema(temaSalvo);
  marcarBotaoTemaAtivo(temaSalvo);

  inputPercentualAlerta.addEventListener("change", () => {
    let valor = Number(inputPercentualAlerta.value);
    if (isNaN(valor) || valor < 1) valor = 1;
    if (valor > 100) valor = 100;
    inputPercentualAlerta.value = valor;
    window.SACOLA_PERCENTUAL_ALERTA = valor;
    localStorage.setItem(CHAVE_PERCENTUAL, String(valor));
  });

  // Avisos do grupo (balãozinho no topo)
  chaveAvisos.checked = avisosLigados();
  chaveAvisos.addEventListener("change", () => definirAvisosLigados(chaveAvisos.checked));

  // Ajuda com Pix desativada por enquanto (política de pagamentos da Play).
  // O bloco de HTML e as funções abaixo continuam no código, só não rodam.
  // iniciarAjuda();

  botoesTema.forEach((botao) => {
    botao.addEventListener("click", () => {
      const tema = botao.dataset.tema;
      aplicarTema(tema);
      marcarBotaoTemaAtivo(tema);
      localStorage.setItem(CHAVE_TEMA, tema);
    });
  });
}

function aplicarTema(tema) {
  if (tema === "claro") {
    document.documentElement.setAttribute("data-tema", "claro");
  } else if (tema === "escuro") {
    document.documentElement.setAttribute("data-tema", "escuro");
  } else {
    // automático: segue a preferência do celular
    document.documentElement.removeAttribute("data-tema");
  }
}

function marcarBotaoTemaAtivo(tema) {
  botoesTema.forEach((botao) => {
    botao.classList.toggle("ativa", botao.dataset.tema === tema);
  });
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Alternativa para quando a área de transferência moderna não está disponível
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    campo.remove();
    return ok;
  }
}

function iniciarAjuda() {
  const secao = document.getElementById("config-ajuda");
  if (!CHAVE_PIX) return;
  secao.classList.remove("oculto");

  const obrigado = document.getElementById("ajuda-obrigado");
  document.getElementById("btn-copiar-pix").addEventListener("click", async () => {
    if (await copiarTexto(CHAVE_PIX)) obrigado.classList.remove("oculto");
  });
}
