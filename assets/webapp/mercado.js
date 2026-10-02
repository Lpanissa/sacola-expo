// mercado.js
// Lógica da tela "Mercado": adicionar itens, somar total, controlar limite
// de orçamento, sugerir itens da lista de compras, comparar preço com a
// última compra do mesmo item, excluir item com swipe e salvar a compra do dia.

import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  formatarDinheiro,
  textoParaNumero,
  interpretarItem,
  normalizarTexto,
  dataEmMilissegundos,
  dataDaCompra,
  hojeISO,
  dataParaISO,
  isoParaData,
  iconeDoTipoHTML,
  TIPOS_COMPRA,
  TIPO_PADRAO,
  tipoComEmoji,
  descricaoDoItem,
  precoUnitarioDoItem,
  valoresDoItem,
  itemTemPreco,
  chaveDoNomeItem,
  numeroParaTextoDinheiro
} from "./utils.js";
import { guardarNaListaFavorita, removerDaListaAoComprar } from "./lista.js";
import { ativarDeslizar, criarLinhaDeslizavel } from "./deslizar.js";
import { criarFormEdicao, preencherFrenteDoItem } from "./edicao-item.js";
import { autorDoItem, membroDoCache, criarAvatar } from "./grupos.js";
import { avisarAtividade } from "./avisos.js";
import { obterEscopoAtual, obterGrupoAtual } from "./estado.js";
import { confirmar, avisar } from "./dialogo.js";
import { emModoConsulta } from "./estado.js";

// ===== Elementos da tela =====
const secaoVazia = document.getElementById("mercado-vazio");
const secaoConteudo = document.getElementById("mercado-conteudo");
const btnNovaCompra = document.getElementById("btn-nova-compra");
const btnFinalizarCompra = document.getElementById("btn-finalizar-compra");
const btnSairCompra = document.getElementById("btn-sair-compra");

const resumoTotalEl = document.getElementById("resumo-total");
const resumoQtdEl = document.getElementById("resumo-qtd");
const resumoLimiteEl = document.getElementById("resumo-limite");

const formItem = document.getElementById("form-item");
const inputDesc = document.getElementById("input-item-desc");
const inputPreco = document.getElementById("input-item-preco");
const btnLimparItemDesc = document.getElementById("btn-limpar-item-desc");

const listaItensEl = document.getElementById("lista-itens");
const listaSugestoesEl = document.getElementById("lista-sugestoes");
const btnAlternarSugestoes = document.getElementById("btn-alternar-sugestoes");

const modalNovaCompra = document.getElementById("modal-nova-compra");
const opcoesTipoCompra = document.getElementById("opcoes-tipo-compra");

const modalOrcamento = document.getElementById("modal-orcamento");
const inputOrcamento = document.getElementById("input-orcamento");
const inputDataNovaCompra = document.getElementById("input-data-nova-compra");
const compraTipoEl = document.getElementById("compra-tipo");
const inputDataCompra = document.getElementById("input-data-compra");
const btnPularOrcamento = document.getElementById("btn-pular-orcamento");
const btnConfirmarOrcamento = document.getElementById("btn-confirmar-orcamento");

// Editar o orçamento de uma compra já aberta (a partir do card "Disponível")
const btnEditarOrcamento = document.getElementById("btn-editar-orcamento");
const modalEditarOrcamento = document.getElementById("modal-editar-orcamento");
const inputEditarOrcamento = document.getElementById("input-editar-orcamento");
const btnRemoverOrcamento = document.getElementById("btn-remover-orcamento");
const btnSalvarOrcamento = document.getElementById("btn-salvar-orcamento");


// ===== Tipos de compra disponíveis =====

// Tipos que têm cores e desenhos de fundo próprios (body[data-tipo] no CSS).
// Os demais usam o tema padrão, do mercado.
const TIPOS_COM_TEMA = ["farmacia", "feira", "acougue", "churras", "bomboniere", "perfumaria", "shopping"];

// Tipos cujo ícone no cabeçalho da compra vem do CSS (cruz da farmácia,
// espeto do churras), então o texto vai sem emoji
const TIPOS_COM_ICONE_NO_CSS = ["farmacia", "churras"];

// ===== Estado local desta tela =====
let compraAtivaId = null;
let compraAtivaTipo = null;
let compraAtivaLimite = null;
let itensDaCompra = [];
let itemEmEdicaoId = null;
let formEdicaoAtual = null; // mantido entre renderizações para não perder o que foi digitado
let cancelarListenerItens = null;
let tipoEscolhidoTemporario = null;

const PERCENTUAL_ALERTA_PADRAO = 85;

// ===== Abrir fluxo de nova compra =====
function abrirModalNovaCompra() {
  if (emModoConsulta()) return; // grupo encerrado: só consulta
  opcoesTipoCompra.innerHTML = "";
  TIPOS_COMPRA.forEach((tipo) => {
    const botao = document.createElement("button");
    botao.className = "opcao-tipo-botao";
    botao.innerHTML = `<span class="opcao-tipo-emoji">${iconeDoTipoHTML(tipo)}</span>${tipo}`;
    botao.addEventListener("click", () => {
      tipoEscolhidoTemporario = tipo;
      modalNovaCompra.classList.add("oculto");
      inputOrcamento.value = "";
      inputDataNovaCompra.value = hojeISO();
      inputDataNovaCompra.max = hojeISO();
      modalOrcamento.classList.remove("oculto");
    });
    opcoesTipoCompra.appendChild(botao);
  });
  modalNovaCompra.classList.remove("oculto");
}

async function criarCompra(orcamento) {
  const escopo = obterEscopoAtual();
  // Data escolhida pela pessoa (hoje, ou um dia passado para registrar
  // uma compra que já aconteceu)
  const dataEscolhida = inputDataNovaCompra.value || hojeISO();

  const novaCompra = {
    tipo: tipoEscolhidoTemporario,
    escopoId: escopo,
    criadoPorId: (auth.currentUser && auth.currentUser.uid) || null,
    limite: orcamento === null ? null : orcamento,
    total: 0,
    quantidadeItens: 0,
    ativa: true,
    dataCompra: Timestamp.fromDate(isoParaData(dataEscolhida)),
    dataInicio: serverTimestamp(),
    dataFim: null
  };

  // Referência gerada na hora (não depende de internet) e gravada sem
  // esperar: começar uma compra não pode ficar preso esperando a rede.
  const referencia = doc(collection(db, "compras"));
  setDoc(referencia, novaCompra).catch((erro) => {
    console.error("Erro ao criar a compra:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para criar a compra", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  });
  lembrarCompra(referencia.id);

  // Normalmente o observador das compras já abriu a tela; isto é só garantia
  if (compraAtivaId === referencia.id) {
    renderizarOutrasCompras();
    return;
  }
  compraAtivaId = referencia.id;
  compraAtivaTipo = tipoEscolhidoTemporario;
  compraAtivaLimite = orcamento;

  mostrarCabecalhoDaCompra(novaCompra);
  mostrarTelaDeCompraAtiva();
  observarItensDaCompra();
  carregarSugestoes();
}

btnNovaCompra.addEventListener("click", abrirModalNovaCompra);

btnPularOrcamento.addEventListener("click", () => {
  modalOrcamento.classList.add("oculto");
  criarCompra(null);
});

btnConfirmarOrcamento.addEventListener("click", () => {
  const valor = textoParaNumero(inputOrcamento.value);
  modalOrcamento.classList.add("oculto");
  criarCompra(valor > 0 ? valor : null);
});

// ===== Editar o orçamento de uma compra já aberta =====
btnEditarOrcamento.addEventListener("click", () => {
  if (emModoConsulta() || !compraAtivaId) return; // grupo encerrado ou sem compra ativa
  inputEditarOrcamento.value = compraAtivaLimite ? numeroParaTextoDinheiro(compraAtivaLimite) : "";
  modalEditarOrcamento.classList.remove("oculto");
  inputEditarOrcamento.focus();
});

async function salvarOrcamento(valor) {
  if (!compraAtivaId) return;
  modalEditarOrcamento.classList.add("oculto");
  try {
    await updateDoc(doc(db, "compras", compraAtivaId), { limite: valor });
  } catch (erro) {
    console.warn("Não foi possível salvar o orçamento:", erro);
  }
}

btnSalvarOrcamento.addEventListener("click", () => {
  const valor = textoParaNumero(inputEditarOrcamento.value);
  salvarOrcamento(valor > 0 ? valor : null);
});

btnRemoverOrcamento.addEventListener("click", () => salvarOrcamento(null));

function mostrarTelaDeCompraAtiva() {
  secaoVazia.classList.add("oculto");
  secaoConteudo.classList.remove("oculto");
}

function mostrarEstadoVazio() {
  secaoVazia.classList.remove("oculto");
  secaoConteudo.classList.add("oculto");
}

// ===== Observa em tempo real os itens da compra ativa =====
// Hora "de mentira" de um item ainda sem "criadoEm" (gravado offline: o
// servidor não preencheu o serverTimestamp ainda). Fica fixa a partir da
// primeira vez que vemos o item — assim dois itens adicionados offline em
// seguida não ficam trocando de lugar a cada nova renderização, e mantêm
// a ordem em que foram digitados até sincronizar de verdade.
const horaLocalDoItemPendente = new Map();

function instanteDoItem(item) {
  if (item.criadoEm) {
    horaLocalDoItemPendente.delete(item.id);
    return dataEmMilissegundos(item.criadoEm);
  }
  if (!horaLocalDoItemPendente.has(item.id)) horaLocalDoItemPendente.set(item.id, Date.now());
  return horaLocalDoItemPendente.get(item.id);
}

function observarItensDaCompra() {
  if (cancelarListenerItens) cancelarListenerItens();

  // Sem orderBy na consulta: um item adicionado offline fica com
  // "criadoEm" nulo até sincronizar, e o Firestore poria esses nulos no
  // início da lista (o item mais novo pulando pro topo até sincronizar).
  // Ordenando aqui, um item pendente conta como "agora" e fica no fim,
  // onde já era esperado.
  const itensRef = collection(db, "compras", compraAtivaId, "itens");

  let primeiraCarga = true;
  cancelarListenerItens = onSnapshot(itensRef, (snapshot) => {
    if (!primeiraCarga) {
      snapshot.docChanges()
        .filter((mudanca) => mudanca.type === "added" && !mudanca.doc.metadata.hasPendingWrites)
        .forEach((mudanca) => {
          const item = mudanca.doc.data();
          avisarAtividade(item.adicionadoPorId, (nome) => `${nome} comprou ${descricaoDoItem(item)}`);
        });
    }
    primeiraCarga = false;
    itensDaCompra = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => instanteDoItem(a) - instanteDoItem(b));
    renderizarItens();
    renderizarResumo();
    renderizarSugestoes();
  });
}

/**
 * Observa em tempo real se existe uma compra em andamento no escopo atual
 * (a sua, ou a do grupo com o parceiro). Se alguém do grupo abrir uma
 * compra, ela aparece aqui; se alguém salvar a compra, a tela volta ao vazio.
 */
let cancelarListenerCompraAtiva = null;
let comprasAbertas = []; // todas as compras em andamento no grupo (ou minhas)

// Cada celular lembra em qual compra está (por grupo). Assim, no mesmo
// grupo, uma pessoa pode estar no açougue e outra na farmácia, cada uma
// com a sua compra e o seu tema.
function chaveCompraLembrada() {
  return `sacola_compra_${obterEscopoAtual()}`;
}

function lerCompraLembrada() {
  try {
    return localStorage.getItem(chaveCompraLembrada());
  } catch {
    return null;
  }
}

function lembrarCompra(compraId) {
  try {
    if (compraId) localStorage.setItem(chaveCompraLembrada(), compraId);
    else localStorage.removeItem(chaveCompraLembrada());
  } catch {
    // sem localStorage: escolhe a compra mais recente da pessoa
  }
}

export function retomarCompraAtivaSeExistir() {
  if (cancelarListenerCompraAtiva) cancelarListenerCompraAtiva();
  comprasAbertas = [];

  const consultaAtivas = query(
    collection(db, "compras"),
    where("escopoId", "==", obterEscopoAtual()),
    where("ativa", "==", true)
  );

  cancelarListenerCompraAtiva = onSnapshot(
    consultaAtivas,
    (snapshot) => {
      const compras = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Compra aberta num dia anterior: encerra sozinha (vai para o Histórico)
      compras.filter(comecouAntesDeHoje).forEach((c) => encerrarCompra(c.id, c));
      comprasAbertas = compras.filter((c) => !comecouAntesDeHoje(c));
      escolherCompraDesteCelular();
    },
    (erro) => console.warn("Não foi possível observar as compras abertas:", erro)
  );
}

/**
 * Qual compra este celular mostra: a que ele lembra, a que já está na
 * tela ou a mais recente aberta pela própria pessoa. As dos outros não
 * entram sozinhas (aparecem em "Em andamento no grupo").
 */
function escolherCompraDesteCelular() {
  const eu = auth.currentUser && auth.currentUser.uid;
  const lembrada = lerCompraLembrada();
  const escolhida =
    comprasAbertas.find((c) => c.id === lembrada) ||
    comprasAbertas.find((c) => c.id === compraAtivaId) ||
    comprasAbertas
      .filter((c) => c.criadoPorId === eu)
      .sort((a, b) => dataEmMilissegundos(b.dataInicio) - dataEmMilissegundos(a.dataInicio))[0];

  if (!escolhida) {
    limparCompraAtiva();
    mostrarEstadoVazio();
  } else {
    compraAtivaTipo = escolhida.tipo;
    compraAtivaLimite = escolhida.limite;
    mostrarCabecalhoDaCompra(escolhida);
    if (compraAtivaId !== escolhida.id) {
      compraAtivaId = escolhida.id;
      lembrarCompra(escolhida.id);
      mostrarTelaDeCompraAtiva();
      observarItensDaCompra();
      carregarSugestoes();
    }
    renderizarResumo();
  }
  renderizarOutrasCompras();
}

// ===== Outras compras em andamento no grupo =====
const outrasComprasEl = document.getElementById("outras-compras");

function renderizarOutrasCompras() {
  const eu = auth.currentUser && auth.currentUser.uid;
  const outras = comprasAbertas.filter((c) => c.id !== compraAtivaId);
  outrasComprasEl.innerHTML = "";
  outrasComprasEl.classList.toggle("oculto", outras.length === 0);
  if (!outras.length) return;

  const titulo = document.createElement("p");
  titulo.className = "outras-compras-titulo";
  titulo.textContent = obterGrupoAtual() ? "Compras em aberto no grupo · toque para ajudar" : "Outras compras abertas";
  outrasComprasEl.appendChild(titulo);

  outras.forEach((compra) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "outra-compra";
    const quem = compra.criadoPorId === eu ? null : membroDoCache(compra.criadoPorId);
    if (quem) botao.appendChild(criarAvatar(quem));
    const texto = document.createElement("span");
    texto.textContent = `${tipoComEmoji(compra.tipo)} · ${quem ? quem.nome.split(" ")[0] : "você"}`;
    botao.appendChild(texto);
    // Entrar na compra de outra pessoa (para ajudar): muda só neste celular
    botao.addEventListener("click", () => {
      lembrarCompra(compra.id);
      escolherCompraDesteCelular();
    });
    outrasComprasEl.appendChild(botao);
  });
}

document.addEventListener("membros-mudou", renderizarOutrasCompras);

/**
 * Muda as cores e o desenho de fundo do app conforme o tipo da compra
 * (ver body[data-tipo] no style.css). Sem compra aberta, volta ao padrão.
 */
function aplicarTemaDoTipo(tipo) {
  const chave = tipo ? normalizarTexto(tipo) : "";
  if (TIPOS_COM_TEMA.includes(chave)) {
    document.body.dataset.tipo = chave;
  } else {
    delete document.body.dataset.tipo;
  }
}

function mostrarCabecalhoDaCompra(dados) {
  aplicarTemaDoTipo(dados.tipo);
  // Na farmácia (cruz vermelha) e no churras (espeto) o ícone vem do CSS
  compraTipoEl.textContent = TIPOS_COM_ICONE_NO_CSS.includes(normalizarTexto(dados.tipo || ""))
    ? dados.tipo
    : tipoComEmoji(dados.tipo);
  const data = dataDaCompra(dados);
  // Não sobrescreve enquanto a pessoa está mexendo no campo de data
  if (document.activeElement !== inputDataCompra) {
    inputDataCompra.value = data ? dataParaISO(data.toDate()) : hojeISO();
  }
  inputDataCompra.max = hojeISO();
}

// Mudar a data da compra em andamento
inputDataCompra.addEventListener("change", async () => {
  if (emModoConsulta()) return; // grupo encerrado: só consulta
  if (!compraAtivaId || !inputDataCompra.value) return;
  await updateDoc(doc(db, "compras", compraAtivaId), {
    dataCompra: Timestamp.fromDate(isoParaData(inputDataCompra.value))
  });
});

function comecouAntesDeHoje(dados) {
  if (!dados.dataInicio) return false; // acabou de ser criada, sem data do servidor ainda
  const inicio = dados.dataInicio.toDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return inicio < hoje;
}

async function encerrarCompra(compraId, dados) {
  try {
    if (!dados.quantidadeItens) {
      // Compra vazia não precisa ir para o Histórico
      await deleteDoc(doc(db, "compras", compraId));
    } else {
      await updateDoc(doc(db, "compras", compraId), {
        ativa: false,
        dataFim: serverTimestamp()
      });
    }
  } catch (erro) {
    console.warn("Não foi possível encerrar a compra:", erro);
  }
}

function limparCompraAtiva() {
  sugestoesDaLista = [];
  aplicarTemaDoTipo(null);
  itemEmEdicaoId = null;
  formEdicaoAtual = null;
  if (cancelarListenerItens) {
    cancelarListenerItens();
    cancelarListenerItens = null;
  }
  compraAtivaId = null;
  compraAtivaTipo = null;
  compraAtivaLimite = null;
  itensDaCompra = [];
}

// Quando o escopo muda (ex: acabou de entrar num grupo), observa de novo
document.addEventListener("escopo-mudou", retomarCompraAtivaSeExistir);

// ===== Renderização =====
function renderizarResumo() {
  const total = itensDaCompra.reduce((soma, item) => soma + item.valorTotal, 0);
  const quantidade = itensDaCompra.length;

  resumoTotalEl.textContent = formatarDinheiro(total);
  resumoQtdEl.textContent = String(quantidade);

  if (compraAtivaLimite === null || compraAtivaLimite === undefined) {
    resumoLimiteEl.textContent = "- -";
    resumoLimiteEl.classList.remove("negativo", "piscando");
    return;
  }

  const disponivel = compraAtivaLimite - total;
  resumoLimiteEl.textContent = formatarDinheiro(disponivel);
  resumoLimiteEl.classList.toggle("negativo", disponivel < 0);

  const percentualUsado = (total / compraAtivaLimite) * 100;
  const percentualAlerta = window.SACOLA_PERCENTUAL_ALERTA || PERCENTUAL_ALERTA_PADRAO;
  resumoLimiteEl.classList.toggle("piscando", percentualUsado >= percentualAlerta);
}

function renderizarItens() {
  listaItensEl.innerHTML = "";

  itensDaCompra.forEach((item) => {
    const { linha, frente } = criarLinhaDeslizavel();
    linha.dataset.itemId = item.id;

    if (item.id === itemEmEdicaoId && formEdicaoAtual) {
      linha.classList.add("editando");
      frente.remove();
      linha.appendChild(formEdicaoAtual);
    } else {
      preencherFrenteDoItem(frente, item, renderizarComparacaoPreco(item), autorDoItem(item.adicionadoPorId));
      ativarDeslizar(linha, frente, {
        aoApagar: () => abrirModalExclusao(item),
        aoEditar: () => abrirEdicao(item)
      });
    }

    listaItensEl.appendChild(linha);
  });
}

/**
 * Compara com o preço da última compra do mesmo item.
 * Itens novos guardam o preço anterior por unidade (precoAnteriorUnitario),
 * então a comparação é justa mesmo com quantidades diferentes.
 */
function renderizarComparacaoPreco(item) {
  if (!itemTemPreco(item)) return "";
  let atual = item.valorTotal;
  let anterior = item.precoAnterior;
  if (item.precoAnteriorUnitario !== undefined) {
    atual = precoUnitarioDoItem(item);
    anterior = item.precoAnteriorUnitario;
  }

  if (anterior === null || anterior === undefined) return "";
  if (Math.abs(anterior - atual) < 0.005) return "";

  const maisBarato = atual < anterior;
  const classe = maisBarato ? "mais-barato" : "mais-caro";
  const seta = maisBarato ? "↓" : "↑";
  return `<span class="item-comparacao ${classe}" title="Preço da última compra">${seta} ${formatarDinheiro(anterior)}</span>`;
}

// ===== Adicionar item =====
formItem.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (emModoConsulta()) return; // grupo encerrado: só consulta

  const { quantidade, nome } = interpretarItem(inputDesc.value);
  if (!nome) return;

  // Já tem um item com esse nome nesta compra? Confirma antes de duplicar
  // (comprar duas unidades separadas às vezes é de propósito, então só
  // avisa — não bloqueia como na Lista de compras)
  const chaveItem = chaveDoNomeItem(nome);
  const jaTem = itensDaCompra.find((item) => chaveDoNomeItem(item.nome) === chaveItem);
  if (jaTem) {
    const continuar = await confirmar({
      emoji: "🔁",
      titulo: "Adicionar de novo?",
      mensagem: `"${jaTem.nome}" já está nesta compra. Quer adicionar mais um?`,
      textoOk: "Adicionar mesmo assim"
    });
    if (!continuar) return;
  }

  // Preço é opcional: sem preço, o item entra com "sem preço". O item
  // entra na hora, sem esperar a gravação terminar: sem internet, a
  // "promessa" do Firestore só resolve quando a rede volta (mesmo o item
  // já aparecendo na tela por baixo), e esperar isso travava a tela —
  // o campo digitado ficava preso até a conexão voltar.
  const { precoUnitario, valorTotal } = valoresDoItem(quantidade, inputPreco.value);

  const referenciaItem = doc(collection(db, "compras", compraAtivaId, "itens"));
  setDoc(referenciaItem, {
    nome,
    quantidade,
    precoUnitario,
    valorTotal,
    precoAnterior: null,
    precoAnteriorUnitario: null,
    adicionadoPorId: (auth.currentUser && auth.currentUser.uid) || null,
    criadoEm: serverTimestamp()
  }).catch((erro) => {
    console.error("Erro ao adicionar item:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para adicionar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  });

  atualizarTotaisDaCompra();

  inputDesc.value = "";
  inputPreco.value = "";
  btnLimparItemDesc.classList.add("oculto");
  inputDesc.focus();
  renderizarSugestoes();

  // Se esse item já estava na Lista de compras, acabou de ser comprado:
  // sai de lá (some das sugestões, inclusive em compras futuras). Senão,
  // segue o comportamento de sempre: vira sugestão pra próxima vez.
  const saiuDaLista = await removerDaListaAoComprar(obterEscopoAtual(), compraAtivaTipo, nome);
  if (!saiuDaLista) guardarNaListaFavorita(obterEscopoAtual(), compraAtivaTipo, nome);

  // Compara com a última compra do mesmo item em segundo plano: quando
  // (e se) a busca terminar, preenche a comparação de preço no item que
  // já está na tela. Sem internet, simplesmente não preenche por agora.
  if (precoUnitario) {
    buscarPrecoAnterior(nome)
      .then((anterior) => {
        if (!anterior) return;
        return updateDoc(referenciaItem, {
          precoAnterior: anterior.total,
          precoAnteriorUnitario: anterior.unitario
        });
      })
      .catch((erro) => console.warn("Não foi possível comparar com a compra anterior:", erro));
  }
});

async function buscarPrecoAnterior(nomeItem) {
  const escopo = obterEscopoAtual();
  const nomeNormalizado = normalizarTexto(nomeItem);

  const comprasRef = collection(db, "compras");
  // Só filtros de igualdade (não precisa de índice composto no Firestore);
  // ordena aqui e olha só as 10 compras mais recentes.
  const consulta = query(
    comprasRef,
    where("escopoId", "==", escopo),
    where("ativa", "==", false)
  );

  const snapshotCompras = await getDocs(consulta);
  const comprasRecentes = [...snapshotCompras.docs]
    .sort((a, b) =>
      dataEmMilissegundos(dataDaCompra(b.data())) - dataEmMilissegundos(dataDaCompra(a.data()))
    )
    .slice(0, 10);

  for (const compraDoc of comprasRecentes) {
    const itensRef = collection(db, "compras", compraDoc.id, "itens");
    const snapshotItens = await getDocs(itensRef);
    // Só vale um item que teve preço (itens sem preço são pulados)
    const encontrado = snapshotItens.docs.find(
      (d) => normalizarTexto(d.data().nome) === nomeNormalizado && itemTemPreco(d.data())
    );
    if (encontrado) {
      const dados = encontrado.data();
      return { total: dados.valorTotal, unitario: precoUnitarioDoItem(dados) };
    }
  }

  return null;
}

// Não é esperada por quem chama (fire-and-forget): é só bookkeeping em
// segundo plano, não precisa travar nada da tela por causa dela.
async function atualizarTotaisDaCompra() {
  const total = itensDaCompra.reduce((soma, item) => soma + (item.valorTotal || 0), 0);
  try {
    await updateDoc(doc(db, "compras", compraAtivaId), {
      total,
      quantidadeItens: itensDaCompra.length
    });
  } catch (erro) {
    console.warn("Não foi possível atualizar os totais da compra:", erro);
  }
}

// Nomes e fotos do grupo chegaram: redesenha para mostrar quem adicionou cada item
document.addEventListener("membros-mudou", () => {
  if (compraAtivaId) renderizarItens();
});

// ===== Editar item (abre os campos direto na linha) =====
function abrirEdicao(item) {
  itemEmEdicaoId = item.id;
  formEdicaoAtual = criarFormEdicao(item, {
    aoCancelar: fecharEdicao,
    aoSalvar: (dados) => {
      updateDoc(doc(db, "compras", compraAtivaId, "itens", item.id), dados).catch((erro) => {
        console.error("Erro ao editar item:", erro);
        avisar({ emoji: "😕", titulo: "Não deu para salvar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
      });
      fecharEdicao();
      atualizarTotaisDaCompra();
    }
  });
  renderizarItens();
}

function fecharEdicao() {
  itemEmEdicaoId = null;
  formEdicaoAtual = null;
  renderizarItens();
}

async function abrirModalExclusao(item) {
  const apagar = await confirmar({
    emoji: "🗑️",
    titulo: "Apagar item?",
    mensagem: `Remover "${descricaoDoItem(item)}" da compra?`,
    textoOk: "Apagar",
    perigo: true
  });
  if (!apagar || !compraAtivaId) return;
  deleteDoc(doc(db, "compras", compraAtivaId, "itens", item.id)).catch((erro) => {
    console.error("Erro ao apagar item:", erro);
    avisar({ emoji: "😕", titulo: "Não deu para apagar", mensagem: `Tente de novo daqui a pouco. (${erro.code || erro.message})` });
  });
  atualizarTotaisDaCompra();
}

// ===== Finalizar / salvar compra =====
btnFinalizarCompra.addEventListener("click", async () => {
  if (emModoConsulta()) return; // grupo encerrado: só consulta
  if (!compraAtivaId) return;
  const encerrar = await confirmar({
    emoji: "🧾",
    titulo: "Encerrar esta compra?",
    mensagem: "Ela vai para o Histórico e a tela fica livre para uma nova compra.",
    textoOk: "Encerrar"
  });
  if (!encerrar) return;

  encerrarCompra(compraAtivaId, { quantidadeItens: itensDaCompra.length });
  lembrarCompra(null);

  limparCompraAtiva();
  mostrarEstadoVazio();
});

// Sai desta compra sem encerrar: ela continua aberta (pra você ou pra quem
// mais estiver no grupo) e volta a aparecer em "Outras compras abertas"
btnSairCompra.addEventListener("click", () => {
  if (!compraAtivaId) return;
  lembrarCompra(null);
  limparCompraAtiva();
  mostrarEstadoVazio();
  renderizarOutrasCompras();
});

// ===== Sugestões vindas da Lista de compras =====
// Os itens da lista do mesmo tipo aparecem como sugestão; o que já entrou
// na compra some daqui na hora (mas continua na página Lista).
let sugestoesDaLista = [];

async function carregarSugestoes() {
  const escopo = obterEscopoAtual();
  const listaRef = collection(db, "listasDeCompras");
  const consulta = query(listaRef, where("escopoId", "==", escopo));
  const snapshot = await getDocs(consulta);
  const meuUid = auth.currentUser && auth.currentUser.uid;

  sugestoesDaLista = snapshot.docs
    .map((docSnap) => docSnap.data())
    .filter((dadosItem) => {
      // Só sugere itens da lista do mesmo tipo da compra (ovo não aparece na farmácia)
      if ((dadosItem.tipo || TIPO_PADRAO) !== compraAtivaTipo) return false;
      // Em lista de grupo, pula o que outras pessoas já disseram que levam
      // (a não ser que eu também leve)
      const levam = [...(dadosItem.responsaveis || []), ...(dadosItem.responsavelId ? [dadosItem.responsavelId] : [])];
      return !(levam.length && !levam.includes(meuUid));
    });

  renderizarSugestoes();
}

// Enquanto a pessoa digita, a sugestão compatível sobe para o primeiro
// lugar: primeiro quem começa com o texto digitado, depois quem só contém
// em algum lugar do nome, por último o resto (sort é estável: sem
// compatível nenhuma, a ordem de sempre é mantida).
function relevanciaDaSugestao(nomeNormalizado, digitado) {
  if (!digitado) return 0;
  if (nomeNormalizado.startsWith(digitado)) return 0;
  if (nomeNormalizado.includes(digitado)) return 1;
  return 2;
}

// Nome da melhor sugestão compatível com o que está sendo digitado agora
// (null = nada digitado ou nada compatível). Usado pelo balãozinho ao lado
// de "Sugestões da lista" quando a lista está oculta.
let melhorCorrespondenciaAtual = null;
const correspondenciaMiniEl = document.getElementById("sugestao-correspondencia-mini");

// Clicar no balãozinho só completa o que está sendo digitado — não deve
// abrir a lista inteira de sugestões (por isso o stopPropagation: sem
// ele, o clique "vaza" pro botão de abrir/fechar que o envolve)
function completarComCorrespondenciaMini(evento) {
  evento.stopPropagation();
  if (!melhorCorrespondenciaAtual) return;
  inputDesc.value = `${melhorCorrespondenciaAtual} `;
  btnLimparItemDesc.classList.remove("oculto");
  inputDesc.focus();
  const fim = inputDesc.value.length;
  inputDesc.setSelectionRange(fim, fim);
}

correspondenciaMiniEl.addEventListener("click", completarComCorrespondenciaMini);
correspondenciaMiniEl.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" || evento.key === " ") {
    evento.preventDefault();
    completarComCorrespondenciaMini(evento);
  }
});

function renderizarSugestoes() {
  const naCompra = new Set(itensDaCompra.map((item) => chaveDoNomeItem(item.nome)));
  listaSugestoesEl.innerHTML = "";

  const digitado = normalizarTexto(interpretarItem(inputDesc.value).nome);

  const paraMostrar = sugestoesDaLista
    .filter((dadosItem) => !naCompra.has(chaveDoNomeItem(dadosItem.nome)))
    .sort((a, b) =>
      relevanciaDaSugestao(normalizarTexto(a.nome), digitado) -
      relevanciaDaSugestao(normalizarTexto(b.nome), digitado)
    );

  paraMostrar.forEach((dadosItem) => {
    const chip = document.createElement("button");
    chip.className = "sugestao-chip";
    chip.textContent = dadosItem.nome;
    chip.addEventListener("click", () => {
      // Nome + espaço, com o cursor no fim: é só digitar a quantidade
      // ("Manteiga 2") e o preço
      inputDesc.value = `${dadosItem.nome} `;
      btnLimparItemDesc.classList.remove("oculto");
      inputDesc.focus();
      const fim = inputDesc.value.length;
      inputDesc.setSelectionRange(fim, fim);
    });
    listaSugestoesEl.appendChild(chip);
  });

  // O cabeçalho (com a seta pra ocultar) só aparece quando há sugestões
  btnAlternarSugestoes.classList.toggle("oculto", paraMostrar.length === 0);

  const primeira = paraMostrar[0];
  melhorCorrespondenciaAtual =
    digitado && primeira && relevanciaDaSugestao(normalizarTexto(primeira.nome), digitado) < 2
      ? primeira.nome
      : null;

  aplicarEstadoSugestoesOcultas();
}

// ===== Ocultar/mostrar as sugestões (a escolha fica salva no aparelho) =====
const CHAVE_SUGESTOES_OCULTAS = "sacola_sugestoes_ocultas";

function sugestoesEstaoOcultas() {
  try {
    return localStorage.getItem(CHAVE_SUGESTOES_OCULTAS) === "1";
  } catch {
    return false;
  }
}

// Com a lista de sugestões oculta, mostra ao lado do título um balãozinho
// pequeno com a correspondência do que está sendo digitado, sem precisar
// abrir tudo. Com a lista aberta, o balãozinho não é necessário.
function atualizarCorrespondenciaMini() {
  const mostrar = sugestoesEstaoOcultas() && !!melhorCorrespondenciaAtual;
  correspondenciaMiniEl.textContent = mostrar ? melhorCorrespondenciaAtual : "";
  correspondenciaMiniEl.classList.toggle("oculto", !mostrar);
}

function aplicarEstadoSugestoesOcultas() {
  const ocultas = sugestoesEstaoOcultas();
  listaSugestoesEl.classList.toggle("oculto", ocultas);
  btnAlternarSugestoes.classList.toggle("fechada", ocultas);
  btnAlternarSugestoes.setAttribute("aria-expanded", String(!ocultas));
  atualizarCorrespondenciaMini();
}

btnAlternarSugestoes.addEventListener("click", () => {
  const ocultarAgora = !sugestoesEstaoOcultas();
  try {
    localStorage.setItem(CHAVE_SUGESTOES_OCULTAS, ocultarAgora ? "1" : "0");
  } catch {
    // sem localStorage (ex: aba anônima): só não lembra da próxima vez
  }
  aplicarEstadoSugestoesOcultas();
});

inputDesc.addEventListener("input", () => {
  btnLimparItemDesc.classList.toggle("oculto", !inputDesc.value);
  renderizarSugestoes();
});

btnLimparItemDesc.addEventListener("click", () => {
  inputDesc.value = "";
  btnLimparItemDesc.classList.add("oculto");
  inputDesc.focus();
  renderizarSugestoes();
});

document.addEventListener("pagina-mudou", (evento) => {
  if (evento.detail.pagina === "mercado" && compraAtivaId) {
    carregarSugestoes();
  }
});
