import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Pressable,
  StatusBar,
  Platform,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { TOURISM_OFFICE } from "../constants/tourismOffice";
import { useResponsive } from "../utils/responsive";

const RADIUS_KM = 80;

// Office hours: Mon–Fri, 8:00 AM – 5:00 PM (keep in sync with TOURISM_OFFICE.hours)
const OFFICE_DAYS = [1, 2, 3, 4, 5];
const OFFICE_OPEN_HOUR = 8;
const OFFICE_CLOSE_HOUR = 17;

const C = {
  navy: "#0B1224",
  navySoft: "#16203A",
  purple: "#7C3AED",
  purpleSoft: "#F1EAFE",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  red: "#DC2626",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E5E7EB",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// 350 m / 2.4 km
const formatDistance = (km) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

// Adds https:// when a link was saved without it
const normalizeUrl = (u) => {
  const t = u ? String(u).trim() : "";
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

const openLink = async (url) => {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Can't open link", url);
  }
};

// "0927 697 3031 / 0969 545 9405" -> first number only, digits and +
const firstPhone = (p) => (p || "").split("/")[0].replace(/[^\d+]/g, "");

const isOfficeOpen = () => {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return (
    OFFICE_DAYS.includes(now.getDay()) &&
    hour >= OFFICE_OPEN_HOUR &&
    hour < OFFICE_CLOSE_HOUR
  );
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

// Press feedback: card gently scales down while pressed
function Press({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (toValue) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => spring(0.97)}
      onPressOut={() => spring(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function SectionHeader({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} style={styles.row}>
          <Text style={styles.linkText}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={C.purple} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function TabItem({ icon, label, active, onPress }) {
  const color = active ? C.purple : C.faint;
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={active ? icon : `${icon}-outline`}
        size={22}
        color={color}
      />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// One package row, used in the spot sheet and the all-packages sheet
function PackageRow({ pkg, spotName, onPress }) {
  const total =
    pkg.totalPrice ||
    pkg.price ||
    (pkg.legs || []).reduce((s, l) => s + (Number(l.estimatedPrice) || 0), 0);
  const legCount = (pkg.legs || []).length;
  const route = (pkg.legs || []).map((l) => cap(l.vehicleType || "ride")).join(" → ");
  const duration = pkg.durationEstimate || pkg.duration;
  return (
    <Press style={styles.pkgCard} onPress={onPress}>
      <View style={styles.row}>
        <Text style={[styles.sheetSub, styles.flex]} numberOfLines={1}>
          {pkg.name}
        </Text>
        {Number(total) > 0 && (
          <Text style={styles.priceText}>₱{Number(total).toLocaleString()}</Text>
        )}
      </View>
      {spotName ? (
        <Text style={styles.spotLabel} numberOfLines={1}>
          {spotName}
        </Text>
      ) : null}
      <Text style={styles.metaText}>
        {legCount} leg{legCount !== 1 ? "s" : ""}
        {pkg.roundTrip ? "  ·  Round trip" : ""}
        {duration ? `  ·  ${duration}` : ""}
      </Text>
      {route ? (
        <Text style={styles.metaText} numberOfLines={1}>
          {route}
        </Text>
      ) : null}
      <View style={[styles.row, { marginTop: 8 }]}>
        <Text style={styles.linkText}>View itinerary and book</Text>
        <Ionicons name="chevron-forward" size={14} color={C.purple} />
      </View>
    </Press>
  );
}

export default function MapScreen({ navigation }) {
  const mapRef = useRef(null);
  const { insets, height, cardWidth, contentWidth, tabHeight } = useResponsive();

  const [authUser, setAuthUser] = useState(auth.currentUser);
  const [userLocation, setUserLocation] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false); // true when GPS is unavailable
  const [allSpots, setAllSpots] = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [renterInfo, setRenterInfo] = useState(null);
  const [spotsLoading, setSpotsLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState("All");
  const [showAllHotels, setShowAllHotels] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [spotPackages, setSpotPackages] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [packagesOpen, setPackagesOpen] = useState(false);

  const sheetSlide = useRef(new Animated.Value(480)).current;
  const sheetFade = useRef(new Animated.Value(0)).current;

  // Track sign-in so Firestore listeners only start once the session exists
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return unsub;
  }, []);

  // Location: never crashes, always ends with a usable position
  useEffect(() => {
    let cancelled = false;
    const fallback = {
      latitude: TOURISM_OFFICE.latitude,
      longitude: TOURISM_OFFICE.longitude,
    };
    const finish = (coords) => {
      if (cancelled) return;
      setUsingFallback(coords === fallback);
      setUserLocation(coords);
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

  // Renter profile (used for the rent flow)
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    getDoc(doc(db, "users", authUser.uid))
      .then((snap) => {
        if (!cancelled && snap.exists()) setRenterInfo(snap.data());
      })
      .catch((e) => console.warn("Profile load failed:", e.code));
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // Live data: starts only after sign-in
  useEffect(() => {
    if (!authUser) return;
    setSpotsLoading(true);

    const unsubs = [
      onSnapshot(
        collection(db, "touristSpots"),
        (snap) => {
          setAllSpots(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                ...data,
                latitude: data.location?.lat ?? data.latitude ?? 0,
                longitude: data.location?.lng ?? data.longitude ?? 0,
              };
            })
          );
          setSpotsLoading(false);
        },
        () => setSpotsLoading(false)
      ),
      onSnapshot(collection(db, "tripPackages"), (snap) =>
        setAllPackages(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, "hotels"), (snap) =>
        setHotels(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [authUser]);

  // Derived data
  const nearbySpots = useMemo(() => {
    if (!userLocation) return [];
    return allSpots
      .map((s) => ({
        ...s,
        distance: getDistanceKm(
          userLocation.latitude,
          userLocation.longitude,
          s.latitude,
          s.longitude
        ),
      }))
      .filter((s) => s.distance <= RADIUS_KM)
      .sort((a, b) => a.distance - b.distance);
  }, [userLocation, allSpots]);

  const categories = useMemo(() => {
    const set = new Set(nearbySpots.map((s) => s.category).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [nearbySpots]);

  const filteredSpots = useMemo(
    () =>
      nearbySpots.filter(
        (s) => activeCategory === "All" || s.category === activeCategory
      ),
    [nearbySpots, activeCategory]
  );

  // Hotels sorted nearest first; hotels without a map pin go last
  const sortedHotels = useMemo(() => {
    const withDistance = hotels.map((h) => {
      const hasPin =
        typeof h.location?.lat === "number" && typeof h.location?.lng === "number";
      return {
        ...h,
        distance:
          hasPin && userLocation
            ? getDistanceKm(
                userLocation.latitude,
                userLocation.longitude,
                h.location.lat,
                h.location.lng
              )
            : null,
      };
    });
    return withDistance.sort((a, b) => {
      if (a.distance == null && b.distance == null) return 0;
      if (a.distance == null) return 1;
      if (b.distance == null) return -1;
      return a.distance - b.distance;
    });
  }, [hotels, userLocation]);

  // The closest hotel with a map pin is the recommended one
  const recommendedId =
    sortedHotels[0]?.distance != null ? sortedHotels[0].id : null;
  const visibleHotels = showAllHotels ? sortedHotels : sortedHotels.slice(0, 3);

  const spotName = (spotId) => allSpots.find((s) => s.id === spotId)?.name || "";

  // Actions
  const openSpotPackages = (spot) => {
    setSelectedSpot(spot);
    setSpotPackages(allPackages.filter((p) => p.spotId === spot.id));
    sheetSlide.setValue(480);
    sheetFade.setValue(0);
    Animated.parallel([
      Animated.spring(sheetSlide, {
        toValue: 0,
        useNativeDriver: true,
        speed: 16,
        bounciness: 4,
      }),
      Animated.timing(sheetFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSpotSheet = () => {
    Animated.parallel([
      Animated.timing(sheetSlide, {
        toValue: 480,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(sheetFade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setSelectedSpot(null));
  };

  const openPackage = (pkg) => {
    const spot = allSpots.find((s) => s.id === pkg.spotId) || null;
    setPackagesOpen(false);
    setSelectedSpot(null);
    setTimeout(() => {
      navigation.navigate("PackageDetail", { package: pkg, spot });
    }, 200);
  };

  const openDirections = (lat, lng) =>
    openLink(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
    );

  // Booking link opens directly; otherwise show the contact options
  const openHotel = (hotel) => {
    const bookingUrl = normalizeUrl(hotel.externalBookingUrl);
    if (bookingUrl) {
      openLink(bookingUrl);
      return;
    }
    setSelectedHotel(hotel);
  };

  const locateMe = () => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion(
      { ...userLocation, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      500
    );
  };

  // Loading state (all hooks are above this return)
  if (!userLocation) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy} />
        <ActivityIndicator color={C.purple} />
        <Text style={styles.loadingText}>Finding your location</Text>
      </View>
    );
  }

  const open = isOfficeOpen();
  const initial = renterInfo?.username
    ? renterInfo.username.charAt(0).toUpperCase()
    : "U";

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabHeight + 90,
            maxWidth: contentWidth,
            width: "100%",
            alignSelf: "center",
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={styles.brand}>
              <Text style={styles.brandWhite}>Toura</Text>
              <Text style={styles.brandPurple}>Move</Text>
            </Text>
            <Text style={styles.brandSub}>Explore · Ride · Discover</Text>
          </View>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate("Notifications")}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => navigation.navigate("Account")}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Map */}
        <View style={[styles.mapCard, { height: Math.round(height * 0.28) }]}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            }}
          >
            <Marker
              coordinate={{
                latitude: TOURISM_OFFICE.latitude,
                longitude: TOURISM_OFFICE.longitude,
              }}
              title={TOURISM_OFFICE.name}
              pinColor={C.purple}
            />
            {filteredSpots.map((spot) => (
              <Marker
                key={spot.id}
                coordinate={{
                  latitude: spot.latitude,
                  longitude: spot.longitude,
                }}
                title={spot.name}
                pinColor={C.green}
                onCalloutPress={() => openSpotPackages(spot)}
              />
            ))}
          </MapView>

          <TouchableOpacity
            style={styles.locateBtn}
            onPress={locateMe}
            activeOpacity={0.85}
          >
            <Ionicons name="locate-outline" size={20} color={C.purple} />
          </TouchableOpacity>
        </View>

        {/* Tourism office */}
        <Press style={styles.officeCard}>
          <View style={styles.officeTop}>
            <View style={styles.officeIcon}>
              <Ionicons name="business" size={26} color="#fff" />
            </View>
            <View style={styles.flex}>
              <View style={styles.badgePurple}>
                <Text style={styles.badgePurpleText}>MUNICIPAL TOURISM OFFICE</Text>
              </View>
              <Text style={styles.officeName} numberOfLines={1}>
                {TOURISM_OFFICE.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {TOURISM_OFFICE.address}
              </Text>
            </View>
            <View
              style={[
                styles.openPill,
                { backgroundColor: open ? C.greenSoft : "#FEE2E2" },
              ]}
            >
              <Ionicons
                name={open ? "checkmark" : "time-outline"}
                size={18}
                color={open ? C.green : C.red}
              />
              <Text style={[styles.openText, { color: open ? C.green : C.red }]}>
                {open ? "OPEN" : "CLOSED"}
              </Text>
            </View>
          </View>

          <View style={styles.officeMeta}>
            {TOURISM_OFFICE.phone ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => openLink(`tel:${TOURISM_OFFICE.phone}`)}
              >
                <Ionicons name="call-outline" size={14} color={C.muted} />
                <Text style={styles.metaText}>{TOURISM_OFFICE.phone}</Text>
              </TouchableOpacity>
            ) : null}
            {TOURISM_OFFICE.website ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => openLink(normalizeUrl(TOURISM_OFFICE.website))}
              >
                <Ionicons name="globe-outline" size={14} color={C.muted} />
                <Text style={styles.metaText}>{TOURISM_OFFICE.website}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.row}>
              <Ionicons name="time-outline" size={14} color={C.muted} />
              <Text style={styles.metaText}>{TOURISM_OFFICE.hours}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.directionsBtn}
            onPress={() =>
              openDirections(TOURISM_OFFICE.latitude, TOURISM_OFFICE.longitude)
            }
          >
            <Ionicons name="navigate-outline" size={16} color={C.purple} />
            <Text style={styles.directionsText}>Get directions</Text>
          </TouchableOpacity>
        </Press>

        {/* Partner hotels */}
        <SectionHeader
          title="Partner hotels"
          action={
            showAllHotels
              ? "Show less"
              : sortedHotels.length > 3
              ? "View all"
              : null
          }
          onAction={() => setShowAllHotels((v) => !v)}
        />
        {sortedHotels.length === 0 ? (
          <Text style={styles.emptyText}>No partner hotels yet.</Text>
        ) : (
          visibleHotels.map((hotel) => {
            const isRecommended = hotel.id === recommendedId;
            const hasBookingLink = !!normalizeUrl(hotel.externalBookingUrl);
            return (
              <Press
                key={hotel.id}
                style={styles.hotelCard}
                onPress={() => openHotel(hotel)}
              >
                {hotel.imageUrl ? (
                  <Image source={{ uri: hotel.imageUrl }} style={styles.hotelImage} />
                ) : (
                  <View style={[styles.hotelImage, styles.placeholder]}>
                    <Text style={styles.placeholderText}>
                      {hotel.name?.charAt(0)?.toUpperCase() || "H"}
                    </Text>
                  </View>
                )}
                <View style={styles.flex}>
                  {isRecommended || hotel.dotAccredited ? (
                    <View style={styles.badgeRow}>
                      {isRecommended ? (
                        <View style={styles.recBadge}>
                          <Ionicons name="star" size={11} color={C.purple} />
                          <Text style={styles.recBadgeText}>RECOMMENDED</Text>
                        </View>
                      ) : null}
                      {hotel.dotAccredited ? (
                        <View style={styles.dotBadge}>
                          <Ionicons name="shield-checkmark" size={12} color={C.green} />
                          <Text style={styles.dotBadgeText}>DOT ACCREDITED</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <Text style={styles.hotelName} numberOfLines={1}>
                    {hotel.name}
                  </Text>
                  <View style={styles.row}>
                    <Ionicons name="navigate-outline" size={12} color={C.muted} />
                    <Text style={styles.metaText}>
                      {hotel.distance != null
                        ? `${formatDistance(hotel.distance)} ${
                            usingFallback ? "from tourism office" : "away"
                          }`
                        : "Distance unavailable"}
                    </Text>
                  </View>
                  {hotel.priceFrom ? (
                    <Text style={styles.priceText}>
                      from ₱{Number(hotel.priceFrom).toLocaleString()}
                      <Text style={styles.priceUnit}> / night</Text>
                    </Text>
                  ) : null}
                  <View style={[styles.row, { marginTop: 6 }]}>
                    <Text style={styles.linkText}>
                      {hasBookingLink ? "Book on hotel site" : "Contact hotel"}
                    </Text>
                    <Ionicons
                      name={hasBookingLink ? "open-outline" : "chevron-forward"}
                      size={14}
                      color={C.purple}
                    />
                  </View>
                </View>
              </Press>
            );
          })
        )}

        {/* Spots */}
        <SectionHeader title="Tourist spots near you" />
        {categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {categories.map((cat) => {
              const active = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {cap(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {spotsLoading ? (
          <ActivityIndicator color={C.purple} style={{ marginVertical: 24 }} />
        ) : filteredSpots.length === 0 ? (
          <Text style={styles.emptyText}>No spots match your filter.</Text>
        ) : (
          <FlatList
            data={filteredSpots}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.hList}
            renderItem={({ item }) => {
              const pkgCount = allPackages.filter((p) => p.spotId === item.id).length;
              return (
                <Press
                  style={[styles.spotCard, { width: cardWidth }]}
                  onPress={() => openSpotPackages(item)}
                >
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.spotImage} />
                  ) : (
                    <View style={[styles.spotImage, styles.placeholder]} />
                  )}
                  <View style={styles.namePill}>
                    <Ionicons name="location" size={12} color={C.purple} />
                    <Text style={styles.namePillText} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={styles.spotMeta} numberOfLines={1}>
                    {formatDistance(item.distance)}
                    {pkgCount > 0
                      ? `  ·  ${pkgCount} ${pkgCount === 1 ? "package" : "packages"}`
                      : ""}
                  </Text>
                </Press>
              );
            }}
          />
        )}
      </ScrollView>

      {/* Ask assistant */}
      <TouchableOpacity
        style={[styles.assistant, { bottom: tabHeight + 14 }]}
        onPress={() => navigation.navigate("Chat")}
        activeOpacity={0.9}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
        <Text style={styles.assistantText}>Ask assistant</Text>
      </TouchableOpacity>

      {/* Bottom tabs */}
      <View style={[styles.tabBar, { height: tabHeight, paddingBottom: insets.bottom }]}>
        <TabItem icon="compass" label="Explore" active />
        <TabItem icon="map" label="Packages" onPress={() => setPackagesOpen(true)} />
        <TabItem
          icon="calendar"
          label="Bookings"
          onPress={() => navigation.navigate("Notifications")}
        />
        <TabItem
          icon="person"
          label="Profile"
          onPress={() => navigation.navigate("Account")}
        />
      </View>

      {/* Spot packages sheet */}
      <Modal
        visible={!!selectedSpot}
        transparent
        animationType="none"
        onRequestClose={closeSpotSheet}
      >
        <Animated.View style={[styles.backdrop, { opacity: sheetFade }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSpotSheet}
          />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetSlide }] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedSpot?.name}
              </Text>
              <Text style={styles.muted}>Trip packages</Text>
            </View>
            <TouchableOpacity onPress={closeSpotSheet} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          {spotPackages.length === 0 ? (
            <View style={styles.noPkg}>
              <Text style={styles.sheetSub}>No packages yet</Text>
              <Text style={styles.muted}>Trip packages for this spot will appear here.</Text>
            </View>
          ) : (
            <ScrollView style={styles.pkgList} showsVerticalScrollIndicator={false}>
              {spotPackages.map((pkg) => (
                <PackageRow key={pkg.id} pkg={pkg} onPress={() => openPackage(pkg)} />
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.sheetDirections}
            onPress={() =>
              selectedSpot && openDirections(selectedSpot.latitude, selectedSpot.longitude)
            }
          >
            <Ionicons name="navigate-outline" size={16} color="#fff" />
            <Text style={styles.sheetDirectionsText}>Directions to this spot</Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* All packages sheet (Packages tab) */}
      <Modal
        visible={packagesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPackagesOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPackagesOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle}>All packages</Text>
              <Text style={styles.muted}>
                {allPackages.length} {allPackages.length === 1 ? "package" : "packages"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setPackagesOpen(false)} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          {allPackages.length === 0 ? (
            <View style={styles.noPkg}>
              <Text style={styles.sheetSub}>No packages yet</Text>
              <Text style={styles.muted}>Trip packages will appear here once they are added.</Text>
            </View>
          ) : (
            <ScrollView style={styles.pkgList} showsVerticalScrollIndicator={false}>
              {allPackages.map((pkg) => (
                <PackageRow
                  key={pkg.id}
                  pkg={pkg}
                  spotName={spotName(pkg.spotId)}
                  onPress={() => openPackage(pkg)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Hotel contact sheet */}
      <Modal
        visible={!!selectedHotel}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedHotel(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelectedHotel(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedHotel?.name}
              </Text>
              <Text style={styles.muted} numberOfLines={2}>
                {selectedHotel?.distance != null
                  ? `${formatDistance(selectedHotel.distance)} ${
                      usingFallback ? "from tourism office" : "away"
                    }`
                  : "Distance unavailable"}
                {selectedHotel?.address ? `  ·  ${selectedHotel.address}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedHotel(null)} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {selectedHotel?.description ? (
              <Text style={[styles.muted, { marginBottom: 12 }]}>
                {selectedHotel.description}
              </Text>
            ) : null}

            {selectedHotel?.phone ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openLink(`tel:${firstPhone(selectedHotel.phone)}`)}
              >
                <Ionicons name="call-outline" size={18} color={C.purple} />
                <Text style={styles.contactText}>{selectedHotel.phone}</Text>
              </TouchableOpacity>
            ) : null}

            {selectedHotel?.email ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openLink(`mailto:${selectedHotel.email}`)}
              >
                <Ionicons name="mail-outline" size={18} color={C.purple} />
                <Text style={styles.contactText}>{selectedHotel.email}</Text>
              </TouchableOpacity>
            ) : null}

            {normalizeUrl(selectedHotel?.facebookUrl) ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openLink(normalizeUrl(selectedHotel.facebookUrl))}
              >
                <Ionicons name="logo-facebook" size={18} color={C.purple} />
                <Text style={styles.contactText}>
                  {selectedHotel.facebookName || "Facebook page"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {selectedHotel?.location?.lat ? (
              <TouchableOpacity
                style={styles.sheetDirections}
                onPress={() =>
                  openDirections(selectedHotel.location.lat, selectedHotel.location.lng)
                }
              >
                <Ionicons name="navigate-outline" size={16} color="#fff" />
                <Text style={styles.sheetDirectionsText}>Directions</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const TAB_HEIGHT = Platform.OS === "ios" ? 84 : 66;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  screen: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingBottom: TAB_HEIGHT + 90 },
  loading: {
    flex: 1,
    backgroundColor: C.navy,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { color: C.faint, marginTop: 12, fontSize: 14 },

  // Header
  header: {
    backgroundColor: C.navy,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 56,
    paddingBottom: 18,
  },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  brandWhite: { color: "#FFFFFF" },
  brandPurple: { color: "#A78BFA" },
  brandSub: { color: C.faint, fontSize: 13, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.navySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.purple,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Map
  mapCard: {
    height: 230,
    backgroundColor: "#DDE3EE",
    overflow: "hidden",
  },
  locateBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  // Shared bits
  placeholder: {
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: C.purple, fontSize: 22, fontWeight: "700" },
  muted: { color: C.muted, fontSize: 13 },
  metaText: { color: C.muted, fontSize: 12 },
  linkText: { color: C.purple, fontSize: 13, fontWeight: "600" },
  priceText: { color: C.text, fontSize: 14, fontWeight: "700" },
  priceUnit: { color: C.muted, fontSize: 12, fontWeight: "400" },
  emptyText: { color: C.muted, fontSize: 14, marginHorizontal: 20, marginBottom: 8 },

  // Tourism office
  officeCard: {
    marginHorizontal: 16,
    marginTop: -40,
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  officeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  officeIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.purple,
    justifyContent: "center",
    alignItems: "center",
  },
  badgePurple: {
    alignSelf: "flex-start",
    backgroundColor: C.purpleSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  badgePurpleText: { color: C.purple, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  officeName: { color: C.text, fontSize: 16, fontWeight: "700" },
  openPill: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 62,
  },
  openText: { fontSize: 11, fontWeight: "800", marginTop: 1 },
  officeMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  directionsBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.purpleSoft,
    paddingVertical: 10,
    borderRadius: 10,
  },
  directionsText: { color: C.purple, fontWeight: "700", fontSize: 13 },

  // Sections
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: "700" },

  // Hotels
  hotelCard: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  hotelImage: { width: 92, height: 92, borderRadius: 12 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  recBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: C.purpleSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  recBadgeText: { color: C.purple, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  dotBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: C.greenSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  dotBadgeText: { color: C.green, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  hotelName: { color: C.text, fontSize: 15, fontWeight: "700", marginBottom: 3 },

  // Spots
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.navy, borderColor: C.navy },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },
  hList: { paddingHorizontal: 16, gap: 12 },
  spotCard: { width: 200 },
  spotImage: { width: "100%", height: 130, borderRadius: 16 },
  namePill: {
    position: "absolute",
    left: 10,
    bottom: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: 180,
  },
  namePillText: { color: C.text, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  spotMeta: { color: C.muted, fontSize: 12, marginTop: 6, marginLeft: 4 },

  // Assistant button
  assistant: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.navy,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  assistantText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // Tab bar
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_HEIGHT,
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingBottom: Platform.OS === "ios" ? 18 : 8,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: "600" },

  // Sheets (taller than before)
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,18,36,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: "88%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: "800" },
  sheetSub: { color: C.text, fontSize: 15, fontWeight: "700" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  noPkg: { paddingVertical: 24, alignItems: "center", gap: 4 },
  pkgList: { maxHeight: 480 },
  pkgCard: {
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  spotLabel: { color: C.purple, fontSize: 12, fontWeight: "700", marginTop: 2 },
  sheetDirections: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.navy,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sheetDirectionsText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  contactText: { color: C.text, fontSize: 14, fontWeight: "600", flex: 1 },
});