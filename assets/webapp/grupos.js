// grupos.js
// Grupos compartilhados: a pessoa pode estar em vários grupos (casa,
// amigos, trabalho...) e escolhe qual está usando agora. Cada grupo tem
// suas próprias compras e listas. "Só eu" = compras pessoais.
//
// Dados no Firestore:
// - grupos/{id}: { nome, codigo, membros: [uid, ...] }
// - usuarios/{uid}: { nome, fotoURL, grupoId } (grupoId = grupo em uso)

import { db, auth } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  Timestamp,
  FieldPath,
  deleteField
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { definirGrupoAtual, obterGrupoAtual, obterPerfilAtual } from "./estado.js";
import { exigirLogin } from "./perfil.js";
import { avisar, confirmar } from "./dialogo.js";
import { inicialDoNome, hojeISO, formatarData } from "./utils.js";
import { recortarFoto } from "./recorte-foto.js";
import { ativarDeslizar, criarLinhaDeslizavel, iconeSVG } from "./deslizar.js";
import { desenharQRCode, abrirLeitorQR, extrairCodigoDeConvite } from "./qrcode-convite.js";

const topbarGrupoEl = document.getElementById("topbar-grupo");
const btnMeusGrupos = document.getElementById("btn-meus-grupos");
const modalPerfil = document.getElementById("modal-perfil");

const modalGrupos = document.getElementById("modal-grupos");
const gruposListaEl = document.getElementById("grupos-lista");
const btnCriarGrupo = document.getElementById("btn-criar-grupo");
const btnEntrarGrupo = document.getElementById("btn-entrar-grupo");

const modalNovoGrupo = document.getElementById("modal-novo-grupo");
const inputNomeGrupo = document.getElementById("input-nome-grupo");
const btnConfirmarNovoGrupo = document.getElementById("btn-confirmar-novo-grupo");

const modalConvite = document.getElementById("modal-convite");
const codigoConviteEl = document.getElementById("codigo-convite-gerado");
const conviteAreaCodigo = document.getElementById("convite-area-codigo");
const conviteAreaEntrar = document.getElementById("convite-area-entrar");
const inputCodigoEntrar = document.getElementById("input-codigo-entrar");
const btnConfirmarEntrarGrupo = document.getElementById("btn-confirmar-entrar-grupo");

let meusGrupos = [];            // [{ id, nome, codigo, membros }]
let gruposConfirmados = false;  // já veio a lista de grupos do servidor (não só do cache)
const saindoDe = new Set();     // grupos que a própria pessoa está saindo (não é "remoção")
const avisadosSemAcesso = new Set();
let cancelarListenerGrupos = null;
const cacheMembros = new Map(); // uid -> { nome, fotoURL }

// ===== Membros (nome e foto de cada pessoa) =====
// Nome e foto vêm, de preferência, do próprio grupo (grupos/{id}.perfis),
// que todo participante consegue ler. O cadastro (usuarios/{uid}) é só
// um reserva: muitas regras do Firestore só deixam cada um ler o seu.
async function carregarMembro(uid) {
  if (cacheMembros.has(uid)) return cacheMembros.get(uid);
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    if (snap.exists() && snap.data().nome) {
      const membro = { nome: snap.data().nome, fotoURL: snap.data().fotoURL || null };
      cacheMembros.set(uid, membro);
      return membro;
    }
  } catch {
    // sem permissão ou sem internet: não guarda, tenta de novo depois
  }
  return { nome: "Alguém", fotoURL: null };
}

/**
 * Nome e foto de um participante a partir dos dados do grupo (perfis
 * publicados), com o cadastro como reserva.
 */
async function membroDoGrupo(dadosGrupo, uid) {
  const publicado = (dadosGrupo.perfis || {})[uid];
  if (publicado && publicado.nome) return { nome: publicado.nome, fotoURL: publicado.fotoURL || null };
  return carregarMembro(uid);
}

/**
 * Cada participante grava o próprio nome e foto dentro de cada grupo em
 * que está (só quando mudou), para os outros verem.
 */
function publicarMeuPerfilNosGrupos() {
  const perfil = obterPerfilAtual();
  if (!perfil) return;
  const meu = { nome: perfil.nome, fotoURL: perfil.fotoURL || null };
  meusGrupos.forEach((grupo) => {
    const salvo = (grupo.perfis || {})[perfil.uid];
    if (salvo && salvo.nome === meu.nome && salvo.fotoURL === meu.fotoURL) return;
    updateDoc(doc(db, "grupos", grupo.id), new FieldPath("perfis", perfil.uid), meu)
      .catch((erro) => console.warn("Não foi possível publicar o perfil no grupo:", erro));
  });
}

/**
 * Quem adicionou um item, para mostrar a fotinha — só quando a compra é
 * de um grupo (nas compras pessoais é sempre a própria pessoa).
 */
/**
 * Nome e foto de alguém dos meus grupos (null se ainda não carregou).
 */
export function membroDoCache(uid) {
  return cacheMembros.get(uid) || null;
}

/**
 * Grupos em que a pessoa está: [{ id, nome, foto, codigo, membros, ... }]
 */
export function obterMeusGrupos() {
  return meusGrupos;
}

export function autorDoItem(uid) {
  if (!obterGrupoAtual() || !uid) return null;
  return cacheMembros.get(uid) || null;
}

/**
 * Cria a bolinha com a foto da pessoa (ou a inicial do nome, colorida).
 */
export function criarAvatar(membro, classe = "avatar-mini") {
  const el = document.createElement("span");
  el.className = classe;
  el.title = membro.nome;
  if (membro.fotoURL) {
    const img = document.createElement("img");
    img.src = membro.fotoURL;
    img.alt = membro.nome;
    img.referrerPolicy = "no-referrer"; // fotos do Google às vezes recusam com referrer
    img.addEventListener("error", () => {
      img.remove();
      el.textContent = inicialDoNome(membro.nome);
    });
    el.appendChild(img);
  } else {
    el.textContent = inicialDoNome(membro.nome);
  }
  el.style.setProperty("--cor-avatar", corDoNome(membro.nome));
  return el;
}

function corDoNome(nome) {
  const cores = ["#FF9CB8", "#B7A6FF", "#7ED9B5", "#FFAE8A", "#FFD66B", "#7EC8F2"];
  let soma = 0;
  for (const letra of nome || "") soma += letra.charCodeAt(0);
  return cores[soma % cores.length];
}

// ===== Observa os grupos em que a pessoa está =====
function observarMeusGrupos() {
  if (cancelarListenerGrupos) cancelarListenerGrupos();
  cancelarListenerGrupos = null;
  meusGrupos = [];

  const perfil = obterPerfilAtual();
  if (perfil) cacheMembros.set(perfil.uid, { nome: perfil.nome, fotoURL: perfil.fotoURL });

  const usuario = auth.currentUser;
  if (!usuario || usuario.isAnonymous) {
    atualizarTopo();
    return;
  }

  const consulta = query(collection(db, "grupos"), where("membros", "array-contains", usuario.uid));
  cancelarListenerGrupos = onSnapshot(consulta, async (snapshot) => {
    const antes = new Map(meusGrupos.map((g) => [g.id, g]));
    meusGrupos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!snapshot.metadata.fromCache) {
      // Grupo que sumiu sem a pessoa ter saído: um administrador a removeu
      const agora = new Set(meusGrupos.map((g) => g.id));
      antes.forEach((grupo, id) => {
        if (!agora.has(id) && !saindoDe.has(id)) avisarSemAcesso(id, grupo);
        saindoDe.delete(id);
      });
      gruposConfirmados = true;
      verificarAcessoAoGrupoAtual();
    }
    // Nome e foto de todo mundo: primeiro o que está gravado nos grupos
    meusGrupos.forEach((grupo) => {
      Object.entries(grupo.perfis || {}).forEach(([uid, dados]) => {
        if (dados && dados.nome) cacheMembros.set(uid, { nome: dados.nome, fotoURL: dados.fotoURL || null });
      });
    });
    const perfilAtual = obterPerfilAtual();
    if (perfilAtual) cacheMembros.set(perfilAtual.uid, { nome: perfilAtual.nome, fotoURL: perfilAtual.fotoURL });
    // Quem ainda não publicou no grupo: tenta o cadastro
    const uids = new Set(meusGrupos.flatMap((g) => g.membros || []));
    await Promise.all([...uids].filter((uid) => !cacheMembros.has(uid)).map(carregarMembro));
    publicarMeuPerfilNosGrupos();
    atualizarTopo();
    if (!modalGrupos.classList.contains("oculto")) renderizarGrupos();
    // Avisa as telas (ex: fotinhas nos itens da compra, listas dos grupos)
    document.dispatchEvent(new CustomEvent("membros-mudou"));
    document.dispatchEvent(new CustomEvent("grupos-mudou"));
  }, (erro) => console.warn("Não foi possível carregar os grupos:", erro));
}

document.addEventListener("perfil-mudou", observarMeusGrupos);

/**
 * Grupo em uso que não está mais nos meus grupos (fui removido, inclusive
 * com o app fechado): avisa e volta para "Só eu".
 */
function verificarAcessoAoGrupoAtual() {
  const grupoId = obterGrupoAtual();
  if (!gruposConfirmados || !grupoId || !obterPerfilAtual()) return;
  if (!meusGrupos.some((g) => g.id === grupoId)) avisarSemAcesso(grupoId, null);
}

function avisarSemAcesso(grupoId, grupo) {
  if (grupoId === obterGrupoAtual()) usarGrupo(null);
  if (avisadosSemAcesso.has(grupoId)) return;
  avisadosSemAcesso.add(grupoId);
  avisar({
    emoji: "🔒",
    titulo: grupo ? `Você não faz mais parte de ${nomeDoGrupo(grupo)}` : "Você não tem mais acesso a esse grupo",
    mensagem: "Um administrador tirou você do grupo. As compras e listas dele não aparecem mais para você.",
    textoOk: "Entendi"
  });
}

document.addEventListener("escopo-mudou", verificarAcessoAoGrupoAtual);
document.addEventListener("escopo-mudou", atualizarTopo);

// ===== Término do grupo =====
// Grupo com "expiraEm" no passado fica só para consulta: ninguém entra e
// ninguém adiciona nada; ele continua aparecendo em "Encerrados".
export function grupoEncerrado(grupo) {
  return !!(grupo && grupo.expiraEm && grupo.expiraEm.toMillis() < Date.now());
}

function dataDeTermino(grupo) {
  return grupo.expiraEm ? formatarData(grupo.expiraEm.toDate()) : "";
}

export function nomeDoGrupo(grupo) {
  return grupo.nome || `Grupo ${grupo.codigo}`;
}

// O botão do topo sempre aparece: mostra o grupo em uso ou, nas compras
// "Só eu", um ícone e o texto "Só eu" — assim dá pra trocar de grupo de
// qualquer tela, mesmo sem estar num grupo agora.
function atualizarTopo() {
  const grupo = meusGrupos.find((g) => g.id === obterGrupoAtual());
  atualizarModoConsulta(grupo);
  topbarGrupoEl.innerHTML = "";
  if (grupo) {
    topbarGrupoEl.appendChild(criarFotoDoGrupo(grupo, "grupo-foto-mini"));
    const nome = document.createElement("span");
    nome.textContent = nomeDoGrupo(grupo);
    topbarGrupoEl.appendChild(nome);
  } else {
    const foto = document.createElement("span");
    foto.className = "grupo-foto-mini sem-foto";
    foto.innerHTML = iconeSVG("pessoa", "icone-grupo-vazio");
    topbarGrupoEl.appendChild(foto);
    const nome = document.createElement("span");
    nome.textContent = "Só eu";
    topbarGrupoEl.appendChild(nome);
  }
  topbarGrupoEl.title = "Meus grupos";
  topbarGrupoEl.classList.remove("oculto");
}

// Grupo em uso já terminou: tudo só para consulta + faixa avisando
const avisoConsultaEl = document.getElementById("aviso-consulta");
function atualizarModoConsulta(grupo) {
  const encerrado = grupoEncerrado(grupo);
  document.body.classList.toggle("modo-consulta", encerrado);
  avisoConsultaEl.classList.toggle("oculto", !encerrado);
  if (encerrado) {
    avisoConsultaEl.innerHTML = "";
    avisoConsultaEl.insertAdjacentHTML("afterbegin", iconeSVG("relogio", "icone-menu"));
    const texto = document.createElement("span");
    texto.textContent = `${nomeDoGrupo(grupo)} terminou em ${dataDeTermino(grupo)} · só para consulta`;
    avisoConsultaEl.appendChild(texto);
  }
  document.dispatchEvent(new CustomEvent("consulta-mudou", { detail: { encerrado } }));
}

// A data de término pode passar com o app aberto
setInterval(() => atualizarTopo(), 60 * 1000);

// ===== Modal "Meus grupos" =====
async function abrirMeusGrupos() {
  const logado = await exigirLogin();
  if (!logado) return;
  modalPerfil.classList.add("oculto");
  mostrarOpcoesNovoGrupo(false);
  renderizarGrupos();
  modalGrupos.classList.remove("oculto");
}

topbarGrupoEl.addEventListener("click", abrirMeusGrupos);
btnMeusGrupos.addEventListener("click", abrirMeusGrupos);

function renderizarGrupos() {
  const perfil = obterPerfilAtual();
  const grupoAtual = obterGrupoAtual();
  gruposListaEl.innerHTML = "";

  // "Só eu": compras pessoais
  const pessoal = document.createElement("li");
  pessoal.className = "grupo-card" + (!grupoAtual ? " ativo" : "");
  pessoal.innerHTML = `
    <div class="grupo-topo">
      <div class="grupo-identidade">
        <span class="grupo-foto-area"></span>
        <span class="grupo-nome">Só eu</span>
      </div>
      ${!grupoAtual ? '<span class="grupo-selo">Em uso</span>' : ""}
    </div>
    <p class="grupo-membros-texto">Suas compras pessoais, só você vê.</p>
  `;
  if (perfil) pessoal.querySelector(".grupo-foto-area").appendChild(criarAvatar(perfil, "grupo-foto"));
  pessoal.addEventListener("click", () => usarGrupo(null));
  gruposListaEl.appendChild(pessoal);

  const ativos = meusGrupos.filter((g) => !grupoEncerrado(g));
  const encerrados = meusGrupos
    .filter(grupoEncerrado)
    .sort((a, b) => b.expiraEm.toMillis() - a.expiraEm.toMillis());

  [...ativos, ...encerrados].forEach((grupo, indice) => {
    const encerrado = grupoEncerrado(grupo);
    if (encerrado && indice === ativos.length) {
      const titulo = document.createElement("li");
      titulo.className = "grupos-secao";
      titulo.textContent = "Encerrados · só para consulta";
      gruposListaEl.appendChild(titulo);
    }
    const ativo = grupo.id === grupoAtual;
    const membros = (grupo.membros || []).map((uid) => ({ uid, ...(cacheMembros.get(uid) || { nome: "Alguém" }) }));
    const nomes = membros.map((m) => (perfil && m.uid === perfil.uid ? "você" : m.nome.split(" ")[0]));
    const podeEditar = perfil && ehAdminDoGrupo(grupo, perfil.uid) && !encerrado;

    const { linha, frente: card } = criarLinhaDeslizavel({
      classeExtra: "grupo-item",
      iconeEditar: "link",
      iconeApagar: "sair"
    });
    card.classList.add("grupo-card");
    if (ativo) card.classList.add("ativo");
    if (encerrado) card.classList.add("encerrado");
    card.innerHTML = `
      <div class="grupo-topo">
        <div class="grupo-identidade">
          <span class="grupo-foto-area">
            ${podeEditar ? `<button type="button" class="btn-editar-foto grupo-lapis" aria-label="Editar grupo">${iconeSVG("lapis", "icone-lapis")}</button>` : ""}
          </span>
          <span class="grupo-nome"></span>
        </div>
        ${ativo ? '<span class="grupo-selo">Em uso</span>' : ""}
      </div>
      <div class="grupo-avatares"></div>
      <p class="grupo-membros-texto"></p>
      ${grupo.expiraEm ? `<p class="grupo-termino">${encerrado ? "Terminou" : "Termina"} em ${dataDeTermino(grupo)}</p>` : ""}
    `;
    card.querySelector(".grupo-foto-area").prepend(criarFotoDoGrupo(grupo));
    card.querySelector(".grupo-nome").textContent = nomeDoGrupo(grupo);
    card.querySelector(".grupo-membros-texto").textContent =
      `${membros.length} ${membros.length === 1 ? "pessoa" : "pessoas"}: ${juntarNomes(nomes)}`;
    const avataresEl = card.querySelector(".grupo-avatares");
    membros.forEach((m) => avataresEl.appendChild(criarAvatar(m, "avatar-grupo")));
    // Tocar nas fotinhas abre os participantes (e não "usa" o grupo)
    const btnParticipantes = document.createElement("button");
    btnParticipantes.type = "button";
    btnParticipantes.className = "btn-participantes";
    btnParticipantes.textContent = "Participantes";
    btnParticipantes.addEventListener("click", (evento) => {
      evento.stopPropagation();
      abrirParticipantes(grupo);
    });
    avataresEl.appendChild(btnParticipantes);

    if (podeEditar) {
      const lapis = card.querySelector(".grupo-lapis");
      lapis.addEventListener("click", (evento) => {
        evento.stopPropagation();
        abrirMenuDoGrupo(grupo, lapis, card);
      });
    }

    ativarDeslizar(linha, card, {
      aoTocar: () => usarGrupo(grupo.id),
      // Grupo encerrado não convida mais ninguém
      aoEditar: encerrado ? () => {} : () => mostrarCodigo(grupo.codigo),
      aoApagar: () => sairDoGrupo(grupo),
      funcionaEmConsulta: true
    });

    gruposListaEl.appendChild(linha);
  });
}

// ===== Participantes: papéis e permissões =====
const modalParticipantes = document.getElementById("modal-participantes");
const participantesTituloEl = document.getElementById("participantes-titulo");
const participantesSubtituloEl = document.getElementById("participantes-subtitulo");
const participantesListaEl = document.getElementById("participantes-lista");
let participantesContexto = null; // { grupoId, tipoLista }

/**
 * Mostra quem está no grupo. Com tipoLista, mostra também quem pode
 * editar aquela lista (e deixa quem pode liberar/tirar essa permissão).
 */
export function abrirParticipantes(grupo, { tipoLista = null } = {}) {
  participantesContexto = { grupoId: grupo.id, tipoLista };
  renderizarParticipantes();
  modalParticipantes.classList.remove("oculto");
}

function renderizarParticipantes() {
  if (!participantesContexto) return;
  const grupo = meusGrupos.find((g) => g.id === participantesContexto.grupoId);
  if (!grupo) return;
  const { tipoLista } = participantesContexto;
  const eu = (obterPerfilAtual() || {}).uid;
  const souAdmin = ehAdminDoGrupo(grupo, eu) && !grupoEncerrado(grupo);
  const info = tipoLista ? (grupo.listasInfo || {})[tipoLista] || null : null;
  const criadorDaLista = info && info.criadorId;
  const possoLiberarLista = tipoLista && !grupoEncerrado(grupo) && (souAdmin || criadorDaLista === eu);

  participantesTituloEl.textContent = `Participantes · ${nomeDoGrupo(grupo)}`;
  participantesSubtituloEl.textContent = tipoLista
    ? (possoLiberarLista
      ? `Toque na chavinha para deixar alguém editar a lista ${tipoLista.toLowerCase()}.`
      : `Quem pode editar a lista ${tipoLista.toLowerCase()}.`)
    : (souAdmin ? "Você pode tornar alguém administrador do grupo." : "");

  participantesListaEl.innerHTML = "";
  (grupo.membros || []).forEach((uid) => {
    const membro = cacheMembros.get(uid) || { nome: "Alguém" };
    const criouGrupo = ehCriador(grupo, uid);
    const admin = criouGrupo || (grupo.admins || []).includes(uid);
    const criouLista = tipoLista && criadorDaLista === uid;
    const editaLista = tipoLista && (!criadorDaLista || admin || criouLista || ((info && info.editores) || []).includes(uid));

    // Admin remove participante arrastando para a esquerda. Ninguém remove
    // quem criou o grupo; só o criador remove outros administradores.
    const podeRemover = souAdmin && uid !== eu && !criouGrupo && (ehCriador(grupo, eu) || !admin);
    let item;
    let linha;
    if (podeRemover) {
      const deslizavel = criarLinhaDeslizavel({ classeExtra: "participante-item", iconeEditar: null, iconeApagar: "removerPessoa" });
      item = deslizavel.linha;
      linha = deslizavel.frente;
      linha.classList.add("participante");
      ativarDeslizar(item, linha, { aoApagar: () => removerParticipante(grupo, uid, membro) });
    } else {
      linha = document.createElement("li");
      linha.className = "participante";
      item = linha;
    }
    linha.appendChild(criarAvatar(membro, "avatar-grupo"));

    const textos = document.createElement("div");
    textos.className = "participante-textos";
    const nome = document.createElement("span");
    nome.className = "participante-nome";
    nome.textContent = uid === eu ? `${membro.nome} (você)` : membro.nome;
    textos.appendChild(nome);
    const papeis = [];
    if (criouGrupo) papeis.push("Criou o grupo");
    else if (admin) papeis.push("Administrador");
    if (criouLista) papeis.push("Criou esta lista");
    else if (tipoLista && editaLista && !admin) papeis.push("Pode editar esta lista");
    if (papeis.length) {
      const papel = document.createElement("span");
      papel.className = "participante-papel";
      papel.textContent = papeis.join(" · ");
      textos.appendChild(papel);
    }
    linha.appendChild(textos);

    // Chavinha: com lista, "pode editar esta lista"; sem lista, "administrador"
    if (uid !== eu && !criouGrupo) {
      if (tipoLista && possoLiberarLista && !admin && !criouLista) {
        linha.appendChild(criarChave(`Deixar ${membro.nome} editar a lista`, editaLista && !!criadorDaLista, (ligada) =>
          alterarEditorDaLista(grupo, tipoLista, uid, ligada)));
      } else if (!tipoLista && souAdmin) {
        linha.appendChild(criarChave(`Tornar ${membro.nome} administrador`, admin, (ligada) =>
          salvarNoGrupo(grupo.id, { admins: ligada ? arrayUnion(uid) : arrayRemove(uid) })));
      }
    }

    participantesListaEl.appendChild(item);
  });
}

async function removerParticipante(grupo, uid, membro) {
  const primeiroNome = membro.nome.split(" ")[0];
  const remover = await confirmar({
    emoji: "👋",
    titulo: `Remover ${primeiroNome} do grupo?`,
    mensagem: `${membro.nome} perde o acesso a ${nomeDoGrupo(grupo)}: as compras e listas do grupo somem para ${primeiroNome}.`,
    textoOk: "Remover",
    perigo: true
  });
  if (!remover) return;
  try {
    await updateDoc(
      doc(db, "grupos", grupo.id),
      "membros", arrayRemove(uid),
      "admins", arrayRemove(uid),
      new FieldPath("perfis", uid), deleteField()
    );
  } catch (erro) {
    console.error("Erro ao remover participante:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para remover", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

function criarChave(rotulo, ligada, aoMudar) {
  const chave = document.createElement("input");
  chave.type = "checkbox";
  chave.className = "chave";
  chave.setAttribute("role", "switch");
  chave.setAttribute("aria-label", rotulo);
  chave.checked = ligada;
  chave.addEventListener("change", () => aoMudar(chave.checked));
  return chave;
}

async function alterarEditorDaLista(grupo, tipo, uid, liberar) {
  const eu = (obterPerfilAtual() || {}).uid;
  const info = (grupo.listasInfo || {})[tipo];
  try {
    const campos = [new FieldPath("listasInfo", tipo, "editores"), liberar ? arrayUnion(uid) : arrayRemove(uid)];
    // Lista antiga sem dono registrado: quem está liberando (admin) vira o dono
    if (!info || !info.criadorId) campos.push(new FieldPath("listasInfo", tipo, "criadorId"), eu);
    await updateDoc(doc(db, "grupos", grupo.id), ...campos);
  } catch (erro) {
    console.error("Erro ao mudar permissão da lista:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para salvar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

// Atualiza o modal quando o grupo muda (ex: alguém entrou, permissão salva)
document.addEventListener("grupos-mudou", () => {
  if (!modalParticipantes.classList.contains("oculto")) renderizarParticipantes();
});

// ===== Foto e nome do grupo (só quem criou pode mudar) =====

// Grupos antigos não guardavam quem criou: vale quem entrou primeiro
export function ehCriador(grupo, uid) {
  return grupo.criadorId ? grupo.criadorId === uid : (grupo.membros || [])[0] === uid;
}

/**
 * Administrador do grupo: quem criou e quem ele (ou outro admin) promoveu.
 * Pode mudar nome/foto do grupo, editar todas as listas do grupo e
 * decidir quem pode editar cada lista.
 */
export function ehAdminDoGrupo(grupo, uid) {
  return !!grupo && !!uid && (ehCriador(grupo, uid) || (grupo.admins || []).includes(uid));
}

/**
 * Quem pode editar (adicionar, mudar, apagar itens) uma lista de grupo:
 * administradores, quem criou a lista e quem essa pessoa liberou.
 * Listas antigas, sem dono registrado, continuam abertas para todo mundo.
 */
export function podeEditarListaDoGrupo(grupo, tipo, uid) {
  if (!grupo || grupoEncerrado(grupo)) return false;
  if (ehAdminDoGrupo(grupo, uid)) return true;
  const info = (grupo.listasInfo || {})[tipo];
  if (!info || !info.criadorId) return true;
  return info.criadorId === uid || (info.editores || []).includes(uid);
}

/**
 * Bolinha com a foto do grupo (ou o ícone de pessoas se não tiver foto).
 */
export function criarFotoDoGrupo(grupo, classe = "grupo-foto") {
  const el = document.createElement("span");
  el.className = classe;
  if (grupo.foto) {
    const img = document.createElement("img");
    img.src = grupo.foto;
    img.alt = "";
    el.appendChild(img);
  } else {
    el.classList.add("sem-foto");
    el.innerHTML = iconeSVG("grupo", "icone-grupo-vazio");
  }
  return el;
}

// Menuzinho do lápis: fica solto na tela (position: fixed) logo abaixo do
// lápis, para não ser cortado pelo card que desliza.
const menuGrupoEl = document.createElement("div");
menuGrupoEl.className = "menu-foto menu-grupo oculto";
menuGrupoEl.setAttribute("role", "menu");
menuGrupoEl.innerHTML = `
  <button type="button" role="menuitem" data-acao="nome">${iconeSVG("lapis", "icone-menu")} Mudar nome</button>
  <button type="button" role="menuitem" data-acao="camera">${iconeSVG("camera", "icone-menu")} Câmera</button>
  <button type="button" role="menuitem" data-acao="galeria">${iconeSVG("imagem", "icone-menu")} Galeria</button>
  <button type="button" role="menuitem" data-acao="tirar-foto">${iconeSVG("lixeira", "icone-menu")} Tirar foto</button>
`;
document.body.appendChild(menuGrupoEl);

const inputFotoGrupoCamera = document.createElement("input");
inputFotoGrupoCamera.type = "file";
inputFotoGrupoCamera.accept = "image/*";
inputFotoGrupoCamera.capture = "environment";
inputFotoGrupoCamera.hidden = true;
const inputFotoGrupoGaleria = document.createElement("input");
inputFotoGrupoGaleria.type = "file";
inputFotoGrupoGaleria.accept = "image/*";
inputFotoGrupoGaleria.hidden = true;
document.body.append(inputFotoGrupoCamera, inputFotoGrupoGaleria);

let grupoDoMenu = null;
let cardDoMenu = null;

function abrirMenuDoGrupo(grupo, lapis, card) {
  grupoDoMenu = grupo;
  cardDoMenu = card;
  menuGrupoEl.querySelector('[data-acao="tirar-foto"]').classList.toggle("oculto", !grupo.foto);
  // Mostra primeiro para saber o tamanho, depois posiciona dentro da tela
  menuGrupoEl.style.visibility = "hidden";
  menuGrupoEl.classList.remove("oculto");
  const posicao = lapis.getBoundingClientRect();
  const largura = menuGrupoEl.offsetWidth;
  const altura = menuGrupoEl.offsetHeight;
  const margem = 12;
  const esquerda = Math.max(margem, Math.min(posicao.left, window.innerWidth - largura - margem));
  const cabeEmbaixo = posicao.bottom + 6 + altura <= window.innerHeight - margem;
  const topo = cabeEmbaixo ? posicao.bottom + 6 : Math.max(margem, posicao.top - altura - 6);
  menuGrupoEl.style.left = `${esquerda}px`;
  menuGrupoEl.style.top = `${topo}px`;
  menuGrupoEl.style.visibility = "";
}

function fecharMenuDoGrupo() {
  menuGrupoEl.classList.add("oculto");
}

// Clicar fora, rolar a lista ou fechar o modal fecha o menuzinho
document.addEventListener("click", (evento) => {
  if (!menuGrupoEl.contains(evento.target)) fecharMenuDoGrupo();
});
modalGrupos.addEventListener("scroll", fecharMenuDoGrupo, true);

menuGrupoEl.addEventListener("click", (evento) => {
  const acao = evento.target.dataset.acao;
  if (!acao || !grupoDoMenu) return;
  fecharMenuDoGrupo();
  if (acao === "nome") editarNomeDoGrupo(grupoDoMenu, cardDoMenu);
  if (acao === "camera") inputFotoGrupoCamera.click();
  if (acao === "galeria") inputFotoGrupoGaleria.click();
  if (acao === "tirar-foto") salvarNoGrupo(grupoDoMenu.id, { foto: null });
});

[inputFotoGrupoCamera, inputFotoGrupoGaleria].forEach((input) => {
  input.addEventListener("change", async () => {
    const arquivo = input.files && input.files[0];
    input.value = "";
    if (!arquivo || !grupoDoMenu) return;
    const grupoId = grupoDoMenu.id;
    let foto;
    try {
      foto = await recortarFoto(arquivo); // abre a tela de enquadrar
    } catch (erro) {
      console.error("Erro ao ler a foto:", erro);
      avisar({ emoji: "🖼️", titulo: "Não deu para abrir essa foto", mensagem: `Tente outra imagem (JPG ou PNG). (${erro.message || erro})` });
      return;
    }
    if (foto) await salvarNoGrupo(grupoId, { foto }); // null = cancelou
  });
});

async function salvarNoGrupo(grupoId, dados) {
  try {
    await updateDoc(doc(db, "grupos", grupoId), dados);
  } catch (erro) {
    console.error("Erro ao salvar o grupo:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para salvar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

/**
 * Troca o nome do grupo por um campo, direto no card.
 */
function editarNomeDoGrupo(grupo, card) {
  const nomeEl = card.querySelector(".grupo-nome");
  const form = document.createElement("form");
  form.className = "grupo-nome-form";
  form.innerHTML = `
    <input type="text" maxlength="30" aria-label="Nome do grupo">
    <button type="submit" class="edicao-botao edicao-salvar" aria-label="Salvar">✓</button>
  `;
  const campo = form.querySelector("input");
  campo.value = nomeDoGrupo(grupo);
  nomeEl.replaceWith(form);
  campo.focus();
  campo.select();

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nome = campo.value.trim();
    if (nome && nome !== grupo.nome) await salvarNoGrupo(grupo.id, { nome });
    renderizarGrupos();
  });
  // Toques no campo não contam como "usar o grupo"
  form.addEventListener("click", (evento) => evento.stopPropagation());
}

function juntarNomes(nomes) {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

async function usarGrupo(grupoId) {
  const perfil = obterPerfilAtual();
  if (!perfil) return;
  if (grupoId !== obterGrupoAtual()) {
    try {
      await updateDoc(doc(db, "usuarios", perfil.uid), { grupoId: grupoId || null });
    } catch (erro) {
      console.warn("Não foi possível salvar o grupo em uso:", erro);
    }
    definirGrupoAtual(grupoId || null);
  }
  modalGrupos.classList.add("oculto");
}

// ===== "Novo grupo": mostra as opções criar / entrar com código =====
const btnNovoGrupo = document.getElementById("btn-novo-grupo");
const opcoesNovoGrupo = document.getElementById("grupos-opcoes-novo");

function mostrarOpcoesNovoGrupo(mostrar) {
  btnNovoGrupo.classList.toggle("oculto", mostrar);
  opcoesNovoGrupo.classList.toggle("oculto", !mostrar);
}

btnNovoGrupo.addEventListener("click", () => mostrarOpcoesNovoGrupo(true));

// ===== Criar grupo =====
const inputTerminoGrupo = document.getElementById("input-termino-grupo");

btnCriarGrupo.addEventListener("click", () => {
  inputNomeGrupo.value = "";
  inputTerminoGrupo.value = "";
  inputTerminoGrupo.min = hojeISO();
  modalGrupos.classList.add("oculto");
  modalNovoGrupo.classList.remove("oculto");
  inputNomeGrupo.focus();
});

btnConfirmarNovoGrupo.addEventListener("click", async () => {
  const perfil = obterPerfilAtual();
  if (!perfil) return;
  const nome = inputNomeGrupo.value.trim() || "Meu grupo";
  // Termina no fim do dia escolhido (horário do aparelho)
  let expiraEm = null;
  if (inputTerminoGrupo.value) {
    const [ano, mes, dia] = inputTerminoGrupo.value.split("-").map(Number);
    expiraEm = Timestamp.fromDate(new Date(ano, mes - 1, dia, 23, 59, 59));
  }

  btnConfirmarNovoGrupo.disabled = true;
  try {
    const codigo = gerarCodigoConvite();
    const refGrupo = await addDoc(collection(db, "grupos"), {
      nome,
      codigo,
      criadorId: perfil.uid,
      foto: null,
      expiraEm,
      membros: [perfil.uid],
      perfis: { [perfil.uid]: { nome: perfil.nome, fotoURL: perfil.fotoURL || null } }
    });
    modalNovoGrupo.classList.add("oculto");
    await usarGrupo(refGrupo.id);
    mostrarCodigo(codigo);
  } catch (erro) {
    console.error("Erro ao criar grupo:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para criar o grupo", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  } finally {
    btnConfirmarNovoGrupo.disabled = false;
  }
});

function gerarCodigoConvite() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return codigo;
}

// ===== Convite: mostrar o código ou digitar um código =====
function mostrarCodigo(codigo) {
  modalGrupos.classList.add("oculto");
  codigoConviteEl.textContent = codigo;
  desenharQRCode(document.getElementById("qr-convite"), linkDeConvite(codigo));
  conviteAreaCodigo.classList.remove("oculto");
  conviteAreaEntrar.classList.add("oculto");
  modalConvite.classList.remove("oculto");
}

btnEntrarGrupo.addEventListener("click", () => {
  modalGrupos.classList.add("oculto");
  inputCodigoEntrar.value = "";
  conviteAreaCodigo.classList.add("oculto");
  conviteAreaEntrar.classList.remove("oculto");
  modalConvite.classList.remove("oculto");
  inputCodigoEntrar.focus();
});

btnConfirmarEntrarGrupo.addEventListener("click", async () => {
  const codigoDigitado = inputCodigoEntrar.value.trim().toUpperCase();
  if (!codigoDigitado) {
    inputCodigoEntrar.focus();
    return;
  }

  const textoOriginal = btnConfirmarEntrarGrupo.textContent;
  btnConfirmarEntrarGrupo.disabled = true;
  btnConfirmarEntrarGrupo.textContent = "Entrando...";
  try {
    const grupoDoc = await buscarGrupoPorCodigo(codigoDigitado);
    if (!grupoDoc) {
      avisar({ emoji: "🔍", titulo: "Código não encontrado", mensagem: "Confira o código com quem te convidou." });
      return;
    }
    inputCodigoEntrar.value = "";
    modalConvite.classList.add("oculto");
    await entrarNoGrupo(grupoDoc);
  } finally {
    btnConfirmarEntrarGrupo.disabled = false;
    btnConfirmarEntrarGrupo.textContent = textoOriginal;
  }
});

async function buscarGrupoPorCodigo(codigo) {
  try {
    const consulta = query(collection(db, "grupos"), where("codigo", "==", codigo));
    const snapshot = await getDocs(consulta);
    return snapshot.empty ? null : snapshot.docs[0];
  } catch (erro) {
    console.error("Erro ao buscar o grupo:", erro);
    return null;
  }
}

/**
 * Coloca a pessoa (já logada com Google) no grupo e passa a usar ele.
 */
async function entrarNoGrupo(grupoDoc) {
  if (grupoEncerrado(grupoDoc.data()) && !(grupoDoc.data().membros || []).includes((obterPerfilAtual() || {}).uid)) {
    avisar({ emoji: "🔒", titulo: "Esse grupo já terminou", mensagem: `${nomeDoGrupo(grupoDoc.data())} terminou em ${dataDeTermino(grupoDoc.data())} e não aceita mais ninguém.` });
    return;
  }
  const perfil = obterPerfilAtual();
  if (!perfil) {
    avisar({ emoji: "🔑", titulo: "Entre com sua conta", mensagem: "Entre com sua conta Google antes de entrar num grupo." });
    return;
  }

  try {
    const membrosAntes = grupoDoc.data().membros || [];
    if (!membrosAntes.includes(perfil.uid)) {
      await updateDoc(
        doc(db, "grupos", grupoDoc.id),
        "membros", arrayUnion(perfil.uid),
        new FieldPath("perfis", perfil.uid), { nome: perfil.nome, fotoURL: perfil.fotoURL || null }
      );
    }
    await usarGrupo(grupoDoc.id);

    const outros = await Promise.all(membrosAntes.filter((uid) => uid !== perfil.uid).map((uid) => membroDoGrupo(grupoDoc.data(), uid)));
    avisar({
      emoji: "🎉",
      titulo: `Bem-vindo(a) ao ${nomeDoGrupo(grupoDoc.data())}!`,
      mensagem: outros.length
        ? `Agora você está no grupo com ${juntarNomes(outros.map((m) => m.nome.split(" ")[0]))}.`
        : "Você entrou no grupo.",
      textoOk: "Oba!"
    });
  } catch (erro) {
    console.error("Erro ao entrar no grupo:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para entrar no grupo", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

// Ler o QR code do convite pela câmera
document.getElementById("btn-ler-qr").addEventListener("click", () => {
  abrirLeitorQR((texto) => {
    const codigo = extrairCodigoDeConvite(texto);
    if (!codigo) {
      avisar({ emoji: "🤔", titulo: "Esse QR code não é de convite", mensagem: "Peça para a pessoa mostrar o QR code do grupo no Sacola." });
      return;
    }
    inputCodigoEntrar.value = codigo;
    btnConfirmarEntrarGrupo.click();
  });
});

// ===== Convite por link (sacola.../?convite=CODIGO) =====
const modalAceitarConvite = document.getElementById("modal-aceitar-convite");
const conviteTituloEl = document.getElementById("convite-titulo");
const conviteTextoEl = document.getElementById("convite-texto");
const conviteAvataresEl = document.getElementById("convite-avatares");
const btnAceitarConvite = document.getElementById("btn-aceitar-convite");
const btnCompartilharConvite = document.getElementById("btn-compartilhar-convite");

let codigoDoConvite = new URLSearchParams(location.search).get("convite");
let grupoDoConvite = null;

if (codigoDoConvite) {
  codigoDoConvite = codigoDoConvite.trim().toUpperCase();
  // Tira o ?convite= do endereço, para não reabrir ao recarregar
  history.replaceState(null, "", location.pathname + location.hash);
}

function linkDeConvite(codigo) {
  return `${location.origin}${location.pathname}?convite=${encodeURIComponent(codigo)}`;
}

btnCompartilharConvite.addEventListener("click", async () => {
  const codigo = codigoConviteEl.textContent;
  const grupo = meusGrupos.find((g) => g.codigo === codigo);
  const link = linkDeConvite(codigo);
  const texto = `Entra no meu grupo${grupo ? ` "${nomeDoGrupo(grupo)}"` : ""} no Sacola para a gente dividir as compras 🛒`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Convite para o Sacola", text: texto, url: link });
      return;
    } catch (erro) {
      if (erro.name === "AbortError") return; // a pessoa fechou o compartilhar
    }
  }
  try {
    await navigator.clipboard.writeText(`${texto}\n${link}`);
    avisar({ emoji: "📋", titulo: "Link copiado!", mensagem: "Agora é só colar no WhatsApp (ou onde preferir)." });
  } catch {
    avisar({ emoji: "🔗", titulo: "Link de convite", mensagem: link });
  }
});

/**
 * Assim que o app sabe quem é o usuário (anônimo ou Google), mostra o
 * convite. Pessoa nova: o "Aceitar" faz o login com Google e já entra.
 */
async function mostrarConviteRecebido() {
  if (!codigoDoConvite || !auth.currentUser) return;
  const codigo = codigoDoConvite;
  codigoDoConvite = null; // mostra uma vez só

  grupoDoConvite = await buscarGrupoPorCodigo(codigo);
  if (!grupoDoConvite) {
    avisar({ emoji: "🔍", titulo: "Convite não encontrado", mensagem: "Esse link de convite não vale mais. Peça um novo para quem te convidou." });
    return;
  }

  const dados = grupoDoConvite.data();
  const perfil = obterPerfilAtual();
  if (grupoEncerrado(dados) && !(perfil && (dados.membros || []).includes(perfil.uid))) {
    avisar({ emoji: "🔒", titulo: "Esse convite expirou", mensagem: `${nomeDoGrupo(dados)} terminou em ${dataDeTermino(dados)} e não aceita mais ninguém.` });
    return;
  }
  if (perfil && (dados.membros || []).includes(perfil.uid)) {
    await usarGrupo(grupoDoConvite.id);
    avisar({ emoji: "👥", titulo: "Você já está nesse grupo", mensagem: `Agora você está usando "${nomeDoGrupo(dados)}".` });
    return;
  }

  const membros = await Promise.all((dados.membros || []).map((uid) => membroDoGrupo(dados, uid)));
  conviteAvataresEl.innerHTML = "";
  membros.forEach((m) => conviteAvataresEl.appendChild(criarAvatar(m, "avatar-grupo")));
  const nomes = juntarNomes(membros.map((m) => m.nome.split(" ")[0]));
  conviteTituloEl.textContent = `Convite para "${nomeDoGrupo(dados)}"`;
  conviteTextoEl.textContent = membros.length
    ? `${nomes} ${membros.length > 1 ? "te convidaram" : "te convidou"} para dividir as compras no grupo.`
    : "Você foi convidado(a) para dividir as compras no grupo.";
  btnAceitarConvite.textContent = perfil ? "Aceitar convite" : "Entrar com Google e aceitar";
  modalAceitarConvite.classList.remove("oculto");
}

// Espera o login (anônimo ou Google) terminar para buscar o grupo do convite
document.addEventListener("escopo-mudou", mostrarConviteRecebido);

btnAceitarConvite.addEventListener("click", async () => {
  // Pessoa nova: faz o login com Google aqui mesmo (tem que ser no clique)
  const logado = await exigirLogin();
  if (!logado || !grupoDoConvite) return;
  modalAceitarConvite.classList.add("oculto");
  // Recarrega o grupo (pode ter mudado enquanto a pessoa fazia login)
  const atualizado = await buscarGrupoPorCodigo(grupoDoConvite.data().codigo);
  if (atualizado) await entrarNoGrupo(atualizado);
});

// ===== Sair de um grupo =====
async function sairDoGrupo(grupo) {
  const perfil = obterPerfilAtual();
  if (!perfil) return;
  const sair = await confirmar({
    emoji: "👋",
    titulo: `Sair de ${nomeDoGrupo(grupo)}?`,
    mensagem: "Você deixa de ver as compras e listas deste grupo.",
    textoOk: "Sair do grupo",
    perigo: true
  });
  if (!sair) return;

  try {
    saindoDe.add(grupo.id);
    await updateDoc(doc(db, "grupos", grupo.id), { membros: arrayRemove(perfil.uid) });
    if (obterGrupoAtual() === grupo.id) await usarGrupo(null);
  } catch (erro) {
    console.error("Erro ao sair do grupo:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para sair do grupo", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}
