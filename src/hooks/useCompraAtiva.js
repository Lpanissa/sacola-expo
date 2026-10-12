// src/hooks/useCompraAtiva.js
// Porta o núcleo do mercado.js (criar/retomar compra, itens em tempo
// real, totais) para um hook de React. Fica de fora, por enquanto:
// sugestões vindas da Lista, comparação com a compra anterior e o
// seletor de "outras compras abertas no grupo" — ver pendências no chat.

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import firestore from "@react-native-firebase/firestore";
import { db, authInstance } from "../firebase";
import { useAppState } from "../context/AppStateContext";
import { chaveDoNomeItem, dataEmMilissegundos, interpretarItem, isoParaData, valoresDoItem } from "../utils";

function chaveCompraLembrada(escopo) {
  return `sacola_compra_${escopo}`;
}

const horaLocalDoItemPendente = new Map();
function instanteDoItem(item) {
  if (item.criadoEm) {
    horaLocalDoItemPendente.delete(item.id);
    return dataEmMilissegundos(item.criadoEm);
  }
  if (!horaLocalDoItemPendente.has(item.id)) horaLocalDoItemPendente.set(item.id, Date.now());
  return horaLocalDoItemPendente.get(item.id);
}

function comecouAntesDeHoje(dados) {
  if (!dados.dataInicio) return false;
  const inicio = dados.dataInicio.toDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return inicio < hoje;
}

async function encerrarCompraDoc(compraId, quantidadeItens) {
  try {
    if (!quantidadeItens) {
      await db.collection("compras").doc(compraId).delete();
    } else {
      await db.collection("compras").doc(compraId).update({
        ativa: false,
        dataFim: firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (erro) {
    console.warn("Não foi possível encerrar a compra:", erro);
  }
}

// Assina os itens de uma compra e mantém o total/quantidade do documento
// pai sempre derivados dessa mesma lista — é a ÚNICA função que escreve
// "total"/"quantidadeItens", então duas escritas seguidas (dois itens
// adicionados rápido, por exemplo) nunca mais se pisam: cada snapshot novo
// recalcula do zero a partir da lista que o próprio Firestore confirmou.
function escutarItens(compraId, aoAtualizar) {
  const itensRef = db.collection("compras").doc(compraId).collection("itens");
  return itensRef.onSnapshot((snapshot) => {
    const lista = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => instanteDoItem(a) - instanteDoItem(b));
    aoAtualizar(lista);
    const total = lista.reduce((soma, item) => soma + (item.valorTotal || 0), 0);
    db.collection("compras")
      .doc(compraId)
      .update({ total, quantidadeItens: lista.length })
      .catch((erro) => console.warn("Não foi possível atualizar os totais da compra:", erro));
  });
}

export function useCompraAtiva() {
  const { escopoAtual } = useAppState();
  const [comprasAbertas, setComprasAbertas] = useState([]);
  const [compraAtiva, setCompraAtiva] = useState(null); // { id, tipo, limite, ... }
  const [itens, setItens] = useState([]);
  const cancelarItensRef = useRef(null);
  const compraAtivaIdRef = useRef(null);
  const [gatilhoSelecao, setGatilhoSelecao] = useState(0);

  // ===== Observa compras abertas no escopo (minha ou do grupo) =====
  useEffect(() => {
    const consulta = db
      .collection("compras")
      .where("escopoId", "==", escopoAtual)
      .where("ativa", "==", true);

    const cancelar = consulta.onSnapshot(
      (snapshot) => {
        const compras = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        compras.filter(comecouAntesDeHoje).forEach((c) => encerrarCompraDoc(c.id, c.quantidadeItens));
        setComprasAbertas(compras.filter((c) => !comecouAntesDeHoje(c)));
      },
      (erro) => console.warn("Não foi possível observar as compras abertas:", erro)
    );
    return cancelar;
  }, [escopoAtual]);

  // ===== Escolhe qual compra este aparelho mostra =====
  // "cancelado" evita que uma execução antiga (que ainda está esperando o
  // AsyncStorage responder) sobrescreva o resultado de uma execução mais
  // nova — por exemplo, logo depois de criar uma compra, o listener de
  // "compras abertas" pode disparar de novo antes do primeiro await
  // terminar; sem essa proteção, o resultado antigo "ganhava" por último
  // e jogava a tela de volta pro estado vazio por um instante.
  useEffect(() => {
    let cancelado = false;

    (async () => {
      const eu = authInstance.currentUser && authInstance.currentUser.uid;
      let lembrada = null;
      try {
        lembrada = await AsyncStorage.getItem(chaveCompraLembrada(escopoAtual));
      } catch {
        lembrada = null;
      }
      if (cancelado) return;

      const escolhida =
        comprasAbertas.find((c) => c.id === lembrada) ||
        comprasAbertas.find((c) => c.id === compraAtivaIdRef.current) ||
        comprasAbertas
          .filter((c) => c.criadoPorId === eu)
          .sort((a, b) => dataEmMilissegundos(b.dataInicio) - dataEmMilissegundos(a.dataInicio))[0];

      if (!escolhida) {
        compraAtivaIdRef.current = null;
        setCompraAtiva(null);
        setItens([]);
        if (cancelarItensRef.current) {
          cancelarItensRef.current();
          cancelarItensRef.current = null;
        }
        return;
      }

      setCompraAtiva(escolhida);

      if (compraAtivaIdRef.current !== escolhida.id) {
        compraAtivaIdRef.current = escolhida.id;
        try {
          await AsyncStorage.setItem(chaveCompraLembrada(escopoAtual), escolhida.id);
        } catch {
          // sem AsyncStorage: só não lembra entre sessões
        }
        if (cancelado) return;

        if (cancelarItensRef.current) cancelarItensRef.current();
        cancelarItensRef.current = escutarItens(escolhida.id, setItens);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [comprasAbertas, escopoAtual, gatilhoSelecao]);

  useEffect(() => () => {
    if (cancelarItensRef.current) cancelarItensRef.current();
  }, []);

  const criarCompra = useCallback(
    async (tipo, orcamento, dataISO, aoFalhar) => {
      const novaCompra = {
        tipo,
        escopoId: escopoAtual,
        criadoPorId: (authInstance.currentUser && authInstance.currentUser.uid) || null,
        limite: orcamento || null,
        total: 0,
        quantidadeItens: 0,
        ativa: true,
        dataCompra: firestore.Timestamp.fromDate(isoParaData(dataISO)),
        dataInicio: firestore.FieldValue.serverTimestamp(),
        dataFim: null,
      };
      const referencia = db.collection("compras").doc();
      referencia.set(novaCompra).catch((erro) => {
        console.error("Erro ao criar a compra:", erro);
        if (aoFalhar) aoFalhar(erro);
      });
      compraAtivaIdRef.current = referencia.id;
      try {
        await AsyncStorage.setItem(chaveCompraLembrada(escopoAtual), referencia.id);
      } catch {}
      setCompraAtiva({ id: referencia.id, ...novaCompra });
      setItens([]);
      if (cancelarItensRef.current) cancelarItensRef.current();
      cancelarItensRef.current = escutarItens(referencia.id, setItens);
      return referencia.id;
    },
    [escopoAtual]
  );

  // Diz se já existe um item com esse nome na compra atual, sem gravar
  // nada — a tela usa isso para perguntar "adicionar mesmo assim?" ANTES
  // de escrever, assim um "Cancelar" realmente cancela.
  const encontrarDuplicado = useCallback(
    (textoDigitado) => {
      const { nome } = interpretarItem(textoDigitado);
      if (!nome) return null;
      const chaveItem = chaveDoNomeItem(nome);
      return itens.find((item) => chaveDoNomeItem(item.nome) === chaveItem) || null;
    },
    [itens]
  );

  const adicionarItem = useCallback(
    async (textoDigitado, textoPreco) => {
      if (!compraAtiva) return { ok: false };
      const { quantidade, nome } = interpretarItem(textoDigitado);
      if (!nome) return { ok: false };

      const { precoUnitario, valorTotal } = valoresDoItem(quantidade, textoPreco);
      const referenciaItem = db.collection("compras").doc(compraAtiva.id).collection("itens").doc();
      referenciaItem
        .set({
          nome,
          quantidade,
          precoUnitario,
          valorTotal,
          precoAnterior: null,
          precoAnteriorUnitario: null,
          adicionadoPorId: (authInstance.currentUser && authInstance.currentUser.uid) || null,
          criadoEm: firestore.FieldValue.serverTimestamp(),
        })
        .catch((erro) => console.error("Erro ao adicionar item:", erro));

      return { ok: true };
    },
    [compraAtiva]
  );

  const editarItem = useCallback(
    async (itemId, dados) => {
      if (!compraAtiva) return;
      try {
        await db.collection("compras").doc(compraAtiva.id).collection("itens").doc(itemId).update(dados);
      } catch (erro) {
        console.error("Erro ao editar item:", erro);
      }
    },
    [compraAtiva]
  );

  const apagarItem = useCallback(
    async (itemId) => {
      if (!compraAtiva) return;
      db.collection("compras").doc(compraAtiva.id).collection("itens").doc(itemId).delete().catch((erro) => {
        console.error("Erro ao apagar item:", erro);
      });
    },
    [compraAtiva]
  );

  const editarOrcamento = useCallback(
    async (valor) => {
      if (!compraAtiva) return;
      try {
        await db.collection("compras").doc(compraAtiva.id).update({ limite: valor });
        setCompraAtiva((atual) => (atual ? { ...atual, limite: valor } : atual));
      } catch (erro) {
        console.warn("Não foi possível salvar o orçamento:", erro);
      }
    },
    [compraAtiva]
  );

  const encerrarCompra = useCallback(async () => {
    if (!compraAtiva) return;
    await encerrarCompraDoc(compraAtiva.id, itens.length);
    try {
      await AsyncStorage.removeItem(chaveCompraLembrada(escopoAtual));
    } catch {}
    compraAtivaIdRef.current = null;
    setCompraAtiva(null);
    setItens([]);
    if (cancelarItensRef.current) {
      cancelarItensRef.current();
      cancelarItensRef.current = null;
    }
  }, [compraAtiva, itens, escopoAtual]);

  const sairDaCompra = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(chaveCompraLembrada(escopoAtual));
    } catch {}
    compraAtivaIdRef.current = null;
    setCompraAtiva(null);
    setItens([]);
    if (cancelarItensRef.current) {
      cancelarItensRef.current();
      cancelarItensRef.current = null;
    }
  }, [escopoAtual]);

  const entrarNaCompra = useCallback(
    async (compraId) => {
      try {
        await AsyncStorage.setItem(chaveCompraLembrada(escopoAtual), compraId);
      } catch {}
      compraAtivaIdRef.current = null;
      setGatilhoSelecao((n) => n + 1); // faz o efeito de seleção rodar de novo
    },
    [escopoAtual]
  );

  const outrasCompras = comprasAbertas.filter((c) => c.id !== (compraAtiva && compraAtiva.id));

  return {
    compraAtiva,
    itens,
    outrasCompras,
    criarCompra,
    encontrarDuplicado,
    adicionarItem,
    editarItem,
    apagarItem,
    editarOrcamento,
    encerrarCompra,
    sairDaCompra,
    entrarNaCompra,
  };
}
