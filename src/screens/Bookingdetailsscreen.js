import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Linking, Alert, ActivityIndicator,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export default function BookingDetailScreen({ route, navigation }) {
  const { booking } = route.params;
  const [vehicleLocation, setVehicleLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicle = async () => {
      try {
        const snap = await getDoc(doc(db, "vehicles", booking.vehicleId));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.lat === "number" && typeof data.lng === "number") {
            setVehicleLocation({ latitude: data.lat, longitude: data.lng });
          }
        }
      } catch (e) {
        console.error("Error fetching vehicle:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchVehicle();
  }, []);

  const openGoogleMaps = () => {
    if (!vehicleLocation) { Alert.alert("Error", "Vehicle location not available."); return; }
    const { latitude, longitude } = vehicleLocation;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
    Linking.openURL(url);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active": return "#16A34A";
      case "pending_payment": return "#D97706";
      case "completed": return "#64748B";
      case "cancelled": return "#DC2626";
      default: return "#1A56DB";
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "pending_payment": return "⏳  Pending — Pay cash to owner upon pickup";
      case "active": return "✅  Active Booking";
      case "completed": return "🏁  Completed";
      case "cancelled": return "❌  Cancelled";
      default: return status;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Details</Text>
      </View>

      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: getStatusColor(booking.status) }]}>
        <Text style={styles.statusBannerText}>{getStatusLabel(booking.status)}</Text>
      </View>

      {/* Booking Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Booking Summary</Text>
        <Row label="Vehicle" value={booking.vehicleCategory?.replace("_", " ").toUpperCase()} />
        {booking.vehicleModel ? <Row label="Model" value={booking.vehicleModel} /> : null}
        <Row label="Plate" value={booking.vehiclePlate} />
        {booking.hours ? <Row label="Duration" value={`${booking.hours} hour(s)`} /> : null}
        {booking.totalPrice ? <Row label="Total" value={`₱${booking.totalPrice?.toFixed(2)}`} highlight /> : null}
        <Row label="Payment" value={booking.paymentMethod || "Cash"} />
        <Row label="Booked On" value={formatDate(booking.createdAt)} />
      </View>

      {/* Renter Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Info</Text>
        <Row label="Name" value={booking.renterName} />
        <Row label="Phone" value={booking.renterPhone} />
      </View>

      {/* Directions Button */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle Location</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#1A56DB" style={{ marginVertical: 12 }} />
        ) : vehicleLocation ? (
          <>
            <Text style={styles.locationText}>
              📍 Lat: {vehicleLocation.latitude.toFixed(5)}, Lng: {vehicleLocation.longitude.toFixed(5)}
            </Text>
            <TouchableOpacity style={styles.googleMapsBtn} onPress={openGoogleMaps}>
              <Text style={styles.googleMapsBtnText}>🗺  Get Directions in Google Maps</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.noLocationText}>Vehicle location not available.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    backgroundColor: "#1A56DB", paddingTop: 52, paddingBottom: 16,
    paddingHorizontal: 18, flexDirection: "row", alignItems: "center",
  },
  backBtn: { marginRight: 12, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  backBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  statusBanner: { paddingVertical: 13, paddingHorizontal: 20, alignItems: "center" },
  statusBannerText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  rowLabel: { fontSize: 13, color: "#94A3B8", fontWeight: "500" },
  rowValue: { fontSize: 13, color: "#0F172A", fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  rowValueHighlight: { color: "#1A56DB", fontSize: 15 },
  locationText: { fontSize: 13, color: "#64748B", marginBottom: 12, marginTop: 4 },
  noLocationText: { fontSize: 13, color: "#94A3B8", fontStyle: "italic", marginVertical: 8 },
  googleMapsBtn: { backgroundColor: "#1A56DB", padding: 14, borderRadius: 12, alignItems: "center" },
  googleMapsBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});