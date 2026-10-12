// src/navigation/RootNavigator.js
// Equivalente nativo do navegacao.js (tabbar inferior: Mercado, Lista, Histórico).

import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import MercadoScreen from "../screens/MercadoScreen";
import ListaScreen from "../screens/ListaScreen";
import HistoricoScreen from "../screens/HistoricoScreen";

const Tab = createBottomTabNavigator();

const ICONES_TAB = { Mercado: "🛒", Lista: "📝", Histórico: "🧾" };

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: "#2FB88A",
          tabBarInactiveTintColor: "#8CA79C",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>{ICONES_TAB[route.name]}</Text>,
        })}
      >
        <Tab.Screen name="Mercado" component={MercadoScreen} />
        <Tab.Screen name="Lista" component={ListaScreen} />
        <Tab.Screen name="Histórico" component={HistoricoScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
