import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

const EMPTY_LEG = { vehicleType: "", fromSpot: "", toSpot: "" };

export default function AdminPackages({ navigation }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [legs, setLegs] = useState([{ ...EMPTY_LEG }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "tripPackages"), (snapshot) => {
      setPackages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setDuration("");
    setLegs([{ ...EMPTY_LEG }]);
    setEditingId(null);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const openAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setName(item.name || "");
    setDescription(item.description || "");
    setPrice(item.price?.toString() || "");
    setDuration(item.duration || "");
    setLegs(item.legs?.length ? item.legs : [{ ...EMPTY_LEG }]);
    setModalVisible(true);
  };

  const addLeg = () => setLegs([...legs, { ...EMPTY_LEG }]);

  const removeLeg = (index) => {
    if (legs.length === 1) return;
    setLegs(legs.filter((_, i) => i !== index));
  };

  const updateLeg = (index, field, value) => {
    setLegs(legs.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Enter a package name to continue.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price) || 0,
        duration: duration.trim(),
        legs: legs.filter(
          (l) => l.vehicleType.trim() || l.fromSpot.trim() || l.toSpot.trim()
        ),
        updatedAt: new Date(),
      };

      if (editingId) {
        await updateDoc(doc(db, "tripPackages", editingId), payload);
      } else {
        await addDoc(collection(db, "tripPackages"), {
          ...payload,
          createdAt: new Date(),
        });
      }

      closeModal();
    } catch (error) {
      console.error(error);
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, pkgName) => {
    Alert.alert("Delete package", `"${pkgName}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "tripPackages", id));
          } catch (e) {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  const renderPackage = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.duration ? (
            <Text style={styles.rowMeta}>{item.duration}</Text>
          ) : null}
        </View>
        {item.price > 0 && (
          <Text style={styles.rowPrice}>₱{item.price.toLocaleString()}</Text>
        )}
      </View>

      {item.description ? (
        <Text style={styles.rowDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      {item.legs?.length > 0 && (
        <View style={styles.legList}>
          {item.legs.map((leg, idx) => (
            <Text key={idx} style={styles.legLine} numberOfLines={1}>
              <Text style={styles.legVehicle}>{leg.vehicleType || "Vehicle"}</Text>
              {"   "}
              {leg.fromSpot || "?"} to {leg.toSpot || "?"}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.rowActions}>
        <TouchableOpacity onPress={() => openEdit(item)} hitSlop={8}>
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDelete(item.id, item.name)}
          hitSlop={8}
        >
          <Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate("AdminDashboard")
          }
          hitSlop={8}
        >
          <Text style={styles.headerLink}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openAdd} hitSlop={8}>
          <Text style={styles.headerAction}>New package</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Packages</Text>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.muted} />
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(item) => item.id}
          renderItem={renderPackage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No packages yet</Text>
              <Text style={styles.emptySub}>
                Create your first trip package to get started.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                <Text style={styles.primaryText}>New package</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {editingId ? "Edit package" : "New package"}
                </Text>
                <TouchableOpacity onPress={closeModal} hitSlop={8}>
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Island hopping"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What this package includes"
                  placeholderTextColor={C.faint}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.inline}>
                  <View style={[styles.flex, styles.gapRight]}>
                    <Text style={styles.label}>Price (₱)</Text>
                    <TextInput
                      style={styles.input}
                      value={price}
                      onChangeText={setPrice}
                      placeholder="0"
                      placeholderTextColor={C.faint}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.flex, styles.gapLeft]}>
                    <Text style={styles.label}>Duration</Text>
                    <TextInput
                      style={styles.input}
                      value={duration}
                      onChangeText={setDuration}
                      placeholder="1 day"
                      placeholderTextColor={C.faint}
                    />
                  </View>
                </View>

                {/* Legs */}
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Trip legs</Text>
                  <TouchableOpacity onPress={addLeg} hitSlop={8}>
                    <Text style={styles.headerAction}>Add leg</Text>
                  </TouchableOpacity>
                </View>

                {legs.map((leg, index) => (
                  <View key={index} style={styles.leg}>
                    <View style={styles.legHead}>
                      <Text style={styles.legTitle}>Leg {index + 1}</Text>
                      {legs.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeLeg(index)}
                          hitSlop={8}
                        >
                          <Text style={[styles.actionText, styles.actionDanger]}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TextInput
                      style={styles.input}
                      value={leg.vehicleType}
                      onChangeText={(v) => updateLeg(index, "vehicleType", v)}
                      placeholder="Vehicle (motorbike, boat)"
                      placeholderTextColor={C.faint}
                    />
                    <View style={[styles.inline, styles.legInputs]}>
                      <TextInput
                        style={[styles.input, styles.flex, styles.gapRight]}
                        value={leg.fromSpot}
                        onChangeText={(v) => updateLeg(index, "fromSpot", v)}
                        placeholder="From"
                        placeholderTextColor={C.faint}
                      />
                      <TextInput
                        style={[styles.input, styles.flex, styles.gapLeft]}
                        value={leg.toSpot}
                        onChangeText={(v) => updateLeg(index, "toSpot", v)}
                        placeholder="To"
                        placeholderTextColor={C.faint}
                      />
                    </View>
                  </View>
                ))}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={closeModal}
                    disabled={saving}
                  >
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.flex, saving && styles.disabled]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={C.bg} size="small" />
                    ) : (
                      <Text style={styles.primaryText}>
                        {editingId ? "Save changes" : "Create package"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
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

  // List
  listContent: { paddingHorizontal: 24, paddingBottom: 48, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Empty
  empty: { paddingTop: 96, alignItems: "flex-start" },
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
    marginBottom: 24,
  },

  // Package row
  row: {
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start" },
  rowTitle: { color: C.text, fontSize: 17, fontWeight: "600" },
  rowMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  rowPrice: {
    color: C.text,
    fontSize: 17,
    fontWeight: "600",
    marginLeft: 16,
  },
  rowDesc: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  legList: { marginTop: 12 },
  legLine: { color: C.muted, fontSize: 13, lineHeight: 22 },
  legVehicle: { color: C.text, fontWeight: "500" },
  rowActions: { flexDirection: "row", gap: 24, marginTop: 16 },
  actionText: { color: C.muted, fontSize: 14, fontWeight: "500" },
  actionDanger: { color: C.danger },

  // Modal
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
    maxHeight: "92%",
  },
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

  // Legs
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 30,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: "600" },
  leg: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  legHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  legTitle: { color: C.muted, fontSize: 13, fontWeight: "500" },
  legInputs: { marginTop: 10 },

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