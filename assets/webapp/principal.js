// principal.js
// Ponto de entrada do app: importa e inicia todas as telas.
// Este é o único arquivo referenciado no index.html (além do firebase-config.js).

import { iniciarNavegacao } from "./navegacao.js";
import { iniciarVoltar } from "./voltar.js";
import { iniciarConfiguracoes } from "./configuracoes.js";
import { ativarMascarasDeDinheiro } from "./utils.js";
import { iniciarTermos } from "./termos.js";
// Estes módulos carregam seus dados sozinhos no evento "escopo-mudou",
// que o perfil.js dispara assim que sabe quem é o usuário (anônimo ou Google).
import "./mercado.js";
import "./lista.js";
import "./historico.js";
import "./perfil.js"; // perfil.js já se conecta sozinho aos elementos da tela
import "./grupos.js";

iniciarTermos();
iniciarNavegacao();
iniciarVoltar();
iniciarConfiguracoes();
ativarMascarasDeDinheiro();

// Botão X no canto de cima de todos os modais
document.querySelectorAll(".modal-conteudo").forEach((conteudo) => {
  const botaoX = document.createElement("button");
  botaoX.type = "button";
  botaoX.className = "botao-fechar-modal";
  botaoX.setAttribute("aria-label", "Fechar");
  botaoX.textContent = "✕";
  botaoX.addEventListener("click", () => {
    conteudo.closest(".modal").classList.add("oculto");
  });
  conteudo.prepend(botaoX);
});

// Clicar fora de qualquer modal (no fundo escuro) fecha o modal.
// Guarda onde o clique começou, para não fechar quando a pessoa começa
// a selecionar um texto dentro do modal e solta o dedo/mouse do lado de fora.
let cliqueComecouNoFundo = false;
document.addEventListener("pointerdown", (evento) => {
  cliqueComecouNoFundo = evento.target.classList.contains("modal");
});
document.addEventListener("click", (evento) => {
  if (cliqueComecouNoFundo && evento.target.classList.contains("modal")) {
    evento.target.classList.add("oculto");
  }
  cliqueComecouNoFundo = false;
});

// Enter pula para o próximo campo do formulário. No último campo, envia
// o formulário normalmente. Em modais sem formulário (ex: orçamento,
// código de convite), o Enter aperta o botão principal do modal.
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Enter" || evento.target.tagName !== "INPUT") return;
  const campo = evento.target;

  const formulario = campo.form;
  if (formulario) {
    const campos = [...formulario.querySelectorAll("input:not([type=hidden]):not([disabled])")];
    const proximo = campos[campos.indexOf(campo) + 1];
    if (proximo) {
      evento.preventDefault();
      proximo.focus();
    }
    return;
  }

  const modal = campo.closest(".modal-conteudo");
  const botaoPrincipal = modal && modal.querySelector(".botao-primario");
  if (botaoPrincipal) {
    evento.preventDefault();
    botaoPrincipal.click();
  }
});
