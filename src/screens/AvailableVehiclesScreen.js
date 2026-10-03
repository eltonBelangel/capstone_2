import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

export default function AvailableVehiclesScreen({ route }) {
  const { spot, vehicles } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Vehicles for {spot.name}
      </Text>

      {vehicles.length === 0 ? (
        <Text style={styles.empty}>
          No vehicles allowed for this destination
        </Text>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.text}>Type: {item.category}</Text>
              <Text style={styles.text}>Plate: {item.plate}</Text>
              <Text style={styles.text}>
                Capabilities: {item.capabilities.join(', ')}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  text: { fontSize: 14 },
  empty: { color: '#777', marginTop: 20 },
});
