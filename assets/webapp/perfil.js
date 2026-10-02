// perfil.js
// Login (opcional) com Google e avatar no topo da tela.
// Os grupos compartilhados ficam em grupos.js.
//
// O app funciona sem conta: ao abrir, entra automaticamente como usuário
// anônimo do Firebase (cada aparelho tem seu próprio id). Só pedimos login
// com Google quando a pessoa quer algo que precisa de conta (ex: grupo com
// o parceiro). Nesse momento a conta anônima é "promovida" para Google com
// linkWithPopup, mantendo o mesmo id — então nada do que já foi salvo se perde.
//
// Usamos popup (e não redirect) porque os navegadores atuais bloqueiam o
// armazenamento de terceiros que o signInWithRedirect precisa quando o app
// está num domínio diferente do authDomain: a tela do Google abria e o app
// voltava sem ter logado.

import { auth, db, googleProvider } from "./firebase-config.js";
import {
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { inicialDoNome } from "./utils.js";
import { recortarFoto } from "./recorte-foto.js";
import { avisar } from "./dialogo.js";
import { definirGrupoAtual, definirPerfilAtual, obterPerfilAtual } from "./estado.js";

const btnPerfil = document.getElementById("btn-perfil");

const modalPerfil = document.getElementById("modal-perfil");
const perfilNomeEl = document.getElementById("perfil-nome-exibicao");
const btnLoginGoogle = document.getElementById("btn-login-google");
const btnLogout = document.getElementById("btn-logout");
const btnAbrirConfiguracoes = document.getElementById("btn-abrir-configuracoes");
const areaLogado = document.getElementById("perfil-area-logado");
const areaDeslogado = document.getElementById("perfil-area-deslogado");


let fotoDoGoogle = null;

// ===== Foto do perfil =====
const perfilFotoEl = document.getElementById("perfil-foto");
const btnEditarFoto = document.getElementById("btn-editar-foto");
const menuFoto = document.getElementById("menu-foto");
const opcaoFotoGoogle = document.getElementById("opcao-foto-google");
const inputFotoCamera = document.getElementById("input-foto-camera");
const inputFotoGaleria = document.getElementById("input-foto-galeria");

/**
 * Mostra a foto (ou a inicial) no botão do topo e no perfil.
 */
function mostrarFoto(perfil) {
  [btnPerfil, perfilFotoEl].forEach((el) => {
    el.innerHTML = "";
    if (perfil.fotoURL) {
      const img = document.createElement("img");
      img.src = perfil.fotoURL;
      img.alt = perfil.nome;
      img.referrerPolicy = "no-referrer"; // fotos do Google às vezes recusam com referrer
      img.addEventListener("error", () => {
        el.textContent = inicialDoNome(perfil.nome);
      });
      el.appendChild(img);
    } else {
      el.textContent = inicialDoNome(perfil.nome);
    }
  });
}

btnEditarFoto.addEventListener("click", (evento) => {
  evento.stopPropagation();
  opcaoFotoGoogle.classList.toggle("oculto", !fotoDoGoogle);
  menuFoto.classList.toggle("oculto");
});

// Clicar em qualquer outro lugar fecha o menuzinho
document.addEventListener("click", (evento) => {
  if (!menuFoto.contains(evento.target)) menuFoto.classList.add("oculto");
});

menuFoto.addEventListener("click", (evento) => {
  const origem = evento.target.dataset.origem;
  if (!origem) return;
  menuFoto.classList.add("oculto");
  if (origem === "camera") inputFotoCamera.click();
  if (origem === "galeria") inputFotoGaleria.click();
  if (origem === "google") salvarFoto(fotoDoGoogle, false);
});

[inputFotoCamera, inputFotoGaleria].forEach((input) => {
  input.addEventListener("change", async () => {
    const arquivo = input.files && input.files[0];
    input.value = "";
    if (!arquivo) return;
    let foto;
    try {
      foto = await recortarFoto(arquivo); // abre a tela de enquadrar
    } catch (erro) {
      console.error("Erro ao ler a foto:", erro);
      avisar({ emoji: "🖼️", titulo: "Não deu para abrir essa foto", mensagem: `Tente outra imagem (JPG ou PNG). (${erro.message || erro})` });
      return;
    }
    if (foto) salvarFoto(foto, true); // null = cancelou
  });
});

async function salvarFoto(fotoURL, personalizada) {
  const perfil = obterPerfilAtual();
  if (!perfil) return;
  const novoPerfil = { ...perfil, fotoURL };
  mostrarFoto(novoPerfil);
  try {
    await updateDoc(doc(db, "usuarios", perfil.uid), { fotoURL, fotoPersonalizada: personalizada });
    definirPerfilAtual(novoPerfil);
  } catch (erro) {
    console.error("Erro ao salvar a foto:", erro);
    mostrarFoto(perfil);
    avisar({ emoji: "😕", titulo: "Não deu para salvar a foto", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

function fecharModalPerfil() {
  modalPerfil.classList.add("oculto");
}

btnPerfil.addEventListener("click", () => {
  modalPerfil.classList.remove("oculto");
});


function temContaGoogle() {
  return !!auth.currentUser && !auth.currentUser.isAnonymous;
}

// ===== Login / Logout =====

/**
 * Garante que a pessoa está logada com Google antes de continuar.
 * Retorna true se já estava logada ou se o login deu certo.
 * Use antes de qualquer ação que precise de conta. Precisa ser chamada
 * direto no clique (sem await antes), senão o navegador bloqueia o popup.
 */
export async function exigirLogin() {
  if (temContaGoogle()) return true;
  return entrarComGoogle();
}

/**
 * "tentativaAutomatica" marca uma segunda tentativa feita sozinha pelo
 * próprio app (não pela pessoa), usada quando o Google fecha a janela de
 * login sem terminar. Isso é comum dentro do app Android (TWA): a pessoa
 * escolhe a conta, a aba de login fecha, mas o Firebase recebe um erro de
 * "fechada pelo usuário" mesmo o login às vezes já tendo passado por baixo.
 * Por isso, antes de desistir, conferimos se já logou e, se não, tentamos
 * mais uma vez sozinhos — é o mesmo que a pessoa clicar de novo.
 */
async function entrarComGoogle(tentativaAutomatica = false) {
  const usuarioAnonimo = auth.currentUser && auth.currentUser.isAnonymous
    ? auth.currentUser
    : null;

  try {
    if (usuarioAnonimo) {
      // Transforma a conta anônima em conta Google (mesmo id, mesmos dados)
      const resultado = await linkWithPopup(usuarioAnonimo, googleProvider);
      await copiarNomeDoGoogle(resultado.user);
      await aplicarUsuario(resultado.user);
    } else {
      const resultado = await signInWithPopup(auth, googleProvider);
      await aplicarUsuario(resultado.user);
    }
    return true;
  } catch (erro) {
    // Essa conta Google já foi usada antes (ex: em outro aparelho):
    // entra nela e leva junto o que foi salvo sem conta neste aparelho.
    if (erro.code === "auth/credential-already-in-use" && usuarioAnonimo) {
      const credencial = GoogleAuthProvider.credentialFromError(erro);
      const uidAnonimo = usuarioAnonimo.uid;
      const resultado = await signInWithCredential(auth, credencial);
      await migrarDadosAnonimos(uidAnonimo, resultado.user.uid);
      await aplicarUsuario(resultado.user);
      return true;
    }

    if (erro.code === "auth/popup-closed-by-user" ||
        erro.code === "auth/cancelled-popup-request") {
      // Às vezes o login terminou de verdade apesar do erro (a página só
      // ainda não tinha percebido). Confere antes de tentar de novo.
      if (temContaGoogle()) return true;
      if (!tentativaAutomatica) return entrarComGoogle(true);
      return false;
    }

    console.error("Erro no login:", erro);
    if (erro.code === "auth/popup-blocked") {
      avisar({ emoji: "🚫", titulo: "Janela bloqueada", mensagem: "O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo." });
    } else if (erro.code === "auth/unauthorized-domain") {
      avisar({ emoji: "🔒", titulo: "Endereço não autorizado", mensagem: "Este endereço não está autorizado no Firebase (Authentication > Settings > Authorized domains)." });
    } else {
      avisar({ emoji: "😕", titulo: "Não deu para entrar", mensagem: `Não foi possível concluir o login com Google (${erro.code || "erro desconhecido"}).` });
    }
    return false;
  }
}

/**
 * Ao promover uma conta anônima, o Firebase não preenche o nome e a foto
 * automaticamente — copiamos do perfil Google que acabou de ser vinculado.
 */
async function copiarNomeDoGoogle(usuario) {
  if (usuario.displayName) return;
  const dadosGoogle = usuario.providerData.find((p) => p.providerId === "google.com");
  if (!dadosGoogle) return;
  try {
    await updateProfile(usuario, {
      displayName: dadosGoogle.displayName,
      photoURL: dadosGoogle.photoURL
    });
  } catch (erro) {
    console.warn("Não foi possível copiar o nome do Google:", erro);
  }
}

/**
 * Passa as compras e a lista de compras feitas sem conta para a conta
 * Google em que a pessoa acabou de entrar. Melhor esforço: se falhar,
 * o app continua funcionando normalmente.
 */
async function migrarDadosAnonimos(uidAntigo, uidNovo) {
  try {
    const snapUsuario = await getDoc(doc(db, "usuarios", uidNovo));
    const escopoNovo = (snapUsuario.exists() && snapUsuario.data().grupoId) || uidNovo;

    const lote = writeBatch(db);
    for (const nomeColecao of ["compras", "listasDeCompras"]) {
      const consulta = query(collection(db, nomeColecao), where("escopoId", "==", uidAntigo));
      const snapshot = await getDocs(consulta);
      snapshot.docs.forEach((d) => lote.update(d.ref, { escopoId: escopoNovo }));
    }
    await lote.commit();
  } catch (erro) {
    console.warn("Não foi possível migrar os dados feitos sem conta:", erro);
  }
}

btnLoginGoogle.addEventListener("click", () => {
  entrarComGoogle();
});

btnLogout.addEventListener("click", async () => {
  fecharModalPerfil();
  // Ao sair, onAuthStateChanged entra de novo como anônimo automaticamente
  await signOut(auth);
});

// ===== Reage a mudanças de login =====
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    mostrarDeslogado();
    try {
      await signInAnonymously(auth);
    } catch (erro) {
      // Ex: login anônimo desativado no Firebase, ou primeira vez sem internet
      console.warn("Não foi possível entrar como anônimo:", erro.code);
      definirGrupoAtual(null);
    }
    return;
  }

  await aplicarUsuario(usuario);
});

function mostrarDeslogado() {
  btnPerfil.innerHTML = '<span id="perfil-inicial">?</span>';
  areaLogado.classList.add("oculto");
  areaDeslogado.classList.remove("oculto");
  btnLogout.classList.add("oculto");
  definirPerfilAtual(null);
}

/**
 * Atualiza a tela e o escopo de dados para o usuário atual.
 * Também é chamada depois do linkWithPopup, porque promover a conta
 * anônima não dispara o onAuthStateChanged (o id continua o mesmo).
 */
async function aplicarUsuario(usuario) {
  if (usuario.isAnonymous) {
    mostrarDeslogado();
    // Avisa as telas para carregarem os dados deste usuário anônimo
    definirGrupoAtual(null);
    return;
  }

  const dadosGoogle = usuario.providerData.find((p) => p.providerId === "google.com");
  fotoDoGoogle = usuario.photoURL || (dadosGoogle && dadosGoogle.photoURL) || null;
  const perfil = {
    uid: usuario.uid,
    nome: usuario.displayName || (dadosGoogle && dadosGoogle.displayName) || "Sem nome",
    fotoURL: fotoDoGoogle
  };

  // Garante que existe um documento do usuário salvo no Firestore,
  // e recupera o grupo em uso e a foto escolhida pela pessoa (se houver).
  const refUsuario = doc(db, "usuarios", usuario.uid);
  let grupoId = null;
  try {
    const snapUsuario = await getDoc(refUsuario);
    if (snapUsuario.exists()) {
      const dados = snapUsuario.data();
      grupoId = dados.grupoId || null;
      if (dados.fotoPersonalizada && dados.fotoURL) perfil.fotoURL = dados.fotoURL;
      // Corrige nome/foto desatualizados (ex: quem ficou salvo como "Sem nome")
      if (dados.nome !== perfil.nome || dados.fotoURL !== perfil.fotoURL) {
        await updateDoc(refUsuario, { nome: perfil.nome, fotoURL: perfil.fotoURL });
      }
    } else {
      await setDoc(refUsuario, {
        nome: perfil.nome,
        fotoURL: perfil.fotoURL,
        grupoId: null
      });
    }
  } catch (erro) {
    console.warn("Não foi possível carregar o perfil:", erro);
  }

  definirPerfilAtual(perfil);
  mostrarFoto(perfil);
  perfilNomeEl.textContent = perfil.nome;
  areaLogado.classList.remove("oculto");
  areaDeslogado.classList.add("oculto");
  btnLogout.classList.remove("oculto");

  definirGrupoAtual(grupoId);
}

// ===== Atalho para abrir Configurações a partir do perfil =====
btnAbrirConfiguracoes.addEventListener("click", () => {
  modalPerfil.classList.add("oculto");
  document.getElementById("modal-configuracoes").classList.remove("oculto");
});
