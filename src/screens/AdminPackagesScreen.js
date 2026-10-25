import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  StatusBar,
  Image,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { pickImageAsDataUri } from "../utils/pickImage";

const C = {
  navy: "#0B1224",
  purple: "#7C3AED",
  purpleSoft: "#F1EAFE",
  green: "#16A34A",
  red: "#DC2626",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E5E7EB",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const emptyLeg = () => ({ vehicleType: "", fromSpot: "", toSpot: "", estimatedPrice: "" });

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  duration: "",
  spotId: null,
  spotName: "",
  roundTrip: false,
  imageUrl: null,
  legs: [emptyLeg()],
};

// Reusable labelled input
function Field({ label, multiline, small, ...inputProps }) {
  return (
    <View>
      <Text style={small ? styles.miniLabel : styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        placeholderTextColor={C.faint}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        {...inputProps}
      />
    </View>
  );
}

export default function AdminPackagesScreen({ navigation }) {
  const [packages, setPackages] = useState([]);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // "list" | "form"
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const unsubPkgs = onSnapshot(
      collection(db, "tripPackages"),
      (snap) => {
        setPackages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsubSpots = onSnapshot(collection(db, "touristSpots"), (snap) =>
      setSpots(snap.docs.map((d) => ({ id: d.id, name: d.data().name || "Untitled" })))
    );
    return () => {
      unsubPkgs();
      unsubSpots();
    };
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setLeg = (index, key, value) =>
    setForm((f) => ({
      ...f,
      legs: f.legs.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    }));

  const addLeg = () => setForm((f) => ({ ...f, legs: [...f.legs, emptyLeg()] }));

  const removeLeg = (index) =>
    setForm((f) =>
      f.legs.length === 1 ? f : { ...f, legs: f.legs.filter((_, i) => i !== index) }
    );

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("form");
  };

  const openEdit = (pkg) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name || "",
      description: pkg.description || "",
      price: pkg.totalPrice?.toString() || pkg.price?.toString() || "",
      duration: pkg.durationEstimate || pkg.duration || "",
      spotId: pkg.spotId || null,
      spotName: pkg.spotName || "",
      roundTrip: !!pkg.roundTrip,
      imageUrl: pkg.imageUrl || null,
      legs: pkg.legs?.length
        ? pkg.legs.map((l) => ({
            vehicleType: l.vehicleType || "",
            fromSpot: l.fromSpot || l.fromLabel || "",
            toSpot: l.toSpot || l.toLabel || "",
            estimatedPrice: l.estimatedPrice?.toString() || "",
          }))
        : [emptyLeg()],
    });
    setView("form");
  };

  const closeForm = () => {
    setView("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const pickPhoto = async () => {
    const uri = await pickImageAsDataUri({ aspect: [16, 9] });
    if (uri) set("imageUrl", uri);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter a package name to continue.");
      return;
    }
    if (!form.spotId) {
      Alert.alert("Spot required", "Choose the tourist spot this package belongs to.");
      return;
    }

    const legs = form.legs
      .filter((l) => l.vehicleType.trim() || l.fromSpot.trim() || l.toSpot.trim())
      .map((l) => ({
        vehicleType: l.vehicleType.trim(),
        fromSpot: l.fromSpot.trim(),
        toSpot: l.toSpot.trim(),
        fromLabel: l.fromSpot.trim(),
        toLabel: l.toSpot.trim(),
        estimatedPrice: parseFloat(l.estimatedPrice) || 0,
      }));

    const price = parseFloat(form.price) || 0;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      totalPrice: price,
      duration: form.duration.trim(),
      durationEstimate: form.duration.trim(),
      spotId: form.spotId,
      spotName: form.spotName,
      roundTrip: form.roundTrip,
      imageUrl: form.imageUrl || null,
      legs,
      updatedAt: new Date(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "tripPackages", editingId), payload);
      } else {
        await addDoc(collection(db, "tripPackages"), { ...payload, createdAt: new Date() });
      }
      closeForm();
    } catch (e) {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    Alert.alert("Delete package", `"${name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "tripPackages", id));
          } catch {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  const renderPackage = ({ item }) => {
    const total =
      item.totalPrice ||
      item.price ||
      (item.legs || []).reduce((s, l) => s + (Number(l.estimatedPrice) || 0), 0);
    const legCount = (item.legs || []).length;
    const route = (item.legs || []).map((l) => cap(l.vehicleType || "ride")).join(" → ");
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.85}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.placeholder]}>
            <Text style={styles.placeholderText}>{item.name?.charAt(0)?.toUpperCase() || "P"}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
              {item.name}
            </Text>
            {Number(total) > 0 ? (
              <Text style={styles.price}>₱{Number(total).toLocaleString()}</Text>
            ) : null}
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[item.spotName, item.durationEstimate || item.duration].filter(Boolean).join("  ·  ") ||
              "No spot or duration"}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {legCount} leg{legCount !== 1 ? "s" : ""}
            {item.roundTrip ? "  ·  Round trip" : ""}
          </Text>
          {route ? (
            <Text style={styles.route} numberOfLines={1}>
              {route}
            </Text>
          ) : null}

          <View style={styles.cardActions}>
            <Text style={styles.link}>Tap to edit</Text>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} hitSlop={8}>
              <Text style={styles.danger}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isForm = view === "form";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      {/* Header */}
      <View style={styles.header}>
        {isForm ? (
          <TouchableOpacity onPress={closeForm} hitSlop={8}>
            <Text style={styles.headerLink}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("AdminDashboard"))}
            hitSlop={8}
          >
            <Text style={styles.headerLink}>Back</Text>
          </TouchableOpacity>
        )}

        {isForm ? (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.headerBtn, saving && styles.disabled]}
            hitSlop={8}
          >
            {saving ? (
              <ActivityIndicator color={C.navy} size="small" />
            ) : (
              <Text style={styles.headerBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openAdd} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="add" size={16} color={C.navy} />
            <Text style={styles.headerBtnText}>New package</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {isForm ? (editingId ? "Edit package" : "New package") : "Trip packages"}
        </Text>
        <Text style={styles.subtitle}>
          {isForm
            ? "Pick the spot, then add each leg of the trip. Leg prices are added together for the total."
            : "Multi-leg trips shown under each tourist spot on the homepage."}
        </Text>
      </View>

      <View style={styles.content}>
        {isForm ? (
          <KeyboardAwareScrollView
            style={styles.flex}
            contentContainerStyle={styles.formContent}
            bottomOffset={28}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Photo</Text>
            {form.imageUrl ? (
              <View>
                <Image source={{ uri: form.imageUrl }} style={styles.preview} />
                <TouchableOpacity style={styles.removePhoto} onPress={() => set("imageUrl", null)}>
                  <Text style={styles.danger}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
                <Ionicons name="camera-outline" size={24} color={C.purple} />
                <Text style={styles.photoPickerText}>Add a photo</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Tourist spot</Text>
            {spots.length === 0 ? (
              <Text style={styles.hint}>Add a tourist spot first.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {spots.map((s) => {
                  const active = form.spotId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        set("spotId", s.id);
                        set("spotName", s.name);
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Field label="Package name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="Island hopping adventure" />
            <Field label="Description" multiline value={form.description} onChangeText={(v) => set("description", v)} placeholder="What this package includes" />

            <View style={styles.inline}>
              <View style={[styles.flex, { marginRight: 6 }]}>
                <Field label="Total price (₱)" value={form.price} onChangeText={(v) => set("price", v)} placeholder="0" keyboardType="numeric" />
              </View>
              <View style={[styles.flex, { marginLeft: 6 }]}>
                <Field label="Duration" value={form.duration} onChangeText={(v) => set("duration", v)} placeholder="1 day" />
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Round trip</Text>
              <Switch
                value={form.roundTrip}
                onValueChange={(v) => set("roundTrip", v)}
                trackColor={{ false: C.border, true: C.green }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.legsHead}>
              <Text style={styles.sectionTitle}>Trip legs</Text>
              <TouchableOpacity onPress={addLeg} hitSlop={8}>
                <Text style={styles.link}>+ Add leg</Text>
              </TouchableOpacity>
            </View>

            {form.legs.map((leg, index) => (
              <View key={index} style={styles.legCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.legTitle}>Leg {index + 1}</Text>
                  {form.legs.length > 1 && (
                    <TouchableOpacity onPress={() => removeLeg(index)} hitSlop={8}>
                      <Text style={styles.danger}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Field small label="Vehicle" value={leg.vehicleType} onChangeText={(v) => setLeg(index, "vehicleType", v)} placeholder="Motorbike, boat, van" />
                <View style={styles.inline}>
                  <View style={[styles.flex, { marginRight: 6 }]}>
                    <Field small label="From" value={leg.fromSpot} onChangeText={(v) => setLeg(index, "fromSpot", v)} placeholder="Start point" />
                  </View>
                  <View style={[styles.flex, { marginLeft: 6 }]}>
                    <Field small label="To" value={leg.toSpot} onChangeText={(v) => setLeg(index, "toSpot", v)} placeholder="End point" />
                  </View>
                </View>
                <Field small label="Estimated price (₱)" value={leg.estimatedPrice} onChangeText={(v) => setLeg(index, "estimatedPrice", v)} placeholder="0" keyboardType="numeric" />
              </View>
            ))}

            {editingId ? (
              <TouchableOpacity
                style={styles.deleteFull}
                onPress={() => handleDelete(editingId, form.name)}
              >
                <Text style={styles.danger}>Delete this package</Text>
              </TouchableOpacity>
            ) : null}
          </KeyboardAwareScrollView>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.purple} />
          </View>
        ) : (
          <FlatList
            data={packages}
            keyExtractor={(item) => item.id}
            renderItem={renderPackage}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No packages yet</Text>
                <Text style={styles.emptySub}>
                  Create a trip with a photo, a spot, and the vehicles for each leg.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                  <Text style={styles.primaryText}>New package</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.navy },
  rowBetween: { flexDirection: "row", alignItems: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  disabled: { opacity: 0.6 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLink: { color: C.faint, fontSize: 15 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
  },
  headerBtnText: { color: C.navy, fontSize: 14, fontWeight: "700" },
  titleBlock: { backgroundColor: C.navy, paddingHorizontal: 20, paddingBottom: 22 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: C.faint, fontSize: 13, lineHeight: 19, marginTop: 6 },

  // Content sheet
  content: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    overflow: "hidden",
  },
  list: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  formContent: { padding: 20, paddingBottom: 120 },

  // Package card
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardImage: { width: "100%", height: 150 },
  placeholder: {
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: C.purple, fontSize: 36, fontWeight: "800" },
  cardBody: { padding: 14 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  route: { color: C.text, fontSize: 13, fontWeight: "600", marginTop: 6 },
  price: { color: C.text, fontSize: 15, fontWeight: "700", marginLeft: 12 },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  link: { color: C.purple, fontSize: 14, fontWeight: "600" },
  danger: { color: C.red, fontSize: 14, fontWeight: "600" },
  deleteFull: { alignItems: "center", paddingVertical: 20, marginTop: 10 },

  // Empty
  empty: { paddingTop: 48, alignItems: "flex-start" },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: C.muted, fontSize: 14, lineHeight: 21, marginBottom: 20 },

  // Buttons
  primaryBtn: {
    backgroundColor: C.navy,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // Form
  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  miniLabel: { color: C.muted, fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 6 },
  hint: { color: C.faint, fontSize: 13 },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  textArea: { minHeight: 90 },
  inline: { flexDirection: "row" },

  // Photo
  photoPicker: {
    height: 130,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.purple,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  photoPickerText: { color: C.purple, fontSize: 14, fontWeight: "700" },
  preview: { width: "100%", height: 180, borderRadius: 14 },
  removePhoto: { alignSelf: "flex-end", marginTop: 8 },

  // Spot chips
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.navy, borderColor: C.navy },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },

  // Switch
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  switchLabel: { color: C.text, fontSize: 15 },

  // Legs
  legsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 4,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  legCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  legTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
});