import React, { useState, useEffect, useMemo } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { collection, onSnapshot, setDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { pickImageAsDataUri } from "../utils/pickImage";
import { DINING_DIRECTORY } from "../constants/sanCarlosDining";

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

const key = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);

const EMPTY = {
  name: "",
  category: "",
  cuisine: "",
  address: "",
  priceRange: "",
  phone: "",
  email: "",
  facebookName: "",
  facebookUrl: "",
  openingHours: "",
  description: "",
  latitude: null,
  longitude: null,
  imageUrls: [],
};

// Fills the form from a restaurant (spreadsheet entry or saved entry)
const toForm = (r) => ({
  ...EMPTY,
  name: r.name || "",
  category: r.category || "",
  cuisine: r.cuisine || "",
  address: r.address || "",
  priceRange: r.priceRange || "",
  phone: r.phone || "",
  email: r.email || "",
  facebookName: r.facebookName || "",
  facebookUrl: r.facebookUrl || "",
  openingHours: r.openingHours || "",
  description: r.description || "",
  latitude: typeof r.location?.lat === "number" ? r.location.lat : null,
  longitude: typeof r.location?.lng === "number" ? r.location.lng : null,
  imageUrls: Array.isArray(r.imageUrls) ? r.imageUrls : r.imageUrl ? [r.imageUrl] : [],
});

const toPayload = (f) => ({
  name: f.name.trim(),
  category: clean(f.category),
  cuisine: clean(f.cuisine),
  address: clean(f.address),
  priceRange: clean(f.priceRange),
  phone: clean(f.phone),
  email: clean(f.email),
  facebookName: clean(f.facebookName),
  facebookUrl: clean(f.facebookUrl),
  openingHours: clean(f.openingHours),
  description: clean(f.description),
  imageUrl: f.imageUrls[0] || null,
  imageUrls: f.imageUrls.slice(0, 4),
  location:
    typeof f.latitude === "number" && typeof f.longitude === "number"
      ? { lat: f.latitude, lng: f.longitude }
      : null,
  updatedAt: new Date(),
});

function Field({ label, multiline, ...inputProps }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
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

export default function AdminRestaurantsScreen({ navigation }) {
  const [saved, setSaved] = useState([]);
  const [view, setView] = useState("list"); // "list" | "form"
  const [editing, setEditing] = useState(null); // the restaurant being edited
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Saved entries in Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "restaurants"), (snap) =>
      setSaved(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  // Spreadsheet list, with saved entries added on top (same name = saved details win)
  const list = useMemo(() => {
    const map = new Map();
    DINING_DIRECTORY.forEach((r) =>
      map.set(key(r.name), { ...r, savedId: null, source: "spreadsheet" })
    );
    saved.forEach((r) => {
      const k = key(r.name);
      map.set(k, { ...(map.get(k) || {}), ...r, savedId: r.id, source: "saved" });
    });
    return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [saved]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setView("form");
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm(toForm(r));
    setView("form");
  };

  const closeForm = () => {
    setView("list");
    setEditing(null);
    setForm(EMPTY);
  };

  const addPhoto = async () => {
    if (form.imageUrls.length >= 4) {
      Alert.alert("Photo limit", "You can add up to 4 photos per restaurant.");
      return;
    }
    const uri = await pickImageAsDataUri({ aspect: [4, 3] });
    if (uri) {
      setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, uri].slice(0, 4) }));
    }
  };

  const removePhoto = (index) =>
    setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== index) }));

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow location to save this restaurant's map pin.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set("latitude", pos.coords.latitude);
      set("longitude", pos.coords.longitude);
    } catch {
      Alert.alert("Could not get location", "Turn on location, stand at the restaurant, and try again.");
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter the restaurant name.");
      return;
    }
    setSaving(true);
    try {
      // Keep the same document when editing, so the app merges it with the spreadsheet entry
      const docId = editing ? editing.savedId || key(editing.name) : key(form.name);
      await setDoc(doc(db, "restaurants", docId), toPayload(form), { merge: true });
      closeForm();
    } catch {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (r) => {
    Alert.alert(
      "Delete saved details",
      `This removes the details you added for "${r.name}". The spreadsheet listing stays.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "restaurants", r.savedId));
              closeForm();
            } catch {
              Alert.alert("Could not delete", "Check your connection and try again.");
            }
          },
        },
      ]
    );
  };

  const renderRow = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.85}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.placeholderText}>{item.name?.charAt(0)?.toUpperCase() || "R"}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[item.cuisine, item.priceRange].filter(Boolean).join("  ·  ") || "No details yet"}
        </Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: item.source === "saved" ? C.green : C.faint }]} />
          <Text style={styles.rowMeta}>
            {item.source === "saved" ? "Saved" : "Spreadsheet"}
            {item.phone || item.facebookUrl ? "  ·  Contact added" : ""}
            {item.location?.lat ? "  ·  Pin set" : ""}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.faint} />
    </TouchableOpacity>
  );

  const isForm = view === "form";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

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
          <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.headerBtn, saving && styles.disabled]}>
            {saving ? (
              <ActivityIndicator color={C.navy} size="small" />
            ) : (
              <Text style={styles.headerBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openNew} style={styles.headerBtn}>
            <Ionicons name="add" size={16} color={C.navy} />
            <Text style={styles.headerBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {isForm ? (editing ? "Edit restaurant" : "New restaurant") : "Restaurants"}
        </Text>
        <Text style={styles.subtitle}>
          {isForm
            ? "Add the contact, location and photo. Only the name is required."
            : "Spreadsheet restaurants are listed here. Tap one to add its contact, location or photo."}
        </Text>
      </View>

      <View style={styles.content}>
        {isForm ? (
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Photos (best dishes, interior, front)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {form.imageUrls.map((uri, i) => (
                <View key={`${i}-${uri.slice(0, 24)}`} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)} hitSlop={6}>
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
              {form.imageUrls.length < 4 ? (
                <TouchableOpacity style={styles.photoAdd} onPress={addPhoto}>
                  <Ionicons name="camera-outline" size={22} color={C.purple} />
                  <Text style={styles.photoAddText}>Add</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
            <Text style={styles.hint}>
              Up to 4 photos. The first photo is the main one. Keep photos small so they save.
            </Text>

            <Text style={styles.section}>Details</Text>
            <Field label="Name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="Restaurant name" />
            <Field label="Cuisine" value={form.cuisine} onChangeText={(v) => set("cuisine", v)} placeholder="Filipino, seafood, coffee..." />
            <Field label="Category" value={form.category} onChangeText={(v) => set("category", v)} placeholder="Full-service, cafe, restobar..." />
            <Field label="Price range" value={form.priceRange} onChangeText={(v) => set("priceRange", v)} placeholder="₱150 - ₱400" />
            <Field label="Opening hours" value={form.openingHours} onChangeText={(v) => set("openingHours", v)} placeholder="8 AM - 9 PM" />
            <Field label="Description" multiline value={form.description} onChangeText={(v) => set("description", v)} placeholder="What the restaurant is known for" />

            <Text style={styles.section}>Address and map</Text>
            <Field label="Address" value={form.address} onChangeText={(v) => set("address", v)} placeholder="Street, barangay, city" />
            <TouchableOpacity
              style={[styles.secondaryBtn, locating && styles.disabled]}
              onPress={useMyLocation}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator color={C.purple} size="small" />
              ) : (
                <>
                  <Ionicons name="locate-outline" size={16} color={C.purple} />
                  <Text style={styles.secondaryText}>
                    {form.latitude != null ? "Update map pin from my location" : "Set map pin from my location"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {form.latitude != null ? (
              <View style={styles.pinSet}>
                <Ionicons name="checkmark-circle" size={16} color={C.green} />
                <Text style={styles.pinText}>
                  Pin set: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                </Text>
                <TouchableOpacity onPress={() => { set("latitude", null); set("longitude", null); }}>
                  <Text style={styles.danger}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.hint}>
                Without a pin, directions search the name and address on Google Maps.
              </Text>
            )}

            <Text style={styles.section}>Contact</Text>
            <Field label="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="0917 000 0000" keyboardType="phone-pad" />
            <Field label="Email" value={form.email} onChangeText={(v) => set("email", v)} placeholder="restaurant@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Facebook page name" value={form.facebookName} onChangeText={(v) => set("facebookName", v)} placeholder="Restaurant name" />
            <Field label="Facebook link" value={form.facebookUrl} onChangeText={(v) => set("facebookUrl", v)} placeholder="https://facebook.com/..." keyboardType="url" autoCapitalize="none" />

            {editing?.savedId ? (
              <TouchableOpacity style={styles.deleteFull} onPress={() => handleDelete(editing)}>
                <Text style={styles.danger}>Delete saved details</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item) => item.savedId || key(item.name)}
            renderItem={renderRow}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.navy },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  disabled: { opacity: 0.6 },

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

  content: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    overflow: "hidden",
  },
  list: { padding: 20, paddingBottom: 40 },
  formContent: { padding: 20, paddingBottom: 120 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  placeholder: { backgroundColor: C.purpleSoft, justifyContent: "center", alignItems: "center" },
  placeholderText: { color: C.purple, fontSize: 22, fontWeight: "800" },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  section: { color: C.text, fontSize: 15, fontWeight: "800", marginTop: 26, marginBottom: 4 },
  hint: { color: C.faint, fontSize: 12, marginTop: 8, lineHeight: 17 },
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
  photoRow: { gap: 10, paddingVertical: 4 },
  photoWrap: { width: 110, height: 82, borderRadius: 12, overflow: "hidden" },
  photoThumb: { width: "100%", height: "100%" },
  photoRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15,23,42,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoAdd: {
    width: 110,
    height: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.purple,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  photoAddText: { color: C.purple, fontSize: 12, fontWeight: "700" },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  secondaryText: { color: C.purple, fontWeight: "700", fontSize: 14 },
  pinSet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
  },
  pinText: { flex: 1, color: C.text, fontSize: 13 },
  danger: { color: C.red, fontSize: 14, fontWeight: "600" },
  deleteFull: { alignItems: "center", paddingVertical: 20, marginTop: 10 },
});