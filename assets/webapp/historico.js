// historico.js
// Página "Histórico": lista das compras já finalizadas, com resumo de cada
// uma, busca por item comprado, e o ranking dos 3 itens mais comprados.
// Tocar numa compra (ou arrastar para a direita) abre os detalhes;
// arrastar para a esquerda apaga.

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  formatarDinheiro,
  formatarData,
  normalizarTexto,
  dataEmMilissegundos,
  dataDaCompra,
  tipoComEmoji
} from "./utils.js";
import { obterEscopoAtual } from "./estado.js";
import { ativarDeslizar, criarLinhaDeslizavel } from "./deslizar.js";
import { abrirDetalheDaCompra, apagarCompra } from "./historico-detalhe.js";

const listaHistoricoEl = document.getElementById("lista-historico");
const inputBuscaEl = document.getElementById("input-busca-historico");
const destaquesEl = document.getElementById("historico-destaques");

let comprasCarregadas = [];
let cancelarListenerHistorico = null;

export function observarHistorico() {
  if (cancelarListenerHistorico) cancelarListenerHistorico();

  const comprasRef = collection(db, "compras");
  // Só filtros de igualdade (não precisa de índice composto no Firestore);
  // a ordenação da mais recente para a mais antiga é feita aqui.
  const consulta = query(
    comprasRef,
    where("escopoId", "==", obterEscopoAtual()),
    where("ativa", "==", false)
  );

  cancelarListenerHistorico = onSnapshot(consulta, (snapshot) => {
    comprasCarregadas = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => dataEmMilissegundos(dataDaCompra(b)) - dataEmMilissegundos(dataDaCompra(a)));
    renderizarLista(comprasCarregadas);
    calcularRanking();
  });
}

// Recarrega quando o grupo/escopo muda (ex: acabou de entrar num grupo)
document.addEventListener("escopo-mudou", observarHistorico);

function renderizarLista(compras) {
  listaHistoricoEl.innerHTML = "";

  if (compras.length === 0) {
    const vazio = document.createElement("li");
    vazio.className = "estado-vazio";
    vazio.textContent = "Nenhuma compra salva ainda.";
    listaHistoricoEl.appendChild(vazio);
    return;
  }

  compras.forEach((compra) => {
    const data = dataDaCompra(compra);
    const dataTexto = data ? formatarData(data.toDate()) : "";

    const excedeu =
      compra.limite !== null &&
      compra.limite !== undefined &&
      compra.total > compra.limite;

    const { linha, frente: cartao } = criarLinhaDeslizavel({
      classeExtra: "historico-item",
      iconeEditar: "lupa"
    });
    cartao.innerHTML = `
      <div class="historico-data">${tipoComEmoji(compra.tipo)} · ${dataTexto}</div>
      <div class="historico-linha">
        <span>Total gasto</span>
        <span>${formatarDinheiro(compra.total)}</span>
      </div>
      <div class="historico-linha">
        <span>Itens comprados</span>
        <span>${compra.quantidadeItens || 0}</span>
      </div>
      ${
        excedeu
          ? `<div class="historico-linha historico-ultrapassou">
              <span>Ultrapassou o limite em</span>
              <span>${formatarDinheiro(compra.total - compra.limite)}</span>
            </div>`
          : ""
      }
    `;
    ativarDeslizar(linha, cartao, {
      aoApagar: () => apagarCompra(compra),
      aoEditar: () => abrirDetalheDaCompra(compra.id),
      aoTocar: () => abrirDetalheDaCompra(compra.id),
      tocarEmConsulta: true
    });
    listaHistoricoEl.appendChild(linha);
  });
}

// ===== Busca por item já comprado em algum dia =====
inputBuscaEl.addEventListener("input", async () => {
  const termo = normalizarTexto(inputBuscaEl.value);

  if (!termo) {
    renderizarLista(comprasCarregadas);
    return;
  }

  const comprasComItem = [];

  for (const compra of comprasCarregadas) {
    const itensRef = collection(db, "compras", compra.id, "itens");
    const snapshotItens = await getDocs(itensRef);
    const encontrou = snapshotItens.docs.some((d) =>
      normalizarTexto(d.data().nome).includes(termo)
    );
    if (encontrou) comprasComItem.push(compra);
  }

  renderizarLista(comprasComItem);
});

// ===== Ranking dos 3 itens mais comprados =====
async function calcularRanking() {
  const contagem = {};

  for (const compra of comprasCarregadas) {
    const itensRef = collection(db, "compras", compra.id, "itens");
    const snapshotItens = await getDocs(itensRef);
    snapshotItens.docs.forEach((docSnap) => {
      const nome = docSnap.data().nome;
      const chave = normalizarTexto(nome);
      if (!contagem[chave]) contagem[chave] = { nome, vezes: 0 };
      contagem[chave].vezes += 1;
    });
  }

  const ranking = Object.values(contagem)
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 3);

  destaquesEl.innerHTML = "";
  ranking.forEach((item, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "historico-card";
    cartao.style.minWidth = "140px";
    cartao.innerHTML = `
      <div class="historico-data">${["🥇", "🥈", "🥉"][indice]} ${item.nome}</div>
      <div class="historico-linha"><span>Comprado</span><span>${item.vezes}x</span></div>
    `;
    destaquesEl.appendChild(cartao);
  });
}
