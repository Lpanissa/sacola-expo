// termos.js
// Tela de aceite dos Termos de Uso e da Política de Privacidade.
// Aparece no primeiro uso (e sempre que a versão dos termos mudar).

const CHAVE = "sacola-termos-aceitos";
const VERSAO = "2026-09-26";

function jaAceitou() {
  try {
    return localStorage.getItem(CHAVE) === VERSAO;
  } catch {
    return false;
  }
}

export function iniciarTermos() {
  if (jaAceitou()) return;

  const tela = document.createElement("div");
  tela.className = "tela-termos";
  tela.setAttribute("role", "dialog");
  tela.setAttribute("aria-modal", "true");
  tela.innerHTML = `
    <div class="termos-caixa">
      <img src="icons/icon-192.png" alt="" class="termos-logo">
      <h2>Bem-vindo ao Sacola</h2>
      <p>Para continuar, leia e aceite nossos
        <a href="privacidade.html" target="_blank" rel="noopener">Termos de Uso e Política de Privacidade</a>.</p>
      <label class="termos-check">
        <input type="checkbox" id="termos-checkbox">
        <span>Li e concordo com os Termos de Uso e a Política de Privacidade</span>
      </label>
      <button type="button" id="termos-aceitar" class="botao-primario" disabled>Aceitar e continuar</button>
    </div>`;
  document.body.appendChild(tela);

  const caixa = tela.querySelector("#termos-checkbox");
  const botao = tela.querySelector("#termos-aceitar");
  caixa.addEventListener("change", () => { botao.disabled = !caixa.checked; });
  botao.addEventListener("click", () => {
    try { localStorage.setItem(CHAVE, VERSAO); } catch { /* segue mesmo sem salvar */ }
    tela.remove();
  });
}
