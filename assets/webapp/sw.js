// Service Worker do Sacola
// Cuida do cache básico para o app funcionar offline.

const NOME_CACHE = "sacola-cache-v31";

// Caminhos relativos, para funcionar também quando o app está numa subpasta
// (ex: GitHub Pages em usuario.github.io/Sacola/)
const ARQUIVOS_ESSENCIAIS = [
  "./",
  "./index.html",
  "./style.css",
  "./principal.js",
  "./firebase-config.js",
  "./estado.js",
  "./utils.js",
  "./navegacao.js",
  "./configuracoes.js",
  "./mercado.js",
  "./lista.js",
  "./historico.js",
  "./perfil.js",
  "./termos.js",
  "./privacidade.html",
  "./exclusao-de-conta.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/logo.svg",
  "./fundos/mercado.svg",
  "./fundos/farmacia.svg",
  "./fundos/feira.svg",
  "./fundos/perfumaria.svg",
  "./fundos/shopping.svg",
  "./fundos/churras.svg",
  "./fundos/acougue.svg",
  "./fundos/bomboniere.svg",
  "./icons/churras.svg",
  "./dialogo.js",
  "./deslizar.js",
  "./edicao-item.js",
  "./historico-detalhe.js",
  "./grupos.js",
  "./avisos.js",
  "./qrcode-convite.js",
  "./voltar.js",
  "./recorte-foto.js"
];

// O app é feito de módulos ES importados direto de CDNs (não vêm
// empacotados nem copiados para o próprio site). Sem guardar esses
// arquivos aqui, o app pode não abrir offline se o cache do navegador
// para eles já tiver sido limpo (comum em aparelhos com pouco espaço).
const ARQUIVOS_CDN = [
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
];

// Instala o service worker e guarda os arquivos essenciais no cache.
// Os arquivos do próprio app precisam ser guardados com sucesso (senão a
// instalação falha e nada fica disponível offline); os de CDN são "melhor
// esforço" cada um por si, pra um deles falhando não travar os outros.
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then(async (cache) => {
      await cache.addAll(ARQUIVOS_ESSENCIAIS);
      await Promise.allSettled(
        ARQUIVOS_CDN.map((url) => cache.add(url).catch((erro) => {
          console.warn("Não foi possível guardar em cache:", url, erro);
        }))
      );
    })
  );
  self.skipWaiting();
});

// Remove caches antigos quando uma nova versão é ativada
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes
          .filter((nome) => nome !== NOME_CACHE)
          .map((nome) => caches.delete(nome))
      );
    })
  );
  self.clients.claim();
});

// Domínios de CDN de onde o app importa módulos direto (ver ARQUIVOS_CDN).
// Também cuidamos deles no fetch, e não só na instalação, pra pegar
// qualquer arquivo novo desses CDNs que apareça depois (ex: outra versão).
const ORIGENS_CDN = ["https://www.gstatic.com", "https://cdn.jsdelivr.net"];

// Estratégia: tenta a rede primeiro; se falhar (sem internet), usa o cache
self.addEventListener("fetch", (evento) => {
  // Não interceptamos chamadas para o Firebase (precisam ser sempre "ao
  // vivo"; o próprio Firestore cuida do funcionamento offline dos dados
  // com o enableIndexedDbPersistence do firebase-config.js)
  if (evento.request.url.includes("firebaseio.com") ||
      evento.request.url.includes("firestore.googleapis.com") ||
      evento.request.url.includes("googleapis.com")) {
    return;
  }

  if (evento.request.method !== "GET") return;

  const origem = new URL(evento.request.url).origin;
  const ehDoProprioApp = origem === self.location.origin;
  const ehDoCDN = ORIGENS_CDN.includes(origem);
  if (!ehDoProprioApp && !ehDoCDN) return; // resto (ex: fontes do Google) segue direto pra rede

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        // Atualiza o cache com a versão mais nova sempre que possível
        const respostaClonada = resposta.clone();
        caches.open(NOME_CACHE).then((cache) => {
          cache.put(evento.request, respostaClonada);
        });
        return resposta;
      })
      .catch(() => {
        // Sem internet: tenta servir do cache
        return caches.match(evento.request).then((respostaCache) => {
          return respostaCache || (ehDoProprioApp ? caches.match("./index.html") : undefined);
        });
      })
  );
});
