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

// Starter list: San Carlos City hotels
const STARTER_HOTELS = [
  { name: "Ma. Awani Hotel & Suites", phone: "0917-146-9562", email: "Awanihot2019@yahoo.com", facebookName: "Ma. Awani Hotel & Suites", facebookUrl: "https://www.facebook.com/share/19WZ3E72jg/?mibextid=wwXIfr", address: "East Euzkara Avenue, Brgy. Palampas, San Carlos City, Negros Occidental", priceFrom: 2299 },
  { name: "Belladama Hotel", phone: "0936-901-1938", email: "belladama.social@gmail.com", facebookName: "Belladama", facebookUrl: "https://www.facebook.com/share/18EisD5sV9/?mibextid=wwXIfr", address: "120 Broce Street, San Carlos City, Negros Occidental", priceFrom: 1000 },
  { name: "Dragon Inn", phone: "0947-418-5959", priceFrom: 650 },
  { name: "Amu Visitors Inn", phone: "0939-184-3235", address: "Locsin St, San Carlos City", priceFrom: 500 },
  { name: "Carmel's Inn", phone: "0933-818-1319", email: "carmelsinn@gmail.com", facebookName: "Carmel's Inn", facebookUrl: "https://www.facebook.com/share/1CxZwhHVpv/?mibextid=wwXIfr", address: "C.L Ledesma Sr. Avenue, San Carlos City, Negros Occidental", priceFrom: 1290 },
  { name: "Mom's Small Hotel & Restaurant", phone: "0927 697 3031 / 0969 545 9405", facebookName: "Mom's Small Hotel & Restaurant", facebookUrl: "https://www.facebook.com/share/1A21no5yL7/?mibextid=wwXIfr", address: "F.C Ledesma Avenue", priceFrom: 850 },
  { name: "San Carlos Palau Hotel Inc", phone: "0977-715-5001", email: "palauhotel.scc@gmail.com", facebookName: "Palau Hotel", facebookUrl: "https://www.facebook.com/share/1ABZ3KHwBf/?mibextid=wwXIfr", address: "Locsin St. Corner Burgos St. Brgy.6", priceFrom: 1850 },
  { name: "Meg's Resort", phone: "0968-881-2493", email: "megsrestaurant2025@gmail.com", facebookName: "Meg's Resort", facebookUrl: "https://www.facebook.com/share/19b2E2Rrh4/?mibextid=wwXIfr", address: "Eco-Translink Highway, San Carlos City", priceFrom: 1999 },
  { name: "FB Travellers Inn", phone: "0932-205-5888", email: "fbtravellersinn@yahoo.com", facebookName: "FB Travellers INN", facebookUrl: "https://www.facebook.com/share/1DXNjA4Qht/?mibextid=wwXIfr", address: "Eco Tourism Highway, Don Juan Subd.", priceFrom: 850 },
  { name: "Skyland Hotel and Restaurant", phone: "0908-669-2735 / 0916-282-4602", priceFrom: 725 },
];

const EMPTY = {
  name: "",
  partnerName: "",
  phone: "",
  email: "",
  facebookName: "",
  facebookUrl: "",
  address: "",
  description: "",
  priceFrom: "",
  latitude: "",
  longitude: "",
  externalUrl: "",
  availability: "available",
  dotAccredited: false,
  imageUrl: null,
};

const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);

const toForm = (h) => ({
  ...EMPTY,
  name: h.name || "",
  partnerName: h.partnerName || "",
  phone: h.phone || "",
  email: h.email || "",
  facebookName: h.facebookName || "",
  facebookUrl: h.facebookUrl || "",
  address: h.address || "",
  description: h.description || "",
  priceFrom: h.priceFrom ? String(h.priceFrom) : "",
  latitude: h.location?.lat ? String(h.location.lat) : "",
  longitude: h.location?.lng ? String(h.location.lng) : "",
  externalUrl: h.externalBookingUrl || "",
  availability: h.availabilityStatus || "available",
  dotAccredited: !!h.dotAccredited,
  imageUrl: h.imageUrl || null,
});

const toPayload = (f) => {
  const lat = parseFloat(f.latitude);
  const lng = parseFloat(f.longitude);
  return {
    name: f.name.trim(),
    partnerName: clean(f.partnerName),
    phone: clean(f.phone),
    email: clean(f.email),
    facebookName: clean(f.facebookName),
    facebookUrl: clean(f.facebookUrl),
    address: clean(f.address),
    description: clean(f.description),
    priceFrom: parseFloat(f.priceFrom) || 0,
    location: !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null,
    externalBookingUrl: clean(f.externalUrl),
    availabilityStatus: f.availability,
    dotAccredited: !!f.dotAccredited,
    imageUrl: f.imageUrl || null,
    isPartner: true,
    updatedAt: new Date(),
  };
};

// Reusable labelled input
function Field({ label, optional, multiline, ...inputProps }) {
  return (
    <View>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}>  optional</Text> : null}
      </Text>
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

export default function AdminHotelsScreen({ navigation }) {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // "list" | "form"
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setView("form");
  };

  const openEdit = (h) => {
    setEditingId(h.id);
    setForm(toForm(h));
    setView("form");
  };

  const closeForm = () => {
    setView("list");
    setEditingId(null);
    setForm(EMPTY);
  };

  const pickPhoto = async () => {
    const uri = await pickImageAsDataUri({ aspect: [16, 9] });
    if (uri) set("imageUrl", uri);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter the hotel name.");
      return;
    }
    const hasContact = [form.phone, form.email, form.facebookName, form.facebookUrl, form.externalUrl]
      .some((v) => v && v.trim());
    if (!hasContact) {
      Alert.alert(
        "Add a contact",
        "Enter at least a phone number, email, Facebook page, or booking link so tourists can reach the hotel."
      );
      return;
    }

    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editingId) {
        await updateDoc(doc(db, "hotels", editingId), payload);
      } else {
        await addDoc(collection(db, "hotels"), { ...payload, createdAt: new Date() });
      }
      closeForm();
    } catch (e) {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (h) => {
    Alert.alert("Delete hotel", `"${h.name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "hotels", h.id));
          } catch {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  const importStarter = () => {
    Alert.alert(
      `Import ${STARTER_HOTELS.length} hotels`,
      "Add the San Carlos City hotels to your list? You can edit each one afterwards.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          onPress: async () => {
            setImporting(true);
            try {
              for (const h of STARTER_HOTELS) {
                const payload = toPayload({
                  ...EMPTY,
                  name: h.name,
                  phone: h.phone || "",
                  email: h.email || "",
                  facebookName: h.facebookName || "",
                  facebookUrl: h.facebookUrl || "",
                  address: h.address || "",
                  priceFrom: String(h.priceFrom || ""),
                });
                await addDoc(collection(db, "hotels"), { ...payload, createdAt: new Date() });
              }
            } catch {
              Alert.alert("Import stopped", "Some hotels may not have been added. Check the list before importing again.");
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  const renderHotel = ({ item }) => {
    const status = item.availabilityStatus || "available";
    const contact =
      [item.phone, item.email].filter(Boolean)[0] || item.facebookName || "No contact";
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.85}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.placeholder]}>
            <Text style={styles.placeholderText}>{item.name?.charAt(0)?.toUpperCase() || "H"}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.priceFrom ? (
              <Text style={styles.price}>₱{Number(item.priceFrom).toLocaleString()}</Text>
            ) : null}
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {contact}
          </Text>
          {item.address ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}

          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] || C.green }]} />
            <Text style={styles.cardMeta}>{cap(status)}</Text>
            {item.dotAccredited ? (
              <View style={styles.dotBadge}>
                <Ionicons name="shield-checkmark" size={12} color={C.green} />
                <Text style={styles.dotBadgeText}>DOT ACCREDITED</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardActions}>
            <Text style={styles.link}>Tap to edit</Text>
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
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
          <TouchableOpacity onPress={openNew} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="add" size={16} color={C.navy} />
            <Text style={styles.headerBtnText}>New hotel</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{isForm ? (editingId ? "Edit hotel" : "New hotel") : "Partner hotels"}</Text>
        <Text style={styles.subtitle}>
          {isForm
            ? "Fill in what you have. Only the name and one contact are required."
            : "Shown on the tourist homepage with their photo and contact details."}
        </Text>
      </View>

      <View style={styles.content}>
        {isForm ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formContent}
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

            <Field label="Hotel name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="Ma. Awani Hotel & Suites" />
            <Field label="Owner or contact person" optional value={form.partnerName} onChangeText={(v) => set("partnerName", v)} placeholder="Name" />

            <Text style={styles.section}>Contact</Text>
            <Field label="Phone" value={form.phone} onChangeText={(v) => set("phone", v)} placeholder="0917-146-9562" keyboardType="phone-pad" />
            <Field label="Email" optional value={form.email} onChangeText={(v) => set("email", v)} placeholder="hotel@email.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Facebook page name" optional value={form.facebookName} onChangeText={(v) => set("facebookName", v)} placeholder="Ma. Awani Hotel & Suites" />
            <Field label="Facebook link" optional value={form.facebookUrl} onChangeText={(v) => set("facebookUrl", v)} placeholder="https://facebook.com/..." keyboardType="url" autoCapitalize="none" />
            <Field label="Booking link" optional value={form.externalUrl} onChangeText={(v) => set("externalUrl", v)} placeholder="https://hotel-website.com/book" keyboardType="url" autoCapitalize="none" />
            <Text style={styles.hint}>Tourists who tap Book are sent to the booking link. Without one, they see the contact options.</Text>

            <Text style={styles.section}>Location and price</Text>
            <Field label="Address" optional value={form.address} onChangeText={(v) => set("address", v)} placeholder="Street, barangay, city" />
            <Field label="Price per night (₱)" optional value={form.priceFrom} onChangeText={(v) => set("priceFrom", v)} placeholder="1500" keyboardType="numeric" />
            <View style={styles.inline}>
              <View style={[styles.flex, { marginRight: 6 }]}>
                <Field label="Latitude" optional value={form.latitude} onChangeText={(v) => set("latitude", v)} placeholder="10.48" keyboardType="decimal-pad" />
              </View>
              <View style={[styles.flex, { marginLeft: 6 }]}>
                <Field label="Longitude" optional value={form.longitude} onChangeText={(v) => set("longitude", v)} placeholder="123.41" keyboardType="decimal-pad" />
              </View>
            </View>
            <Field label="Description" optional multiline value={form.description} onChangeText={(v) => set("description", v)} placeholder="Rooms and amenities" />

            <Text style={styles.section}>Status</Text>
            <View style={styles.segment}>
              {STATUSES.map((s) => {
                const active = form.availability === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.segmentItem, active && styles.segmentActive]}
                    onPress={() => set("availability", s)}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{cap(s)}</Text>
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

            {editingId ? (
              <TouchableOpacity style={styles.deleteFull} onPress={() => handleDelete({ id: editingId, name: form.name })}>
                <Text style={styles.danger}>Delete this hotel</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : loading ? (
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
                <Text style={styles.emptySub}>Add a hotel one at a time, or import the San Carlos City list.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={openNew}>
                  <Text style={styles.primaryText}>New hotel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10 }, importing && styles.disabled]} onPress={importStarter} disabled={importing}>
                  {importing ? (
                    <ActivityIndicator color={C.muted} size="small" />
                  ) : (
                    <Text style={styles.secondaryText}>Import {STARTER_HOTELS.length} San Carlos hotels</Text>
                  )}
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
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
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
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
    justifyContent: "center",
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
  placeholderText: { color: C.purple, fontSize: 36, fontWeight: "800" },
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
  link: { color: C.purple, fontSize: 14, fontWeight: "600" },
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
    alignSelf: "stretch",
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: C.card,
  },
  secondaryText: { color: C.muted, fontSize: 15, fontWeight: "600" },
  deleteFull: { alignItems: "center", paddingVertical: 20, marginTop: 10 },

  // Form
  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  optional: { color: C.faint, fontSize: 12, fontWeight: "400" },
  section: {
    color: C.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 26,
    marginBottom: 2,
  },
  hint: { color: C.faint, fontSize: 12, marginTop: 6, lineHeight: 17 },
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

  // Status
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: C.card,
  },
  segmentItem: { flex: 1, paddingVertical: 11, alignItems: "center" },
  segmentActive: { backgroundColor: C.navy },
  segmentText: { color: C.muted, fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: "#FFFFFF" },
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
});