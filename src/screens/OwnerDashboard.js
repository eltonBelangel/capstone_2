import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig"; // ✅ FIXED PATH

import { signOut } from "firebase/auth";

export default function OwnerDashboard({ navigation }) {
  const [vehicles, setVehicles] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editField, setEditField] = useState("");
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const vehicleQuery = query(
      collection(db, "vehicles"),
      where("ownerId", "==", user.uid)
    );
    const unsubscribeVehicles = onSnapshot(vehicleQuery, (snapshot) => {
      setVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingVehicles(false);
    });

    const bookingQuery = query(
      collection(db, "bookings"),
      where("ownerId", "==", user.uid)
    );
    const unsubscribeBookings = onSnapshot(bookingQuery, (snapshot) => {
      setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingBookings(false);
    });

    return () => {
      unsubscribeVehicles();
      unsubscribeBookings();
    };
  }, []);

  const handleDeleteVehicle = (id) => {
    Alert.alert("Delete Vehicle", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "vehicles", id));
            Alert.alert("Success", "Vehicle deleted.");
          } catch {
            Alert.alert("Error", "Failed to delete.");
          }
        },
      },
    ]);
  };

  const handleDeleteBooking = (id) => {
    Alert.alert("Delete Booking", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "bookings", id));
            Alert.alert("Success", "Booking deleted.");
          } catch {
            Alert.alert("Error", "Failed to delete.");
          }
        },
      },
    ]);
  };

  const openEditVehicle = (item) => {
    setEditItem({ ...item, collectionName: "vehicles" });
    setEditField("plate");
    setEditValue(item.plate || "");
    setEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    try {
      await updateDoc(doc(db, editItem.collectionName, editItem.id), {
        [editField]: editValue,
      });
      Alert.alert("Success", "Updated successfully.");
      setEditModal(false);
    } catch {
      Alert.alert("Error", "Failed to update.");
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            navigation.replace("Login");
          } catch {
            Alert.alert("Error", "Failed to log out.");
          }
        },
      },
    ]);
  };

  const cardData = [
    { key: "vehicles", label: "View Vehicle", count: vehicles.length, icon: "🚗", color: "#4F9FFF" },
    { key: "transactions", label: "View Transaction", count: bookings.length, icon: "💰", color: "#4F6FFF" },
  ];

  const renderVehicleRow = (item) => (
    <View style={styles.tableRow} key={item.id}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.rowThumb} />
      ) : (
        <View style={styles.rowAvatar}>
          <Text style={styles.rowAvatarText}>🚗</Text>
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.model || item.category || "Vehicle"}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          Plate: {item.plate || "N/A"} • ₱{item.price || 0}/hr
        </Text>
        <View style={[styles.badge,
          { backgroundColor: item.isAvailable ? "#E6FFF6" : "#FFE8E8" }
        ]}>
          <Text style={[styles.badgeText,
            { color: item.isAvailable ? "#1DAB87" : "#FF3B30" }
          ]}>
            {item.isAvailable ? "✅ Available" : "❌ Not Available"}
          </Text>
        </View>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditVehicle(item)}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteVehicle(item.id)}>
          <Text style={styles.deleteBtnText}>Del</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBookingRow = (item) => (
    <View style={styles.tableRow} key={item.id}>
      <View style={[styles.rowAvatar, { backgroundColor: "#4F6FFF" }]}>
        <Text style={styles.rowAvatarText}>👤</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.renterName || "Unknown"}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.vehicleCategory || "Vehicle"} • {item.vehiclePlate || "N/A"}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          📞 {item.renterPhone || "N/A"}
        </Text>
        <View style={[styles.badge,
          { backgroundColor: item.status === "active" ? "#E6FFF6" : "#F0F0F0" }
        ]}>
          <Text style={[styles.badgeText,
            { color: item.status === "active" ? "#1DAB87" : "#888" }
          ]}>
            {item.status || "pending"}
          </Text>
        </View>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteBooking(item.id)}>
          <Text style={styles.deleteBtnText}>Del</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const getTitle = () => {
    if (activeTable === "vehicles") return "My Vehicles";
    if (activeTable === "transactions") return "My Transactions";
    return "Vehicle Dashboard";
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6F8" />

      {/* HEADER */}
      <View style={styles.header}>
        {activeTable ? (
          <TouchableOpacity onPress={() => setActiveTable(null)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
        <Text style={styles.headerTitle}>{getTitle()}</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* HOME VIEW */}
      {!activeTable && (
        <ScrollView contentContainerStyle={styles.homeContainer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("AddVehicle")}
          >
            <Text style={styles.addButtonText}>+ Add Vehicle</Text>
          </TouchableOpacity>

          <View style={styles.cardsRow}>
            {cardData.map((card) => (
              <TouchableOpacity
                key={card.key}
                style={[styles.card, { backgroundColor: card.color }]}
                onPress={() => setActiveTable(card.key)}
                activeOpacity={0.85}
              >
                <Text style={styles.cardIcon}>{card.icon}</Text>
                <Text style={styles.cardCount}>{card.count}</Text>
                <Text style={styles.cardLabel}>{card.label}</Text>
                <View style={styles.cardArrow}>
                  <Text style={styles.cardArrowText}>→</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* TABLE VIEW */}
      {activeTable && (
        <View style={styles.tableContainer}>
          {activeTable === "vehicles" && (
            <TouchableOpacity
              style={[styles.addButton, { marginBottom: 12 }]}
              onPress={() => navigation.navigate("AddVehicle")}
            >
              <Text style={styles.addButtonText}>+ Add Vehicle</Text>
            </TouchableOpacity>
          )}

          <View style={styles.tableTopRow}>
            <Text style={styles.tableCount}>
              {activeTable === "vehicles" ? vehicles.length : bookings.length} records found
            </Text>
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Info</Text>
            <Text style={[styles.tableHeaderText, { width: 90, textAlign: "center" }]}>Actions</Text>
          </View>

          <FlatList
            data={activeTable === "vehicles" ? vehicles : bookings}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              activeTable === "vehicles"
                ? renderVehicleRow(item)
                : renderBookingRow(item)
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No records found.</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </View>
      )}

      {/* EDIT MODAL */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Vehicle</Text>
            <Text style={styles.fieldLabel}>Plate Number</Text>
            <TextInput
              style={styles.fieldInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder="Enter plate number"
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveEdit}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F6F8", paddingTop: 30 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#F4F6F8",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#1A1A2E" },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#E8EFFF",
    borderRadius: 8,
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
  },
  logoutBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  homeContainer: { padding: 20, paddingTop: 24 },
  addButton: {
    backgroundColor: "#4F6FFF",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  cardsRow: { flexDirection: "row", justifyContent: "space-between", gap: 14, marginTop: 24 },
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  cardIcon: { fontSize: 32, marginBottom: 10 },
  cardCount: { fontSize: 32, fontWeight: "800", color: "#fff" },
  cardLabel: { fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: "600", marginTop: 4 },
  cardArrow: {
    position: "absolute",
    bottom: 14,
    right: 14,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 20,
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  cardArrowText: { color: "#fff", fontSize: 13, fontWeight: "bold" },

  tableContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  tableTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  tableCount: { fontSize: 13, color: "#888" },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#E8EFFF",
    borderRadius: 10,
    marginBottom: 6,
  },
  tableHeaderText: { color: "#4F6FFF", fontSize: 13, fontWeight: "700" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    elevation: 1,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1DAB87",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowAvatarText: { fontSize: 20 },
  rowThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  rowInfo: { flex: 1 },
  rowName: { color: "#1A1A2E", fontWeight: "600", fontSize: 14 },
  rowSub: { color: "#888", fontSize: 12, marginTop: 2 },
  badge: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  rowActions: { flexDirection: "row", gap: 6 },
  editBtn: {
    backgroundColor: "#E8EFFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  editBtnText: { color: "#4F6FFF", fontWeight: "700", fontSize: 12 },
  deleteBtn: {
    backgroundColor: "#FFE8E8",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteBtnText: { color: "#FF3B30", fontWeight: "700", fontSize: 12 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#aaa", fontStyle: "italic", fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#1A1A2E", marginBottom: 16 },
  fieldLabel: { fontSize: 13, color: "#888", fontWeight: "600", marginBottom: 6 },
  fieldInput: {
    backgroundColor: "#F4F6F8",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    padding: 13,
    color: "#1A1A2E",
    fontSize: 14,
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F4F6F8",
    alignItems: "center",
  },
  modalCancelText: { color: "#888", fontWeight: "700" },
  modalSave: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#4F6FFF",
    alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },
});