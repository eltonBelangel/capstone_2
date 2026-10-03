import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  SafeAreaView,
  StatusBar,
  Image,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig"; // ✅ FIXED PATH

import { signOut } from "firebase/auth";
import * as ImagePicker from "expo-image-picker";

export default function AdminDashboard({ navigation }) {
  const [users, setUsers] = useState([]);
  const [owners, setOwners] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [spots, setSpots] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editField, setEditField] = useState("");
  const [editValue, setEditValue] = useState("");

  // Add Tourist Spot state
  const [addSpotModal, setAddSpotModal] = useState(false);
  const [spotName, setSpotName] = useState("");
  const [spotDescription, setSpotDescription] = useState("");
  const [spotLatitude, setSpotLatitude] = useState("");
  const [spotLongitude, setSpotLongitude] = useState("");
  const [spotCategory, setSpotCategory] = useState("");
  const [spotImage, setSpotImage] = useState(null);
  const [uploadingSpot, setUploadingSpot] = useState(false);

  const unsubscribers = useRef([]);

  useEffect(() => {
    const qUsers = query(collection(db, "users"), where("role", "==", "user"));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const qOwners = query(collection(db, "users"), where("role", "==", "owner"));
    const unsubOwners = onSnapshot(qOwners, (snapshot) => {
      setOwners(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    unsubscribers.current.push(unsubUsers, unsubOwners);
    return () => { unsubUsers(); unsubOwners(); };
  }, []);

  useEffect(() => {
    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      setVehicles(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    unsubscribers.current.push(unsubVehicles);
    return () => unsubVehicles();
  }, []);

  useEffect(() => {
    const unsubSpots = onSnapshot(collection(db, "touristSpots"), (snapshot) => {
      setSpots(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    unsubscribers.current.push(unsubSpots);
    return () => unsubSpots();
  }, []);

  // ── Delete ──
  const handleDelete = async (collectionName, itemId) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (collectionName === "users") {
              const ownerVehiclesQuery = query(
                collection(db, "vehicles"),
                where("ownerId", "==", itemId)
              );
              const snapshot = await getDocs(ownerVehiclesQuery);
              snapshot.forEach(async (v) => {
                await deleteDoc(doc(db, "vehicles", v.id));
              });
            }
            await deleteDoc(doc(db, collectionName, itemId));
            Alert.alert("Success", "Deleted successfully.");
          } catch (error) {
            Alert.alert("Error", "Failed to delete item.");
          }
        },
      },
    ]);
  };

  // ── Edit ──
  const openEdit = (item, collectionName) => {
    setEditItem({ ...item, collectionName });
    const mainField =
      collectionName === "vehicles"
        ? "name"
        : collectionName === "touristSpots"
        ? "name"
        : "username";
    setEditField(mainField);
    setEditValue(item[mainField] || "");
    setEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem || !editField) return;
    try {
      await updateDoc(doc(db, editItem.collectionName, editItem.id), {
        [editField]: editValue,
      });
      Alert.alert("Success", "Updated successfully.");
      setEditModal(false);
    } catch (error) {
      Alert.alert("Error", "Failed to update.");
    }
  };

  // ── Pick image from gallery ──
  const pickSpotImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "We need gallery access to pick an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setSpotImage(result.assets[0].uri);
    }
  };

  // ── Convert image to Base64 (stored in Firestore, no Storage needed) ──
  const uploadSpotImage = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // returns "data:image/jpeg;base64,..."
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ── Reset form ──
  const resetAddSpotForm = () => {
    setSpotName("");
    setSpotDescription("");
    setSpotLatitude("");
    setSpotLongitude("");
    setSpotCategory("");
    setSpotImage(null);
  };

  // ── Save new tourist spot to Firestore ──
  const handleAddSpot = async () => {
    if (!spotName.trim()) {
      Alert.alert("Validation", "Please enter a spot name.");
      return;
    }
    if (!spotLatitude.trim() || !spotLongitude.trim()) {
      Alert.alert("Validation", "Please enter latitude and longitude.");
      return;
    }
    const lat = parseFloat(spotLatitude);
    const lng = parseFloat(spotLongitude);
    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert("Validation", "Latitude and longitude must be valid numbers.");
      return;
    }

    setUploadingSpot(true);
    try {
      let imageUrl = null;
      if (spotImage) {
        imageUrl = await uploadSpotImage(spotImage);
      }

      await addDoc(collection(db, "touristSpots"), {
        name: spotName.trim(),
        description: spotDescription.trim(),
        category: spotCategory.trim(),
        location: { lat, lng },
        imageUrl: imageUrl || null,
        createdAt: new Date(),
      });

      Alert.alert("Success", "Tourist spot added! It will appear on the map instantly.");
      setAddSpotModal(false);
      resetAddSpotForm();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to add tourist spot.");
    } finally {
      setUploadingSpot(false);
    }
  };

  // ── Logout ──
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            unsubscribers.current.forEach((unsub) => unsub());
            unsubscribers.current = [];
            await signOut(auth);
            navigation.replace("Login");
          } catch (error) {
            Alert.alert("Error", "Failed to log out. Please try again.");
          }
        },
      },
    ]);
  };

  const handleBack = () => setActiveTable(null);

  const cardData = [
    { key: "users", label: "Users", count: users.length, color: "#4F6FFF", icon: "👤" },
    { key: "owners", label: "Owners", count: owners.length, color: "#7C4FFF", icon: "🏪" },
    { key: "vehicles", label: "Vehicles", count: vehicles.length, color: "#4FAAFF", icon: "🚗" },
    { key: "spots", label: "Tourist Spots", count: spots.length, color: "#1DAB87", icon: "📍" },
  ];

  const getTableData = () => {
    if (activeTable === "users") return { data: users, collection: "users" };
    if (activeTable === "owners") return { data: owners, collection: "users" };
    if (activeTable === "vehicles") return { data: vehicles, collection: "vehicles" };
    if (activeTable === "spots") return { data: spots, collection: "touristSpots" };
    return { data: [], collection: "" };
  };

  const getTableTitle = () => {
    const map = { users: "Users", owners: "Owners", vehicles: "Vehicles", spots: "Tourist Spots" };
    return map[activeTable] || "";
  };

  const renderTableRow = (item, collectionName) => {
    const name = item.username || item.name || item.category || "—";
    const sub =
      item.email ||
      item.plate ||
      (item.location
        ? `${item.location.lat?.toFixed(4)}, ${item.location.lng?.toFixed(4)}`
        : null) ||
      item.ownerId ||
      "—";
    const badge = item.role || item.status || item.capabilities?.[0] || null;

    return (
      <View style={styles.tableRow} key={item.id}>
        {collectionName === "touristSpots" && item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.rowThumb} />
        ) : (
          <View style={styles.rowAvatar}>
            <Text style={styles.rowAvatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
          {collectionName === "touristSpots" && item.description ? (
            <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item, collectionName)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(collectionName, item.id)}>
            <Text style={styles.deleteBtnText}>Del</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const { data, collection: colName } = getTableData();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0E2A" />

      {/* HEADER */}
      <View style={styles.header}>
        {activeTable ? (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
        <Text style={styles.headerTitle}>
          {activeTable ? getTableTitle() : "Admin Panel"}
        </Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* HOME VIEW */}
      {!activeTable && (
        <ScrollView contentContainerStyle={styles.homeContainer}>
          <Text style={styles.welcomeText}>Welcome, Admin 👋</Text>
          <Text style={styles.subText}>Manage your app from here</Text>

          <View style={styles.cardsGrid}>
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

                {/* "+ Add" button only on Tourist Spots card */}
                {card.key === "spots" && (
                  <TouchableOpacity
                    style={styles.cardAddBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setAddSpotModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cardAddBtnText}>+ Add Spot</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* TABLE VIEW */}
      {activeTable && (
        <View style={styles.tableContainer}>
          <View style={styles.tableTopRow}>
            <Text style={styles.tableCount}>{data.length} records found</Text>
            {activeTable === "spots" && (
              <TouchableOpacity
                style={styles.addSpotHeaderBtn}
                onPress={() => setAddSpotModal(true)}
              >
                <Text style={styles.addSpotHeaderBtnText}>+ Add Spot</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Name / Info</Text>
            <Text style={[styles.tableHeaderText, { width: 110, textAlign: "center" }]}>Actions</Text>
          </View>

          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderTableRow(item, colName)}
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

      {/* ══════════════════════════════════════
          ADD TOURIST SPOT MODAL
      ══════════════════════════════════════ */}
      <Modal visible={addSpotModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.addSpotCard}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Header */}
              <View style={styles.addSpotHeaderRow}>
                <Text style={styles.addSpotTitle}>📍 Add Tourist Spot</Text>
                <TouchableOpacity
                  onPress={() => { setAddSpotModal(false); resetAddSpotForm(); }}
                >
                  <Text style={styles.closeX}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Image Picker */}
              <Text style={styles.fieldLabel}>Photo</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickSpotImage}>
                {spotImage ? (
                  <Image source={{ uri: spotImage }} style={styles.imagePreview} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderIcon}>🖼️</Text>
                    <Text style={styles.imagePlaceholderText}>Tap to select a photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {spotImage && (
                <TouchableOpacity onPress={() => setSpotImage(null)} style={styles.removeImageBtn}>
                  <Text style={styles.removeImageText}>✕ Remove Image</Text>
                </TouchableOpacity>
              )}

              {/* Spot Name */}
              <Text style={styles.fieldLabel}>Spot Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={spotName}
                onChangeText={setSpotName}
                placeholder="e.g. White Sand Beach"
                placeholderTextColor="#555"
              />

              {/* Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <TextInput
                style={styles.fieldInput}
                value={spotCategory}
                onChangeText={setSpotCategory}
                placeholder="e.g. Beach, Mountain, Heritage"
                placeholderTextColor="#555"
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea]}
                value={spotDescription}
                onChangeText={setSpotDescription}
                placeholder="Short description of this tourist spot..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Coordinates */}
              <Text style={styles.fieldLabel}>Coordinates *</Text>
              <View style={styles.coordRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.coordHint}>Latitude</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={spotLatitude}
                    onChangeText={setSpotLatitude}
                    placeholder="e.g. 10.6407"
                    placeholderTextColor="#555"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.coordHint}>Longitude</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={spotLongitude}
                    onChangeText={setSpotLongitude}
                    placeholder="e.g. 122.9663"
                    placeholderTextColor="#555"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Tip */}
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  💡 Tip: Open Google Maps → long press any location → the coordinates appear at the top. Copy them here.
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => { setAddSpotModal(false); resetAddSpotForm(); }}
                  disabled={uploadingSpot}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, uploadingSpot && { opacity: 0.6 }]}
                  onPress={handleAddSpot}
                  disabled={uploadingSpot}
                >
                  {uploadingSpot ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>Add Spot</Text>
                  )}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={editModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.addSpotTitle}>Edit Record</Text>
            <Text style={styles.fieldLabel}>
              {editField.charAt(0).toUpperCase() + editField.slice(1)}
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={editValue}
              onChangeText={setEditValue}
              placeholder="Enter new value"
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
  safe: { flex: 1, backgroundColor: "#0A0E2A", paddingTop: 30 },

  // HEADER
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 20,
    backgroundColor: "#0A0E2A",
    borderBottomWidth: 1,
    borderBottomColor: "#1A1F3A",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#1A1F3A",
    borderRadius: 8,
  },
  backBtnText: { color: "#7C9FFF", fontWeight: "600", fontSize: 14 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
  },
  logoutBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },

  // HOME
  homeContainer: { padding: 20, paddingTop: 28 },
  welcomeText: { fontSize: 26, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  subText: { fontSize: 14, color: "#8A90B8", marginBottom: 28 },
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 14 },
  card: {
    width: "47%",
    borderRadius: 20,
    padding: 20,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  cardIcon: { fontSize: 28, marginBottom: 10 },
  cardCount: { fontSize: 36, fontWeight: "800", color: "#fff" },
  cardLabel: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: "600", marginTop: 4 },
  cardArrow: {
    position: "absolute",
    bottom: 14,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  cardArrowText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  cardAddBtn: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  cardAddBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // TABLE
  tableContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  tableTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  tableCount: { fontSize: 13, color: "#8A90B8" },
  addSpotHeaderBtn: {
    backgroundColor: "#1DAB87",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addSpotHeaderBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#1A1F3A",
    borderRadius: 10,
    marginBottom: 6,
  },
  tableHeaderText: { color: "#8A90B8", fontSize: 13, fontWeight: "700" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#131729",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1A1F3A",
  },
  rowAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#4F6FFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowAvatarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  rowThumb: { width: 42, height: 42, borderRadius: 8, marginRight: 12 },
  rowInfo: { flex: 1 },
  rowName: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowSub: { color: "#8A90B8", fontSize: 12, marginTop: 2 },
  rowDesc: { color: "#6A7090", fontSize: 11, marginTop: 2, fontStyle: "italic" },
  badge: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: "#1A2A4A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: "#4F9FFF", fontSize: 11, fontWeight: "600" },
  rowActions: { flexDirection: "row", gap: 6 },
  editBtn: {
    backgroundColor: "#1A3A6A",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  editBtnText: { color: "#4F9FFF", fontWeight: "700", fontSize: 12 },
  deleteBtn: {
    backgroundColor: "#3A1A1A",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteBtnText: { color: "#FF3B30", fontWeight: "700", fontSize: 12 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyText: { color: "#8A90B8", fontStyle: "italic", fontSize: 15 },

  // MODALS SHARED
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#131729",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "#1A1F3A",
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#1A1F3A",
    alignItems: "center",
  },
  modalCancelText: { color: "#8A90B8", fontWeight: "700" },
  modalSave: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#1DAB87",
    alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },

  // ADD SPOT MODAL
  addSpotCard: {
    backgroundColor: "#131729",
    borderRadius: 24,
    padding: 22,
    width: "100%",
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: "#1A1F3A",
  },
  addSpotHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  addSpotTitle: { fontSize: 19, fontWeight: "bold", color: "#fff" },
  closeX: { fontSize: 18, color: "#8A90B8", fontWeight: "bold", padding: 4 },
  fieldLabel: { fontSize: 13, color: "#8A90B8", fontWeight: "600", marginBottom: 6, marginTop: 14 },
  fieldInput: {
    backgroundColor: "#0A0E2A",
    borderWidth: 1,
    borderColor: "#2A3A5A",
    borderRadius: 10,
    padding: 13,
    color: "#fff",
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  coordRow: { flexDirection: "row" },
  coordHint: { fontSize: 12, color: "#6A7090", marginBottom: 4 },
  imagePicker: {
    borderWidth: 1.5,
    borderColor: "#2A3A5A",
    borderStyle: "dashed",
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: 160, borderRadius: 12 },
  imagePlaceholder: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0E2A",
  },
  imagePlaceholderIcon: { fontSize: 32, marginBottom: 6 },
  imagePlaceholderText: { color: "#5A6080", fontSize: 13 },
  removeImageBtn: { marginTop: 6, alignSelf: "flex-end" },
  removeImageText: { color: "#FF3B30", fontSize: 12, fontWeight: "600" },
  tipBox: {
    backgroundColor: "#0D1830",
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: "#1DAB87",
  },
  tipText: { color: "#6A90B8", fontSize: 12, lineHeight: 18 },
});
