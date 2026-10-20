import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  ActivityIndicator,
  Animated,
  Pressable,
  Dimensions,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

const { width: SCREEN_W } = Dimensions.get("window");

const COLORS = {
  bg: "#F4F6FB",
  surface: "#FFFFFF",
  primary: "#2563EB",
  accent: "#10B981",
  accentSoft: "#ECFDF5",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  navy: "#0B1220",
};

const VEHICLE_ICONS = {
  motor: "🏍️",
  motorcycle: "🏍️",
  "habal-habal": "🏍️",
  boat: "🚤",
  banca: "🚤",
  van: "🚐",
  car: "🚗",
  jeep: "🚌",
  tricycle: "🛺",
  tricyle: "🛺",
  default: "🚗",
};

function ScalePressable({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()
      }
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export default function PackageDetailScreen({ route, navigation }) {
  const { package: pkg, spot } = route.params;
  const [matchingVehicles, setMatchingVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [booking, setBooking] = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(24)).current;

  const legs = pkg.legs || [];
  const totalPrice =
    pkg.totalPrice ||
    legs.reduce((sum, leg) => sum + (Number(leg.estimatedPrice) || 0), 0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 5 }),
    ]).start();
  }, []);

  useEffect(() => {
    const types = [
      ...new Set(legs.map((l) => (l.vehicleType || "").toLowerCase()).filter(Boolean)),
    ];
    if (types.length === 0) {
      setLoadingVehicles(false);
      return;
    }
    const unsub = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const matched = all.filter((v) => {
        const cat = (v.category || "").toLowerCase();
        return types.some((t) => cat.includes(t) || t.includes(cat));
      });
      setMatchingVehicles(matched);
      setLoadingVehicles(false);
    });
    return () => unsub();
  }, [pkg.id]);

  const getIcon = (type) => {
    const t = (type || "").toLowerCase();
    for (const key of Object.keys(VEHICLE_ICONS)) {
      if (t.includes(key)) return VEHICLE_ICONS[key];
    }
    return VEHICLE_ICONS.default;
  };

  const openDirections = (lat, lng) => {
    if (!lat || !lng) {
      Alert.alert("No location", "Location not available.");
      return;
    }
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    );
  };

  const handleBookPackage = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Login required", "Please log in to book a package.");
      return;
    }
    Alert.alert(
      "Confirm booking",
      `Book "${pkg.name}" for ₱${Number(totalPrice).toLocaleString()}?\n\nPay cash to providers along the route.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Book now",
          onPress: async () => {
            try {
              setBooking(true);
              await addDoc(collection(db, "bookings"), {
                type: "package",
                packageId: pkg.id,
                packageName: pkg.name,
                spotId: spot?.id || pkg.spotId,
                spotName: spot?.name || pkg.spotName,
                userId: user.uid,
                totalPrice,
                legs,
                status: "pending_payment",
                createdAt: new Date(),
              });
              Alert.alert(
                "Booked ✅",
                "Your trip package is confirmed. Check Account for details."
              );
              navigation.goBack();
            } catch (e) {
              Alert.alert("Error", "Failed to book. Try again.");
            } finally {
              setBooking(false);
            }
          },
        },
      ]
    );
  };

  const mapLat = spot?.location?.lat || spot?.latitude || 9.3;
  const mapLng = spot?.location?.lng || spot?.longitude || 123.3;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {pkg.imageUrl || spot?.imageUrl ? (
            <Image
              source={{ uri: pkg.imageUrl || spot.imageUrl }}
              style={styles.heroImage}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Text style={{ fontSize: 56 }}>🏝️</Text>
            </View>
          )}
          <View style={styles.heroGradient} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>{pkg.name}</Text>
            <Text style={styles.heroSpot}>
              {spot?.name || pkg.spotName || "Tourist spot"}
            </Text>
          </View>
        </View>

        <Animated.View
          style={{
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
          }}
        >
          {/* Price card */}
          <View style={styles.priceCard}>
            <View>
              <Text style={styles.priceLabel}>Estimated total</Text>
              <Text style={styles.priceValue}>₱{Number(totalPrice).toLocaleString()}</Text>
            </View>
            <View style={styles.chipsRow}>
              {pkg.durationEstimate ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>⏱ {pkg.durationEstimate}</Text>
                </View>
              ) : null}
              {pkg.roundTrip ? (
                <View style={[styles.chip, styles.chipBlue]}>
                  <Text style={[styles.chipText, { color: COLORS.primary }]}>🔄 Round trip</Text>
                </View>
              ) : null}
            </View>
          </View>

          {pkg.description ? (
            <Text style={styles.description}>{pkg.description}</Text>
          ) : null}

          {/* Timeline itinerary */}
          <Text style={styles.sectionTitle}>Itinerary</Text>
          <View style={styles.timeline}>
            {legs.length === 0 ? (
              <Text style={styles.emptyText}>No legs defined.</Text>
            ) : (
              legs.map((leg, index) => {
                const isLast = index === legs.length - 1;
                return (
                  <View key={index} style={styles.timelineRow}>
                    <View style={styles.timelineLeft}>
                      <View style={styles.timelineDot}>
                        <Text style={styles.timelineDotText}>{index + 1}</Text>
                      </View>
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>
                    <View style={[styles.legCard, isLast && { marginBottom: 0 }]}>
                      <View style={styles.legHeader}>
                        <Text style={styles.legIcon}>{getIcon(leg.vehicleType)}</Text>
                        <Text style={styles.legType}>
                          {(leg.vehicleType || "Transport").toUpperCase()}
                        </Text>
                        {leg.estimatedPrice != null && Number(leg.estimatedPrice) > 0 && (
                          <Text style={styles.legPrice}>
                            ₱{Number(leg.estimatedPrice).toLocaleString()}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.legRoute}>
                        {leg.fromLabel || "Start"}  →  {leg.toLabel || "Next"}
                      </Text>
                      {leg.description ? (
                        <Text style={styles.legDesc}>{leg.description}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Map */}
          <Text style={styles.sectionTitle}>Map & directions</Text>
          <View style={styles.mapCard}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: Number(mapLat),
                longitude: Number(mapLng),
                latitudeDelta: 0.06,
                longitudeDelta: 0.06,
              }}
            >
              <Marker
                coordinate={{ latitude: Number(mapLat), longitude: Number(mapLng) }}
                title={spot?.name || pkg.name}
                pinColor="#F59E0B"
              />
            </MapView>
            <ScalePressable
              style={styles.mapBtn}
              onPress={() => openDirections(mapLat, mapLng)}
            >
              <Text style={styles.mapBtnText}>Open in Google Maps  ↗</Text>
            </ScalePressable>
          </View>

          {/* Matching vehicles */}
          <Text style={styles.sectionTitle}>Transport from drivers</Text>
          <Text style={styles.sectionHint}>
            Vehicles matching this package’s leg types
          </Text>
          {loadingVehicles ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />
          ) : matchingVehicles.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No matching vehicles online. You can still book and arrange on-site.
              </Text>
            </View>
          ) : (
            matchingVehicles.slice(0, 8).map((v) => (
              <View key={v.id} style={styles.vehicleRow}>
                <View style={styles.vehicleIconWrap}>
                  <Text style={{ fontSize: 22 }}>{getIcon(v.category)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>
                    {(v.category || "Vehicle").replace("_", " ")}
                    {v.model ? ` · ${v.model}` : ""}
                  </Text>
                  <Text style={styles.vehicleSub}>
                    {v.plate ? `Plate ${v.plate}` : "Available"}
                    {v.price ? `  ·  ₱${v.price}` : ""}
                  </Text>
                </View>
                <View style={styles.availableDot} />
              </View>
            ))
          )}
        </Animated.View>
      </ScrollView>

      {/* Sticky book bar */}
      <View style={styles.bookBar}>
        <View>
          <Text style={styles.bookBarLabel}>Total</Text>
          <Text style={styles.bookBarPrice}>₱{Number(totalPrice).toLocaleString()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.bookBtn, booking && { opacity: 0.7 }]}
          onPress={handleBookPackage}
          disabled={booking}
          activeOpacity={0.9}
        >
          {booking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.bookBtnText}>Book package</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  hero: { height: 240, backgroundColor: COLORS.navy, position: "relative" },
  heroImage: { width: "100%", height: 240 },
  heroPlaceholder: { justifyContent: "center", alignItems: "center" },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,18,32,0.45)",
  },
  backBtn: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnText: { color: "#fff", fontSize: 20, fontWeight: "600" },
  heroTextWrap: { position: "absolute", bottom: 20, left: 20, right: 20 },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.4 },
  heroSpot: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 4 },

  priceCard: {
    marginHorizontal: 16,
    marginTop: -18,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  priceLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "500" },
  priceValue: { fontSize: 28, fontWeight: "800", color: COLORS.accent, letterSpacing: -0.5 },
  chipsRow: { alignItems: "flex-end", gap: 6 },
  chip: {
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  chipBlue: { backgroundColor: "#EFF6FF" },
  chipText: { fontSize: 11, fontWeight: "700", color: "#047857" },

  description: {
    marginHorizontal: 20,
    marginTop: 16,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginHorizontal: 20,
    marginTop: -8,
    marginBottom: 10,
  },

  timeline: { marginHorizontal: 16 },
  timelineRow: { flexDirection: "row" },
  timelineLeft: { width: 36, alignItems: "center" },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  timelineDotText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#BFDBFE",
    marginVertical: 2,
  },
  legCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    marginLeft: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  legIcon: { fontSize: 18, marginRight: 6 },
  legType: { fontSize: 12, fontWeight: "800", color: COLORS.text, flex: 1 },
  legPrice: { fontSize: 14, fontWeight: "800", color: COLORS.accent },
  legRoute: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginTop: 2 },
  legDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

  mapCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  map: { height: 160, width: "100%" },
  mapBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 13,
    alignItems: "center",
  },
  mapBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  emptyBox: {
    marginHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: "center" },

  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  vehicleName: { fontSize: 14, fontWeight: "700", color: COLORS.text, textTransform: "capitalize" },
  vehicleSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  availableDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },

  bookBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  bookBarLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: "500" },
  bookBarPrice: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  bookBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 150,
    alignItems: "center",
  },
  bookBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
