// avisos.js
// Balãozinho discreto no topo quando alguém do grupo mexe nas compras:
// adiciona item numa lista, cria uma lista ou compra um item na compra
// aberta. Só um balão por vez: um aviso novo substitui o anterior.
// Pode ser desligado nas Configurações (fica salvo neste aparelho).

import { auth } from "./firebase-config.js";
import { membroDoCache, criarAvatar } from "./grupos.js";

const CHAVE_AVISOS = "sacola_avisos_grupo";
const DURACAO_MS = 4500;

let balaoEl = null;
let temporizador = null;

export function avisosLigados() {
  try {
    return localStorage.getItem(CHAVE_AVISOS) !== "desligado";
  } catch {
    return true;
  }
}

export function definirAvisosLigados(ligados) {
  try {
    localStorage.setItem(CHAVE_AVISOS, ligados ? "ligado" : "desligado");
  } catch {
    // sem localStorage: vale só até fechar o app
  }
  if (!ligados) esconder();
}

/**
 * Mostra o aviso se: os avisos estão ligados, a pessoa está num grupo
 * e quem fez a ação foi outra pessoa. "texto" recebe o primeiro nome.
 * Ex: avisarAtividade(uid, (nome) => `${nome} adicionou Leite à lista`)
 */
export function avisarAtividade(autorId, texto, emoji = "🛒") {
  if (!avisosLigados() || !autorId) return;
  if (auth.currentUser && autorId === auth.currentUser.uid) return;
  const autor = membroDoCache(autorId); // só gente dos meus grupos
  if (!autor) return;

  mostrar(autor, `${emoji} ${texto(autor.nome.split(" ")[0])}`);
}

function mostrar(autor, texto) {
  if (!balaoEl) {
    balaoEl = document.createElement("div");
    balaoEl.className = "balao-aviso";
    balaoEl.setAttribute("role", "status");
    balaoEl.addEventListener("click", esconder);
    document.body.appendChild(balaoEl);
  }

  // Substitui o aviso anterior
  balaoEl.innerHTML = "";
  balaoEl.appendChild(criarAvatar(autor));
  const textoEl = document.createElement("span");
  textoEl.textContent = texto;
  balaoEl.appendChild(textoEl);

  // Reinicia a animação de entrada
  balaoEl.classList.remove("visivel");
  void balaoEl.offsetWidth;
  balaoEl.classList.add("visivel");

  clearTimeout(temporizador);
  temporizador = setTimeout(esconder, DURACAO_MS);
}

function esconder() {
  if (balaoEl) balaoEl.classList.remove("visivel");
}
