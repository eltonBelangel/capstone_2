import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { addDoc, collection, updateDoc, doc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function PaymentScreen({ route, navigation }) {
  const { vehicle, renterName, renterPhone } = route.params;

  const [hours, setHours] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPrice =
    hours && !isNaN(hours) ? parseFloat(hours) * vehicle.price : 0;

  const handleConfirmBooking = async () => {
    if (!hours || isNaN(hours) || parseFloat(hours) <= 0) {
      Alert.alert("Invalid", "Please enter a valid number of hours.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "You must be logged in.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "bookings"), {
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleCategory: vehicle.category,
        vehicleModel: vehicle.model || "",
        ownerId: vehicle.ownerId,
        renterId: user.uid,
        renterName: renterName || "No Name",
        renterPhone: renterPhone || "No Phone",
        hours: parseFloat(hours),
        totalPrice,
        paymentMethod: "Cash",
        status: "pending_payment",
        createdAt: new Date(),
      });

      await updateDoc(doc(db, "vehicles", vehicle.id), {
        isAvailable: false,
      });

      Alert.alert(
        "🎉 Booking Confirmed!",
        `You booked ${vehicle.model || vehicle.category} for ${hours} hour(s).\n\nTotal: ₱${totalPrice.toFixed(2)}\n\nPlease pay cash to the owner upon pickup.`,
        [{ text: "OK", onPress: () => navigation.popToTop() }]
      );
    } catch (error) {
      console.error("Booking error:", error);
      Alert.alert("Error", "Failed to confirm booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>Booking Summary</Text>

      {/* Vehicle Card */}
      <View style={styles.vehicleCard}>
        {vehicle.imageUrl ? (
          <Image
            source={{ uri: vehicle.imageUrl }}
            style={styles.vehicleImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.vehicleImage, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 40 }}>🚗</Text>
          </View>
        )}

        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleCategory}>
            {vehicle.category.replace("_", " ").toUpperCase()}
          </Text>
          {vehicle.model ? (
            <Text style={styles.vehicleDetail}>🚘 {vehicle.model}</Text>
          ) : null}
          <Text style={styles.vehicleDetail}>🪪 {vehicle.plate}</Text>
          <Text style={styles.vehicleRate}>₱{vehicle.price} / hour</Text>
        </View>
      </View>

      {/* Renter Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>👤 Your Info</Text>
        <Text style={styles.infoText}>Name: {renterName || "No Name"}</Text>
        <Text style={styles.infoText}>Phone: {renterPhone || "No Phone"}</Text>
      </View>

      {/* Hours Input */}
      <View style={styles.section}>
        <Text style={styles.label}>How many hours do you want to rent?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2"
          value={hours}
          onChangeText={setHours}
          keyboardType="numeric"
        />
      </View>

      {/* Total Summary */}
      {totalPrice > 0 && (
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Rate</Text>
            <Text style={styles.summaryValue}>₱{vehicle.price}/hr</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>{hours} hr(s)</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>₱{totalPrice.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Cash Payment Notice */}
      <View style={styles.cashNoticeBox}>
        <Text style={styles.cashNoticeIcon}>💵</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cashNoticeTitle}>Cash Payment</Text>
          <Text style={styles.cashNoticeText}>
            Payment will be collected by the vehicle owner upon pickup. Please prepare the exact amount.
          </Text>
        </View>
      </View>

      {/* Confirm Button */}
      <TouchableOpacity
        style={[styles.confirmButton, (loading || totalPrice <= 0) && { opacity: 0.5 }]}
        onPress={handleConfirmBooking}
        disabled={loading || totalPrice <= 0}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.confirmButtonText}>
            ✅ Confirm Booking — ₱{totalPrice > 0 ? totalPrice.toFixed(2) : "0.00"}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        🔒 Your booking will be saved and the vehicle marked as unavailable.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5", padding: 16 },

  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#007BFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 14,
    marginTop: 45,
  },
  backButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  screenTitle: { fontSize: 24, fontWeight: "bold", marginBottom: 16, color: "#1a1a1a" },

  vehicleCard: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", marginBottom: 16, elevation: 3 },
  vehicleImage: { width: "100%", height: 170 },
  imagePlaceholder: { backgroundColor: "#E8F0FF", justifyContent: "center", alignItems: "center" },
  vehicleInfo: { padding: 14 },
  vehicleCategory: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  vehicleDetail: { fontSize: 13, color: "#555", marginBottom: 3 },
  vehicleRate: { fontSize: 15, fontWeight: "bold", color: "#28A745", marginTop: 4 },

  infoBox: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 16, elevation: 2 },
  infoTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 6, color: "#333" },
  infoText: { fontSize: 13, color: "#555", marginBottom: 3 },

  section: { marginBottom: 16 },
  label: { fontSize: 15, fontWeight: "600", marginBottom: 8, color: "#333" },
  input: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#ddd", padding: 12, fontSize: 16 },

  summaryBox: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, elevation: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: "#555" },
  summaryValue: { fontSize: 14, color: "#333", fontWeight: "500" },
  summaryTotal: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10, marginTop: 4 },
  summaryTotalLabel: { fontSize: 16, fontWeight: "bold", color: "#1a1a1a" },
  summaryTotalValue: { fontSize: 18, fontWeight: "bold", color: "#28A745" },

  cashNoticeBox: {
    backgroundColor: "#FFF8E1",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    borderLeftWidth: 4,
    borderLeftColor: "#FFC107",
  },
  cashNoticeIcon: { fontSize: 28, marginRight: 10 },
  cashNoticeTitle: { fontSize: 14, fontWeight: "bold", color: "#333", marginBottom: 4 },
  cashNoticeText: { fontSize: 13, color: "#555", lineHeight: 19 },

  confirmButton: { backgroundColor: "#28A745", padding: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  confirmButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  note: { textAlign: "center", fontSize: 12, color: "#888", marginBottom: 10 },
});