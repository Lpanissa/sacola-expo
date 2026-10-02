// historico-detalhe.js
// Detalhes de uma compra do Histórico: itens, totais e correções
// (mudar a data, editar/apagar itens e adicionar um item esquecido).
// A compra inteira se apaga arrastando o card no Histórico.

import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  formatarDinheiro,
  interpretarItem,
  dataEmMilissegundos,
  dataDaCompra,
  dataParaISO,
  isoParaData,
  hojeISO,
  tipoComEmoji,
  descricaoDoItem,
  valoresDoItem
} from "./utils.js";
import { confirmar } from "./dialogo.js";
import { emModoConsulta } from "./estado.js";
import { ativarDeslizar, criarLinhaDeslizavel } from "./deslizar.js";
import { criarFormEdicao, preencherFrenteDoItem } from "./edicao-item.js";
import { autorDoItem } from "./grupos.js";

const modal = document.getElementById("modal-compra-detalhe");
const tipoEl = document.getElementById("detalhe-tipo");
const inputData = document.getElementById("detalhe-data");
const totalEl = document.getElementById("detalhe-total");
const qtdEl = document.getElementById("detalhe-qtd");
const limiteEl = document.getElementById("detalhe-limite");
const ultrapassouEl = document.getElementById("detalhe-ultrapassou");
const itensEl = document.getElementById("detalhe-itens");
const formItem = document.getElementById("form-detalhe-item");
const inputDesc = document.getElementById("input-detalhe-desc");
const inputPreco = document.getElementById("input-detalhe-preco");

let compraId = null;
let dadosCompra = null;
let itens = [];
let itemEmEdicaoId = null;
let formEdicaoAtual = null;
let cancelarListeners = [];

// ===== Abrir / fechar =====
export function abrirDetalheDaCompra(id) {
  pararDeObservar();
  compraId = id;
  itens = [];
  itensEl.innerHTML = "";
  inputDesc.value = "";
  inputPreco.value = "";

  cancelarListeners = [
    onSnapshot(doc(db, "compras", id), (snap) => {
      if (!snap.exists()) {
        // A compra foi apagada (aqui ou pelo parceiro)
        modal.classList.add("oculto");
        return;
      }
      dadosCompra = snap.data();
      renderizarCabecalho();
    }),
    onSnapshot(collection(db, "compras", id, "itens"), (snapshot) => {
      itens = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => dataEmMilissegundos(a.criadoEm) - dataEmMilissegundos(b.criadoEm));
      renderizarItens();
      renderizarCabecalho();
      corrigirTotaisSalvos();
    })
  ];

  modal.classList.remove("oculto");
}

function pararDeObservar() {
  cancelarListeners.forEach((cancelar) => cancelar());
  cancelarListeners = [];
  compraId = null;
  dadosCompra = null;
  itemEmEdicaoId = null;
  formEdicaoAtual = null;
}

// Quando o modal fecha (X, clicar fora...), para de observar a compra
new MutationObserver(() => {
  if (modal.classList.contains("oculto") && compraId) pararDeObservar();
}).observe(modal, { attributes: true, attributeFilter: ["class"] });

// ===== Renderização =====
function totalDosItens() {
  return itens.reduce((soma, item) => soma + (item.valorTotal || 0), 0);
}

function renderizarCabecalho() {
  if (!dadosCompra) return;
  tipoEl.textContent = tipoComEmoji(dadosCompra.tipo);

  const data = dataDaCompra(dadosCompra);
  if (document.activeElement !== inputData) {
    inputData.value = data ? dataParaISO(data.toDate()) : "";
  }
  inputData.max = hojeISO();

  const total = totalDosItens();
  totalEl.textContent = formatarDinheiro(total);
  qtdEl.textContent = String(itens.length);

  const limite = dadosCompra.limite;
  const temLimite = limite !== null && limite !== undefined;
  limiteEl.textContent = temLimite ? formatarDinheiro(limite) : "- -";
  ultrapassouEl.classList.toggle("oculto", !(temLimite && total > limite));
  if (temLimite && total > limite) {
    ultrapassouEl.textContent = `Passou do orçamento em ${formatarDinheiro(total - limite)}`;
  }
}

function renderizarItens() {
  itensEl.innerHTML = "";

  if (itens.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "estado-vazio";
    vazio.textContent = "Nenhum item nesta compra.";
    itensEl.appendChild(vazio);
    return;
  }

  itens.forEach((item) => {
    const { linha, frente } = criarLinhaDeslizavel();

    if (item.id === itemEmEdicaoId && formEdicaoAtual) {
      linha.classList.add("editando");
      frente.remove();
      linha.appendChild(formEdicaoAtual);
    } else {
      preencherFrenteDoItem(frente, item, "", autorDoItem(item.adicionadoPorId));
      ativarDeslizar(linha, frente, {
        aoApagar: () => apagarItem(item),
        aoEditar: () => editarItem(item)
      });
    }

    itensEl.appendChild(linha);
  });
}

/**
 * Mantém o total e a quantidade salvos na compra iguais aos itens
 * (o card do Histórico e o ranking usam esses números).
 */
async function corrigirTotaisSalvos() {
  if (!compraId || !dadosCompra) return;
  const total = totalDosItens();
  if (Math.abs((dadosCompra.total || 0) - total) < 0.005 && dadosCompra.quantidadeItens === itens.length) return;
  await updateDoc(doc(db, "compras", compraId), { total, quantidadeItens: itens.length });
}

// ===== Correções =====
inputData.addEventListener("change", async () => {
  if (emModoConsulta()) return; // grupo encerrado: só consulta
  if (!compraId || !inputData.value) return;
  await updateDoc(doc(db, "compras", compraId), {
    dataCompra: Timestamp.fromDate(isoParaData(inputData.value))
  });
});

function editarItem(item) {
  itemEmEdicaoId = item.id;
  formEdicaoAtual = criarFormEdicao(item, {
    aoCancelar: fecharEdicao,
    aoSalvar: async (dados) => {
      await updateDoc(doc(db, "compras", compraId, "itens", item.id), dados);
      fecharEdicao();
    }
  });
  renderizarItens();
}

function fecharEdicao() {
  itemEmEdicaoId = null;
  formEdicaoAtual = null;
  renderizarItens();
}

async function apagarItem(item) {
  const apagar = await confirmar({
    emoji: "🗑️",
    titulo: "Apagar item?",
    mensagem: `Remover "${descricaoDoItem(item)}" desta compra?`,
    textoOk: "Apagar",
    perigo: true
  });
  if (!apagar || !compraId) return;
  await deleteDoc(doc(db, "compras", compraId, "itens", item.id));
}

formItem.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (emModoConsulta()) return; // grupo encerrado: só consulta
  if (!compraId) return;

  const { quantidade, nome } = interpretarItem(inputDesc.value);
  if (!nome) return;
  // Preço é opcional
  const { precoUnitario, valorTotal } = valoresDoItem(quantidade, inputPreco.value);

  await addDoc(collection(db, "compras", compraId, "itens"), {
    nome,
    quantidade,
    precoUnitario,
    valorTotal,
    precoAnterior: null,
    precoAnteriorUnitario: null,
    adicionadoPorId: (auth.currentUser && auth.currentUser.uid) || null,
    criadoEm: serverTimestamp()
  });

  inputDesc.value = "";
  inputPreco.value = "";
  inputDesc.focus();
});

// ===== Apagar a compra inteira =====
export async function apagarCompra(compra) {
  const data = dataDaCompra(compra);
  const apagar = await confirmar({
    emoji: "🗑️",
    titulo: "Apagar esta compra?",
    mensagem: `${tipoComEmoji(compra.tipo)}${data ? ` de ${data.toDate().toLocaleDateString("pt-BR")}` : ""} e todos os itens dela serão apagados do Histórico.`,
    textoOk: "Apagar compra",
    perigo: true
  });
  if (!apagar) return;

  const lote = writeBatch(db);
  const snapshotItens = await getDocs(collection(db, "compras", compra.id, "itens"));
  snapshotItens.docs.forEach((d) => lote.delete(d.ref));
  lote.delete(doc(db, "compras", compra.id));
  await lote.commit();
}
