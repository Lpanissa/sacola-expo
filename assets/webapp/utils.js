// utils.js
// Funções pequenas e reutilizadas em várias partes do app Sacola.

/**
 * Formata um número como dinheiro brasileiro: 4.5 -> "R$ 4,50"
 */
export function formatarDinheiro(valor) {
  const numero = Number(valor) || 0;
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/**
 * Converte um texto de preço digitado pelo usuário (ex: "4,50", "4.50" ou
 * "1.234,50") em número. Se tiver vírgula, os pontos são separadores de milhar.
 */
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
 * Máscara de dinheiro: a pessoa digita só os números e a vírgula entra
 * sozinha, preenchendo da direita para a esquerda.
 * Ex: "2" -> "0,02", "299" -> "2,99", "35000" -> "350,00", "123456" -> "1.234,56"
 */
export function formatarDigitosComoDinheiro(texto) {
  const digitos = String(texto).replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return "";
  const centavos = Number(digitos);
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Liga a máscara de dinheiro em todos os campos com o atributo data-dinheiro.
 */
export function ativarMascarasDeDinheiro() {
  document.querySelectorAll("input[data-dinheiro]").forEach(aplicarMascaraDeDinheiro);
}

/**
 * Liga a máscara de dinheiro num campo só (para campos criados depois,
 * como os da edição de item).
 */
export function aplicarMascaraDeDinheiro(campo) {
  campo.addEventListener("input", () => {
    campo.value = formatarDigitosComoDinheiro(campo.value);
    // Mantém o cursor sempre no fim, onde os números entram
    const fim = campo.value.length;
    campo.setSelectionRange(fim, fim);
  });
}

/**
 * Número -> texto no formato da máscara: 4.5 -> "4,50"
 */
export function numeroParaTextoDinheiro(valor) {
  return formatarDigitosComoDinheiro(String(Math.round((Number(valor) || 0) * 100)));
}

/**
 * Emoji de cada tipo de compra, usado nos botões, na tela e no histórico.
 */
export const EMOJI_TIPO_COMPRA = {
  Mercado: "🛒",
  Feira: "🥕",
  "Açougue": "🥩",
  "Farmácia": "💊",
  Churras: "🍢🍺",
  Festa: "🎉",
  Bomboniere: "🍬",
  Perfumaria: "🧴",
  Shopping: "🛍️"
};

/**
 * Descrição do item com a quantidade: "3 sucos" (ou só "suco" se for 1)
 */
export function descricaoDoItem(item) {
  return item.quantidade > 1 ? `${formatarNumero(item.quantidade)} ${item.nome}` : item.nome;
}

export function formatarNumero(numero) {
  return Number(numero).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/**
 * Chave para comparar itens pelo nome, sem a quantidade e sem o plural
 * simples: "Manteiga 2" = "manteiga", "2 Chás" = "cha".
 */
export function chaveDoNomeItem(nome) {
  return normalizarTexto(interpretarItem(nome || "").nome)
    .split(" ")
    .map((palavra) => (palavra.length > 3 ? palavra.replace(/s$/, "") : palavra))
    .join(" ");
}

/**
 * O preço é opcional: item sem preço fica com precoUnitario null e
 * valorTotal 0 (não entra na soma nem na comparação de preço).
 */
export function valoresDoItem(quantidade, textoPreco) {
  const preco = textoParaNumero(textoPreco);
  return preco > 0
    ? { precoUnitario: preco, valorTotal: quantidade * preco }
    : { precoUnitario: null, valorTotal: 0 };
}

export function itemTemPreco(item) {
  return (item.precoUnitario || 0) > 0 || (item.valorTotal || 0) > 0;
}

/**
 * Preço de uma unidade (itens antigos só tinham o total)
 */
export function precoUnitarioDoItem(item) {
  if (item.precoUnitario) return item.precoUnitario;
  return item.quantidade ? item.valorTotal / item.quantidade : item.valorTotal;
}

// Tipos de compra, na ordem em que aparecem nas opções
export const TIPOS_COMPRA = Object.keys(EMOJI_TIPO_COMPRA);

// Itens de lista antigos, de antes das listas por tipo, contam como Mercado
export const TIPO_PADRAO = "Mercado";

/**
 * "do mercado", "da farmácia"... para frases como "lista do mercado"
 */
export function doTipo(tipo) {
  const femininos = ["Feira", "Farmácia", "Festa", "Bomboniere", "Perfumaria"];
  return `${femininos.includes(tipo) ? "da" : "do"} ${(tipo || TIPO_PADRAO).toLowerCase()}`;
}

// Tipos que têm ícone desenhado (icons/<chave>.svg) em vez de emoji nos botões
const ICONES_DESENHADOS = { Churras: "icons/churras.svg" };

/**
 * Ícone do tipo para os botões de escolha (HTML): desenho próprio ou emoji.
 */
export function iconeDoTipoHTML(tipo) {
  if (ICONES_DESENHADOS[tipo]) return `<img class="icone-tipo" src="${ICONES_DESENHADOS[tipo]}" alt="">`;
  return EMOJI_TIPO_COMPRA[tipo] || "🛍️";
}

export function tipoComEmoji(tipo) {
  const emoji = EMOJI_TIPO_COMPRA[tipo];
  return emoji ? `${emoji} ${tipo}` : tipo || "";
}

/**
 * Interpreta o texto digitado no campo de item, com a quantidade no
 * começo ou no fim:
 *   "3 sucos"        -> { quantidade: 3, nome: "sucos" }
 *   "Iogurte grego 6" -> { quantidade: 6, nome: "Iogurte grego" }
 *   "Manteiga 2x", "Pão x4", "Tomate 3 un" também valem
 *   "suco"           -> { quantidade: 1, nome: "suco" }
 * Número colado numa medida faz parte do nome: "Leite 1L", "Arroz 5kg",
 * "Coca 2 litros" continuam com quantidade 1.
 */
export function interpretarItem(textoDigitado) {
  const texto = textoDigitado.trim().replace(/\s+/g, " ");
  const numero = "(\\d+(?:[.,]\\d+)?)";

  const regras = [
    new RegExp(`^${numero}\\s*(?:x|un|unid|unidades?)?\\s+(.+)$`, "i"), // "3 sucos", "3x sucos"
    new RegExp(`^(.+?)\\s+(?:x\\s*)?${numero}\\s*(?:x|un|unid|unidades?)?$`, "i") // "sucos 3", "sucos x3", "sucos 3un"
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

/**
 * Gera um id simples e único, suficiente para itens locais
 * (o Firestore gera os ids "de verdade" para os documentos salvos).
 */
export function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Formata uma data (objeto Date ou timestamp do Firestore) para
 * o formato "23 de setembro de 2026, 14:32"
 */
export function formatarDataHora(data) {
  const dataObj = data instanceof Date ? data : new Date(data);
  return dataObj.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Formata só a data, sem hora: "23/09/2026"
 */
export function formatarData(data) {
  const dataObj = data instanceof Date ? data : new Date(data);
  return dataObj.toLocaleDateString("pt-BR");
}

/**
 * Retorna a inicial de um nome, em maiúscula, para usar no avatar do perfil.
 */
export function inicialDoNome(nome) {
  if (!nome) return "?";
  return nome.trim().charAt(0).toUpperCase();
}

/**
 * Converte um campo de data do Firestore em milissegundos, para ordenar.
 * Datas ainda sem valor (salvas agora, esperando o servidor) contam como "agora".
 */
export function dataEmMilissegundos(valor) {
  if (!valor) return Date.now();
  if (typeof valor.toMillis === "function") return valor.toMillis();
  return new Date(valor).getTime();
}

/**
 * Data de hoje no formato dos campos <input type="date">: "2026-09-24"
 */
export function hojeISO() {
  return dataParaISO(new Date());
}

/**
 * Date -> "AAAA-MM-DD" (no fuso do aparelho, não em UTC)
 */
export function dataParaISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * "AAAA-MM-DD" -> Date ao meio-dia (evita que o fuso horário mude o dia)
 */
export function isoParaData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

/**
 * Data que vale para uma compra: a escolhida pela pessoa (dataCompra) ou,
 * em compras antigas que não tinham esse campo, o dia em que foi salva.
 */
export function dataDaCompra(compra) {
  return compra.dataCompra || compra.dataFim || compra.dataInicio || null;
}

/**
 * Deixa um texto "normalizado" para comparação/busca:
 * remove acentos, deixa minúsculo e sem espaços nas pontas.
 * Ex: "Suco de Uva" -> "suco de uva"
 */
export function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
