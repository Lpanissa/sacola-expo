// src/screens/HistoricoScreen.js
// Ainda não reescrita (porta de historico.js + historico-detalhe.js). Placeholder.
import { StyleSheet, Text, View } from "react-native";

export default function HistoricoScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.texto}>Histórico — em construção</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E4F4EC", alignItems: "center", justifyContent: "center" },
  texto: { color: "#5C7A70" },
});
