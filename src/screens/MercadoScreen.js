// src/screens/MercadoScreen.js
// Equivalente nativo da tela "Mercado" (mercado.js + a parte #pagina-mercado
// do index.html). Ainda faltam: sugestões vindas da Lista, comparação com
// a compra anterior, e o seletor de "outras compras abertas no grupo"
// (outrasCompras já vem do hook, só a UI de trocar de compra não).

import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCompraAtiva } from "../hooks/useCompraAtiva";
import {
  EMOJI_TIPO_COMPRA,
  TIPOS_COMPRA,
  descricaoDoItem,
  formatarDigitosComoDinheiro,
  formatarDinheiro,
  numeroParaTextoDinheiro,
  textoParaNumero,
  tipoComEmoji,
  hojeISO,
} from "../utils";

const CORES = {
  fundo: "#E4F4EC",
  primaria: "#2FB88A",
  primariaEscura: "#1F8C68",
  texto: "#17322B",
  textoFraco: "#5C7A70",
  cartao: "#FFFFFF",
  perigo: "#E0544A",
};

export default function MercadoScreen() {
  const insets = useSafeAreaInsets();
  const {
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
  } = useCompraAtiva();

  const [modalTipoVisivel, setModalTipoVisivel] = useState(false);
  const [modalOrcamentoVisivel, setModalOrcamentoVisivel] = useState(false);
  const [tipoEscolhido, setTipoEscolhido] = useState(null);
  const [textoOrcamento, setTextoOrcamento] = useState("");

  const [desc, setDesc] = useState("");
  const [preco, setPreco] = useState("");
  const [itemEmEdicaoId, setItemEmEdicaoId] = useState(null);

  const total = useMemo(() => itens.reduce((soma, i) => soma + (i.valorTotal || 0), 0), [itens]);
  const disponivel = compraAtiva && compraAtiva.limite != null ? compraAtiva.limite - total : null;

  function abrirEscolhaDeTipo() {
    setTipoEscolhido(null);
    setModalTipoVisivel(true);
  }

  function escolherTipo(tipo) {
    setTipoEscolhido(tipo);
    setTextoOrcamento("");
    setModalTipoVisivel(false);
    setModalOrcamentoVisivel(true);
  }

  async function confirmarCriacao(orcamentoTexto) {
    const valor = textoParaNumero(orcamentoTexto);
    setModalOrcamentoVisivel(false);
    await criarCompra(tipoEscolhido, valor > 0 ? valor : null, hojeISO(), () => {
      Alert.alert("Não deu para criar a compra", "Tente de novo daqui a pouco.");
    });
  }

  // Pergunta ANTES de gravar: só escreve no Firestore se não houver
  // duplicado, ou se a pessoa confirmar "Adicionar mesmo assim" — assim
  // o "Cancelar" realmente cancela, em vez de só esconder um item já salvo.
  function enviarItem() {
    if (!desc.trim()) return;
    const duplicado = encontrarDuplicado(desc);
    if (duplicado) {
      Alert.alert(
        "Adicionar de novo?",
        `"${duplicado.nome}" já está nesta compra. Quer adicionar mais um?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Adicionar mesmo assim", onPress: () => confirmarEnvioDoItem() },
        ]
      );
      return;
    }
    confirmarEnvioDoItem();
  }

  async function confirmarEnvioDoItem() {
    const resultado = await adicionarItem(desc, preco);
    if (!resultado.ok) return;
    setDesc("");
    setPreco("");
  }

  function confirmarExclusao(item) {
    Alert.alert("Apagar item?", `Remover "${descricaoDoItem(item)}" da compra?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => apagarItem(item.id) },
    ]);
  }

  function abrirEdicaoDeOrcamento() {
    setTextoOrcamento(compraAtiva.limite ? numeroParaTextoDinheiro(compraAtiva.limite) : "");
    setModalOrcamentoVisivel(true);
  }

  function confirmarEncerrar() {
    Alert.alert("Encerrar esta compra?", "Ela vai para o Histórico e a tela fica livre para uma nova compra.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Encerrar", onPress: () => encerrarCompra() },
    ]);
  }

  if (!compraAtiva) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.vazio}>
          <Text style={styles.vazioEmoji}>🛒</Text>
          <Text style={styles.vazioTitulo}>Nenhuma compra em andamento</Text>
          <Pressable style={styles.botaoPrimario} onPress={abrirEscolhaDeTipo}>
            <Text style={styles.botaoPrimarioTexto}>+ Nova compra</Text>
          </Pressable>

          {outrasCompras.length > 0 && (
            <View style={styles.outrasCompras}>
              <Text style={styles.outrasComprasTitulo}>Compras em aberto</Text>
              {outrasCompras.map((c) => (
                <Pressable key={c.id} style={styles.outraCompra} onPress={() => entrarNaCompra(c.id)}>
                  <Text>{tipoComEmoji(c.tipo)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <ModalEscolherTipo
          visivel={modalTipoVisivel}
          onEscolher={escolherTipo}
          onFechar={() => setModalTipoVisivel(false)}
        />
        <ModalOrcamento
          visivel={modalOrcamentoVisivel}
          texto={textoOrcamento}
          onMudarTexto={setTextoOrcamento}
          onPular={() => confirmarCriacao("")}
          onConfirmar={() => confirmarCriacao(textoOrcamento)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.cabecalho}>
        <Text style={styles.cabecalhoTipo}>{tipoComEmoji(compraAtiva.tipo)}</Text>
        <Pressable onPress={abrirEdicaoDeOrcamento}>
          <Text style={styles.cabecalhoOrcamentoLink}>Orçamento</Text>
        </Pressable>
      </View>

      <View style={styles.resumo}>
        <ResumoItem rotulo="Total" valor={formatarDinheiro(total)} />
        <ResumoItem rotulo="Itens" valor={String(itens.length)} />
        <ResumoItem
          rotulo="Disponível"
          valor={disponivel === null ? "- -" : formatarDinheiro(disponivel)}
          negativo={disponivel !== null && disponivel < 0}
        />
      </View>

      <FlatList
        style={styles.lista}
        data={itens}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) =>
          itemEmEdicaoId === item.id ? (
            <LinhaEdicao
              item={item}
              onCancelar={() => setItemEmEdicaoId(null)}
              onSalvar={(dados) => {
                editarItem(item.id, dados);
                setItemEmEdicaoId(null);
              }}
            />
          ) : (
            <LinhaItem
              item={item}
              onEditar={() => setItemEmEdicaoId(item.id)}
              onApagar={() => confirmarExclusao(item)}
            />
          )
        }
        ListEmptyComponent={<Text style={styles.listaVazia}>Nenhum item ainda. Adicione abaixo.</Text>}
      />

      <View style={styles.rodapeBotoes}>
        <Pressable style={styles.botaoSecundario} onPress={sairDaCompra}>
          <Text style={styles.botaoSecundarioTexto}>Sair</Text>
        </Pressable>
        <Pressable style={styles.botaoPrimario} onPress={confirmarEncerrar}>
          <Text style={styles.botaoPrimarioTexto}>Encerrar compra</Text>
        </Pressable>
      </View>

      <View style={[styles.formItem, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.inputDesc}
          placeholder="O que você comprou?"
          value={desc}
          onChangeText={setDesc}
          onSubmitEditing={enviarItem}
          returnKeyType="done"
        />
        <TextInput
          style={styles.inputPreco}
          placeholder="Preço"
          keyboardType="numeric"
          value={preco}
          onChangeText={(texto) => setPreco(formatarDigitosComoDinheiro(texto))}
        />
        <Pressable style={styles.botaoAdicionar} onPress={enviarItem}>
          <Text style={styles.botaoAdicionarTexto}>+</Text>
        </Pressable>
      </View>

      <ModalOrcamento
        visivel={modalOrcamentoVisivel}
        texto={textoOrcamento}
        onMudarTexto={setTextoOrcamento}
        onPular={() => {
          setModalOrcamentoVisivel(false);
          editarOrcamento(null);
        }}
        onConfirmar={() => {
          const valor = textoParaNumero(textoOrcamento);
          setModalOrcamentoVisivel(false);
          editarOrcamento(valor > 0 ? valor : null);
        }}
      />
    </View>
  );
}

function ResumoItem({ rotulo, valor, negativo }) {
  return (
    <View style={styles.resumoItem}>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
      <Text style={[styles.resumoValor, negativo && styles.resumoValorNegativo]}>{valor}</Text>
    </View>
  );
}

function LinhaItem({ item, onEditar, onApagar }) {
  return (
    <Swipeable
      renderLeftActions={() => (
        <View style={[styles.acaoSwipe, { backgroundColor: CORES.primaria }]}>
          <Text style={styles.acaoSwipeTexto}>Editar</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={[styles.acaoSwipe, { backgroundColor: CORES.perigo }]}>
          <Text style={styles.acaoSwipeTexto}>Apagar</Text>
        </View>
      )}
      onSwipeableOpen={(direcao) => (direcao === "left" ? onEditar() : onApagar())}
      overshootLeft={false}
      overshootRight={false}
    >
      <View style={styles.linhaItem}>
        <Text style={styles.linhaItemNome}>{descricaoDoItem(item)}</Text>
        <Text style={styles.linhaItemValor}>{item.valorTotal ? formatarDinheiro(item.valorTotal) : "sem preço"}</Text>
      </View>
    </Swipeable>
  );
}

function LinhaEdicao({ item, onCancelar, onSalvar }) {
  const [nome, setNome] = useState(item.nome);
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [precoTexto, setPrecoTexto] = useState(item.precoUnitario ? numeroParaTextoDinheiro(item.precoUnitario) : "");

  function salvar() {
    const qtdDigitada = Number(quantidade);
    const qtd = Number.isFinite(qtdDigitada) && qtdDigitada > 0 ? qtdDigitada : item.quantidade;
    const preco = textoParaNumero(precoTexto);
    onSalvar({
      nome: nome.trim() || item.nome,
      quantidade: qtd,
      precoUnitario: preco > 0 ? preco : null,
      valorTotal: preco > 0 ? preco * qtd : 0,
    });
  }

  return (
    <View style={styles.linhaEdicao}>
      <TextInput style={styles.inputEdicaoNome} value={nome} onChangeText={setNome} />
      <TextInput
        style={styles.inputEdicaoQtd}
        value={quantidade}
        onChangeText={setQuantidade}
        keyboardType="numeric"
      />
      <TextInput
        style={styles.inputEdicaoPreco}
        value={precoTexto}
        onChangeText={(t) => setPrecoTexto(formatarDigitosComoDinheiro(t))}
        keyboardType="numeric"
      />
      <Pressable onPress={salvar}><Text style={styles.linkSalvar}>Salvar</Text></Pressable>
      <Pressable onPress={onCancelar}><Text style={styles.linkCancelar}>Cancelar</Text></Pressable>
    </View>
  );
}

function ModalEscolherTipo({ visivel, onEscolher, onFechar }) {
  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCartao}>
          <Text style={styles.modalTitulo}>O que você vai comprar?</Text>
          <View style={styles.gradeTipos}>
            {TIPOS_COMPRA.map((tipo) => (
              <Pressable key={tipo} style={styles.opcaoTipo} onPress={() => onEscolher(tipo)}>
                <Text style={styles.opcaoTipoEmoji}>{EMOJI_TIPO_COMPRA[tipo]}</Text>
                <Text style={styles.opcaoTipoTexto}>{tipo}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onFechar}><Text style={styles.linkCancelar}>Cancelar</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ModalOrcamento({ visivel, texto, onMudarTexto, onPular, onConfirmar }) {
  return (
    <Modal visible={visivel} animationType="fade" transparent>
      <View style={styles.modalFundo}>
        <View style={styles.modalCartao}>
          <Text style={styles.modalTitulo}>Quer definir um orçamento?</Text>
          <TextInput
            style={styles.inputOrcamento}
            placeholder="R$ 0,00"
            keyboardType="numeric"
            value={texto}
            onChangeText={(t) => onMudarTexto(formatarDigitosComoDinheiro(t))}
          />
          <Pressable style={styles.botaoPrimario} onPress={onConfirmar}>
            <Text style={styles.botaoPrimarioTexto}>Confirmar</Text>
          </Pressable>
          <Pressable onPress={onPular}><Text style={styles.linkCancelar}>Sem orçamento</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  vazioEmoji: { fontSize: 48 },
  vazioTitulo: { fontSize: 16, color: CORES.textoFraco, marginBottom: 6 },
  botaoPrimario: {
    backgroundColor: CORES.primaria,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: "center",
  },
  botaoPrimarioTexto: { color: "#fff", fontWeight: "800", fontSize: 15 },
  botaoSecundario: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D7E8E1",
  },
  botaoSecundarioTexto: { color: CORES.texto, fontWeight: "700" },
  outrasCompras: { marginTop: 24, alignItems: "center", gap: 8 },
  outrasComprasTitulo: { color: CORES.textoFraco, fontSize: 13, fontWeight: "700" },
  outraCompra: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  cabecalho: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  cabecalhoTipo: { fontSize: 22, fontWeight: "900", color: CORES.primariaEscura },
  cabecalhoOrcamentoLink: { color: CORES.primaria, fontWeight: "700" },
  resumo: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    justifyContent: "space-between",
  },
  resumoItem: { alignItems: "center", flex: 1 },
  resumoRotulo: { color: CORES.textoFraco, fontSize: 12, fontWeight: "700" },
  resumoValor: { color: CORES.texto, fontSize: 17, fontWeight: "900", marginTop: 2 },
  resumoValorNegativo: { color: CORES.perigo },
  lista: { flex: 1, marginTop: 10 },
  listaVazia: { textAlign: "center", color: CORES.textoFraco, marginTop: 30 },
  linhaItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 14,
    borderRadius: 12,
  },
  linhaItemNome: { color: CORES.texto, fontWeight: "700", flex: 1 },
  linhaItemValor: { color: CORES.textoFraco },
  acaoSwipe: { flex: 1, justifyContent: "center", alignItems: "center", marginVertical: 4 },
  acaoSwipeTexto: { color: "#fff", fontWeight: "800" },
  linhaEdicao: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 10,
    borderRadius: 12,
  },
  inputEdicaoNome: { flex: 1, borderBottomWidth: 1, borderColor: "#D7E8E1", padding: 4 },
  inputEdicaoQtd: { width: 40, borderBottomWidth: 1, borderColor: "#D7E8E1", padding: 4 },
  inputEdicaoPreco: { width: 70, borderBottomWidth: 1, borderColor: "#D7E8E1", padding: 4 },
  linkSalvar: { color: CORES.primaria, fontWeight: "800" },
  linkCancelar: { color: CORES.textoFraco, fontWeight: "700", textAlign: "center", marginTop: 10 },
  rodapeBotoes: { flexDirection: "row", gap: 10, padding: 16, justifyContent: "center" },
  formItem: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#D7E8E1",
  },
  inputDesc: { flex: 1, backgroundColor: CORES.fundo, borderRadius: 10, paddingHorizontal: 12 },
  inputPreco: { width: 90, backgroundColor: CORES.fundo, borderRadius: 10, paddingHorizontal: 12 },
  botaoAdicionar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: CORES.primaria,
    alignItems: "center",
    justifyContent: "center",
  },
  botaoAdicionarTexto: { color: "#fff", fontSize: 22, fontWeight: "900" },
  modalFundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCartao: { backgroundColor: "#fff", borderRadius: 18, padding: 20 },
  modalTitulo: { fontSize: 16, fontWeight: "800", color: CORES.texto, marginBottom: 14, textAlign: "center" },
  gradeTipos: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginBottom: 10 },
  opcaoTipo: { width: 86, alignItems: "center", padding: 10, backgroundColor: CORES.fundo, borderRadius: 12 },
  opcaoTipoEmoji: { fontSize: 26 },
  opcaoTipoTexto: { fontSize: 12, marginTop: 4, color: CORES.texto, fontWeight: "700" },
  inputOrcamento: {
    backgroundColor: CORES.fundo,
    borderRadius: 10,
    padding: 12,
    textAlign: "center",
    fontSize: 18,
    marginBottom: 14,
  },
});
