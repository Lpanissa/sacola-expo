// edicao-item.js
// Formulário de edição de um item (descrição com quantidade + preço da
// unidade), aberto direto na linha. Usado na compra e no Histórico.

import {
  interpretarItem,
  aplicarMascaraDeDinheiro,
  numeroParaTextoDinheiro,
  descricaoDoItem,
  precoUnitarioDoItem,
  formatarNumero,
  formatarDinheiro,
  valoresDoItem,
  itemTemPreco
} from "./utils.js";
import { criarAvatar } from "./grupos.js";

/**
 * Cria o formulário já preenchido com os dados do item.
 * aoSalvar recebe { nome, quantidade, precoUnitario, valorTotal }.
 */
export function criarFormEdicao(item, { aoSalvar, aoCancelar }) {
  const form = document.createElement("form");
  form.className = "item-edicao";
  form.autocomplete = "off";
  form.innerHTML = `
    <input type="text" class="edicao-desc" required aria-label="Item (ex: 3 sucos)" placeholder="Ex: 3 sucos">
    <input type="text" inputmode="numeric" class="edicao-preco" aria-label="Preço da unidade (opcional)" placeholder="Preço un.">
    <button type="submit" class="edicao-botao edicao-salvar" aria-label="Salvar">✓</button>
    <button type="button" class="edicao-botao edicao-cancelar" aria-label="Cancelar">✕</button>
  `;

  const campoDesc = form.querySelector(".edicao-desc");
  const campoPreco = form.querySelector(".edicao-preco");
  if (item) {
    campoDesc.value = descricaoDoItem(item);
    campoPreco.value = itemTemPreco(item) ? numeroParaTextoDinheiro(precoUnitarioDoItem(item)) : "";
  }
  aplicarMascaraDeDinheiro(campoPreco);

  form.querySelector(".edicao-cancelar").addEventListener("click", aoCancelar);

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const { quantidade, nome } = interpretarItem(campoDesc.value);
    if (!nome) return;
    // Preço é opcional: apagar o preço deixa o item "sem preço"
    await aoSalvar({ nome, quantidade, ...valoresDoItem(quantidade, campoPreco.value) });
  });

  // Foca e seleciona a descrição assim que o form entra na tela
  requestAnimationFrame(() => {
    campoDesc.focus();
    campoDesc.select();
  });

  return form;
}

/**
 * Preenche a "frente" de uma linha com o nome do item, o preço da unidade
 * (quando há mais de uma) e o total. htmlExtraValores entra embaixo do
 * total (ex: comparação com a última compra).
 */
export function preencherFrenteDoItem(frente, item, htmlExtraValores = "", autor = null) {
  const temPreco = itemTemPreco(item);
  frente.innerHTML = `
    <span class="item-desc">
      <span class="item-nome"></span>
      ${item.quantidade > 1 && temPreco
        ? `<span class="item-unitario">${formatarNumero(item.quantidade)} × ${formatarDinheiro(precoUnitarioDoItem(item))}</span>`
        : ""}
    </span>
    <span class="item-valores">
      ${temPreco
        ? `<span class="item-preco">${formatarDinheiro(item.valorTotal)}</span>`
        : `<span class="item-preco sem-preco">sem preço</span>`}
      ${htmlExtraValores}
    </span>
  `;
  frente.querySelector(".item-nome").textContent = descricaoDoItem(item);

  // Em grupo: fotinha de quem adicionou o item, no lugar da bolinha colorida
  if (autor) {
    frente.classList.add("com-autor");
    frente.prepend(criarAvatar(autor));
  }
}
