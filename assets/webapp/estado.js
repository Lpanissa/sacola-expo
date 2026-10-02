// estado.js
// Estado compartilhado entre as várias telas do app: quem está logado
// e qual "grupo" (compartilhamento com o parceiro) está ativo agora.

import { auth } from "./firebase-config.js";

let grupoIdAtual = null;
let perfilAtual = null; // { uid, nome, fotoURL }

export function definirGrupoAtual(grupoId) {
  grupoIdAtual = grupoId;
  document.dispatchEvent(new CustomEvent("escopo-mudou"));
}

export function obterGrupoAtual() {
  return grupoIdAtual;
}

export function definirPerfilAtual(perfil) {
  perfilAtual = perfil;
  document.dispatchEvent(new CustomEvent("perfil-mudou", { detail: perfil }));
}

export function obterPerfilAtual() {
  return perfilAtual;
}

/**
 * true quando o grupo em uso já passou da data de término: tudo fica só
 * para consulta (ninguém adiciona nem apaga nada). Quem liga/desliga é o
 * grupos.js, pela classe "modo-consulta" no <body>.
 */
export function emModoConsulta() {
  return document.body.classList.contains("modo-consulta");
}

/**
 * O "escopo" decide de quem são os dados (compras, listas, histórico):
 * - se a pessoa está num grupo compartilhado, usa o id do grupo
 * - senão, usa o id do próprio usuário (Google ou anônimo — cada aparelho
 *   sem conta tem seu próprio id anônimo)
 * - "local" só se nem o login anônimo funcionou
 */
export function obterEscopoAtual() {
  if (grupoIdAtual) return grupoIdAtual;
  if (auth.currentUser) return auth.currentUser.uid;
  return "local";
}
