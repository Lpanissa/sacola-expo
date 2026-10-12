// src/hooks/usePushToken.js
// Pede permissão de notificação e devolve o token do Expo (ou null).
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

export async function obterTokenDeNotificacao() {
  if (!Device.isDevice) return null;
  const atual = await Notifications.getPermissionsAsync();
  let status = atual.status;
  if (status !== "granted") {
    const pedido = await Notifications.requestPermissionsAsync();
    status = pedido.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Sacola",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const resultado = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return resultado.data;
}
