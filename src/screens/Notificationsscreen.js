import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { auth, db } from "../../firebaseConfig";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
export default function NotificationsScreen({ navigation }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [authUser, setAuthUser] = useState(auth.currentUser);

  // Wait for Firebase to restore the session before starting listeners
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return unsubAuth;
  }, []);

  useEffect(() => {
    const user = authUser;
    if (!user) return;
    const q = query(collection(db, "bookings"), where("renterId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [authUser]);

  const getIcon = (status) => {
    switch (status) {
      case "active": return { icon: "✅", bg: "#DCFCE7" };
      case "pending_payment": return { icon: "⏳", bg: "#FEF9C3" };
      case "completed": return { icon: "🏁", bg: "#F1F5F9" };
      case "cancelled": return { icon: "❌", bg: "#FEE2E2" };
      default: return { icon: "📋", bg: "#EFF6FF" };
    }
  };

  const getMessage = (booking) => {
    const vehicle = `${booking.vehicleCategory?.replace("_", " ")} (${booking.vehiclePlate})`;
    switch (booking.status) {
      case "active": return `Your booking for ${vehicle} is now active.`;
      case "pending_payment": return `Booking confirmed! Pay ₱${booking.totalPrice?.toFixed(2)} cash to the owner for ${vehicle}.`;
      case "completed": return `Your rental of ${vehicle} is complete.`;
      case "cancelled": return `Your booking for ${vehicle} was cancelled.`;
      default: return `Booking for ${booking.vehiclePlate} updated.`;
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#1A56DB" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {bookings.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{bookings.length}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {bookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>Your booking updates will appear here.</Text>
          </View>
        ) : (
          bookings.map((booking) => {
            const { icon, bg } = getIcon(booking.status);
            return (
              <TouchableOpacity
                key={booking.id}
                style={styles.notifCard}
                onPress={() => navigation.navigate("BookingDetail", { booking })}
              >
                <View style={[styles.notifIconBox, { backgroundColor: bg }]}>
                  <Text style={{ fontSize: 20 }}>{icon}</Text>
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifMessage}>{getMessage(booking)}</Text>
                  {booking.totalPrice ? (
                    <Text style={styles.notifPrice}>₱{booking.totalPrice?.toFixed(2)}</Text>
                  ) : null}
                  <Text style={styles.notifDate}>{formatDate(booking.createdAt)}</Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    backgroundColor: "#1A56DB", paddingTop: 52, paddingBottom: 16,
    paddingHorizontal: 18, flexDirection: "row", alignItems: "center",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  countBadge: {
    marginLeft: 10, backgroundColor: "#EF4444", borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  emptyContainer: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: "#94A3B8", textAlign: "center" },
  notifCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "center", marginBottom: 10,
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  notifIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginRight: 12 },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 13, color: "#1E293B", fontWeight: "500", lineHeight: 18, marginBottom: 4 },
  notifPrice: { fontSize: 13, fontWeight: "700", color: "#1A56DB", marginBottom: 2 },
  notifDate: { fontSize: 11, color: "#94A3B8" },
  arrow: { fontSize: 20, color: "#CBD5E1", marginLeft: 8 },
});