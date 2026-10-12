// App.js
// Ponto de entrada do app nativo (reescrita completa, sem WebView).

import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { AppStateProvider, useAppState } from "./src/context/AppStateContext";
import RootNavigator from "./src/navigation/RootNavigator";

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Fica na splash nativa até sabermos quem está logado (evita o "flash"
// da tela vazia antes do login anônimo automático terminar).
function EsperaAuthPronta({ children }) {
  const { carregandoAuth } = useAppState();

  useEffect(() => {
    if (!carregandoAuth) SplashScreen.hideAsync().catch(() => {});
  }, [carregandoAuth]);

  if (carregandoAuth) return null;
  return children;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <AppStateProvider>
          <EsperaAuthPronta>
            <RootNavigator />
          </EsperaAuthPronta>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
