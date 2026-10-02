// navegacao.js
// Controla a troca entre as páginas (Mercado, Lista de compras, Histórico)
// através do menu inferior (tabbar).

const paginas = document.querySelectorAll(".pagina");
const botoesTab = document.querySelectorAll(".tab-item");

// Última página aberta, para voltar nela ao recarregar o app
const CHAVE_ULTIMA_PAGINA = "sacola_ultima_pagina";

/**
 * Mostra a página correspondente ao nome (ex: "mercado", "lista", "historico")
 * e marca o botão certo como ativo no menu inferior.
 */
export function irParaPagina(nomePagina, { doVoltar = false, restaurando = false } = {}) {
  paginas.forEach((pagina) => {
    pagina.classList.toggle("ativa", pagina.id === `pagina-${nomePagina}`);
  });

  botoesTab.forEach((botao) => {
    botao.classList.toggle("ativa", botao.dataset.pagina === nomePagina);
  });

  try {
    localStorage.setItem(CHAVE_ULTIMA_PAGINA, nomePagina);
  } catch {
    // sem localStorage (ex: aba anônima): só não lembra a página
  }

  // Dispara um evento customizado avisando que a página mudou,
  // para que outros arquivos (mercado.js, historico.js, etc.)
  // possam atualizar dados quando o usuário entra na tela deles.
  document.dispatchEvent(
    new CustomEvent("pagina-mudou", { detail: { pagina: nomePagina, doVoltar, restaurando } })
  );
}

/**
 * Liga os cliques dos botões do menu inferior à troca de página.
 * Deve ser chamado uma vez, quando o app inicia.
 */
export function iniciarNavegacao() {
  botoesTab.forEach((botao) => {
    botao.addEventListener("click", () => {
      irParaPagina(botao.dataset.pagina);
    });
  });

  // Volta para a última página que estava aberta
  let ultima = null;
  try {
    ultima = localStorage.getItem(CHAVE_ULTIMA_PAGINA);
  } catch {
    ultima = null;
  }
  if (ultima && document.getElementById(`pagina-${ultima}`)) irParaPagina(ultima, { restaurando: true });
}
