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
  KeyboardAvoidingView,
  Platform,
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
import { auth, db } from "../../firebaseConfig";

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

  // Add tourist spot state
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
    return () => {
      unsubUsers();
      unsubOwners();
    };
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

  // Delete
  const handleDelete = (collectionName, itemId) => {
    Alert.alert("Delete record", "This record will be permanently removed.", [
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
              await Promise.all(
                snapshot.docs.map((v) => deleteDoc(doc(db, "vehicles", v.id)))
              );
            }
            await deleteDoc(doc(db, collectionName, itemId));
          } catch (error) {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  // Edit
  const openEdit = (item, collectionName) => {
    setEditItem({ ...item, collectionName });
    const mainField =
      collectionName === "vehicles" || collectionName === "touristSpots"
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
      setEditModal(false);
    } catch (error) {
      Alert.alert("Could not save", "Check your connection and try again.");
    }
  };

  // Pick image from gallery
  const pickSpotImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow gallery access to choose a photo.");
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

  // Convert image to base64 (stored in Firestore, no Storage needed)
  const uploadSpotImage = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const resetAddSpotForm = () => {
    setSpotName("");
    setSpotDescription("");
    setSpotLatitude("");
    setSpotLongitude("");
    setSpotCategory("");
    setSpotImage(null);
  };

  const closeAddSpot = () => {
    setAddSpotModal(false);
    resetAddSpotForm();
  };

  const handleAddSpot = async () => {
    if (!spotName.trim()) {
      Alert.alert("Name required", "Enter a name for the spot.");
      return;
    }
    if (!spotLatitude.trim() || !spotLongitude.trim()) {
      Alert.alert("Coordinates required", "Enter both latitude and longitude.");
      return;
    }
    const lat = parseFloat(spotLatitude);
    const lng = parseFloat(spotLongitude);
    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert("Invalid coordinates", "Latitude and longitude must be numbers.");
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

      closeAddSpot();
    } catch (error) {
      console.error(error);
      Alert.alert("Could not add spot", "Check your connection and try again.");
    } finally {
      setUploadingSpot(false);
    }
  };

  // Logout
  const handleLogout = () => {
    Alert.alert("Log out", "You will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            unsubscribers.current.forEach((unsub) => unsub());
            unsubscribers.current = [];
            await signOut(auth);
            navigation.replace("Login");
          } catch (error) {
            Alert.alert("Could not log out", "Try again.");
          }
        },
      },
    ]);
  };

  const handleBack = () => setActiveTable(null);

  const sections = [
    { key: "users", label: "Users", count: users.length },
    { key: "owners", label: "Owners", count: owners.length },
    { key: "vehicles", label: "Vehicles", count: vehicles.length },
    { key: "spots", label: "Tourist spots", count: spots.length },
  ];

  const getTableData = () => {
    if (activeTable === "users") return { data: users, collection: "users" };
    if (activeTable === "owners") return { data: owners, collection: "users" };
    if (activeTable === "vehicles") return { data: vehicles, collection: "vehicles" };
    if (activeTable === "spots") return { data: spots, collection: "touristSpots" };
    return { data: [], collection: "" };
  };

  const getTableTitle = () => {
    const map = {
      users: "Users",
      owners: "Owners",
      vehicles: "Vehicles",
      spots: "Tourist spots",
    };
    return map[activeTable] || "";
  };

  const renderTableRow = (item, collectionName) => {
    const name = item.username || item.name || item.category || "Untitled";
    const sub =
      item.email ||
      item.plate ||
      (item.location
        ? `${item.location.lat?.toFixed(4)}, ${item.location.lng?.toFixed(4)}`
        : null) ||
      item.ownerId ||
      null;
    const badge = item.role || item.status || item.capabilities?.[0] || null;
    const meta = [sub, badge].filter(Boolean).join("   ");

    return (
      <View style={styles.tableRow} key={item.id}>
        {collectionName === "touristSpots" && item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.rowThumb} />
        ) : null}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          {meta ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {collectionName === "touristSpots" && item.description ? (
            <Text style={styles.rowDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity
            onPress={() => openEdit(item, collectionName)}
            hitSlop={8}
          >
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(collectionName, item.id)}
            hitSlop={8}
          >
            <Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const { data, collection: colName } = getTableData();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        {activeTable ? (
          <TouchableOpacity onPress={handleBack} hitSlop={8}>
            <Text style={styles.headerLink}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <TouchableOpacity onPress={handleLogout} hitSlop={8}>
          <Text style={styles.headerLink}>Log out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{activeTable ? getTableTitle() : "Admin"}</Text>

      {/* Home */}
      {!activeTable && (
        <ScrollView
          contentContainerStyle={styles.homeContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Records</Text>
          {sections.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.navRow}
              onPress={() => setActiveTable(s.key)}
              activeOpacity={0.6}
            >
              <Text style={styles.navLabel}>{s.label}</Text>
              <Text style={styles.navCount}>{s.count}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.sectionLabel, styles.sectionGap]}>Manage</Text>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("AdminPackages")}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Trip packages</Text>
              <Text style={styles.navHint}>Multi-leg trips with pricing</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("AdminHotels")}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Partner hotels</Text>
              <Text style={styles.navHint}>Booking links and availability</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => setAddSpotModal(true)}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Add tourist spot</Text>
              <Text style={styles.navHint}>Appears on the map right away</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Table */}
      {activeTable && (
        <View style={styles.tableContainer}>
          <View style={styles.tableTopRow}>
            <Text style={styles.tableCount}>
              {data.length} {data.length === 1 ? "record" : "records"}
            </Text>
            {activeTable === "spots" && (
              <TouchableOpacity
                onPress={() => setAddSpotModal(true)}
                hitSlop={8}
              >
                <Text style={styles.headerAction}>Add spot</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderTableRow(item, colName)}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptySub}>
                  Records will show up here as they are created.
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </View>
      )}

      {/* Add tourist spot */}
      <Modal
        visible={addSpotModal}
        transparent
        animationType="slide"
        onRequestClose={closeAddSpot}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.overlay}>
            <View style={[styles.sheet, styles.sheetTall]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New tourist spot</Text>
                <TouchableOpacity onPress={closeAddSpot} hitSlop={8}>
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Photo</Text>
                <TouchableOpacity style={styles.imagePicker} onPress={pickSpotImage}>
                  {spotImage ? (
                    <Image source={{ uri: spotImage }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>Choose a photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {spotImage && (
                  <TouchableOpacity
                    onPress={() => setSpotImage(null)}
                    style={styles.removeImageBtn}
                    hitSlop={8}
                  >
                    <Text style={[styles.actionText, styles.actionDanger]}>
                      Remove photo
                    </Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={spotName}
                  onChangeText={setSpotName}
                  placeholder="White Sand Beach"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Category</Text>
                <TextInput
                  style={styles.input}
                  value={spotCategory}
                  onChangeText={setSpotCategory}
                  placeholder="Beach, mountain, heritage"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={spotDescription}
                  onChangeText={setSpotDescription}
                  placeholder="A short description"
                  placeholderTextColor={C.faint}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.inline}>
                  <View style={[styles.flex, styles.gapRight]}>
                    <Text style={styles.label}>Latitude</Text>
                    <TextInput
                      style={styles.input}
                      value={spotLatitude}
                      onChangeText={setSpotLatitude}
                      placeholder="10.6407"
                      placeholderTextColor={C.faint}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.flex, styles.gapLeft]}>
                    <Text style={styles.label}>Longitude</Text>
                    <TextInput
                      style={styles.input}
                      value={spotLongitude}
                      onChangeText={setSpotLongitude}
                      placeholder="122.9663"
                      placeholderTextColor={C.faint}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Text style={styles.hint}>
                  In Google Maps, long press a location to see its coordinates at
                  the top.
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={closeAddSpot}
                    disabled={uploadingSpot}
                  >
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      styles.flex,
                      uploadingSpot && styles.disabled,
                    ]}
                    onPress={handleAddSpot}
                    disabled={uploadingSpot}
                  >
                    {uploadingSpot ? (
                      <ActivityIndicator color={C.bg} size="small" />
                    ) : (
                      <Text style={styles.primaryText}>Add spot</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit */}
      <Modal
        visible={editModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Edit record</Text>
                <TouchableOpacity onPress={() => setEditModal(false)} hitSlop={8}>
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                {editField.charAt(0).toUpperCase() + editField.slice(1)}
              </Text>
              <TextInput
                style={styles.input}
                value={editValue}
                onChangeText={setEditValue}
                placeholder="Enter a new value"
                placeholderTextColor={C.faint}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setEditModal(false)}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.flex]}
                  onPress={handleSaveEdit}
                >
                  <Text style={styles.primaryText}>Save changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Palette
const C = {
  bg: "#0E1116",
  surface: "#151A21",
  border: "#232A33",
  text: "#E8EAED",
  muted: "#8A929E",
  faint: "#566070",
  danger: "#E5736B",
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 20,
  },
  headerLink: { color: C.muted, fontSize: 15 },
  headerAction: { color: C.text, fontSize: 15, fontWeight: "600" },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    paddingHorizontal: 24,
    marginTop: 18,
    marginBottom: 8,
  },

  // Home
  homeContent: { paddingHorizontal: 24, paddingBottom: 48 },
  sectionLabel: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 4,
  },
  sectionGap: { marginTop: 36 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  navLabel: { color: C.text, fontSize: 17, fontWeight: "500" },
  navHint: { color: C.muted, fontSize: 13, marginTop: 3 },
  navCount: { color: C.muted, fontSize: 17, fontVariant: ["tabular-nums"] },

  // Table
  tableContainer: { flex: 1 },
  tableTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  tableCount: { fontSize: 13, color: C.muted },
  listContent: { paddingHorizontal: 24, paddingBottom: 48, flexGrow: 1 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  rowThumb: { width: 44, height: 44, borderRadius: 6, marginRight: 14 },
  rowInfo: { flex: 1, marginRight: 12 },
  rowName: { color: C.text, fontSize: 16, fontWeight: "600" },
  rowSub: { color: C.muted, fontSize: 13, marginTop: 3 },
  rowDesc: { color: C.faint, fontSize: 13, marginTop: 3 },
  rowActions: { flexDirection: "row", gap: 18 },
  actionText: { color: C.muted, fontSize: 14, fontWeight: "500" },
  actionDanger: { color: C.danger },

  // Empty
  emptyContainer: { paddingTop: 72 },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySub: { color: C.muted, fontSize: 15, lineHeight: 22 },

  // Sheets
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 8,
  },
  sheetTall: { maxHeight: "92%" },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "700" },

  label: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 18,
    marginBottom: 8,
  },
  hint: { color: C.faint, fontSize: 13, lineHeight: 19, marginTop: 12 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  textArea: { minHeight: 84, textAlignVertical: "top" },
  inline: { flexDirection: "row" },
  gapRight: { marginRight: 6 },
  gapLeft: { marginLeft: 6 },

  // Image picker
  imagePicker: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    borderRadius: 8,
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: 160 },
  imagePlaceholder: {
    height: 96,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.bg,
  },
  imagePlaceholderText: { color: C.muted, fontSize: 14 },
  removeImageBtn: { marginTop: 10, alignSelf: "flex-end" },

  // Buttons
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
    marginBottom: 32,
  },
  primaryBtn: {
    backgroundColor: C.text,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: C.bg, fontSize: 15, fontWeight: "600" },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  secondaryText: { color: C.muted, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.6 },
});