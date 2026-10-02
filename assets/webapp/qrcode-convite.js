// qrcode-convite.js
// QR code do convite para grupo: desenhar (quem convida) e ler pela
// câmera (quem entra). Quem aponta a câmera normal do celular para o QR
// também cai direto no convite, porque o QR é o próprio link.
//
// Desenho: biblioteca qrcode-generator (carregada no index.html).
// Leitura: BarcodeDetector do navegador (Chrome/Android) ou, onde não
// existe (ex: iPhone), a biblioteca jsQR, carregada só quando precisa.

const URL_JSQR = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

/**
 * Desenha o QR code do texto dentro do elemento (SVG, na cor do texto).
 */
export function desenharQRCode(elemento, texto) {
  elemento.innerHTML = "";
  if (typeof window.qrcode !== "function") return; // biblioteca não carregou (offline)

  const qr = window.qrcode(0, "M");
  qr.addData(texto);
  qr.make();

  const tamanho = qr.getModuleCount();
  const margem = 2;
  let caminho = "";
  for (let linha = 0; linha < tamanho; linha++) {
    for (let coluna = 0; coluna < tamanho; coluna++) {
      if (qr.isDark(linha, coluna)) caminho += `M${coluna + margem} ${linha + margem}h1v1h-1z`;
    }
  }
  const total = tamanho + margem * 2;
  elemento.innerHTML = `
    <svg viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code do convite">
      <rect width="${total}" height="${total}" fill="#fff"/>
      <path d="${caminho}" fill="currentColor"/>
    </svg>
  `;
}

// ===== Leitor de QR code pela câmera =====
const modalLeitor = document.getElementById("modal-leitor-qr");
const videoEl = document.getElementById("leitor-qr-video");
const mensagemEl = document.getElementById("leitor-qr-mensagem");

let stream = null;
let lendo = false;
let aoLerAtual = null;

/**
 * Abre a câmera e chama aoLer(texto) assim que encontrar um QR code.
 */
export async function abrirLeitorQR(aoLer) {
  aoLerAtual = aoLer;
  mensagemEl.textContent = "Aponte a câmera para o QR code do convite.";
  modalLeitor.classList.remove("oculto");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
  } catch (erro) {
    console.warn("Câmera indisponível:", erro);
    mensagemEl.textContent = "Não deu para abrir a câmera. Permita o acesso à câmera ou digite o código.";
    return;
  }

  videoEl.srcObject = stream;
  await videoEl.play().catch(() => {});

  const detectar = await criarDetector();
  if (!detectar) {
    mensagemEl.textContent = "Não deu para carregar o leitor. Digite o código.";
    return;
  }

  lendo = true;
  procurar(detectar);
}

async function criarDetector() {
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      return async () => {
        const codigos = await detector.detect(videoEl);
        return codigos.length ? codigos[0].rawValue : null;
      };
    } catch {
      // cai no jsQR
    }
  }

  const carregou = await carregarJsQR();
  if (!carregou) return null;
  const canvas = document.createElement("canvas");
  const contexto = canvas.getContext("2d", { willReadFrequently: true });
  return async () => {
    if (!videoEl.videoWidth) return null;
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    contexto.drawImage(videoEl, 0, 0);
    const imagem = contexto.getImageData(0, 0, canvas.width, canvas.height);
    const resultado = window.jsQR(imagem.data, imagem.width, imagem.height);
    return resultado ? resultado.data : null;
  };
}

function carregarJsQR() {
  if (window.jsQR) return Promise.resolve(true);
  return new Promise((resolver) => {
    const script = document.createElement("script");
    script.src = URL_JSQR;
    script.onload = () => resolver(true);
    script.onerror = () => resolver(false);
    document.head.appendChild(script);
  });
}

async function procurar(detectar) {
  if (!lendo) return;
  try {
    const texto = await detectar();
    if (texto) {
      const aoLer = aoLerAtual;
      fecharLeitorQR();
      if (aoLer) aoLer(texto);
      return;
    }
  } catch {
    // quadro ruim; tenta o próximo
  }
  setTimeout(() => procurar(detectar), 200);
}

export function fecharLeitorQR() {
  lendo = false;
  aoLerAtual = null;
  if (stream) {
    stream.getTracks().forEach((trilha) => trilha.stop());
    stream = null;
  }
  videoEl.srcObject = null;
  modalLeitor.classList.add("oculto");
}

// Fechar o modal (X ou tocar fora) desliga a câmera
new MutationObserver(() => {
  if (modalLeitor.classList.contains("oculto") && (stream || lendo)) fecharLeitorQR();
}).observe(modalLeitor, { attributes: true, attributeFilter: ["class"] });

/**
 * Tira o código do que foi lido: o link de convite (?convite=CODIGO)
 * ou o próprio código de 6 letras/números.
 */
export function extrairCodigoDeConvite(texto) {
  const limpo = (texto || "").trim();
  try {
    const codigo = new URL(limpo).searchParams.get("convite");
    if (codigo) return codigo.toUpperCase();
  } catch {
    // não é um link
  }
  return /^[A-Za-z0-9]{6}$/.test(limpo) ? limpo.toUpperCase() : null;
}
