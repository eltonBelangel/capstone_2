import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Image,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig"; // ✅ FIXED PATH


export default function FullMapScreen({ route, navigation }) {
  const { userLocation, spots, allowedVehicles } = route.params;
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const getRequiredCapability = (spot) => {
    if (spot.type === "mountain") return "mountain";
    if (spot.type === "island" || spot.type === "beach") return "island";
    return "city";
  };

  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Filter vehicles based on spot capabilities & add distance
  const filteredVehicles = spots.flatMap((spot) =>
    allowedVehicles
      .filter((v) => v.capabilities?.includes(getRequiredCapability(spot)))
      .map((v) => ({
        ...v,
        distance: getDistanceKm(userLocation.latitude, userLocation.longitude, v.lat, v.lng),
      }))
  );

  // Remove duplicates & sort by closest
  const uniqueVehicles = Array.from(
    new Map(filteredVehicles.map((v) => [v.id, v])).values()
  ).sort((a, b) => a.distance - b.distance);

  const handleConfirmRent = async () => {
    try {
      const vehicleRef = doc(db, "vehicles", selectedVehicle.id);
      await updateDoc(vehicleRef, { isAvailable: false });
      Alert.alert("Success", "Vehicle rented successfully!");
      setModalVisible(false);
    } catch (error) {
      Alert.alert("Error", "Failed to rent vehicle.");
    }
  };

  return (
    <ScrollView style={styles.container}>

      {/* ── Back Button ── */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.mapCard}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
        >
          <Marker coordinate={userLocation} title="You are here" pinColor="blue" />
          {spots.map((spot) => (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              title={spot.name}
            />
          ))}
          {spots.map((spot) => (
            <Polyline
              key={`route-${spot.id}`}
              coordinates={[userLocation, { latitude: spot.latitude, longitude: spot.longitude }]}
              strokeColor="#007BFF"
              strokeWidth={4}
            />
          ))}
        </MapView>
      </View>

      <View style={{ marginTop: 15 }}>
        <Text style={styles.title}>Recommended Vehicles</Text>
        {uniqueVehicles.length === 0 ? (
          <Text style={styles.emptyText}>No suitable vehicle for this location.</Text>
        ) : (
          uniqueVehicles.map((vehicle) => (
            <View key={vehicle.id} style={styles.vehicleCard}>

              {/* ── ✅ Vehicle Image ── */}
              {vehicle.imageUrl ? (
                <Image
                  source={{ uri: vehicle.imageUrl }}
                  style={styles.vehicleImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.vehicleImage, styles.vehicleImagePlaceholder]}>
                  <Text style={styles.placeholderIcon}>🚗</Text>
                  <Text style={styles.placeholderText}>No Photo</Text>
                </View>
              )}

              <Text style={styles.vehicleTitle}>
                {vehicle.category.replace("_", " ").toUpperCase()}
              </Text>
              {vehicle.model ? (
                <Text style={styles.vehicleDetail}>🚘 {vehicle.model}</Text>
              ) : null}
              <Text style={styles.vehicleDetail}>🪪 Plate: {vehicle.plate}</Text>
              <Text style={styles.vehicleDetail}>
                🛠 Capabilities: {vehicle.capabilities?.join(", ")}
              </Text>
              {vehicle.price ? (
                <Text style={styles.vehiclePrice}>₱{vehicle.price}/hr</Text>
              ) : null}
              <Text style={styles.distanceText}>
                📏 {vehicle.distance.toFixed(1)} km away
              </Text>

              <TouchableOpacity
                style={styles.rentButton}
                onPress={() => {
                  setSelectedVehicle(vehicle);
                  setModalVisible(true);
                }}
              >
                <Text style={styles.rentButtonText}>Rent Now</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* ── ✅ UPDATED Rent Modal with image, model, price ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedVehicle && (
              <>
                {/* Vehicle Image in Modal */}
                {selectedVehicle.imageUrl ? (
                  <Image
                    source={{ uri: selectedVehicle.imageUrl }}
                    style={styles.modalImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.modalImage, styles.vehicleImagePlaceholder]}>
                    <Text style={styles.placeholderIcon}>🚗</Text>
                    <Text style={styles.placeholderText}>No Photo</Text>
                  </View>
                )}

                <Text style={styles.modalTitle}>
                  {selectedVehicle.category.replace("_", " ").toUpperCase()}
                </Text>

                {selectedVehicle.model ? (
                  <Text style={styles.modalDetail}>🚘 Model: {selectedVehicle.model}</Text>
                ) : null}

                <Text style={styles.modalDetail}>🪪 Plate: {selectedVehicle.plate}</Text>

                {selectedVehicle.price ? (
                  <Text style={styles.modalPrice}>₱{selectedVehicle.price} / hour</Text>
                ) : null}

                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmRent}>
                  <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 15 }}>
                    ✅ Confirm Rent
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={{ fontWeight: "bold", color: "#555" }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5", padding: 15, paddingTop: 50 },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ff003c",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
    marginTop: 10,
  },
  backButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  mapCard: { height: 250, borderRadius: 15, overflow: "hidden" },
  map: { flex: 1 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  emptyText: { color: "#888", fontStyle: "italic", marginBottom: 10 },

  // ── ✅ Vehicle card ──
  vehicleCard: {
    backgroundColor: "#E8F0FE",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  vehicleImage: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    marginBottom: 10,
  },
  vehicleImagePlaceholder: {
    backgroundColor: "#D0DFF8",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: { fontSize: 32 },
  placeholderText: { fontSize: 12, color: "#888", marginTop: 4 },
  vehicleTitle: { fontSize: 15, fontWeight: "bold", marginBottom: 4 },
  vehicleDetail: { fontSize: 13, color: "#444", marginBottom: 3 },
  vehiclePrice: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#28A745",
    marginBottom: 3,
  },
  distanceText: { fontSize: 12, color: "#555", marginBottom: 6 },
  rentButton: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
    alignItems: "center",
  },
  rentButtonText: { color: "#fff", fontWeight: "bold" },

  // ── ✅ Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "88%",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
  },
  modalImage: {
    width: "100%",
    height: 170,
    borderRadius: 12,
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  modalDetail: { fontSize: 14, color: "#444", marginBottom: 5 },
  modalPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#28A745",
    marginBottom: 14,
  },
  confirmButton: {
    backgroundColor: "#28A745",
    padding: 13,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  cancelButton: { padding: 12, alignItems: "center" },
});