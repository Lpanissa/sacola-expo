// src/context/AppStateContext.js
// Equivalente nativo do estado.js + da parte de "entrar automaticamente
// como anônimo" do perfil.js: quem está logado agora e qual grupo
// (compartilhamento com o parceiro) está em uso.

import { createContext, useContext, useEffect, useState } from "react";
import { authInstance, db } from "../firebase";
import { obterTokenDeNotificacao } from "../hooks/usePushToken";

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [usuarioFirebase, setUsuarioFirebase] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [perfil, setPerfil] = useState(null); // { uid, nome, fotoURL }
  const [grupoId, setGrupoId] = useState(null);
  const [modoConsulta, setModoConsulta] = useState(false);

  useEffect(() => {
    const cancelar = authInstance.onAuthStateChanged(async (usuario) => {
      setUsuarioFirebase(usuario);

      if (!usuario) {
        try {
          await authInstance.signInAnonymously();
        } catch (erro) {
          console.warn("Não foi possível entrar como anônimo:", erro.code);
        }
        setCarregandoAuth(false);
        return;
      }

      if (usuario.isAnonymous) {
        setPerfil(null);
        setGrupoId(null);
        setCarregandoAuth(false);
        return;
      }

      const dadosGoogle = (usuario.providerData || []).find(
        (p) => p.providerId === "google.com"
      );
      const perfilAtual = {
        uid: usuario.uid,
        nome: usuario.displayName || (dadosGoogle && dadosGoogle.displayName) || "Sem nome",
        fotoURL: usuario.photoURL || (dadosGoogle && dadosGoogle.photoURL) || null,
      };

      try {
        const refUsuario = db.collection("usuarios").doc(usuario.uid);
        const snap = await refUsuario.get();
        if (snap.exists) {
          const dados = snap.data();
          if (dados.fotoPersonalizada && dados.fotoURL) perfilAtual.fotoURL = dados.fotoURL;
          if (dados.nome !== perfilAtual.nome || dados.fotoURL !== perfilAtual.fotoURL) {
            await refUsuario.update({ nome: perfilAtual.nome, fotoURL: perfilAtual.fotoURL });
          }
        } else {
          await refUsuario.set({ nome: perfilAtual.nome, fotoURL: perfilAtual.fotoURL, grupoId: null });
        }
      } catch (erro) {
        console.warn("Não foi possível carregar o perfil:", erro);
      }

      setPerfil(perfilAtual);
      setCarregandoAuth(false);
    });

    return cancelar;
  }, []);

  // Ouve o grupoId em tempo real (não só na hora do login): se a pessoa
  // aceitar um convite de grupo em outra tela, o app inteiro já passa a
  // usar o escopo do grupo sem precisar reabrir o app.
  useEffect(() => {
    if (!usuarioFirebase || usuarioFirebase.isAnonymous) return;
    const cancelar = db
      .collection("usuarios")
      .doc(usuarioFirebase.uid)
      .onSnapshot(
        (snap) => setGrupoId((snap.exists && snap.data().grupoId) || null),
        (erro) => console.warn("Não foi possível observar o grupo atual:", erro)
      );
    return cancelar;
  }, [usuarioFirebase]);

  // Assim que sabemos quem está logado (mesmo anônimo), pede permissão de
  // notificação e guarda o token no cadastro — uma função do servidor
  // poderá usar isso depois para avisar sobre convites, itens, etc.
  useEffect(() => {
    if (!usuarioFirebase) return;
    obterTokenDeNotificacao()
      .then((token) => {
        if (!token) return;
        db.collection("usuarios")
          .doc(usuarioFirebase.uid)
          .set({ expoPushToken: token }, { merge: true })
          .catch((erro) => console.warn("Não foi possível salvar o token de notificação:", erro));
      })
      .catch((erro) => console.warn("Não foi possível obter o token de notificação:", erro));
  }, [usuarioFirebase]);

  const escopoAtual = grupoId || (usuarioFirebase && usuarioFirebase.uid) || "local";

  return (
    <AppStateContext.Provider
      value={{
        usuarioFirebase,
        carregandoAuth,
        perfil,
        grupoId,
        setGrupoId,
        modoConsulta,
        setModoConsulta,
        escopoAtual,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const contexto = useContext(AppStateContext);
  if (!contexto) throw new Error("useAppState precisa estar dentro de AppStateProvider");
  return contexto;
}
