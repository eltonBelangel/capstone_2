```jsx
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
  getDoc,
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
  const mounted = useRef(false);

  // --------------------------------------------------
  // Verify administrator and start Firestore listeners
  // --------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const localUnsubscribers = [];

    mounted.current = true;

    const stopListeners = () => {
      localUnsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("Listener cleanup failed:", error);
        }
      });

      localUnsubscribers.length = 0;
      unsubscribers.current = [];
    };

    const handleListenerError = (label, error) => {
      console.error(
        `${label} listener failed:`,
        error?.code,
        error?.message
      );
    };

    const startDashboard = async () => {
      try {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          if (!cancelled) {
            setCheckingAdmin(false);
            Alert.alert(
              "Authentication required",
              "Please sign in to access the dashboard.",
              [
                {
                  text: "OK",
                  onPress: () => navigation.replace("Login"),
                },
              ]
            );
          }
          return;
        }

        // Check the signed-in user's role.
        const userRef = doc(db, "users", currentUser.uid);
        const userSnapshot = await getDoc(userRef);

        if (cancelled) return;

        if (
          !userSnapshot.exists() ||
          userSnapshot.data()?.role !== "admin"
        ) {
          setCheckingAdmin(false);
          setAdminAuthorized(false);

          Alert.alert(
            "Access denied",
            "This account does not have administrator privileges.",
            [
              {
                text: "OK",
                onPress: async () => {
                  try {
                    await signOut(auth);
                  } catch (error) {
                    console.error("Sign-out failed:", error);
                  }

                  navigation.replace("Login");
                },
              },
            ]
          );

          return;
        }

        setAdminAuthorized(true);

        // Users
        const usersQuery = query(
          collection(db, "users"),
          where("role", "==", "user")
        );

        const unsubscribeUsers = onSnapshot(
          usersQuery,
          (snapshot) => {
            if (cancelled) return;

            setUsers(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              }))
            );
          },
          (error) => handleListenerError("Users", error)
        );

        localUnsubscribers.push(unsubscribeUsers);

        // Owners
        const ownersQuery = query(
          collection(db, "users"),
          where("role", "==", "owner")
        );

        const unsubscribeOwners = onSnapshot(
          ownersQuery,
          (snapshot) => {
            if (cancelled) return;

            setOwners(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              }))
            );
          },
          (error) => handleListenerError("Owners", error)
        );

        localUnsubscribers.push(unsubscribeOwners);

        // Vehicles
        const unsubscribeVehicles = onSnapshot(
          collection(db, "vehicles"),
          (snapshot) => {
            if (cancelled) return;

            setVehicles(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              }))
            );
          },
          (error) => handleListenerError("Vehicles", error)
        );

        localUnsubscribers.push(unsubscribeVehicles);

        // Tourist spots
        const unsubscribeSpots = onSnapshot(
          collection(db, "touristSpots"),
          (snapshot) => {
            if (cancelled) return;

            setSpots(
              snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
              }))
            );
          },
          (error) => handleListenerError("Tourist spots", error)
        );

        localUnsubscribers.push(unsubscribeSpots);

        unsubscribers.current = localUnsubscribers;
        setCheckingAdmin(false);
      } catch (error) {
        console.error(
          "Admin dashboard initialization failed:",
          error?.code,
          error?.message
        );

        if (!cancelled) {
          setCheckingAdmin(false);
          setAdminAuthorized(false);

          Alert.alert(
            "Dashboard error",
            error?.code === "permission-denied"
              ? "Firestore denied access. Check your security rules and confirm that this account has role: admin."
              : "Could not initialize the dashboard. Check your connection and Firebase configuration."
          );
        }
      }
    };

    startDashboard();

    return () => {
      cancelled = true;
      mounted.current = false;
      stopListeners();
    };
  }, [navigation]);

  // --------------------------------------------------
  // Delete records
  // --------------------------------------------------
  const handleDelete = (collectionName, itemId) => {
    Alert.alert(
      "Delete record",
      "This record will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove a user's associated vehicles first.
              if (collectionName === "users") {
                const ownerVehiclesQuery = query(
                  collection(db, "vehicles"),
                  where("ownerId", "==", itemId)
                );

                const snapshot = await getDocs(ownerVehiclesQuery);

                await Promise.all(
                  snapshot.docs.map((vehicle) =>
                    deleteDoc(doc(db, "vehicles", vehicle.id))
                  )
                );
              }

              await deleteDoc(doc(db, collectionName, itemId));

              Alert.alert("Success", "Record deleted successfully.");
            } catch (error) {
              console.error(
                "Delete failed:",
                error?.code,
                error?.message
              );

              Alert.alert(
                "Could not delete",
                error?.code === "permission-denied"
                  ? "You do not have permission to delete this record. Check your Firestore rules."
                  : "Check your connection and try again."
              );
            }
          },
        },
      ]
    );
  };

  // --------------------------------------------------
  // Edit records
  // --------------------------------------------------
  const openEdit = (item, collectionName) => {
    const mainField =
      collectionName === "vehicles" ||
      collectionName === "touristSpots"
        ? "name"
        : "username";

    setEditItem({ ...item, collectionName });
    setEditField(mainField);
    setEditValue(String(item[mainField] ?? ""));
    setEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem || !editField.trim()) {
      Alert.alert("Invalid edit", "No record or field was selected.");
      return;
    }

    if (!editValue.trim()) {
      Alert.alert("Required field", "The value cannot be empty.");
      return;
    }

    try {
      await updateDoc(
        doc(db, editItem.collectionName, editItem.id),
        {
          [editField]: editValue.trim(),
        }
      );

      setEditModal(false);
      setEditItem(null);

      Alert.alert("Success", "Record updated successfully.");
    } catch (error) {
      console.error(
        "Update failed:",
        error?.code,
        error?.message
      );

      Alert.alert(
        "Could not save",
        error?.code === "permission-denied"
          ? "Firestore denied this update. Check your security rules."
          : "Check your connection and try again."
      );
    }
  };

  // --------------------------------------------------
  // Pick an image for a tourist spot
  // --------------------------------------------------
  const pickSpotImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow gallery access to choose a photo."
        );
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
    } catch (error) {
      console.error("Image picker failed:", error);

      Alert.alert(
        "Image picker error",
        "Could not open your gallery. Please try again."
      );
    }
  };

  // Convert the selected image into a data URL.
  // Note: Firestore documents have a 1 MiB maximum size.
  const uploadSpotImage = async (uri) => {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error("Could not read the selected image.");
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Could not convert the image."));
        }
      };

      reader.onerror = () => {
        reject(new Error("Could not read the image file."));
      };

      reader.readAsDataURL(blob);
    });
  };

  // --------------------------------------------------
  // Add tourist spot
  // --------------------------------------------------
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
      Alert.alert("Name required", "Enter a name for the spot.");
      return;
    }

    if (!spotLatitude.trim() || !spotLongitude.trim()) {
      Alert.alert(
        "Coordinates required",
        "Enter both latitude and longitude."
      );
      return;
    }

    const lat = Number(spotLatitude.trim());
    const lng = Number(spotLongitude.trim());

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      Alert.alert(
        "Invalid coordinates",
        "Enter a valid latitude (-90 to 90) and longitude (-180 to 180)."
      );
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
        imageUrl,
        createdAt: new Date(),
      });

      setAddSpotModal(false);
      resetAddSpotForm();

      Alert.alert("Success", "Tourist spot added successfully.");
    } catch (error) {
      console.error(
        "Add tourist spot failed:",
        error?.code,
        error?.message
      );

      const message =
        error?.code === "permission-denied"
          ? "Firestore denied this operation. Check your administrator permissions and security rules."
          : error?.code === "invalid-argument"
          ? "Some data is invalid. Check the image and field values."
          : "Could not add the tourist spot. Check your connection and try again.";

      Alert.alert("Could not add spot", message);
    } finally {
      setUploadingSpot(false);
    }
  };

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------
  const handleLogout = () => {
    Alert.alert(
      "Log out",
      "You will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            // Stop listeners before signing out.
            unsubscribers.current.forEach((unsubscribe) => {
              try {
                unsubscribe();
              } catch (error) {
                console.warn("Listener cleanup failed:", error);
              }
            });

            unsubscribers.current = [];

            try {
              await signOut(auth);
              navigation.replace("Login");
            } catch (error) {
              console.error("Logout failed:", error);

              Alert.alert(
                "Could not log out",
                "Please try again."
              );
            }
          },
        },
      ]
    );
  };

  // --------------------------------------------------
  // Table helpers
  // --------------------------------------------------
  const handleBack = () => setActiveTable(null);

  const sections = [
    { key: "users", label: "Users", count: users.length },
    { key: "owners", label: "Owners", count: owners.length },
    { key: "vehicles", label: "Vehicles", count: vehicles.length },
    { key: "spots", label: "Tourist spots", count: spots.length },
  ];

  const getTableData = () => {
    if (activeTable === "users") {
      return { data: users, collection: "users" };
    }

    if (activeTable === "owners") {
      return { data: owners, collection: "users" };
    }

    if (activeTable === "vehicles") {
      return { data: vehicles, collection: "vehicles" };
    }

    if (activeTable === "spots") {
      return { data: spots, collection: "touristSpots" };
    }

    return { data: [], collection: "" };
  };

  const getTableTitle = () => {
    const titles = {
      users: "Users",
      owners: "Owners",
      vehicles: "Vehicles",
      spots: "Tourist spots",
    };

    return titles[activeTable] || "";
  };

  const renderTableRow = (item, collectionName) => {
    const name =
      item.username || item.name || item.category || "Untitled";

    const coordinates =
      item.location &&
      Number.isFinite(item.location.lat) &&
      Number.isFinite(item.location.lng)
        ? `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`
        : null;

    const sub =
      item.email ||
      item.plate ||
      coordinates ||
      item.ownerId ||
      null;

    const badge =
      item.role ||
      item.status ||
      item.capabilities?.[0] ||
      null;

    const meta = [sub, badge].filter(Boolean).join("   ");

    return (
      <View style={styles.tableRow}>
        {collectionName === "touristSpots" && item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.rowThumb}
          />
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
            <Text
              style={[styles.actionText, styles.actionDanger]}
            >
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const { data, collection: colName } = getTableData();

  // Show a loading screen while checking the administrator role.
  if (checkingAdmin || !adminAuthorized) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={C.bg}
        />

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.text} />

          <Text style={styles.loadingText}>
            {checkingAdmin
              ? "Verifying administrator..."
              : "Access unavailable"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.bg}
      />

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

      <Text style={styles.title}>
        {activeTable ? getTableTitle() : "Admin"}
      </Text>

      {/* Dashboard home */}
      {!activeTable && (
        <ScrollView
          contentContainerStyle={styles.homeContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Records</Text>

          {sections.map((section) => (
            <TouchableOpacity
              key={section.key}
              style={styles.navRow}
              onPress={() => setActiveTable(section.key)}
              activeOpacity={0.6}
            >
              <Text style={styles.navLabel}>
                {section.label}
              </Text>

              <Text style={styles.navCount}>
                {section.count}
              </Text>
            </TouchableOpacity>
          ))}

          <Text
            style={[styles.sectionLabel, styles.sectionGap]}
          >
            Manage
          </Text>

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("AdminPackages")}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Trip packages</Text>
              <Text style={styles.navHint}>
                Multi-leg trips with pricing
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => navigation.navigate("AdminHotels")}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Partner hotels</Text>
              <Text style={styles.navHint}>
                Booking links and availability
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navRow}
            onPress={() => setAddSpotModal(true)}
            activeOpacity={0.6}
          >
            <View style={styles.flex}>
              <Text style={styles.navLabel}>Add tourist spot</Text>
              <Text style={styles.navHint}>
                Appears on the map right away
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Records table */}
      {activeTable && (
        <View style={styles.tableContainer}>
          <View style={styles.tableTopRow}>
            <Text style={styles.tableCount}>
              {data.length}{" "}
              {data.length === 1 ? "record" : "records"}
            </Text>

            {activeTable === "spots" && (
              <TouchableOpacity
                onPress={() => setAddSpotModal(true)}
                hitSlop={8}
              >
                <Text style={styles.headerAction}>
                  Add spot
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              renderTableRow(item, colName)
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  Nothing here yet
                </Text>

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

      {/* Add tourist spot modal */}
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
                <Text style={styles.sheetTitle}>
                  New tourist spot
                </Text>

                <TouchableOpacity
                  onPress={closeAddSpot}
                  hitSlop={8}
                  disabled={uploadingSpot}
                >
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Photo</Text>

                <TouchableOpacity
                  style={styles.imagePicker}
                  onPress={pickSpotImage}
                  disabled={uploadingSpot}
                >
                  {spotImage ? (
                    <Image
                      source={{ uri: spotImage }}
                      style={styles.imagePreview}
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>
                        Choose a photo
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {spotImage && (
                  <TouchableOpacity
                    onPress={() => setSpotImage(null)}
                    style={styles.removeImageBtn}
                    hitSlop={8}
                    disabled={uploadingSpot}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        styles.actionDanger,
                      ]}
                    >
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
                  editable={!uploadingSpot}
                />

                <Text style={styles.label}>Category</Text>

                <TextInput
                  style={styles.input}
                  value={spotCategory}
                  onChangeText={setSpotCategory}
                  placeholder="Beach, mountain, heritage"
                  placeholderTextColor={C.faint}
                  editable={!uploadingSpot}
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
                  editable={!uploadingSpot}
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
                      editable={!uploadingSpot}
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
                      editable={!uploadingSpot}
                    />
                  </View>
                </View>

                <Text style={styles.hint}>
                  In Google Maps, long-press a location to see
                  its coordinates.
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={closeAddSpot}
                    disabled={uploadingSpot}
                  >
                    <Text style={styles.secondaryText}>
                      Cancel
                    </Text>
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
                      <ActivityIndicator
                        color={C.bg}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.primaryText}>
                        Add spot
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit record modal */}
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
                <Text style={styles.sheetTitle}>
                  Edit record
                </Text>

                <TouchableOpacity
                  onPress={() => setEditModal(false)}
                  hitSlop={8}
                >
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                {editField
                  ? editField.charAt(0).toUpperCase() +
                    editField.slice(1)
                  : "Value"}
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
                  <Text style={styles.secondaryText}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, styles.flex]}
                  onPress={handleSaveEdit}
                >
                  <Text style={styles.primaryText}>
                    Save changes
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// --------------------------------------------------
// Color palette
// --------------------------------------------------
const C = {
  bg: "#0E1116",
  surface: "#151A21",
  border: "#232A33",
  text: "#E8EAED",
  muted: "#8A929E",
  faint: "#566070",
  danger: "#E5736B",
};

// --------------------------------------------------
// Styles
// --------------------------------------------------
const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.bg },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: C.muted,
    fontSize: 15,
    marginTop: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight || 0) + 16
        : 20,
  },
  headerLink: { color: C.muted, fontSize: 15 },
  headerAction: {
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
    paddingHorizontal: 24,
    marginTop: 18,
    marginBottom: 8,
  },

  homeContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
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
  navLabel: {
    color: C.text,
    fontSize: 17,
    fontWeight: "500",
  },
  navHint: {
    color: C.muted,
    fontSize: 13,
    marginTop: 3,
  },
  navCount: {
    color: C.muted,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },

  tableContainer: { flex: 1 },
  tableTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  tableCount: { fontSize: 13, color: C.muted },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    flexGrow: 1,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  rowThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 14,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowName: {
    color: C.text,
    fontSize: 16,
    fontWeight: "600",
  },
  rowSub: {
    color: C.muted,
    fontSize: 13,
    marginTop: 3,
  },
  rowDesc: {
    color: C.faint,
    fontSize: 13,
    marginTop: 3,
  },
  rowActions: {
    flexDirection: "row",
    gap: 18,
  },
  actionText: {
    color: C.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  actionDanger: { color: C.danger },

  emptyContainer: { paddingTop: 72 },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySub: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 22,
  },

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
  sheetTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "700",
  },

  label: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 18,
    marginBottom: 8,
  },
  hint: {
    color: C.faint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
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
  textArea: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  inline: { flexDirection: "row" },
  gapRight: { marginRight: 6 },
  gapLeft: { marginLeft: 6 },

  imagePicker: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    borderRadius: 8,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 160,
  },
  imagePlaceholder: {
    height: 96,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.bg,
  },
  imagePlaceholderText: {
    color: C.muted,
    fontSize: 14,
  },
  removeImageBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
  },

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
  primaryText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  secondaryText: {
    color: C.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  disabled: { opacity: 0.6 },
});
```