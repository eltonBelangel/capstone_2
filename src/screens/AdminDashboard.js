import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
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
  StatusBar,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  Pressable,
} from "react-native";

import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";

import { auth, db } from "../../firebaseConfig";
import { signOut } from "firebase/auth";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

const { width: W } = Dimensions.get("window");
const SIDEBAR_W = Math.min(280, W * 0.78);

const C = {
  bg: "#EEF5F9",
  card: "#FFFFFF",
  teal: "#14B8A6",
  tealSoft: "#E6FAF7",
  tealDark: "#0F766E",
  blue: "#3B82F6",
  blueSoft: "#EFF6FF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  danger: "#EF4444",
  warn: "#F59E0B",
  ok: "#22C55E",
  sidebar: "#FFFFFF",
  sidebarActive: "#E6FAF7",
};

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "users", label: "Users", icon: "people-outline", table: "users" },
  { id: "owners", label: "Owners", icon: "storefront-outline", table: "owners" },
  { id: "vehicles", label: "Vehicles", icon: "car-outline", table: "vehicles" },
  { id: "spots", label: "Tourist spots", icon: "location-outline", table: "spots" },
  { id: "packages", label: "Trip packages", icon: "map-outline", route: "AdminPackages" },
  { id: "hotels", label: "Partner hotels", icon: "bed-outline", route: "AdminHotels" },
  { id: "addSpot", label: "Add tourist spot", icon: "add-circle-outline", action: "addSpot" },
];

export default function AdminDashboard({ navigation }) {
  const [users, setUsers] = useState([]);
  const [owners, setOwners] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [spots, setSpots] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [packages, setPackages] = useState([]);

  const [activeTable, setActiveTable] = useState(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editField, setEditField] = useState("");
  const [editValue, setEditValue] = useState("");

  const [addSpotModal, setAddSpotModal] = useState(false);
  const [spotName, setSpotName] = useState("");
  const [spotDescription, setSpotDescription] = useState("");
  const [spotLatitude, setSpotLatitude] = useState("");
  const [spotLongitude, setSpotLongitude] = useState("");
  const [spotCategory, setSpotCategory] = useState("");
  const [spotImage, setSpotImage] = useState(null);
  const [uploadingSpot, setUploadingSpot] = useState(false);

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [adminAuthorized, setAdminAuthorized] = useState(false);

  const unsubscribers = useRef([]);
  const slideX = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOp, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(slideX, { toValue: -SIDEBAR_W, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setSidebarOpen(false));
  };

  const onNavPress = (item) => {
    setActiveNav(item.id);
    closeSidebar();
    if (item.route) {
      setTimeout(() => navigation.navigate(item.route), 220);
      return;
    }
    if (item.action === "addSpot") {
      setTimeout(() => setAddSpotModal(true), 220);
      return;
    }
    if (item.table) {
      setActiveTable(item.table);
      return;
    }
    if (item.id === "overview") {
      setActiveTable(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const localUnsubscribers = [];

    const stopListeners = () => {
      localUnsubscribers.forEach((u) => {
        try { u(); } catch (_) {}
      });
      localUnsubscribers.length = 0;
      unsubscribers.current = [];
    };

    const startDashboard = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          if (!cancelled) {
            setCheckingAdmin(false);
            Alert.alert("Authentication required", "Please sign in.", [
              { text: "OK", onPress: () => navigation.replace("Login") },
            ]);
          }
          return;
        }

        const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (cancelled) return;

        if (!userSnapshot.exists() || userSnapshot.data()?.role !== "admin") {
          setCheckingAdmin(false);
          setAdminAuthorized(false);
          Alert.alert("Access denied", "This account is not an administrator.", [
            {
              text: "OK",
              onPress: async () => {
                try { await signOut(auth); } catch (_) {}
                navigation.replace("Login");
              },
            },
          ]);
          return;
        }

        setAdminAuthorized(true);
        const add = (unsub) => localUnsubscribers.push(unsub);

        add(onSnapshot(
          query(collection(db, "users"), where("role", "==", "user")),
          (s) => !cancelled && setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Users", e)
        ));
        add(onSnapshot(
          query(collection(db, "users"), where("role", "==", "owner")),
          (s) => !cancelled && setOwners(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Owners", e)
        ));
        add(onSnapshot(
          collection(db, "vehicles"),
          (s) => !cancelled && setVehicles(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Vehicles", e)
        ));
        add(onSnapshot(
          collection(db, "touristSpots"),
          (s) => !cancelled && setSpots(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Spots", e)
        ));
        add(onSnapshot(
          collection(db, "hotels"),
          (s) => !cancelled && setHotels(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Hotels", e)
        ));
        add(onSnapshot(
          collection(db, "tripPackages"),
          (s) => !cancelled && setPackages(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => console.error("Packages", e)
        ));

        unsubscribers.current = localUnsubscribers;
        setCheckingAdmin(false);
      } catch (error) {
        console.error("Admin init", error);
        if (!cancelled) {
          setCheckingAdmin(false);
          setAdminAuthorized(false);
          Alert.alert("Dashboard error", "Could not load admin dashboard.");
        }
      }
    };

    startDashboard();
    return () => {
      cancelled = true;
      stopListeners();
    };
  }, [navigation]);

  const handleDelete = (collectionName, itemId) => {
    Alert.alert("Delete record", "This will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (collectionName === "users") {
              const q = query(collection(db, "vehicles"), where("ownerId", "==", itemId));
              const snap = await getDocs(q);
              await Promise.all(snap.docs.map((v) => deleteDoc(doc(db, "vehicles", v.id))));
            }
            await deleteDoc(doc(db, collectionName, itemId));
            Alert.alert("Success", "Deleted.");
          } catch (e) {
            Alert.alert("Error", e?.code === "permission-denied" ? "Permission denied." : "Try again.");
          }
        },
      },
    ]);
  };

  const openEdit = (item, collectionName) => {
    const mainField =
      collectionName === "vehicles" || collectionName === "touristSpots" ? "name" : "username";
    setEditItem({ ...item, collectionName });
    setEditField(mainField);
    setEditValue(String(item[mainField] ?? ""));
    setEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem || !editField.trim() || !editValue.trim()) {
      Alert.alert("Required", "Value cannot be empty.");
      return;
    }
    try {
      await updateDoc(doc(db, editItem.collectionName, editItem.id), {
        [editField]: editValue.trim(),
      });
      setEditModal(false);
      setEditItem(null);
      Alert.alert("Success", "Updated.");
    } catch (_) {
      Alert.alert("Error", "Could not save.");
    }
  };

  const pickSpotImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission", "Allow gallery access.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setSpotImage(result.assets[0].uri);
      }
    } catch (_) {
      Alert.alert("Error", "Could not open gallery.");
    }
  };

  const uploadSpotImage = async (uri) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not read image.");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Convert failed"));
      reader.onerror = () => reject(new Error("Read failed"));
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
    if (uploadingSpot) return;
    setAddSpotModal(false);
    resetAddSpotForm();
  };

  const handleAddSpot = async () => {
    if (!spotName.trim()) {
      Alert.alert("Required", "Enter a name.");
      return;
    }
    if (!spotLatitude.trim() || !spotLongitude.trim()) {
      Alert.alert("Required", "Enter latitude and longitude.");
      return;
    }
    const lat = Number(spotLatitude.trim());
    const lng = Number(spotLongitude.trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert("Invalid", "Check coordinates.");
      return;
    }
    setUploadingSpot(true);
    try {
      let imageUrl = null;
      if (spotImage) imageUrl = await uploadSpotImage(spotImage);
      await addDoc(collection(db, "touristSpots"), {
        name: spotName.trim(),
        description: spotDescription.trim(),
        category: spotCategory.trim(),
        location: { lat, lng },
        imageUrl,
        createdAt: new Date(),
      });
      setAddSpotModal(false);
      resetAddSpotForm();
      Alert.alert("Success", "Tourist spot added.");
    } catch (e) {
      Alert.alert("Error", e?.code === "permission-denied" ? "Permission denied." : "Try again.");
    } finally {
      setUploadingSpot(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          unsubscribers.current.forEach((u) => {
            try { u(); } catch (_) {}
          });
          unsubscribers.current = [];
          try {
            await signOut(auth);
            navigation.replace("Login");
          } catch (_) {
            Alert.alert("Error", "Could not log out.");
          }
        },
      },
    ]);
  };

  const getTableData = () => {
    if (activeTable === "users") return { data: users, collection: "users" };
    if (activeTable === "owners") return { data: owners, collection: "users" };
    if (activeTable === "vehicles") return { data: vehicles, collection: "vehicles" };
    if (activeTable === "spots") return { data: spots, collection: "touristSpots" };
    return { data: [], collection: "" };
  };

  const getTableTitle = () =>
    ({ users: "Users", owners: "Owners", vehicles: "Vehicles", spots: "Tourist spots" }[activeTable] || "");

  const navCount = (id) => {
    if (id === "users") return users.length;
    if (id === "owners") return owners.length;
    if (id === "vehicles") return vehicles.length;
    if (id === "spots") return spots.length;
    if (id === "packages") return packages.length;
    if (id === "hotels") return hotels.length;
    return null;
  };

  const renderTableRow = (item, collectionName) => {
    const name = item.username || item.name || item.category || "Untitled";
    const coordinates =
      item.location && Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng)
        ? `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`
        : null;
    const sub = item.email || item.plate || coordinates || item.ownerId || null;

    return (
      <View style={styles.tableRow}>
        {collectionName === "touristSpots" && item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.rowThumb} />
        ) : (
          <View style={[styles.rowThumb, styles.rowThumbPlaceholder]}>
            <Ionicons
              name={
                collectionName === "vehicles"
                  ? "car-outline"
                  : collectionName === "touristSpots"
                  ? "location-outline"
                  : "person-outline"
              }
              size={20}
              color={C.muted}
            />
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
          {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <View style={styles.rowActions}>
          <TouchableOpacity onPress={() => openEdit(item, collectionName)} style={styles.chipBtn}>
            <Text style={styles.chipBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(collectionName, item.id)} style={styles.chipBtnDanger}>
            <Text style={styles.chipBtnDangerText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const { data, collection: colName } = getTableData();

  if (checkingAdmin || !adminAuthorized) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.teal} />
          <Text style={styles.loadingText}>
            {checkingAdmin ? "Verifying administrator…" : "Access unavailable"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const Sidebar = (
    <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideX }] }]}>
      <View style={styles.sidebarHeader}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>T</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sidebarBrand}>TouraMove</Text>
          <Text style={styles.sidebarBrandSub}>Admin</Text>
        </View>
        <TouchableOpacity onPress={closeSidebar} hitSlop={10}>
          <Ionicons name="close-outline" size={24} color={C.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.sidebarSection}>Menu</Text>
        {NAV_ITEMS.map((item) => {
          const active =
            activeNav === item.id ||
            (item.table && activeTable === item.table) ||
            (item.id === "overview" && !activeTable && activeNav === "overview");
          const count = navCount(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => onNavPress(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={active ? C.tealDark : C.muted}
                style={styles.navIcon}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              {count != null ? (
                <View style={[styles.navBadge, active && styles.navBadgeActive]}>
                  <Text style={[styles.navBadgeText, active && styles.navBadgeTextActive]}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        <View style={styles.sidebarDivider} />
        <TouchableOpacity style={styles.navItemLogout} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.danger} style={styles.navIcon} />
          <Text style={styles.navLogoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.menuBtn} onPress={openSidebar} activeOpacity={0.8}>
          <Ionicons name="menu-outline" size={24} color={C.tealDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>
            {activeTable ? getTableTitle() : "Overview"}
          </Text>
          <Text style={styles.topSub}>Admin console</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutChip}>
          <Text style={styles.logoutChipText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* MAIN: Overview */}
      {!activeTable && (
        <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.statsGrid}>
            {[
              { label: "Users", value: users.length, table: "users" },
              { label: "Owners", value: owners.length, table: "owners" },
              { label: "Vehicles", value: vehicles.length, table: "vehicles" },
              { label: "Spots", value: spots.length, table: "spots" },
            ].map((s) => (
              <TouchableOpacity
                key={s.label}
                style={styles.statCard}
                onPress={() => {
                  setActiveTable(s.table);
                  setActiveNav(s.table);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.analyticsCard}>
            <Text style={styles.cardHeading}>Summary</Text>
            <View style={styles.analyticsRow}>
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsNum}>{packages.length}</Text>
                <Text style={styles.analyticsLbl}>Packages</Text>
              </View>
              <View style={styles.analyticsDivider} />
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsNum}>{hotels.length}</Text>
                <Text style={styles.analyticsLbl}>Hotels</Text>
              </View>
              <View style={styles.analyticsDivider} />
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsNum}>{spots.length}</Text>
                <Text style={styles.analyticsLbl}>Spots</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Partner hotels</Text>
          {hotels.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyBoxText}>No hotels yet — open menu → Partner hotels</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {hotels.slice(0, 6).map((h) => (
                <View key={h.id} style={styles.hotelCard}>
                  {h.imageUrl ? (
                    <Image source={{ uri: h.imageUrl }} style={styles.hotelPh} />
                  ) : (
                    <View style={[styles.hotelPh, styles.hotelPhEmpty]}>
                      <Text style={styles.hotelInitial}>
                        {h.name?.charAt(0)?.toUpperCase() || "H"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.hotelName} numberOfLines={1}>{h.name}</Text>
                  <Text style={styles.hotelMeta} numberOfLines={1}>
                    {h.priceFrom ? `₱${Number(h.priceFrom).toLocaleString()}/night` : h.address || "Partner"}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Tourist spots</Text>
          <View style={styles.listCard}>
            {spots.length === 0 ? (
              <Text style={styles.emptyInline}>No spots yet</Text>
            ) : (
              spots.slice(0, 5).map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.listRow, i === Math.min(5, spots.length) - 1 && { borderBottomWidth: 0 }]}
                >
                  {s.imageUrl ? (
                    <Image source={{ uri: s.imageUrl }} style={styles.listThumb} />
                  ) : (
                    <View style={[styles.listThumb, styles.rowThumbPlaceholder]}>
                      <Ionicons name="location-outline" size={18} color={C.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.listSub} numberOfLines={1}>{s.category || "Spot"}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openEdit(s, "touristSpots")}>
                    <Text style={styles.listAction}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* TABLE */}
      {activeTable && (
        <View style={styles.tableContainer}>
          <View style={styles.tableTopRow}>
            <Text style={styles.tableCount}>
              {data.length} {data.length === 1 ? "record" : "records"}
            </Text>
            {activeTable === "spots" && (
              <TouchableOpacity onPress={() => setAddSpotModal(true)}>
                <Text style={styles.addLink}>+ Add spot</Text>
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
              </View>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        </View>
      )}

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOp }]} />
          </Pressable>
          {Sidebar}
        </View>
      )}

      {/* ADD SPOT MODAL */}
      <Modal visible={addSpotModal} transparent animationType="slide" onRequestClose={closeAddSpot}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, styles.sheetTall]}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New tourist spot</Text>
                <TouchableOpacity onPress={closeAddSpot} disabled={uploadingSpot}>
                  <Text style={styles.closeLink}>Close</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Photo</Text>
                <TouchableOpacity style={styles.imagePicker} onPress={pickSpotImage} disabled={uploadingSpot}>
                  {spotImage ? (
                    <Image source={{ uri: spotImage }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>Choose a photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={spotName} onChangeText={setSpotName} placeholder="Spot name" placeholderTextColor={C.faint} editable={!uploadingSpot} />
                <Text style={styles.label}>Category</Text>
                <TextInput style={styles.input} value={spotCategory} onChangeText={setSpotCategory} placeholder="Beach…" placeholderTextColor={C.faint} editable={!uploadingSpot} />
                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.textArea]} value={spotDescription} onChangeText={setSpotDescription} placeholder="Description" placeholderTextColor={C.faint} multiline editable={!uploadingSpot} />
                <View style={styles.inline}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.label}>Latitude</Text>
                    <TextInput style={styles.input} value={spotLatitude} onChangeText={setSpotLatitude} placeholder="10.48" placeholderTextColor={C.faint} keyboardType="numeric" editable={!uploadingSpot} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.label}>Longitude</Text>
                    <TextInput style={styles.input} value={spotLongitude} onChangeText={setSpotLongitude} placeholder="123.41" placeholderTextColor={C.faint} keyboardType="numeric" editable={!uploadingSpot} />
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={closeAddSpot} disabled={uploadingSpot}>
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }, uploadingSpot && { opacity: 0.6 }]} onPress={handleAddSpot} disabled={uploadingSpot}>
                    {uploadingSpot ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add spot</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Edit record</Text>
                <TouchableOpacity onPress={() => setEditModal(false)}>
                  <Text style={styles.closeLink}>Close</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>{editField || "Value"}</Text>
              <TextInput style={styles.input} value={editValue} onChangeText={setEditValue} placeholder="New value" placeholderTextColor={C.faint} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditModal(false)}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleSaveEdit}>
                  <Text style={styles.primaryText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: C.muted, marginTop: 12 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.tealSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  menuBtnText: { fontSize: 20, color: C.tealDark, fontWeight: "700" },
  topTitle: { fontSize: 17, fontWeight: "800", color: C.text },
  topSub: { fontSize: 11, color: C.muted },
  logoutChip: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutChipText: { color: C.danger, fontWeight: "700", fontSize: 12 },

  /* Sidebar */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_W,
    backgroundColor: C.sidebar,
    paddingTop: Platform.OS === "android" ? 12 : 8,
    borderRightWidth: 1,
    borderRightColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
    zIndex: 20,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.teal,
    justifyContent: "center",
    alignItems: "center",
  },
  brandMarkText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  sidebarBrand: { fontSize: 16, fontWeight: "800", color: C.text },
  sidebarBrandSub: { fontSize: 11, color: C.muted },
  sidebarClose: { fontSize: 18, color: C.muted, padding: 4 },
  sidebarSection: {
    fontSize: 11,
    fontWeight: "700",
    color: C.faint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
    gap: 10,
  },
  navItemActive: { backgroundColor: C.sidebarActive },
  navIcon: { width: 26, textAlign: "center" },
  navLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: C.text },
  navLabelActive: { color: C.tealDark, fontWeight: "800" },
  navBadge: {
    backgroundColor: C.bg,
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: "center",
  },
  navBadgeActive: { backgroundColor: C.teal },
  navBadgeText: { fontSize: 11, fontWeight: "800", color: C.muted },
  navBadgeTextActive: { color: "#fff" },
  sidebarDivider: { height: 1, backgroundColor: C.border, marginVertical: 12, marginHorizontal: 16 },
  navItemLogout: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  navLogoutText: { fontSize: 14, fontWeight: "700", color: C.danger },

  homeContent: { padding: 16, paddingBottom: 48 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statCard: {
    width: (W - 42) / 2,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  statLabel: { fontSize: 12, color: C.muted, fontWeight: "600" },
  statValue: { fontSize: 24, fontWeight: "800", color: C.tealDark, marginTop: 4 },

  analyticsCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeading: { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 10 },
  analyticsRow: { flexDirection: "row", alignItems: "center" },
  analyticsItem: { flex: 1, alignItems: "center" },
  analyticsNum: { fontSize: 20, fontWeight: "800", color: C.tealDark },
  analyticsLbl: { fontSize: 11, color: C.muted, marginTop: 2 },
  analyticsDivider: { width: 1, height: 32, backgroundColor: C.border },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.text, marginBottom: 10 },
  hotelCard: {
    width: 140,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  hotelPh: {
    width: "100%",
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
  },
  hotelPhEmpty: {
    backgroundColor: C.tealSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  hotelInitial: { fontSize: 28, fontWeight: "800", color: C.tealDark },
  hotelName: { fontSize: 13, fontWeight: "700", color: C.text },
  hotelMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  emptyBox: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyBoxText: { color: C.muted, fontSize: 13, textAlign: "center" },

  listCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  listThumb: { width: 40, height: 40, borderRadius: 8, marginRight: 10 },
  listName: { fontSize: 14, fontWeight: "700", color: C.text },
  listSub: { fontSize: 12, color: C.muted },
  listAction: { color: C.teal, fontWeight: "700", fontSize: 13 },
  emptyInline: { padding: 16, textAlign: "center", color: C.muted },

  tableContainer: { flex: 1 },
  tableTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableCount: { color: C.muted, fontSize: 13 },
  addLink: { color: C.teal, fontWeight: "800", fontSize: 14 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  rowThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 10 },
  rowThumbPlaceholder: { backgroundColor: C.bg, justifyContent: "center", alignItems: "center" },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "700", color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rowActions: { flexDirection: "row", gap: 6 },
  chipBtn: { backgroundColor: C.tealSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipBtnText: { color: C.tealDark, fontWeight: "700", fontSize: 12 },
  chipBtnDanger: { backgroundColor: "#FEF2F2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipBtnDangerText: { color: C.danger, fontWeight: "700", fontSize: 12 },
  emptyContainer: { paddingTop: 40, alignItems: "center" },
  emptyTitle: { color: C.muted, fontSize: 14 },

  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  sheetTall: { maxHeight: "92%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.text },
  closeLink: { color: C.muted, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: C.muted, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.text,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  inline: { flexDirection: "row" },
  imagePicker: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.teal,
    backgroundColor: C.tealSoft,
    borderRadius: 14,
    overflow: "hidden",
  },
  imagePlaceholder: { height: 100, justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { color: C.tealDark, fontWeight: "700" },
  imagePreview: { width: "100%", height: 140 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  primaryBtn: { backgroundColor: C.teal, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  secondaryText: { color: C.muted, fontWeight: "600", fontSize: 15 },
});