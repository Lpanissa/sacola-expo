// src/screens/ListaScreen.js
// Ainda não reescrita (porta de lista.js, 726 linhas). Placeholder.
import { StyleSheet, Text, View } from "react-native";

export default function ListaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.texto}>Lista de compras — em construção</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E4F4EC", alignItems: "center", justifyContent: "center" },
  texto: { color: "#5C7A70" },
});
