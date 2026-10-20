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
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

/**
 * Partner hotels: admin adds hotels that appear for tourists.
 * externalBookingUrl = link to the hotel's existing booking system
 * availabilityStatus = manual status the partner/admin updates
 */
const STATUSES = ["available", "limited", "full"];

export default function AdminHotelsScreen({ navigation }) {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [availability, setAvailability] = useState("available");
  const [dotAccredited, setDotAccredited] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "hotels"), (snap) => {
      setHotels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const reset = () => {
    setName("");
    setAddress("");
    setDescription("");
    setPhone("");
    setPriceFrom("");
    setLatitude("");
    setLongitude("");
    setExternalUrl("");
    setPartnerName("");
    setAvailability("available");
    setDotAccredited(false);
  };

  const closeModal = () => {
    setModalVisible(false);
    reset();
  };

  const openAdd = () => {
    reset();
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Enter the hotel name to continue.");
      return;
    }
    try {
      setSaving(true);
      await addDoc(collection(db, "hotels"), {
        name: name.trim(),
        address: address.trim(),
        description: description.trim(),
        phone: phone.trim(),
        priceFrom: Number(priceFrom) || 0,
        location: {
          lat: Number(latitude) || 0,
          lng: Number(longitude) || 0,
        },
        externalBookingUrl: externalUrl.trim() || null,
        partnerName: partnerName.trim() || null,
        availabilityStatus: availability,
        isPartner: true,
        dotAccredited,
        createdAt: new Date(),
      });
      closeModal();
    } catch (e) {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, n) => {
    Alert.alert("Delete hotel", `"${n}" will be permanently removed.`, [
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

  const statusColor = (s) => {
    if (s === "limited") return C.warn;
    if (s === "full") return C.danger;
    return C.ok;
  };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const renderHotel = ({ item }) => {
    const status = item.availabilityStatus || "available";
    const sub = [item.partnerName, item.address].filter(Boolean).join("   ");
    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {sub ? (
              <Text style={styles.rowMeta} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
          {item.priceFrom ? (
            <Text style={styles.rowPrice}>
              ₱{Number(item.priceFrom).toLocaleString()}
            </Text>
          ) : null}
        </View>

        <View style={styles.statusLine}>
          <View style={[styles.dot, { backgroundColor: statusColor(status) }]} />
          <Text style={styles.statusText}>{cap(status)}</Text>
          {item.dotAccredited ? (
            <Text style={styles.statusText}>   DOT accredited</Text>
          ) : null}
        </View>

        <Text
          style={item.externalBookingUrl ? styles.link : styles.noLink}
          numberOfLines={1}
        >
          {item.externalBookingUrl || "No booking link"}
        </Text>

        <View style={styles.rowActions}>
          <TouchableOpacity
            onPress={() => handleDelete(item.id, item.name)}
            hitSlop={8}
          >
            <Text style={[styles.actionText, styles.actionDanger]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
          <Text style={styles.headerAction}>New hotel</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Partner hotels</Text>
      <Text style={styles.intro}>
        Hotels appear on the tourist homepage. Add a booking link to connect
        their own system, such as their website or Booking.com.
      </Text>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.muted} />
        </View>
      ) : (
        <FlatList
          data={hotels}
          keyExtractor={(item) => item.id}
          renderItem={renderHotel}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No partner hotels yet</Text>
              <Text style={styles.emptySub}>
                Add your first hotel so tourists can find and book it.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                <Text style={styles.primaryText}>New hotel</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>New partner hotel</Text>
                <TouchableOpacity onPress={closeModal} hitSlop={8}>
                  <Text style={styles.headerLink}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Hotel name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Sipaway Beach Resort"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Partner or owner</Text>
                <TextInput
                  style={styles.input}
                  value={partnerName}
                  onChangeText={setPartnerName}
                  placeholder="Contact name"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street, barangay, city"
                  placeholderTextColor={C.faint}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Rooms and amenities"
                  placeholderTextColor={C.faint}
                  multiline
                  textAlignVertical="top"
                />

                <View style={styles.inline}>
                  <View style={[styles.flex, styles.gapRight]}>
                    <Text style={styles.label}>Phone</Text>
                    <TextInput
                      style={styles.input}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="09xxxxxxxxx"
                      placeholderTextColor={C.faint}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.flex, styles.gapLeft]}>
                    <Text style={styles.label}>Price per night (₱)</Text>
                    <TextInput
                      style={styles.input}
                      value={priceFrom}
                      onChangeText={setPriceFrom}
                      placeholder="1500"
                      placeholderTextColor={C.faint}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.inline}>
                  <View style={[styles.flex, styles.gapRight]}>
                    <Text style={styles.label}>Latitude</Text>
                    <TextInput
                      style={styles.input}
                      value={latitude}
                      onChangeText={setLatitude}
                      placeholder="10.48"
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.flex, styles.gapLeft]}>
                    <Text style={styles.label}>Longitude</Text>
                    <TextInput
                      style={styles.input}
                      value={longitude}
                      onChangeText={setLongitude}
                      placeholder="123.41"
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Booking link</Text>
                <TextInput
                  style={styles.input}
                  value={externalUrl}
                  onChangeText={setExternalUrl}
                  placeholder="https://hotel-website.com/book"
                  placeholderTextColor={C.faint}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.hint}>
                  Tourists who tap Book will be sent to this page.
                </Text>

                <Text style={styles.label}>Availability</Text>
                <View style={styles.segment}>
                  {STATUSES.map((s, i) => {
                    const active = availability === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.segmentItem,
                          i > 0 && styles.segmentDivider,
                          active && styles.segmentActive,
                        ]}
                        onPress={() => setAvailability(s)}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active && styles.segmentTextActive,
                          ]}
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
                    value={dotAccredited}
                    onValueChange={setDotAccredited}
                    trackColor={{ false: C.border, true: C.ok }}
                    thumbColor={C.text}
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
                      <ActivityIndicator color={C.bg} size="small" />
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

// Palette
const C = {
  bg: "#0E1116",
  surface: "#151A21",
  border: "#232A33",
  text: "#E8EAED",
  muted: "#8A929E",
  faint: "#566070",
  danger: "#E5736B",
  warn: "#D9A441",
  ok: "#4CAF86",
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
  },
  intro: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 12,
  },

  // List
  listContent: { paddingHorizontal: 24, paddingBottom: 48, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Empty
  empty: { paddingTop: 72, alignItems: "flex-start" },
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

  // Hotel row
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
  statusLine: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  statusText: { color: C.muted, fontSize: 13 },
  link: { color: C.muted, fontSize: 13, marginTop: 8 },
  noLink: { color: C.faint, fontSize: 13, marginTop: 8 },
  rowActions: { flexDirection: "row", gap: 24, marginTop: 14 },
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
  hint: { color: C.faint, fontSize: 13, lineHeight: 19, marginTop: 8 },
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

  // Segmented control
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: C.bg,
  },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: C.border },
  segmentActive: { backgroundColor: C.text },
  segmentText: { color: C.muted, fontSize: 14, fontWeight: "500" },
  segmentTextActive: { color: C.bg, fontWeight: "600" },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
  },
  switchLabel: { color: C.text, fontSize: 15 },

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