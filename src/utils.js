// src/utils.js
// Mesmas funções do utils.js do site. As que manipulavam <input> do DOM
// (máscara de dinheiro) virão como um handler de onChangeText, não mais
// um listener de "input".

export function formatarDinheiro(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function textoParaNumero(texto) {
  if (typeof texto === "number") return texto;
  let limpo = String(texto).trim();
  if (limpo.includes(",")) {
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  }
  const numero = parseFloat(limpo);
  return isNaN(numero) ? 0 : numero;
}

/**
 * Máscara de dinheiro: a pessoa digita só números, a vírgula entra sozinha.
 * Ex: "2" -> "0,02", "299" -> "2,99", "35000" -> "350,00"
 */
export function formatarDigitosComoDinheiro(texto) {
  const digitos = String(texto).replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return "";
  const centavos = Number(digitos);
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function numeroParaTextoDinheiro(valor) {
  return formatarDigitosComoDinheiro(String(Math.round((Number(valor) || 0) * 100)));
}

export const EMOJI_TIPO_COMPRA = {
  Mercado: "🛒",
  Feira: "🥕",
  "Açougue": "🥩",
  "Farmácia": "💊",
  Churras: "🍢🍺",
  Festa: "🎉",
  Bomboniere: "🍬",
  Perfumaria: "🧴",
  Shopping: "🛍️",
};

export function descricaoDoItem(item) {
  return item.quantidade > 1 ? `${formatarNumero(item.quantidade)} ${item.nome}` : item.nome;
}

export function formatarNumero(numero) {
  return Number(numero).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function chaveDoNomeItem(nome) {
  return normalizarTexto(interpretarItem(nome || "").nome)
    .split(" ")
    .map((palavra) => (palavra.length > 3 ? palavra.replace(/s$/, "") : palavra))
    .join(" ");
}

export function valoresDoItem(quantidade, textoPreco) {
  const preco = textoParaNumero(textoPreco);
  return preco > 0
    ? { precoUnitario: preco, valorTotal: quantidade * preco }
    : { precoUnitario: null, valorTotal: 0 };
}

export function itemTemPreco(item) {
  return (item.precoUnitario || 0) > 0 || (item.valorTotal || 0) > 0;
}

export function precoUnitarioDoItem(item) {
  if (item.precoUnitario) return item.precoUnitario;
  return item.quantidade ? item.valorTotal / item.quantidade : item.valorTotal;
}

export const TIPOS_COMPRA = Object.keys(EMOJI_TIPO_COMPRA);
export const TIPO_PADRAO = "Mercado";

export function doTipo(tipo) {
  const femininos = ["Feira", "Farmácia", "Festa", "Bomboniere", "Perfumaria"];
  return `${femininos.includes(tipo) ? "da" : "do"} ${(tipo || TIPO_PADRAO).toLowerCase()}`;
}

export function tipoComEmoji(tipo) {
  const emoji = EMOJI_TIPO_COMPRA[tipo];
  return emoji ? `${emoji} ${tipo}` : tipo || "";
}

/**
 * Interpreta o texto digitado no campo de item, com a quantidade no
 * começo ou no fim: "3 sucos" -> { quantidade: 3, nome: "sucos" }
 */
export function interpretarItem(textoDigitado) {
  const texto = textoDigitado.trim().replace(/\s+/g, " ");
  const numero = "(\\d+(?:[.,]\\d+)?)";

  const regras = [
    new RegExp(`^${numero}\\s*(?:x|un|unid|unidades?)?\\s+(.+)$`, "i"),
    new RegExp(`^(.+?)\\s+(?:x\\s*)?${numero}\\s*(?:x|un|unid|unidades?)?$`, "i"),
  ];

  for (const [indice, regra] of regras.entries()) {
    const casamento = texto.match(regra);
    if (!casamento) continue;
    const [quantidadeTexto, nome] = indice === 0 ? [casamento[1], casamento[2]] : [casamento[2], casamento[1]];
    const quantidade = textoParaNumero(quantidadeTexto);
    if (nome.trim() && quantidade > 0) return { quantidade, nome: nome.trim() };
  }

  return { quantidade: 1, nome: texto };
}

export function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatarDataHora(data) {
  const dataObj = data instanceof Date ? data : new Date(data);
  return dataObj.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarData(data) {
  const dataObj = data instanceof Date ? data : new Date(data);
  return dataObj.toLocaleDateString("pt-BR");
}

export function inicialDoNome(nome) {
  if (!nome) return "?";
  return nome.trim().charAt(0).toUpperCase();
}

export function dataEmMilissegundos(valor) {
  if (!valor) return Date.now();
  if (typeof valor.toMillis === "function") return valor.toMillis();
  return new Date(valor).getTime();
}

export function hojeISO() {
  return dataParaISO(new Date());
}

export function dataParaISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function isoParaData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

export function dataDaCompra(compra) {
  return compra.dataCompra || compra.dataFim || compra.dataInicio || null;
}

export function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
