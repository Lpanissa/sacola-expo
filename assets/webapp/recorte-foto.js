// recorte-foto.js
// Tela para enquadrar a foto (perfil ou grupo) antes de salvar: a foto
// aparece na hora num quadrado com a marca do círculo; dá para arrastar,
// dar zoom (dois dedos, rodinha do mouse ou a barrinha) e confirmar.
// O resultado é um JPEG quadrado de 256px (~20 KB), salvo direto no
// Firestore, sem Firebase Storage.

const TAMANHO_FINAL = 256;
const ZOOM_MAXIMO = 4;

let elementos = null;
let estado = null;     // { imagem, largura, altura, escalaMinima, escala, x, y }
let resolverAtual = null;
const ponteiros = new Map(); // dedos/mouse na tela, para arrastar e pinçar

function criarElementos() {
  const fundo = document.createElement("div");
  fundo.className = "modal modal-recorte oculto";
  fundo.innerHTML = `
    <div class="modal-conteudo recorte-conteudo">
      <h2>Ajustar foto</h2>
      <div class="recorte-area">
        <canvas class="recorte-canvas"></canvas>
        <span class="recorte-mascara" aria-hidden="true"></span>
      </div>
      <input type="range" class="recorte-zoom" min="1" max="${ZOOM_MAXIMO}" step="0.01" value="1" aria-label="Zoom">
      <p class="recorte-dica">Arraste para enquadrar e use dois dedos (ou a barrinha) para aproximar.</p>
      <div class="modal-botoes">
        <button type="button" class="botao-secundario recorte-cancelar">Cancelar</button>
        <button type="button" class="botao-primario recorte-usar">Usar foto</button>
      </div>
    </div>
  `;
  document.body.appendChild(fundo);

  const els = {
    fundo,
    area: fundo.querySelector(".recorte-area"),
    canvas: fundo.querySelector(".recorte-canvas"),
    zoom: fundo.querySelector(".recorte-zoom"),
    usar: fundo.querySelector(".recorte-usar"),
    cancelar: fundo.querySelector(".recorte-cancelar")
  };

  els.usar.addEventListener("click", () => terminar(gerarResultado()));
  els.cancelar.addEventListener("click", () => terminar(null));
  // Fechou de outro jeito (X, tocar fora, botão voltar): cancelou
  new MutationObserver(() => {
    if (fundo.classList.contains("oculto") && resolverAtual) terminar(null);
  }).observe(fundo, { attributes: true, attributeFilter: ["class"] });

  els.zoom.addEventListener("input", () => mudarZoom(Number(els.zoom.value)));

  // Arrastar (um dedo) e pinçar (dois dedos)
  els.area.addEventListener("pointerdown", (evento) => {
    els.area.setPointerCapture(evento.pointerId);
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
  });
  els.area.addEventListener("pointermove", (evento) => {
    if (!ponteiros.has(evento.pointerId) || !estado) return;
    const antes = [...ponteiros.values()];
    const distanciaAntes = antes.length === 2 ? distancia(antes[0], antes[1]) : 0;
    const anterior = ponteiros.get(evento.pointerId);
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (ponteiros.size === 1) {
      const fator = tamanhoNaTela() / els.area.clientWidth; // px da tela -> px do quadro
      estado.x += (evento.clientX - anterior.x) * fator;
      estado.y += (evento.clientY - anterior.y) * fator;
      limitar();
      desenhar();
    } else if (ponteiros.size === 2 && distanciaAntes) {
      const agora = [...ponteiros.values()];
      mudarZoom((estado.escala / estado.escalaMinima) * (distancia(agora[0], agora[1]) / distanciaAntes));
    }
  });
  const soltar = (evento) => ponteiros.delete(evento.pointerId);
  els.area.addEventListener("pointerup", soltar);
  els.area.addEventListener("pointercancel", soltar);
  els.area.addEventListener("wheel", (evento) => {
    if (!estado) return;
    evento.preventDefault();
    mudarZoom((estado.escala / estado.escalaMinima) * (evento.deltaY < 0 ? 1.08 : 1 / 1.08));
  }, { passive: false });

  return els;
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Tamanho do quadro de recorte, em pixels do canvas
function tamanhoNaTela() {
  return elementos.canvas.width;
}

/**
 * Abre a tela de recorte com a foto escolhida. Resolve com a foto pronta
 * (data URL JPEG 256x256) ou null se a pessoa cancelar.
 */
export async function recortarFoto(arquivo) {
  const { imagem, largura, altura } = await carregarImagem(arquivo);
  if (!elementos) elementos = criarElementos();
  if (resolverAtual) terminar(null);

  elementos.fundo.classList.remove("oculto");
  // Canvas nítido: tamanho na tela x densidade de pixels do aparelho
  const lado = Math.round(elementos.area.clientWidth * (window.devicePixelRatio || 1));
  elementos.canvas.width = lado;
  elementos.canvas.height = lado;

  const escalaMinima = Math.max(lado / largura, lado / altura); // a foto sempre cobre o quadro
  estado = { imagem, largura, altura, escalaMinima, escala: escalaMinima, x: 0, y: 0 };
  elementos.zoom.value = "1";
  ponteiros.clear();
  desenhar();

  return new Promise((resolver) => {
    resolverAtual = resolver;
  });
}

/**
 * Lê a foto. Tenta pelo <img> (funciona com JPEG/PNG/WebP e respeita a
 * rotação da câmera) e, se não der, pelo createImageBitmap.
 */
async function carregarImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { imagem: img, largura: img.naturalWidth, altura: img.naturalHeight };
  } catch {
    const bitmap = await createImageBitmap(arquivo);
    return { imagem: bitmap, largura: bitmap.width, altura: bitmap.height };
  } finally {
    // O <img> já decodificado continua podendo ser desenhado
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  }
}

function mudarZoom(zoom) {
  if (!estado) return;
  const novoZoom = Math.min(ZOOM_MAXIMO, Math.max(1, zoom));
  // Aproxima em volta do centro do quadro
  const fator = (estado.escalaMinima * novoZoom) / estado.escala;
  estado.x *= fator;
  estado.y *= fator;
  estado.escala = estado.escalaMinima * novoZoom;
  elementos.zoom.value = String(novoZoom);
  limitar();
  desenhar();
}

// Não deixa sobrar espaço vazio dentro do quadro
function limitar() {
  const lado = tamanhoNaTela();
  const folgaX = Math.max(0, (estado.largura * estado.escala - lado) / 2);
  const folgaY = Math.max(0, (estado.altura * estado.escala - lado) / 2);
  estado.x = Math.min(folgaX, Math.max(-folgaX, estado.x));
  estado.y = Math.min(folgaY, Math.max(-folgaY, estado.y));
}

function desenharEm(contexto, lado, fatorSaida = 1) {
  const escala = estado.escala * fatorSaida;
  const largura = estado.largura * escala;
  const altura = estado.altura * escala;
  contexto.fillStyle = "#fff";
  contexto.fillRect(0, 0, lado, lado);
  contexto.imageSmoothingQuality = "high";
  contexto.drawImage(
    estado.imagem,
    (lado - largura) / 2 + estado.x * fatorSaida,
    (lado - altura) / 2 + estado.y * fatorSaida,
    largura,
    altura
  );
}

function desenhar() {
  desenharEm(elementos.canvas.getContext("2d"), tamanhoNaTela());
}

function gerarResultado() {
  if (!estado) return null;
  const saida = document.createElement("canvas");
  saida.width = TAMANHO_FINAL;
  saida.height = TAMANHO_FINAL;
  desenharEm(saida.getContext("2d"), TAMANHO_FINAL, TAMANHO_FINAL / tamanhoNaTela());
  return saida.toDataURL("image/jpeg", 0.82);
}

function terminar(resultado) {
  const resolver = resolverAtual;
  resolverAtual = null;
  if (estado && estado.imagem.close) estado.imagem.close(); // ImageBitmap
  estado = null;
  if (elementos) elementos.fundo.classList.add("oculto");
  if (resolver) resolver(resultado);
}
