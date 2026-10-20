import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TextInput, Image,
  TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator,
  PanResponder, Animated, Linking, Modal, Dimensions, Pressable,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db } from "../../firebaseConfig";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { TOURISM_OFFICE } from "../constants/tourismOffice";

const { width: SCREEN_W } = Dimensions.get("window");
const RADIUS_KM = 80;

const COLORS = {
  bg: "#F4F6FB",
  surface: "#FFFFFF",
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  accent: "#10B981",
  accentSoft: "#ECFDF5",
  purple: "#7C3AED",
  purpleSoft: "#F3E8FF",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  danger: "#EF4444",
  navy: "#0B1220",
};

const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function ScalePressable({ children, onPress, style, activeOpacity = 0.92 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export default function MapScreen({ navigation }) {
  const [userLocation, setUserLocation] = useState(null);
  const [allSpots, setAllSpots] = useState([]);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [filteredSpots, setFilteredSpots] = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [nearbyVehicles, setNearbyVehicles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [spotsLoading, setSpotsLoading] = useState(true);
  const [renterInfo, setRenterInfo] = useState(null);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [spotPackages, setSpotPackages] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [mapExpanded, setMapExpanded] = useState(false);

  const modalSlide = useRef(new Animated.Value(400)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentOffset = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragDistance.current = 0;
        pan.setOffset({ x: currentOffset.current.x, y: currentOffset.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
        dragDistance.current = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        pan.setValue({ x: gs.dx, y: gs.dy });
      },
      onPanResponderRelease: (_, gs) => {
        pan.flattenOffset();
        currentOffset.current = {
          x: currentOffset.current.x + gs.dx,
          y: currentOffset.current.y + gs.dy,
        };
      },
    })
  ).current;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    const fetchRenterInfo = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) setRenterInfo(snap.data());
    };
    fetchRenterInfo();
  }, []);

  useEffect(() => {
    setSpotsLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "touristSpots"),
      (snapshot) => {
        const spots = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          latitude: d.data().location?.lat ?? d.data().latitude ?? 0,
          longitude: d.data().location?.lng ?? d.data().longitude ?? 0,
        }));
        setAllSpots(spots);
        setSpotsLoading(false);
      },
      () => setSpotsLoading(false)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "tripPackages"), (snapshot) => {
      setAllPackages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "hotels"), (snapshot) => {
      setHotels(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userLocation || allSpots.length === 0) {
      setNearbySpots(allSpots);
      return;
    }
    setNearbySpots(
      allSpots
        .map((spot) => ({
          ...spot,
          distance: getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            spot.latitude,
            spot.longitude
          ),
        }))
        .filter((s) => s.distance <= RADIUS_KM)
        .sort((a, b) => a.distance - b.distance)
    );
  }, [userLocation, allSpots]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSpots(nearbySpots);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredSpots(
        nearbySpots.filter(
          (spot) =>
            spot.name?.toLowerCase().includes(q) ||
            spot.category?.toLowerCase().includes(q)
        )
      );
    }
  }, [searchQuery, nearbySpots]);

  useEffect(() => {
    if (!userLocation) return;
    const unsubscribe = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      const vehicles = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (v) =>
            v.isAvailable !== false &&
            typeof v.lat === "number" &&
            typeof v.lng === "number"
        )
        .filter(
          (v) =>
            getDistanceKm(userLocation.latitude, userLocation.longitude, v.lat, v.lng) <=
            RADIUS_KM
        );
      setNearbyVehicles(vehicles);
    });
    return () => unsubscribe();
  }, [userLocation]);

  const openSpotPackages = (spot) => {
    setSelectedSpot(spot);
    setSpotPackages(allPackages.filter((p) => p.spotId === spot.id));
    modalSlide.setValue(420);
    modalOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(modalSlide, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }),
      Animated.timing(modalOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const closeSpotModal = () => {
    Animated.parallel([
      Animated.timing(modalSlide, { toValue: 420, duration: 200, useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setSelectedSpot(null));
  };

  const openHotelBooking = (hotel) => {
    if (hotel.externalBookingUrl) {
      Linking.openURL(hotel.externalBookingUrl);
      return;
    }
    Alert.alert(
      hotel.name,
      (hotel.description || "Partner hotel") +
        (hotel.phone ? "\n\n📞 " + hotel.phone : "") +
        (hotel.address ? "\n📍 " + hotel.address : "") +
        "\n\nStatus: " + (hotel.availabilityStatus || "available").toUpperCase() +
        (hotel.dotAccredited ? "\n✅ DOT Accredited" : ""),
      [
        { text: "Close", style: "cancel" },
        hotel.location?.lat
          ? {
              text: "Directions",
              onPress: () =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${hotel.location.lat},${hotel.location.lng}&travelmode=driving`
                ),
            }
          : null,
      ].filter(Boolean)
    );
  };

  const openTourismOfficeDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${TOURISM_OFFICE.latitude},${TOURISM_OFFICE.longitude}&travelmode=driving`;
    Linking.openURL(url);
  };

  const handleGoToPayment = (vehicle) => {
    if (!auth.currentUser) {
      Alert.alert("Login required", "Please log in to rent a vehicle.");
      return;
    }
    navigation.navigate("Payment", {
      vehicle,
      renterName: renterInfo?.username || "Guest",
    });
  };

  const renderSpot = ({ item, index }) => {
    const distance =
      item.distance != null
        ? item.distance.toFixed(1)
        : userLocation
        ? getDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            item.latitude,
            item.longitude
          ).toFixed(1)
        : "—";
    const pkgCount = allPackages.filter((p) => p.spotId === item.id).length;

    return (
      <ScalePressable onPress={() => openSpotPackages(item)} style={[styles.spotCard, { marginLeft: index === 0 ? 20 : 0 }]}>
        <View style={styles.spotImageWrap}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.spotImage} resizeMode="cover" />
          ) : (
            <View style={[styles.spotImage, styles.spotImagePlaceholder]}>
              <Text style={{ fontSize: 40 }}>🏝️</Text>
            </View>
          )}
          <View style={styles.distancePill}>
            <Text style={styles.distancePillText}>{distance} km</Text>
          </View>
          {pkgCount > 0 && (
            <View style={styles.pkgPill}>
              <Text style={styles.pkgPillText}>🎒 {pkgCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.spotName} numberOfLines={1}>{item.name}</Text>
        {item.category ? (
          <Text style={styles.spotCategory} numberOfLines={1}>{item.category}</Text>
        ) : null}
        <View style={styles.spotCta}>
          <Text style={styles.spotCtaText}>
            {pkgCount > 0 ? "View packages" : "View spot"}
          </Text>
          <Text style={styles.spotCtaArrow}>→</Text>
        </View>
      </ScalePressable>
    );
  };

  const renderVehicle = ({ item, index }) => {
    const distance = getDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      item.lat,
      item.lng
    ).toFixed(1);
    return (
      <ScalePressable
        onPress={() => handleGoToPayment(item)}
        style={[styles.vehicleCard, { marginLeft: index === 0 ? 20 : 0 }]}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.vehicleImage} resizeMode="cover" />
        ) : (
          <View style={[styles.vehicleImage, styles.vehicleImagePlaceholder]}>
            <Text style={{ fontSize: 28 }}>🚗</Text>
          </View>
        )}
        <Text style={styles.vehicleTitle} numberOfLines={1}>
          {(item.category || "Vehicle").replace("_", " ")}
        </Text>
        {item.model ? <Text style={styles.vehicleSub} numberOfLines={1}>{item.model}</Text> : null}
        <View style={styles.vehicleFooter}>
          {item.price ? (
            <Text style={styles.vehiclePrice}>₱{item.price}</Text>
          ) : (
            <Text style={styles.vehicleSub}>{distance} km</Text>
          )}
          <View style={styles.rentChip}>
            <Text style={styles.rentChipText}>Rent</Text>
          </View>
        </View>
      </ScalePressable>
    );
  };

  if (!userLocation) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.loaderRing}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
        <Text style={styles.loaderText}>Finding your location…</Text>
      </View>
    );
  }

  const mapHeight = mapExpanded ? 360 : 210;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TouraMove</Text>
          <Text style={styles.brandSub}>Explore · Ride · Discover</Text>
        </View>
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => navigation.navigate("Account")}
          activeOpacity={0.85}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {renterInfo?.username ? renterInfo.username.charAt(0).toUpperCase() : "👤"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Map + floating search */}
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          region={{
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: mapExpanded ? 0.09 : 0.055,
            longitudeDelta: mapExpanded ? 0.09 : 0.055,
          }}
        >
          <Marker coordinate={userLocation} title="You" pinColor="#2563EB" />
          <Marker
            coordinate={{
              latitude: TOURISM_OFFICE.latitude,
              longitude: TOURISM_OFFICE.longitude,
            }}
            title={TOURISM_OFFICE.name}
            pinColor="#7C3AED"
          />
          {filteredSpots.map((spot) => (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              title={spot.name}
              pinColor="#F59E0B"
              onCalloutPress={() => openSpotPackages(spot)}
            />
          ))}
        </MapView>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            placeholder="Search beaches, islands, spots…"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.expandMapBtn}
          onPress={() => setMapExpanded((v) => !v)}
          activeOpacity={0.9}
        >
          <Text style={styles.expandMapText}>{mapExpanded ? "Collapse" : "Expand map"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Tourism Office */}
        <Text style={styles.sectionLabel}>Official help</Text>
        <ScalePressable onPress={openTourismOfficeDirections} style={styles.tourismCard}>
          <View style={styles.tourismIcon}>
            <Text style={{ fontSize: 26 }}>🏛️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tourismTitle}>{TOURISM_OFFICE.name}</Text>
            <Text style={styles.tourismAddr} numberOfLines={1}>{TOURISM_OFFICE.address}</Text>
            <Text style={styles.tourismHours}>{TOURISM_OFFICE.hours}</Text>
          </View>
          <View style={styles.tourismArrow}>
            <Text style={{ color: COLORS.purple, fontSize: 18 }}>↗</Text>
          </View>
        </ScalePressable>

        {/* Partner Hotels */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Partner hotels</Text>
          <Text style={styles.sectionCount}>{hotels.length}</Text>
        </View>
        <Text style={styles.sectionHint}>Tap to book via hotel system or view details</Text>
        {hotels.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🏨</Text>
            <Text style={styles.emptyText}>No partner hotels yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            {hotels.map((hotel, index) => {
              const status = hotel.availabilityStatus || "available";
              const statusColor = status === "available" ? "#10B981" : status === "limited" ? "#F59E0B" : "#EF4444";
              return (
                <ScalePressable
                  key={hotel.id}
                  onPress={() => openHotelBooking(hotel)}
                  style={[styles.hotelCard, { marginLeft: index === 0 ? 20 : 0 }]}
                >
                  <View style={styles.hotelIconRow}>
                    <Text style={{ fontSize: 28 }}>🏨</Text>
                    {hotel.dotAccredited ? (
                      <View style={styles.dotPill}><Text style={styles.dotPillText}>DOT</Text></View>
                    ) : null}
                  </View>
                  <Text style={styles.hotelName} numberOfLines={1}>{hotel.name}</Text>
                  <Text style={styles.hotelAddr} numberOfLines={1}>{hotel.address || "Partner hotel"}</Text>
                  <View style={styles.hotelFooter}>
                    <View style={[styles.hotelStatus, { backgroundColor: statusColor + "22" }]}>
                      <View style={[styles.hotelStatusDot, { backgroundColor: statusColor }]} />
                      <Text style={[styles.hotelStatusText, { color: statusColor }]}>{status}</Text>
                    </View>
                    {hotel.priceFrom ? (
                      <Text style={styles.hotelPrice}>₱{Number(hotel.priceFrom).toLocaleString()}+</Text>
                    ) : null}
                  </View>
                  <Text style={styles.hotelCta}>
                    {hotel.externalBookingUrl ? "Book on hotel site →" : "View details →"}
                  </Text>
                </ScalePressable>
              );
            })}
          </ScrollView>
        )}

        {/* Spots */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Tourist spots near you</Text>
          <Text style={styles.sectionCount}>{filteredSpots.length}</Text>
        </View>
        <Text style={styles.sectionHint}>Tap a spot to see trip packages</Text>

        {spotsLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
        ) : filteredSpots.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🗺️</Text>
            <Text style={styles.emptyText}>No spots nearby yet</Text>
          </View>
        ) : (
          <FlatList
            data={filteredSpots}
            renderItem={renderSpot}
            keyExtractor={(item) => item.id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20 }}
          />
        )}

        {/* Vehicles */}
        <View style={[styles.sectionRow, { marginTop: 28 }]}>
          <Text style={styles.sectionLabel}>Vehicles nearby</Text>
          <Text style={styles.sectionCount}>{nearbyVehicles.length}</Text>
        </View>
        <Text style={styles.sectionHint}>Direct rent · also used by trip packages</Text>

        {nearbyVehicles.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🚗</Text>
            <Text style={styles.emptyText}>No vehicles online right now</Text>
          </View>
        ) : (
          <FlatList
            data={nearbyVehicles}
            renderItem={renderVehicle}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20, paddingBottom: 8 }}
          />
        )}
      </ScrollView>

      {/* Packages bottom sheet */}
      <Modal visible={!!selectedSpot} transparent animationType="none" onRequestClose={closeSpotModal}>
        <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSpotModal} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: modalSlide }] },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedSpot?.name}
              </Text>
              <Text style={styles.sheetSub}>Trip packages</Text>
            </View>
            <TouchableOpacity style={styles.sheetClose} onPress={closeSpotModal}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {selectedSpot?.description ? (
            <Text style={styles.sheetDesc} numberOfLines={3}>{selectedSpot.description}</Text>
          ) : null}

          {spotPackages.length === 0 ? (
            <View style={styles.noPkgBox}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🎒</Text>
              <Text style={styles.noPkgTitle}>No packages yet</Text>
              <Text style={styles.noPkgSub}>Admin can add multi-leg trips for this spot.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {spotPackages.map((pkg) => {
                const total =
                  pkg.totalPrice ||
                  (pkg.legs || []).reduce((s, l) => s + (Number(l.estimatedPrice) || 0), 0);
                const legCount = (pkg.legs || []).length;
                return (
                  <ScalePressable
                    key={pkg.id}
                    style={styles.pkgCard}
                    onPress={() => {
                      closeSpotModal();
                      setTimeout(() => {
                        navigation.navigate("PackageDetail", { package: pkg, spot: selectedSpot });
                      }, 220);
                    }}
                  >
                    <View style={styles.pkgCardTop}>
                      <Text style={styles.pkgName} numberOfLines={1}>{pkg.name}</Text>
                      <Text style={styles.pkgPrice}>₱{Number(total).toLocaleString()}</Text>
                    </View>
                    <Text style={styles.pkgMeta}>
                      {legCount} leg{legCount !== 1 ? "s" : ""}
                      {pkg.roundTrip ? "  ·  Round trip" : ""}
                      {pkg.durationEstimate ? `  ·  ${pkg.durationEstimate}` : ""}
                    </Text>
                    <View style={styles.legChips}>
                      {(pkg.legs || []).slice(0, 4).map((leg, i) => (
                        <View key={i} style={styles.legChip}>
                          <Text style={styles.legChipText}>
                            {(leg.vehicleType || "ride").toUpperCase()}
                          </Text>
                        </View>
                      ))}
                      {(pkg.legs || []).length > 4 && (
                        <View style={styles.legChip}>
                          <Text style={styles.legChipText}>+{(pkg.legs || []).length - 4}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pkgTap}>View itinerary & book →</Text>
                  </ScalePressable>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.directionsBtn}
            onPress={() => {
              if (!selectedSpot) return;
              Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${selectedSpot.latitude},${selectedSpot.longitude}&travelmode=driving`
              );
            }}
          >
            <Text style={styles.directionsBtnText}>📍  Directions to this spot</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* Chat FAB */}
      <Animated.View
        style={[styles.fab, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.fabInner}
          activeOpacity={0.9}
          onPress={() => {
            if (dragDistance.current < 8) navigation.navigate("Chat");
          }}
        >
          <Text style={{ fontSize: 24 }}>💬</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  loaderRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  loaderText: { color: COLORS.textSecondary, fontSize: 14 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: COLORS.navy,
  },
  brand: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  brandSub: { fontSize: 12, color: "#94A3B8", marginTop: 2, fontWeight: "500" },
  avatarBtn: { padding: 2 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  mapWrap: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  searchBar: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },
  clearSearch: { color: COLORS.textMuted, fontSize: 14, paddingHorizontal: 4 },
  expandMapBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(15,23,42,0.82)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  expandMapText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  scroll: { flex: 1, marginTop: 8 },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    marginLeft: 20,
    marginTop: 18,
    letterSpacing: -0.2,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 20,
    marginTop: 22,
    marginRight: 20,
  },
  sectionCount: {
    marginLeft: 8,
    backgroundColor: "#E0E7FF",
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 20,
    marginBottom: 12,
    marginTop: 2,
  },

  tourismCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    shadowColor: COLORS.purple,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tourismIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  tourismTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  tourismAddr: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tourismHours: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  tourismArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },

  spotCard: {
    width: 196,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    marginRight: 12,
    padding: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  spotImageWrap: { position: "relative", marginBottom: 10 },
  spotImage: { width: "100%", height: 118, borderRadius: 14 },
  spotImagePlaceholder: {
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  distancePill: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(15,23,42,0.78)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distancePillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pkgPill: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pkgPillText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  spotName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  spotCategory: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },
  spotCta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  spotCtaText: { fontSize: 12, fontWeight: "600", color: COLORS.primary, flex: 1 },
  spotCtaArrow: { color: COLORS.primary, fontWeight: "700" },

  vehicleCard: {
    width: 160,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginRight: 12,
    padding: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  vehicleImage: { width: "100%", height: 88, borderRadius: 12, marginBottom: 8 },
  vehicleImagePlaceholder: {
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text, textTransform: "capitalize" },
  vehicleSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  vehicleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  vehiclePrice: { fontSize: 14, fontWeight: "800", color: COLORS.accent },
  rentChip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rentChipText: { color: "#fff", fontSize: 11, fontWeight: "700" },


  hotelCard: {
    width: 200,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    marginRight: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  hotelIconRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  dotPill: { backgroundColor: "#1D4ED8", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dotPillText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  hotelName: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  hotelAddr: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  hotelFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  hotelStatus: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  hotelStatusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  hotelStatusText: { fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  hotelPrice: { fontSize: 13, fontWeight: "800", color: COLORS.accent },
  hotelCta: { fontSize: 12, fontWeight: "700", color: "#7C3AED", marginTop: 10 },
  emptyBox: {
    marginHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyEmoji: { fontSize: 28, marginBottom: 6 },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 10,
    maxHeight: "78%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, letterSpacing: -0.3 },
  sheetSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetCloseText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "600" },
  sheetDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 14 },

  noPkgBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    marginBottom: 12,
  },
  noPkgTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  noPkgSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, textAlign: "center" },

  pkgCard: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  pkgCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pkgName: { fontSize: 15, fontWeight: "800", color: "#065F46", flex: 1, marginRight: 8 },
  pkgPrice: { fontSize: 17, fontWeight: "800", color: COLORS.accent },
  pkgMeta: { fontSize: 12, color: "#047857", marginTop: 4, marginBottom: 8 },
  legChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  legChip: {
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  legChipText: { fontSize: 10, fontWeight: "700", color: "#047857" },
  pkgTap: { fontSize: 12, fontWeight: "700", color: COLORS.primary },

  directionsBtn: {
    marginTop: 8,
    backgroundColor: COLORS.navy,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  directionsBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    zIndex: 50,
  },
  fabInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: "center",
    alignItems: "center",
  },
});
