import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Linking,
  Alert,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TOURISM_OFFICE } from "../constants/tourismOffice";

const { width: W } = Dimensions.get("window");

const C = {
  navy: "#0B1224",
  purple: "#7C3AED",
  purpleSoft: "#F1EAFE",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E5E7EB",
  amber: "#B45309",
  amberSoft: "#FEF3C7",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export default function PackageDetailScreen({ navigation, route }) {
  const { package: pkg, spot } = route.params || {};
  const [photoIndex, setPhotoIndex] = useState(0);

  // All photos for this package: the package photo, any extra photos, then the spot photo
  const extra = Array.isArray(pkg?.imageUrls) ? pkg.imageUrls : [];
  const photos = [...new Set([pkg?.imageUrl, ...extra, spot?.imageUrl].filter(Boolean))];

  const legs = pkg?.legs || [];
  const total =
    pkg?.totalPrice ||
    pkg?.price ||
    legs.reduce((sum, l) => sum + (Number(l.estimatedPrice) || 0), 0);
  const duration = pkg?.durationEstimate || pkg?.duration;

  const callOffice = () => {
    if (!TOURISM_OFFICE.phone) {
      Alert.alert("No number", "The tourism office number is not set yet.");
      return;
    }
    Linking.openURL(`tel:${TOURISM_OFFICE.phone}`).catch(() =>
      Alert.alert("Can't call", TOURISM_OFFICE.phone)
    );
  };

  const openDirections = () => {
    if (!spot?.latitude || !spot?.longitude) return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}&travelmode=driving`
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Package details
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Photos */}
        {photos.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) =>
                setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / W))
              }
            >
              {photos.map((uri, i) => (
                <Image key={`${uri.slice(0, 30)}-${i}`} source={{ uri }} style={styles.photo} />
              ))}
            </ScrollView>
            {photos.length > 1 ? (
              <View style={styles.dots}>
                {photos.map((_, i) => (
                  <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.photo, styles.placeholder]}>
            <Ionicons name="image-outline" size={40} color={C.faint} />
            <Text style={styles.placeholderText}>No photos yet</Text>
          </View>
        )}

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.title}>{pkg?.name || "Trip package"}</Text>
          {spot?.name ? <Text style={styles.spotName}>{spot.name}</Text> : null}

          <View style={styles.chips}>
            {duration ? (
              <View style={styles.chip}>
                <Ionicons name="time-outline" size={14} color={C.purple} />
                <Text style={styles.chipText}>{duration}</Text>
              </View>
            ) : null}
            {pkg?.roundTrip ? (
              <View style={styles.chip}>
                <Ionicons name="repeat-outline" size={14} color={C.purple} />
                <Text style={styles.chipText}>Round trip</Text>
              </View>
            ) : null}
          </View>

          {pkg?.description ? <Text style={styles.description}>{pkg.description}</Text> : null}
        </View>

        {/* Route */}
        {legs.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route</Text>
            {legs.map((leg, i) => (
              <View key={i} style={styles.legRow}>
                <View style={styles.legNum}>
                  <Text style={styles.legNumText}>{i + 1}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.legTitle}>{cap(leg.vehicleType || "Ride")}</Text>
                  <Text style={styles.legMeta} numberOfLines={2}>
                    {(leg.fromSpot || leg.fromLabel || "Start")} to {(leg.toSpot || leg.toLabel || "End")}
                  </Text>
                  {Number(leg.estimatedPrice) > 0 ? (
                    <Text style={styles.legMeta}>
                      About ₱{Number(leg.estimatedPrice).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {total > 0 ? (
              <Text style={styles.estimate}>
                Estimated total: ₱{Number(total).toLocaleString()}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Notice */}
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={C.amber} />
          <Text style={styles.noticeText}>
            This app does not take payments or bookings. Prices are estimates. To arrange this trip,
            contact the tourism office or the providers directly.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity style={styles.primaryBtn} onPress={callOffice} activeOpacity={0.85}>
          <Ionicons name="call-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryText}>Call tourism office</Text>
        </TouchableOpacity>

        {spot?.latitude && spot?.longitude ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={openDirections} activeOpacity={0.85}>
            <Ionicons name="navigate-outline" size={16} color={C.purple} />
            <Text style={styles.secondaryText}>Directions to {spot.name || "the spot"}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text, flex: 1, textAlign: "center" },

  content: { paddingBottom: 40 },

  photo: { width: W, height: 260 },
  placeholder: { backgroundColor: C.purpleSoft, justifyContent: "center", alignItems: "center", gap: 6 },
  placeholderText: { color: C.muted, fontSize: 13 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive: { backgroundColor: C.purple, width: 16 },

  section: { backgroundColor: C.card, marginTop: 12, padding: 18 },
  title: { fontSize: 22, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
  spotName: { fontSize: 14, color: C.purple, fontWeight: "700", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.purpleSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  chipText: { color: C.purple, fontSize: 12, fontWeight: "700" },
  description: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 12 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: C.text, marginBottom: 12 },
  legRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  legNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.purple,
    justifyContent: "center",
    alignItems: "center",
  },
  legNumText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  legTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  legMeta: { fontSize: 13, color: C.muted, marginTop: 2 },
  estimate: { fontSize: 14, fontWeight: "800", color: C.text, marginTop: 4 },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: C.amberSoft,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  noticeText: { flex: 1, color: C.amber, fontSize: 13, lineHeight: 19 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.navy,
    marginHorizontal: 16,
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 12,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.card,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryText: { color: C.purple, fontWeight: "700", fontSize: 15 },
});