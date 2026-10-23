import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  PanResponder,
  Animated,
  Linking,
  Modal,
  Pressable,
  StatusBar,
  Platform,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db } from "../../firebaseConfig";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { TOURISM_OFFICE } from "../constants/tourismOffice";

const RADIUS_KM = 80;

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

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const statusColor = (s) => {
  if (s === "limited") return C.warn;
  if (s === "full") return C.danger;
  return C.ok;
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

function ScalePressable({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 2,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
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

  const modalSlide = useRef(new Animated.Value(420)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const currentOffset = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      // Let the button handle taps; only take over once the finger really drags
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6,
      onPanResponderGrant: () => {
        pan.setOffset({ x: currentOffset.current.x, y: currentOffset.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gs) => {
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

  // Location: never crashes, always ends with a usable position
  useEffect(() => {
    let cancelled = false;

    // Used when location is denied, off, or unavailable (e.g. emulator with no fix)
    const fallback = {
      latitude: TOURISM_OFFICE.latitude,
      longitude: TOURISM_OFFICE.longitude,
    };

    const finish = (coords) => {
      if (!cancelled) setUserLocation(coords);
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return finish(fallback);

        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          return finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch {
          // No fresh fix: try the last known position before giving up
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            return finish({
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
            });
          }
          return finish(fallback);
        }
      } catch (e) {
        console.warn("Location unavailable:", e?.message);
        finish(fallback);
      }
    })();

    return () => {
      cancelled = true;
    };
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
      Animated.spring(modalSlide, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 4,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSpotModal = () => {
    Animated.parallel([
      Animated.timing(modalSlide, { toValue: 420, duration: 200, useNativeDriver: true }),
      Animated.timing(modalOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setSelectedSpot(null));
  };

  const openDirections = (lat, lng) => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    );
  };

  const openHotelBooking = (hotel) => {
    if (hotel.externalBookingUrl) {
      Linking.openURL(hotel.externalBookingUrl);
      return;
    }
    const lines = [
      hotel.description || "Partner hotel",
      hotel.phone ? `Phone: ${hotel.phone}` : null,
      hotel.address ? `Address: ${hotel.address}` : null,
      `Availability: ${cap(hotel.availabilityStatus || "available")}`,
      hotel.dotAccredited ? "DOT accredited" : null,
    ].filter(Boolean);

    Alert.alert(
      hotel.name,
      lines.join("\n"),
      [
        { text: "Close", style: "cancel" },
        hotel.location?.lat
          ? {
              text: "Directions",
              onPress: () => openDirections(hotel.location.lat, hotel.location.lng),
            }
          : null,
      ].filter(Boolean)
    );
  };

  const openTourismOfficeDirections = () =>
    openDirections(TOURISM_OFFICE.latitude, TOURISM_OFFICE.longitude);

  const handleGoToPayment = (vehicle) => {
    if (!auth.currentUser) {
      Alert.alert("Login required", "Log in to rent a vehicle.");
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
        : null;
    const pkgCount = allPackages.filter((p) => p.spotId === item.id).length;
    const meta = [item.category, distance ? `${distance} km` : null]
      .filter(Boolean)
      .join("   ");

    return (
      <ScalePressable
        onPress={() => openSpotPackages(item)}
        style={[styles.card, styles.spotCard, { marginLeft: index === 0 ? 24 : 0 }]}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.spotImage} resizeMode="cover" />
        ) : (
          <View style={[styles.spotImage, styles.imagePlaceholder]} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {meta ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <Text style={styles.cardAction}>
            {pkgCount > 0
              ? `${pkgCount} ${pkgCount === 1 ? "package" : "packages"}`
              : "View spot"}
          </Text>
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
        style={[styles.card, styles.vehicleCard, { marginLeft: index === 0 ? 24 : 0 }]}
      >
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.vehicleImage} resizeMode="cover" />
        ) : (
          <View style={[styles.vehicleImage, styles.imagePlaceholder]} />
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {cap((item.category || "Vehicle").replace("_", " "))}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[item.model, `${distance} km`].filter(Boolean).join("   ")}
          </Text>
          <View style={styles.vehicleFooter}>
            {item.price ? (
              <Text style={styles.price}>₱{item.price}</Text>
            ) : (
              <View />
            )}
            <Text style={styles.cardAction}>Rent</Text>
          </View>
        </View>
      </ScalePressable>
    );
  };

  if (!userLocation) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={C.muted} />
        <Text style={styles.loaderText}>Finding your location</Text>
      </View>
    );
  }

  const mapHeight = mapExpanded ? 360 : 220;
  const initial = renterInfo?.username
    ? renterInfo.username.charAt(0).toUpperCase()
    : "U";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TouraMove</Text>
          <Text style={styles.brandSub}>Explore, ride, discover</Text>
        </View>
        <TouchableOpacity
          style={styles.avatar}
          onPress={() => navigation.navigate("Account")}
          activeOpacity={0.7}
        >
          <Text style={styles.avatarText}>{initial}</Text>
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
          <TextInput
            placeholder="Search spots and categories"
            placeholderTextColor={C.faint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
              <Text style={styles.clearSearch}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.expandMapBtn}
          onPress={() => setMapExpanded((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={styles.expandMapText}>
            {mapExpanded ? "Collapse" : "Expand"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tourism office */}
        <Text style={styles.sectionTitle}>Official help</Text>
        <TouchableOpacity
          style={styles.officeRow}
          onPress={openTourismOfficeDirections}
          activeOpacity={0.6}
        >
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{TOURISM_OFFICE.name}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {TOURISM_OFFICE.address}
            </Text>
            <Text style={styles.cardMeta}>{TOURISM_OFFICE.hours}</Text>
          </View>
          <Text style={styles.linkText}>Directions</Text>
        </TouchableOpacity>

        {/* Partner hotels */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitleInline}>Partner hotels</Text>
          <Text style={styles.sectionCount}>{hotels.length}</Text>
        </View>
        <Text style={styles.sectionHint}>
          Book through the hotel's own system or view details
        </Text>
        {hotels.length === 0 ? (
          <Text style={styles.emptyText}>No partner hotels yet.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {hotels.map((hotel, index) => {
              const status = hotel.availabilityStatus || "available";
              return (
                <ScalePressable
                  key={hotel.id}
                  onPress={() => openHotelBooking(hotel)}
                  style={[
                    styles.card,
                    styles.hotelCard,
                    { marginLeft: index === 0 ? 24 : 0 },
                  ]}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {hotel.name}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {hotel.address || "Partner hotel"}
                    </Text>
                    <View style={styles.statusLine}>
                      <View
                        style={[styles.dot, { backgroundColor: statusColor(status) }]}
                      />
                      <Text style={styles.cardMeta}>{cap(status)}</Text>
                      {hotel.dotAccredited ? (
                        <Text style={styles.cardMeta}>   DOT accredited</Text>
                      ) : null}
                    </View>
                    <View style={styles.hotelFooter}>
                      {hotel.priceFrom ? (
                        <Text style={styles.price}>
                          From ₱{Number(hotel.priceFrom).toLocaleString()}
                        </Text>
                      ) : (
                        <View />
                      )}
                      <Text style={styles.cardAction}>
                        {hotel.externalBookingUrl ? "Book" : "Details"}
                      </Text>
                    </View>
                  </View>
                </ScalePressable>
              );
            })}
          </ScrollView>
        )}

        {/* Spots */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitleInline}>Spots near you</Text>
          <Text style={styles.sectionCount}>{filteredSpots.length}</Text>
        </View>
        <Text style={styles.sectionHint}>Tap a spot to see trip packages</Text>

        {spotsLoading ? (
          <ActivityIndicator color={C.muted} style={styles.loader} />
        ) : filteredSpots.length === 0 ? (
          <Text style={styles.emptyText}>No spots nearby yet.</Text>
        ) : (
          <FlatList
            data={filteredSpots}
            renderItem={renderSpot}
            keyExtractor={(item) => item.id.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          />
        )}

        {/* Vehicles */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitleInline}>Vehicles nearby</Text>
          <Text style={styles.sectionCount}>{nearbyVehicles.length}</Text>
        </View>
        <Text style={styles.sectionHint}>Rent directly, or as part of a package</Text>

        {nearbyVehicles.length === 0 ? (
          <Text style={styles.emptyText}>No vehicles online right now.</Text>
        ) : (
          <FlatList
            data={nearbyVehicles}
            renderItem={renderVehicle}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          />
        )}
      </ScrollView>

      {/* Packages bottom sheet */}
      <Modal
        visible={!!selectedSpot}
        transparent
        animationType="none"
        onRequestClose={closeSpotModal}
      >
        <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSpotModal}
          />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: modalSlide }] }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedSpot?.name}
              </Text>
              <Text style={styles.cardMeta}>Trip packages</Text>
            </View>
            <TouchableOpacity onPress={closeSpotModal} hitSlop={8}>
              <Text style={styles.headerLink}>Close</Text>
            </TouchableOpacity>
          </View>

          {selectedSpot?.description ? (
            <Text style={styles.sheetDesc} numberOfLines={3}>
              {selectedSpot.description}
            </Text>
          ) : null}

          {spotPackages.length === 0 ? (
            <View style={styles.noPkg}>
              <Text style={styles.cardTitle}>No packages yet</Text>
              <Text style={styles.cardMeta}>
                Trip packages for this spot will appear here.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.pkgList} showsVerticalScrollIndicator={false}>
              {spotPackages.map((pkg) => {
                const total =
                  pkg.totalPrice ||
                  pkg.price ||
                  (pkg.legs || []).reduce(
                    (s, l) => s + (Number(l.estimatedPrice) || 0),
                    0
                  );
                const legCount = (pkg.legs || []).length;
                const meta = [
                  `${legCount} leg${legCount !== 1 ? "s" : ""}`,
                  pkg.roundTrip ? "Round trip" : null,
                  pkg.durationEstimate || pkg.duration || null,
                ]
                  .filter(Boolean)
                  .join("   ");
                const vehicles = (pkg.legs || [])
                  .map((l) => cap(l.vehicleType || "ride"))
                  .join(", ");
                return (
                  <TouchableOpacity
                    key={pkg.id}
                    style={styles.pkgRow}
                    activeOpacity={0.6}
                    onPress={() => {
                      closeSpotModal();
                      setTimeout(() => {
                        navigation.navigate("PackageDetail", {
                          package: pkg,
                          spot: selectedSpot,
                        });
                      }, 220);
                    }}
                  >
                    <View style={styles.pkgTop}>
                      <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
                        {pkg.name}
                      </Text>
                      {Number(total) > 0 && (
                        <Text style={styles.price}>
                          ₱{Number(total).toLocaleString()}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.cardMeta}>{meta}</Text>
                    {vehicles ? (
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {vehicles}
                      </Text>
                    ) : null}
                    <Text style={styles.linkText}>View itinerary and book</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              if (!selectedSpot) return;
              openDirections(selectedSpot.latitude, selectedSpot.longitude);
            }}
          >
            <Text style={styles.primaryText}>Directions to this spot</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* Chat button (draggable) */}
      <Animated.View
        style={[styles.fab, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.fabInner}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("Chat")}
        >
          <Text style={styles.fabText}>Chat</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  loaderText: { color: C.muted, fontSize: 14, marginTop: 12 },
  loader: { marginVertical: 20 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 56,
    paddingBottom: 14,
  },
  brand: {
    fontSize: 26,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.5,
  },
  brandSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: C.text, fontWeight: "600", fontSize: 15 },
  headerLink: { color: C.muted, fontSize: 15 },

  // Map
  mapWrap: {
    marginHorizontal: 24,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text, padding: 0 },
  clearSearch: { color: C.muted, fontSize: 13, fontWeight: "500", paddingLeft: 10 },
  expandMapBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  expandMapText: { color: C.text, fontSize: 12, fontWeight: "600" },

  // Sections
  scroll: { flex: 1, marginTop: 8 },
  scrollContent: { paddingBottom: 120 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: C.text,
    marginLeft: 24,
    marginTop: 20,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 32,
  },
  sectionTitleInline: { fontSize: 17, fontWeight: "600", color: C.text },
  sectionCount: { marginLeft: 8, color: C.muted, fontSize: 15 },
  sectionHint: {
    fontSize: 13,
    color: C.muted,
    marginHorizontal: 24,
    marginTop: 3,
    marginBottom: 14,
  },
  emptyText: { color: C.muted, fontSize: 14, marginHorizontal: 24 },
  hScroll: { paddingRight: 24 },

  // Office
  officeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 24,
    marginTop: 12,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  linkText: { color: C.text, fontSize: 14, fontWeight: "600", marginLeft: 16 },

  // Cards
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 12,
    overflow: "hidden",
  },
  cardBody: { padding: 14 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "600" },
  cardMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  cardAction: { color: C.text, fontSize: 13, fontWeight: "600", marginTop: 10 },
  price: { color: C.text, fontSize: 15, fontWeight: "600" },
  imagePlaceholder: { backgroundColor: C.bg },

  spotCard: { width: 200 },
  spotImage: { width: "100%", height: 112 },

  vehicleCard: { width: 168 },
  vehicleImage: { width: "100%", height: 88 },
  vehicleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  hotelCard: { width: 224 },
  statusLine: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  hotelFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  // Sheet
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 32,
    maxHeight: "80%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "700" },
  sheetDesc: { color: C.muted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  noPkg: { paddingVertical: 28 },
  pkgList: { maxHeight: 340 },
  pkgRow: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  pkgTop: { flexDirection: "row", alignItems: "center" },

  // Buttons
  primaryBtn: {
    backgroundColor: C.text,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: { color: C.bg, fontSize: 15, fontWeight: "600" },

  // Chat button
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    borderRadius: 28,
    backgroundColor: C.text,
    zIndex: 50,
    elevation: 6,
  },
  fabInner: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  fabText: { color: C.bg, fontSize: 15, fontWeight: "600" },
});