import React, { useState, useEffect } from "react";
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
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { pickImageAsDataUri } from "../utils/pickImage";

const C = {
  navy: "#0B1224",
  purple: "#7C3AED",
  purpleSoft: "#F1EAFE",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  amber: "#D97706",
  red: "#DC2626",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E5E7EB",
};

const STATUSES = ["available", "limited", "full"];
const STATUS_COLOR = { available: C.green, limited: C.amber, full: C.red };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const EMPTY_FORM = {
  name: "",
  partnerName: "",
  address: "",
  description: "",
  phone: "",
  priceFrom: "",
  latitude: "",
  longitude: "",
  externalUrl: "",
  availability: "available",
  dotAccredited: false,
  imageUrl: null,
};

export default function AdminHotelsScreen({ navigation }) {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "hotels"),
      (snap) => {
        setHotels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const pickPhoto = async () => {
    const uri = await pickImageAsDataUri({ aspect: [16, 9] });
    if (uri) set("imageUrl", uri);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter the hotel name to continue.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "hotels"), {
        name: form.name.trim(),
        partnerName: form.partnerName.trim() || null,
        address: form.address.trim(),
        description: form.description.trim(),
        phone: form.phone.trim(),
        priceFrom: Number(form.priceFrom) || 0,
        location: {
          lat: Number(form.latitude) || 0,
          lng: Number(form.longitude) || 0,
        },
        externalBookingUrl: form.externalUrl.trim() || null,
        availabilityStatus: form.availability,
        dotAccredited: form.dotAccredited,
        imageUrl: form.imageUrl || null,
        isPartner: true,
        createdAt: new Date(),
      });
      closeModal();
    } catch (e) {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    Alert.alert("Delete hotel", `"${name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "hotels", id));
          } catch {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  const renderHotel = ({ item }) => {
    const status = item.availabilityStatus || "available";
    const meta = [item.partnerName, item.address].filter(Boolean).join("  ·  ");
    return (
      <View style={styles.card}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.placeholder]}>
            <Ionicons name="image-outline" size={28} color={C.faint} />
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.priceFrom ? (
              <Text style={styles.price}>
                ₱{Number(item.priceFrom).toLocaleString()}
              </Text>
            ) : null}
          </View>
          {meta ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}

          <View style={[styles.row, { marginTop: 10 }]}>
            <View
              style={[
                styles.dot,
                { backgroundColor: STATUS_COLOR[status] || C.green },
              ]}
            />
            <Text style={styles.cardMeta}>{cap(status)}</Text>
            {item.dotAccredited ? (
              <View style={styles.dotBadge}>
                <Ionicons name="shield-checkmark" size={12} color={C.green} />
                <Text style={styles.dotBadgeText}>DOT ACCREDITED</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardActions}>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.externalBookingUrl ? "Booking link set" : "No booking link"}
            </Text>
            <TouchableOpacity
              onPress={() => handleDelete(item.id, item.name)}
              hitSlop={8}
            >
              <Text style={styles.danger}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

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
        <TouchableOpacity onPress={openAdd} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="add" size={16} color={C.navy} />
          <Text style={styles.headerBtnText}>New hotel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Partner hotels</Text>
        <Text style={styles.subtitle}>
          Shown on the tourist homepage. Add a booking link to send guests to the
          hotel's own system.
        </Text>
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.purple} />
          </View>
        ) : (
          <FlatList
            data={hotels}
            keyExtractor={(item) => item.id}
            renderItem={renderHotel}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No partner hotels yet</Text>
                <Text style={styles.emptySub}>
                  Add a hotel with a photo so tourists can find and book it.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                  <Text style={styles.primaryText}>New hotel</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>

      <Modal
        visible={modalOpen}
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
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New partner hotel</Text>
                <TouchableOpacity onPress={closeModal} hitSlop={8}>
                  <Text style={styles.headerLinkDark}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Photo</Text>
                {form.imageUrl ? (
                  <View>
                    <Image source={{ uri: form.imageUrl }} style={styles.preview} />
                    <TouchableOpacity
                      style={styles.removePhoto}
                      onPress={() => set("imageUrl", null)}
                    >
                      <Text style={styles.danger}>Remove photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
                    <Ionicons name="camera-outline" size={24} color={C.purple} />
                    <Text style={styles.photoPickerText}>Add a photo</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.label}>Hotel name</Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => set("name", v)}
                  placeholder="Sipaway Beach Resort"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Partner or owner</Text>
                <TextInput
                  style={styles.input}
                  value={form.partnerName}
                  onChangeText={(v) => set("partnerName", v)}
                  placeholder="Contact name"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={styles.input}
                  value={form.address}
                  onChangeText={(v) => set("address", v)}
                  placeholder="Street, barangay, city"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.description}
                  onChangeText={(v) => set("description", v)}
                  placeholder="Rooms and amenities"
                  placeholderTextColor={C.faint}
                  multiline
                  textAlignVertical="top"
                />

                <View style={styles.inline}>
                  <View style={[styles.flex, { marginRight: 6 }]}>
                    <Text style={styles.label}>Phone</Text>
                    <TextInput
                      style={styles.input}
                      value={form.phone}
                      onChangeText={(v) => set("phone", v)}
                      placeholder="09xxxxxxxxx"
                      placeholderTextColor={C.faint}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.flex, { marginLeft: 6 }]}>
                    <Text style={styles.label}>Price per night (₱)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.priceFrom}
                      onChangeText={(v) => set("priceFrom", v)}
                      placeholder="1500"
                      placeholderTextColor={C.faint}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.inline}>
                  <View style={[styles.flex, { marginRight: 6 }]}>
                    <Text style={styles.label}>Latitude</Text>
                    <TextInput
                      style={styles.input}
                      value={form.latitude}
                      onChangeText={(v) => set("latitude", v)}
                      placeholder="10.48"
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.flex, { marginLeft: 6 }]}>
                    <Text style={styles.label}>Longitude</Text>
                    <TextInput
                      style={styles.input}
                      value={form.longitude}
                      onChangeText={(v) => set("longitude", v)}
                      placeholder="123.41"
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Booking link</Text>
                <TextInput
                  style={styles.input}
                  value={form.externalUrl}
                  onChangeText={(v) => set("externalUrl", v)}
                  placeholder="https://hotel-website.com/book"
                  placeholderTextColor={C.faint}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.hint}>
                  Tourists who tap Book are sent to this page.
                </Text>

                <Text style={styles.label}>Availability</Text>
                <View style={styles.segment}>
                  {STATUSES.map((s) => {
                    const active = form.availability === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.segmentItem, active && styles.segmentActive]}
                        onPress={() => set("availability", s)}
                      >
                        <Text
                          style={[styles.segmentText, active && styles.segmentTextActive]}
                        >
                          {cap(s)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>DOT accredited</Text>
                  <Switch
                    value={form.dotAccredited}
                    onValueChange={(v) => set("dotAccredited", v)}
                    trackColor={{ false: C.border, true: C.green }}
                    thumbColor="#FFFFFF"
                  />
                </View>

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
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryText}>Save hotel</Text>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.navy },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowBetween: { flexDirection: "row", alignItems: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  disabled: { opacity: 0.6 },

  // Header (navy, matches Explore)
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLink: { color: C.faint, fontSize: 15 },
  headerLinkDark: { color: C.muted, fontSize: 15 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
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

  // Hotel card
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
  cardBody: { padding: 14 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  price: { color: C.text, fontSize: 15, fontWeight: "700", marginLeft: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.greenSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  dotBadgeText: { color: C.green, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  danger: { color: C.red, fontSize: 14, fontWeight: "600" },

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
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  secondaryText: { color: C.muted, fontSize: 15, fontWeight: "600" },

  // Form sheet
  overlay: { flex: 1, backgroundColor: "rgba(11,18,36,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "92%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  hint: { color: C.faint, fontSize: 12, marginTop: 6 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  textArea: { minHeight: 84 },
  inline: { flexDirection: "row" },

  // Photo
  photoPicker: {
    height: 120,
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
  preview: { width: "100%", height: 160, borderRadius: 14 },
  removePhoto: { alignSelf: "flex-end", marginTop: 8 },

  // Availability
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
  },
  segmentItem: { flex: 1, paddingVertical: 11, alignItems: "center", backgroundColor: C.bg },
  segmentActive: { backgroundColor: C.navy },
  segmentText: { color: C.muted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
  },
  switchLabel: { color: C.text, fontSize: 15 },

  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
});
