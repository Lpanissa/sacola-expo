// lista.js
// Página "Lista de compras": listas por tipo (Mercado, Farmácia, Festa...)
// e por dono: "Só eu" ou um grupo. Cada grupo tem as suas listas: a página
// mostra só as do grupo em uso (ou as pessoais, em "Só eu"). Numa lista de
// grupo cada um marca o que leva.
//
// Os itens de uma lista aparecem como sugestões nas compras do mesmo tipo
// e do mesmo dono (grupo em uso), menos os que outra pessoa já vai levar.
//
// Dados no Firestore:
// - Quais listas existem (inclusive vazias): campo "listas" (array de tipos)
//   no documento do dono — usuarios/{uid} para as pessoais e grupos/{id}
//   para as de grupo. Assim não depende de uma coleção nova nas regras.
//   (Listas antigas, gravadas na coleção "listas", continuam sendo lidas.)
// - "listasDeCompras": os itens { nome, tipo, escopoId, criadoPorId,
//   responsaveis: [uid...], criadoEm } (itens antigos sem "tipo" contam como
//   Mercado; itens antigos podem ter "responsavelId" com uma pessoa só)

import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  setDoc,
  arrayUnion,
  arrayRemove,
  FieldPath,
  onSnapshot,
  query,
  where,
  writeBatch,
  deleteField,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { obterEscopoAtual, obterGrupoAtual } from "./estado.js";
import {
  dataEmMilissegundos,
  iconeDoTipoHTML,
  TIPOS_COMPRA,
  TIPO_PADRAO,
  tipoComEmoji,
  doTipo,
  chaveDoNomeItem
} from "./utils.js";
import { confirmar, avisar } from "./dialogo.js";
import { ativarDeslizar, criarLinhaDeslizavel, iconeSVG } from "./deslizar.js";
import { avisarAtividade } from "./avisos.js";
import {
  obterMeusGrupos,
  nomeDoGrupo,
  criarFotoDoGrupo,
  membroDoCache,
  criarAvatar,
  grupoEncerrado,
  podeEditarListaDoGrupo,
  abrirParticipantes,
  ehAdminDoGrupo
} from "./grupos.js";

const abasEl = document.getElementById("listas-abas");
const vazioEl = document.getElementById("listas-vazio");
const selecionadaEl = document.getElementById("lista-selecionada");
const donoListaEl = document.getElementById("lista-dono");
const formListaItem = document.getElementById("form-lista-item");
const inputListaDesc = document.getElementById("input-lista-desc");
const correspondenciasEl = document.getElementById("lista-correspondencias");
const listaComprasItensEl = document.getElementById("lista-compras-itens");
const btnCriarLista = document.getElementById("btn-criar-lista");
const btnApagarLista = document.getElementById("btn-apagar-lista");
const modalNovaLista = document.getElementById("modal-nova-lista");
const opcoesTipoLista = document.getElementById("opcoes-tipo-lista");
const vazioTituloEl = document.getElementById("listas-vazio-titulo");
const vazioTextoEl = document.getElementById("listas-vazio-texto");
const aguardandoEl = document.getElementById("lista-aguardando");

const CHAVE_LISTA_SELECIONADA = "sacola_lista_selecionada";

let docsListas = [];   // documentos antigos da coleção "listas"
let minhasListas = [];  // tipos das listas pessoais (usuarios/{uid}.listas)
const listasRecemCriadas = new Set(); // aparecem na hora, antes do servidor responder
let ultimasListasCriadasVistas = {}; // grupoId -> marca da última lista criada (para o aviso)
let docsItens = [];    // documentos da coleção "listasDeCompras"
let selecionada = lerSelecionada(); // "escopoId|tipo"
let escoposObservados = "";
let cancelarListeners = [];
let itemEmEdicaoId = null;
let donoDaNovaLista = null;

function lerSelecionada() {
  try {
    return localStorage.getItem(CHAVE_LISTA_SELECIONADA);
  } catch {
    return null;
  }
}

function salvarSelecionada(chave) {
  try {
    localStorage.setItem(CHAVE_LISTA_SELECIONADA, chave);
  } catch {
    // sem localStorage (ex: aba anônima): só não lembra a lista escolhida
  }
}

// ===== Donos das listas: a própria pessoa e os grupos dela =====
function meuUid() {
  return auth.currentUser ? auth.currentUser.uid : "local";
}

function escoposDaPessoa() {
  const grupos = obterMeusGrupos().map((g) => g.id);
  return [meuUid(), ...grupos].slice(0, 30); // limite do "in" do Firestore
}

function grupoDoEscopo(escopoId) {
  return obterMeusGrupos().find((g) => g.id === escopoId) || null;
}

function chaveDaLista(escopoId, tipo) {
  return `${escopoId}|${tipo}`;
}

function separarChave(chave) {
  const [escopoId, tipo] = (chave || "").split("|");
  return { escopoId, tipo };
}

// ===== Quem pode criar listas =====
// Num grupo, só os administradores criam listas; os outros participantes
// esperam o administrador criar. Listas pessoais ("Só eu"): sempre.
function podeCriarListaNoGrupo(grupo) {
  return !!grupo && !grupoEncerrado(grupo) && ehAdminDoGrupo(grupo, meuUid());
}

// Grupo em uso em que a pessoa não é administradora
function grupoEmUsoSemPermissaoDeCriar() {
  const grupo = grupoDoEscopo(obterGrupoAtual());
  return grupo && !podeCriarListaNoGrupo(grupo) ? grupo : null;
}

function tipoDoItem(d) {
  return d.data().tipo || TIPO_PADRAO;
}

/**
 * Observa em tempo real as listas e os itens de todos os donos (eu + meus
 * grupos). Roda de novo quando a pessoa entra/sai de grupos.
 */
export function observarListaDeCompras() {
  const escopos = escoposDaPessoa();
  const assinatura = escopos.join(",");
  if (assinatura === escoposObservados && cancelarListeners.length) {
    renderizar();
    return;
  }
  escoposObservados = assinatura;
  cancelarListeners.forEach((cancelar) => cancelar());

  let primeiraCargaItens = true;

  cancelarListeners = [
    // Listas pessoais: campo "listas" no meu documento de usuário
    onSnapshot(doc(db, "usuarios", meuUid()), (snap) => {
      minhasListas = (snap.exists() && snap.data().listas) || [];
      renderizar();
    }, (erro) => console.warn("Não foi possível ler as listas pessoais:", erro)),
    // Listas antigas (coleção "listas"); se as regras não liberam essa
    // coleção, só ignora
    onSnapshot(query(collection(db, "listas"), where("escopoId", "in", escopos)), (snapshot) => {
      docsListas = snapshot.docs;
      renderizar();
    }, () => {
      docsListas = [];
    }),
    // Sem orderBy na consulta (evita precisar de índice composto no Firestore);
    // a ordenação é feita aqui mesmo.
    onSnapshot(query(collection(db, "listasDeCompras"), where("escopoId", "in", escopos)), (snapshot) => {
      docsItens = [...snapshot.docs].sort(
        (a, b) => dataEmMilissegundos(a.data().criadoEm) - dataEmMilissegundos(b.data().criadoEm)
      );
      if (!primeiraCargaItens) {
        novosDocumentos(snapshot).forEach((d) =>
          avisarAtividade(d.data().criadoPorId, (nome) => `${nome} colocou ${d.data().nome} na lista ${doTipo(tipoDoItem(d))}${sufixoDoGrupo(d.data().escopoId)}`, "📝")
        );
      }
      primeiraCargaItens = false;
      renderizar();
    }, (erro) => console.warn("Não foi possível ler os itens das listas:", erro))
  ];
  // Desenha já (vazio ou com o que tiver), sem esperar o servidor responder
  renderizar();
}

// Aviso "Fulano criou a lista ..." nos grupos: cada grupo guarda a última
// lista criada (tipo, quem e quando)
function avisarListasNovasDosGrupos() {
  obterMeusGrupos().forEach((grupo) => {
    const ultima = grupo.ultimaListaCriada;
    const marca = ultima ? `${ultima.tipo}|${ultima.em}` : "";
    const vistaAntes = ultimasListasCriadasVistas[grupo.id];
    ultimasListasCriadasVistas[grupo.id] = marca;
    if (vistaAntes === undefined || !ultima || marca === vistaAntes) return; // primeira leitura ou nada novo
    avisarAtividade(ultima.por, (nome) => `${nome} criou a lista ${doTipo(ultima.tipo)} (${nomeDoGrupo(grupo)})`, "📝");
  });
}

document.addEventListener("grupos-mudou", avisarListasNovasDosGrupos);

document.addEventListener("escopo-mudou", observarListaDeCompras);
document.addEventListener("grupos-mudou", observarListaDeCompras);

function sufixoDoGrupo(escopoId) {
  const grupo = grupoDoEscopo(escopoId);
  return grupo ? ` (${nomeDoGrupo(grupo)})` : "";
}

// Documentos que acabaram de chegar do servidor (criados por outra pessoa)
function novosDocumentos(snapshot) {
  return snapshot
    .docChanges()
    .filter((mudanca) => mudanca.type === "added" && !mudanca.doc.metadata.hasPendingWrites)
    .map((mudanca) => mudanca.doc);
}

/**
 * Listas existentes: as criadas e as que já têm itens (itens antigos contam
 * como Mercado). Primeiro as do dono em uso (grupo atual ou "só eu"),
 * depois as dos outros grupos; dentro de cada dono, na ordem dos tipos.
 */
function listasExistentes() {
  const chaves = new Set(docsListas.map((d) => chaveDaLista(d.data().escopoId, d.data().tipo)));
  minhasListas.forEach((tipo) => chaves.add(chaveDaLista(meuUid(), tipo)));
  obterMeusGrupos().forEach((grupo) => (grupo.listas || []).forEach((tipo) => chaves.add(chaveDaLista(grupo.id, tipo))));
  listasRecemCriadas.forEach((chave) => chaves.add(chave));
  docsItens.forEach((d) => chaves.add(chaveDaLista(d.data().escopoId, tipoDoItem(d))));

  // Cada grupo com as suas listas: só as do grupo em uso (ou as pessoais)
  const donoAtual = obterEscopoAtual();
  return [...chaves]
    .map(separarChave)
    .filter(({ escopoId, tipo }) => TIPOS_COMPRA.includes(tipo) && escopoId === donoAtual)
    .sort((a, b) => TIPOS_COMPRA.indexOf(a.tipo) - TIPOS_COMPRA.indexOf(b.tipo));
}

function itensDaLista({ escopoId, tipo }) {
  return docsItens.filter((d) => d.data().escopoId === escopoId && tipoDoItem(d) === tipo);
}

function renderizar() {
  const listas = listasExistentes();
  const chaves = listas.map(({ escopoId, tipo }) => chaveDaLista(escopoId, tipo));
  if (!chaves.includes(selecionada)) selecionada = chaves[0] || null;

  // Abas: tipo + (foto e nome do grupo, se a lista for de um grupo)
  abasEl.innerHTML = "";
  listas.forEach((lista) => {
    const chave = chaveDaLista(lista.escopoId, lista.tipo);
    const qtd = itensDaLista(lista).length;
    const aba = document.createElement("button");
    aba.type = "button";
    aba.className = "lista-aba" + (chave === selecionada ? " ativa" : "");
    const texto = document.createElement("span");
    texto.textContent = `${tipoComEmoji(lista.tipo)}${qtd ? ` · ${qtd}` : ""}`;
    aba.appendChild(texto);
    aba.addEventListener("click", () => selecionar(chave));
    abasEl.appendChild(aba);
  });
  const grupoSemPermissao = grupoEmUsoSemPermissaoDeCriar();
  if (listas.length && !grupoSemPermissao) {
    const nova = document.createElement("button");
    nova.type = "button";
    nova.className = "lista-aba lista-aba-nova";
    nova.textContent = "+ Nova lista";
    nova.addEventListener("click", abrirModalNovaLista);
    abasEl.appendChild(nova);
  }

  vazioEl.classList.toggle("oculto", listas.length > 0);
  // Sem nenhuma lista: quem pode cria; quem não pode espera o administrador
  btnCriarLista.classList.toggle("oculto", !!grupoSemPermissao);
  vazioTituloEl.textContent = grupoSemPermissao ? "Aguardando lista" : "Nenhuma lista ainda";
  vazioTextoEl.textContent = grupoSemPermissao
    ? `O administrador de ${nomeDoGrupo(grupoSemPermissao)} ainda não criou uma lista. Assim que criar, ela aparece aqui.`
    : "Crie uma lista para o mercado, a farmácia, a feira…";
  // Tem outras listas, mas o grupo em uso ainda não tem nenhuma
  const grupoEmUsoTemLista = grupoSemPermissao && listas.some((l) => l.escopoId === grupoSemPermissao.id);
  aguardandoEl.classList.toggle("oculto", !grupoSemPermissao || !listas.length || grupoEmUsoTemLista);
  if (grupoSemPermissao) aguardandoEl.textContent = `Aguardando o administrador de ${nomeDoGrupo(grupoSemPermissao)} criar uma lista para o grupo.`;
  selecionadaEl.classList.toggle("oculto", !selecionada);
  if (!selecionada) return;

  const lista = separarChave(selecionada);
  const grupo = grupoDoEscopo(lista.escopoId);
  const encerrada = grupoEncerrado(grupo);
  const podeEditar = podeEditarLista(lista);
  selecionadaEl.classList.toggle("somente-leitura", encerrada || !podeEditar);
  donoListaEl.innerHTML = "";
  donoListaEl.classList.toggle("oculto", !grupo);
  if (grupo) {
    donoListaEl.appendChild(criarFotoDoGrupo(grupo, "grupo-foto-mini"));
    const texto = document.createElement("span");
    texto.textContent = encerrada
      ? `Lista do grupo ${nomeDoGrupo(grupo)} · grupo encerrado, só para consulta`
      : podeEditar
        ? `Lista do grupo ${nomeDoGrupo(grupo)} · toque num item para dizer que você leva`
        : `Lista do grupo ${nomeDoGrupo(grupo)} · só quem criou pode editar; toque num item para dizer que você leva`;
    donoListaEl.appendChild(texto);

    // Participantes do grupo (e quem pode editar esta lista)
    const btnParticipantes = document.createElement("button");
    btnParticipantes.type = "button";
    btnParticipantes.className = "lista-participantes";
    (grupo.membros || []).slice(0, 4).forEach((uid) => btnParticipantes.appendChild(criarAvatar(membroDoCache(uid) || { nome: "Alguém" })));
    const qtd = document.createElement("span");
    qtd.textContent = `${(grupo.membros || []).length} ${(grupo.membros || []).length === 1 ? "pessoa" : "pessoas"}`;
    btnParticipantes.appendChild(qtd);
    btnParticipantes.addEventListener("click", () => abrirParticipantes(grupo, { tipoLista: lista.tipo }));
    donoListaEl.appendChild(btnParticipantes);
  }

  renderizarItens(itensDaLista(lista), !!grupo, encerrada, podeEditar);
  renderizarCorrespondencias();
}

function renderizarItens(documentos, ehDeGrupo, encerrada = false, podeEditar = true) {
  listaComprasItensEl.innerHTML = "";

  if (documentos.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "estado-vazio";
    vazio.textContent = "Nada nesta lista por enquanto.";
    listaComprasItensEl.appendChild(vazio);
    return;
  }

  documentos.forEach((docSnap) => {
    const { linha, frente } = criarLinhaDeslizavel();

    if (docSnap.id === itemEmEdicaoId) {
      linha.classList.add("editando");
      frente.remove();
      linha.appendChild(criarFormNome(docSnap));
    } else {
      frente.innerHTML = '<span class="item-desc"><span class="item-nome"></span></span>';
      frente.querySelector(".item-nome").textContent = docSnap.data().nome;
      if (ehDeGrupo) mostrarQuemLeva(frente, docSnap.data());
      // Lista de grupo encerrado: só mostra, sem arrastar nem "eu levo"
      if (!encerrada) ativarDeslizar(linha, frente, {
        aoApagar: () => apagarItem(docSnap),
        aoEditar: () => {
          itemEmEdicaoId = docSnap.id;
          renderizar();
        },
        // Em lista de grupo: tocar = "eu levo" (tocar de novo desmarca)
        aoTocar: ehDeGrupo ? () => alternarQuemLeva(docSnap) : undefined,
        funcionaEmConsulta: true,
        // Sem permissão de editar: só dá para tocar ("quem leva")
        permitirArrastar: podeEditar
      });
    }

    listaComprasItensEl.appendChild(linha);
  });
}

// ===== "Quem leva": quem vai trazer cada item (listas de grupo) =====
// Pode ser mais de uma pessoa: cada um toca no item para entrar ou sair.
// Itens antigos guardavam só uma pessoa em "responsavelId".
export function quemLeva(dados) {
  const pessoas = new Set(dados.responsaveis || []);
  if (dados.responsavelId) pessoas.add(dados.responsavelId);
  return [...pessoas];
}

function mostrarQuemLeva(frente, dados) {
  const pessoas = quemLeva(dados);
  const eu = meuUid();
  const selo = document.createElement("span");
  selo.className = "quem-leva";

  if (!pessoas.length) {
    selo.classList.add("ninguem");
    selo.textContent = "Quem leva?";
    frente.appendChild(selo);
    return;
  }

  // Eu primeiro, depois os outros
  pessoas.sort((a, b) => (a === eu ? -1 : b === eu ? 1 : 0));
  const fotos = document.createElement("span");
  fotos.className = "quem-leva-fotos";
  pessoas.slice(0, 3).forEach((uid) => fotos.appendChild(criarAvatar(membroDoCache(uid) || { nome: "Alguém" })));
  selo.appendChild(fotos);

  const nomes = pessoas.map((uid) => (uid === eu ? "Você" : (membroDoCache(uid) || { nome: "Alguém" }).nome.split(" ")[0]));
  const texto = document.createElement("span");
  texto.textContent = pessoas.length === 1
    ? (pessoas[0] === eu ? "Eu levo" : `${nomes[0]} leva`)
    : pessoas.length === 2
      ? `${nomes[0]} e ${nomes[1]} levam`
      : `${nomes[0]} e +${pessoas.length - 1} levam`;
  selo.appendChild(texto);
  if (pessoas.includes(eu)) selo.classList.add("eu");
  frente.appendChild(selo);
}

async function alternarQuemLeva(docSnap) {
  const eu = meuUid();
  const dados = docSnap.data();
  const vouLevar = quemLeva(dados).includes(eu);

  let mudancas;
  if (dados.responsavelId) {
    // Item antigo (uma pessoa em "responsavelId"): regrava a lista inteira
    const pessoas = vouLevar ? quemLeva(dados).filter((uid) => uid !== eu) : [...quemLeva(dados), eu];
    mudancas = { responsaveis: pessoas, responsavelId: null };
  } else {
    // arrayUnion/arrayRemove: duas pessoas tocando ao mesmo tempo não se atrapalham
    mudancas = { responsaveis: vouLevar ? arrayRemove(eu) : arrayUnion(eu) };
  }

  try {
    await updateDoc(doc(db, "listasDeCompras", docSnap.id), mudancas);
  } catch (erro) {
    console.error("Erro ao marcar quem leva:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para marcar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

// ===== Editar o nome de um item (direto na linha) =====
function criarFormNome(docSnap) {
  const form = document.createElement("form");
  form.className = "item-edicao";
  form.autocomplete = "off";
  form.innerHTML = `
    <input type="text" class="edicao-desc" required aria-label="Item">
    <button type="submit" class="edicao-botao edicao-salvar" aria-label="Salvar">✓</button>
    <button type="button" class="edicao-botao edicao-cancelar" aria-label="Cancelar">✕</button>
  `;
  const campo = form.querySelector(".edicao-desc");
  campo.value = docSnap.data().nome;

  const fechar = () => {
    itemEmEdicaoId = null;
    renderizar();
  };
  form.querySelector(".edicao-cancelar").addEventListener("click", fechar);
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nome = campo.value.trim();
    if (!nome) return;
    await updateDoc(doc(db, "listasDeCompras", docSnap.id), { nome });
    fechar();
  });

  requestAnimationFrame(() => {
    campo.focus();
    campo.select();
  });
  return form;
}

async function apagarItem(docSnap) {
  if (!podeEditarSelecionada()) return;
  const apagar = await confirmar({
    emoji: "🗑️",
    titulo: "Tirar da lista?",
    mensagem: `Remover "${docSnap.data().nome}" da lista?`,
    textoOk: "Remover",
    perigo: true
  });
  if (apagar) await deleteDoc(doc(db, "listasDeCompras", docSnap.id));
}

// Lista de um grupo que já terminou: só para consulta
function listaSelecionadaEncerrada() {
  return !!selecionada && grupoEncerrado(grupoDoEscopo(separarChave(selecionada).escopoId));
}

// Pode adicionar/mudar/apagar itens? Listas pessoais: sempre. Listas de
// grupo: administradores, quem criou a lista e quem essa pessoa liberou.
function podeEditarLista({ escopoId, tipo }) {
  const grupo = grupoDoEscopo(escopoId);
  if (!grupo) return true;
  return podeEditarListaDoGrupo(grupo, tipo, meuUid());
}

function podeEditarSelecionada() {
  return !!selecionada && podeEditarLista(separarChave(selecionada));
}

function selecionar(chave) {
  selecionada = chave;
  salvarSelecionada(chave);
  renderizar();
}

// ===== Criar lista: para quem (eu ou um grupo) + tipo =====
function abrirModalNovaLista() {
  // A lista nova é sempre do grupo em uso (ou pessoal, em "Só eu")
  donoDaNovaLista = obterEscopoAtual();

  opcoesTipoLista.innerHTML = "";
  TIPOS_COMPRA.forEach((tipo) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "opcao-tipo-botao";
    botao.innerHTML = `<span class="opcao-tipo-emoji">${iconeDoTipoHTML(tipo)}</span>${tipo}`;
    botao.addEventListener("click", () => criarLista(donoDaNovaLista, tipo));
    opcoesTipoLista.appendChild(botao);
  });
  modalNovaLista.classList.remove("oculto");
}

async function criarLista(escopoId, tipo) {
  const grupoDaLista = grupoDoEscopo(escopoId);
  // Grupo encerrado (só consulta) ou pessoa que não é administradora do grupo
  if (grupoDaLista && !podeCriarListaNoGrupo(grupoDaLista)) return;
  modalNovaLista.classList.add("oculto");
  const chave = chaveDaLista(escopoId, tipo);
  const jaExiste = listasExistentes().some((l) => chaveDaLista(l.escopoId, l.tipo) === chave);

  // Abre a lista na hora; a gravação continua em segundo plano
  listasRecemCriadas.add(chave);
  selecionar(chave);
  inputListaDesc.focus();
  if (jaExiste) return;

  try {
    await registrarLista(escopoId, tipo);
  } catch (erro) {
    console.error("Erro ao criar a lista:", erro);
    listasRecemCriadas.delete(chave);
    renderizar();
    avisar({ emoji: "😕", titulo: "Não deu para criar a lista", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
}

// Grava que a lista existe (no grupo ou no cadastro da pessoa)
async function registrarLista(escopoId, tipo) {
  if (grupoDoEscopo(escopoId)) {
    // Quem cria é o dono da lista: só ele (e quem ele liberar, e os
    // administradores do grupo) pode editar
    await updateDoc(
      doc(db, "grupos", escopoId),
      "listas", arrayUnion(tipo),
      "ultimaListaCriada", { tipo, por: meuUid(), em: Date.now() },
      new FieldPath("listasInfo", tipo), { criadorId: meuUid(), editores: [] }
    );
  } else {
    await setDoc(doc(db, "usuarios", meuUid()), { listas: arrayUnion(tipo) }, { merge: true });
  }
}

/**
 * Item comprado vai para a lista favorita do mesmo tipo (sem a quantidade
 * e sem repetir); se essa lista ainda não existe, cria. Em grupo, respeita
 * as permissões: sem poder editar (ou criar) a lista, simplesmente não faz.
 */
export async function guardarNaListaFavorita(escopoId, tipo, nome) {
  if (!escopoId || !tipo || !nome) return;
  const lista = { escopoId, tipo };
  const chave = chaveDaLista(escopoId, tipo);
  const grupo = grupoDoEscopo(escopoId);
  const existe = listasExistentes().some((l) => chaveDaLista(l.escopoId, l.tipo) === chave)
    || (grupo && (grupo.listas || []).includes(tipo))
    || (!grupo && minhasListas.includes(tipo));

  if (grupo && (existe ? !podeEditarLista(lista) : !podeCriarListaNoGrupo(grupo))) return;

  const chaveItem = chaveDoNomeItem(nome);
  if (itensDaLista(lista).some((d) => chaveDoNomeItem(d.data().nome) === chaveItem)) return;

  try {
    if (!existe) {
      listasRecemCriadas.add(chave);
      await registrarLista(escopoId, tipo);
    }
    await addDoc(collection(db, "listasDeCompras"), {
      nome,
      tipo,
      escopoId,
      criadoPorId: meuUid(),
      responsaveis: [],
      criadoEm: serverTimestamp()
    });
  } catch (erro) {
    // Não atrapalha a compra: só deixa de guardar na lista
    console.warn("Não foi possível guardar o item na lista:", erro);
  }
}

/**
 * Item que já estava na lista e acabou de ser comprado (no Mercado): sai
 * da lista, porque já foi resolvido — não faz sentido continuar
 * sugerindo algo que você já comprou. Devolve true se tirou algum item,
 * false se esse item não estava na lista (ou sem permissão para editar).
 */
export async function removerDaListaAoComprar(escopoId, tipo, nome) {
  if (!escopoId || !tipo || !nome) return false;
  const grupo = grupoDoEscopo(escopoId);
  if (grupo && !podeEditarLista({ escopoId, tipo })) return false;

  const chaveItem = chaveDoNomeItem(nome);
  const encontrados = itensDaLista({ escopoId, tipo }).filter(
    (d) => chaveDoNomeItem(d.data().nome) === chaveItem
  );
  if (!encontrados.length) return false;

  try {
    await Promise.all(encontrados.map((d) => deleteDoc(doc(db, "listasDeCompras", d.id))));
    return true;
  } catch (erro) {
    // Não atrapalha a compra: o item só continua na lista
    console.warn("Não foi possível remover o item comprado da lista:", erro);
    return false;
  }
}

btnCriarLista.addEventListener("click", abrirModalNovaLista);

// ===== Apagar a lista selecionada (com os itens) =====
btnApagarLista.addEventListener("click", async () => {
  if (!selecionada || listaSelecionadaEncerrada() || !podeEditarSelecionada()) return;
  const lista = separarChave(selecionada);
  const apagar = await confirmar({
    emoji: "🗑️",
    titulo: `Apagar a lista ${doTipo(lista.tipo)}${sufixoDoGrupo(lista.escopoId)}?`,
    mensagem: grupoDoEscopo(lista.escopoId)
      ? "A lista e todos os itens dela serão apagados para todo mundo do grupo."
      : "A lista e todos os itens dela serão apagados.",
    textoOk: "Apagar lista",
    perigo: true
  });
  if (!apagar) return;

  try {
    const lote = writeBatch(db);
    itensDaLista(lista).forEach((d) => lote.delete(d.ref));
    if (grupoDoEscopo(lista.escopoId)) {
      lote.update(
        doc(db, "grupos", lista.escopoId),
        "listas", arrayRemove(lista.tipo),
        new FieldPath("listasInfo", lista.tipo), deleteField()
      );
    } else {
      lote.set(doc(db, "usuarios", meuUid()), { listas: arrayRemove(lista.tipo) }, { merge: true });
    }
    await lote.commit();

    // Listas antigas da coleção "listas" (se existirem)
    await Promise.all(
      docsListas
        .filter((d) => d.data().escopoId === lista.escopoId && d.data().tipo === lista.tipo)
        .map((d) => deleteDoc(d.ref).catch(() => {}))
    );
    listasRecemCriadas.delete(selecionada);
  } catch (erro) {
    console.error("Erro ao apagar a lista:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para apagar a lista", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
});

// ===== Evita duplicar item: mostra o que já existe enquanto digita =====
// Compara pelo mesmo critério usado no resto do app (chaveDoNomeItem): sem
// acento, sem maiúsculas e ignorando plural simples.
function itemExistenteComNome(nome) {
  if (!selecionada || !nome) return null;
  const chaveItem = chaveDoNomeItem(nome);
  if (!chaveItem) return null;
  const item = itensDaLista(separarChave(selecionada)).find(
    (d) => chaveDoNomeItem(d.data().nome) === chaveItem
  );
  return item ? item.data().nome : null;
}

function renderizarCorrespondencias() {
  const texto = inputListaDesc.value.trim();
  correspondenciasEl.innerHTML = "";
  const jaExiste = itemExistenteComNome(texto);
  correspondenciasEl.classList.toggle("oculto", !jaExiste);
  if (!jaExiste) return;
  const chip = document.createElement("span");
  chip.className = "correspondencia-chip";
  chip.textContent = jaExiste;
  correspondenciasEl.appendChild(chip);
}

inputListaDesc.addEventListener("input", renderizarCorrespondencias);

// ===== Adicionar item na lista selecionada =====
formListaItem.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (listaSelecionadaEncerrada() || !podeEditarSelecionada()) return; // só consulta / sem permissão

  const nome = inputListaDesc.value.trim();
  if (!nome || !selecionada) return;

  const nomeExistente = itemExistenteComNome(nome);
  if (nomeExistente) {
    avisar({ emoji: "🔁", titulo: "Já está na lista", mensagem: `"${nomeExistente}" já foi adicionado. Toque nele para editar, se precisar.` });
    return;
  }

  const lista = separarChave(selecionada);

  inputListaDesc.value = "";
  correspondenciasEl.classList.add("oculto");
  inputListaDesc.focus();
  try {
    await addDoc(collection(db, "listasDeCompras"), {
      nome,
      tipo: lista.tipo,
      escopoId: lista.escopoId,
      criadoPorId: meuUid(),
      responsaveis: [],
      criadoEm: serverTimestamp()
    });
  } catch (erro) {
    console.error("Erro ao adicionar item na lista:", erro);
    inputListaDesc.value = nome;
    avisar({ emoji: "😕", titulo: "Não deu para adicionar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  }
});
