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
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { TOURISM_OFFICE } from "../constants/tourismOffice";
import { DINING_DIRECTORY } from "../constants/sanCarlosDining";
import { useResponsive } from "../utils/responsive";
import { takePendingDirections, onDirectionsRequest } from "../utils/directionsBus";

const RADIUS_KM = 80;

// Office hours: Mon–Fri, 8:00 AM – 5:00 PM (keep in sync with TOURISM_OFFICE.hours)
const OFFICE_DAYS = [1, 2, 3, 4, 5];
const OFFICE_OPEN_HOUR = 8;
const OFFICE_CLOSE_HOUR = 17;

const C = {
  navy: "#2F7A3E",       // header and main dark (deep green)
  navySoft: "#3E9B4F",   // lighter green
  purple: "#2F7A3E",     // accent for links and icons (deep green)
  purpleSoft: "#FFF1BF", // soft gold chip background
  green: "#3E9B4F",
  greenSoft: "#E6FBEC",
  amber: "#7A5300",      // warning text
  red: "#DC2626",
  bg: "#FBF7EC",         // warm cream page background
  card: "#FFFFFF",
  text: "#1B2A1F",
  muted: "#5F6B5F",
  faint: "#94A3B8",
  border: "#E8DFC7",
  cream: "#E8DFC7",
  yellow: "#FFC62E",
  gold: "#FFC62E",
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

// All photos for a restaurant: the main photo first, then any extra photos
const photosOf = (r) =>
  [...new Set([r?.imageUrl, ...(Array.isArray(r?.imageUrls) ? r.imageUrls : [])].filter(Boolean))];

// ==========================================
// VOICE NAVIGATION HELPERS
// ==========================================
const METERS = (a, b) => getDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;

// Compass direction from point a to point b, in degrees
const bearingDeg = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const TURN_WORDS = {
  left: "turn left",
  right: "turn right",
  "slight left": "bear left",
  "slight right": "bear right",
  "sharp left": "turn sharp left",
  "sharp right": "turn sharp right",
  straight: "continue straight",
  uturn: "make a U-turn",
};

// "turn left onto Rizal Avenue"
const turnText = (step) => {
  if (!step) return "";
  if (step.type === "arrive") return "arrive at your destination";
  const road = step.name ? ` onto ${step.name}` : "";
  if (step.type === "roundabout" || step.type === "rotary") {
    return `enter the roundabout and take exit ${step.exit || 1}${road}`;
  }
  const base = TURN_WORDS[step.modifier] || "continue";
  return `${base}${road}`;
};

const turnIcon = (step) => {
  if (!step) return "arrow-up";
  if (step.type === "arrive") return "flag";
  if (step.type === "roundabout" || step.type === "rotary") return "sync";
  if (step.modifier === "uturn") return "arrow-undo";
  if ((step.modifier || "").includes("left")) return "arrow-back";
  if ((step.modifier || "").includes("right")) return "arrow-forward";
  return "arrow-up";
};

// 200 -> "200 meters", 1400 -> "1.4 kilometers"
const spokenDistance = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} kilometers` : `${Math.max(50, Math.round(m / 50) * 50)} meters`;

// One shape for every kind of pin, so the map card can show the same details
const placeOf = (kind, r) => {
  const hasLoc = typeof r.location?.lat === "number" && typeof r.location?.lng === "number";
  const subtitle =
    kind === "spot"
      ? cap(r.category) || "Tourist spot"
      : kind === "hotel"
      ? `Partner hotel${r.dotAccredited ? "  ·  DOT accredited" : ""}`
      : kind === "resto"
      ? [r.cuisine || r.category || "Restaurant", r.priceRange].filter(Boolean).join("  ·  ")
      : "Municipal tourism office";
  return {
    kind,
    raw: r,
    name: r.name,
    latitude: hasLoc ? r.location.lat : r.latitude,
    longitude: hasLoc ? r.location.lng : r.longitude,
    photos: photosOf(r),
    subtitle,
    description: r.description || "",
    address: r.address || "",
    phone: r.phone || "",
    hours: r.openingHours || r.hours || "",
    price: kind === "hotel" && r.priceFrom ? `from ₱${Number(r.priceFrom).toLocaleString()} / night` : "",
    facebookUrl: r.facebookUrl || "",
    website: r.website || "",
  };
};

// Swipeable photo carousel with dots, like Google Maps photos
function PhotoCarousel({ photos, width, height }) {
  const [index, setIndex] = useState(0);
  const h = height || width * 0.62;
  if (photos.length === 0) {
    return (
      <View style={[styles.carouselEmpty, { width, height: h }]}>
        <Ionicons name="image-outline" size={28} color={C.faint} />
        <Text style={styles.metaText}>No photos yet</Text>
      </View>
    );
  }
  return (
    <View style={{ width }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        style={{ width, borderRadius: 14 }}
      >
        {photos.map((uri, i) => (
          <Image
            key={`${i}-${uri.slice(0, 24)}`}
            source={{ uri }}
            style={{ width, height: h, borderRadius: 14 }}
          />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={styles.carouselDots}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.carouselDot, i === index && styles.carouselDotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

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
        <Text style={styles.linkText}>View package photos</Text>
        <Ionicons name="chevron-forward" size={14} color={C.purple} />
      </View>
    </Press>
  );
}

export default function MapScreen({ navigation }) {
  const mapRef = useRef(null);
  const { insets, width, height, cardWidth, contentWidth, tabHeight } = useResponsive();

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
  const [routeSpot, setRouteSpot] = useState(null);
  const [route, setRoute] = useState(null); // { coords, distanceKm, minutes }
  const [mapFull, setMapFull] = useState(false);
  const fullMapRef = useRef(null);
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsOpen, setRestaurantsOpen] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restoMode, setRestoMode] = useState("recommended"); // "recommended" | "cheapest"

  // Voice navigation
  const [navigating, setNavigating] = useState(false);
  const [navInfo, setNavInfo] = useState(null); // { step, distance, remainingKm, minutes }
  const [livePos, setLivePos] = useState(null); // your position while navigating
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const watchRef = useRef(null);
  const simRef = useRef(null); // test-drive timer
  const navRef = useRef(null);

  // Dining directory + Firestore entries. A Firestore entry with the same name
  // adds or replaces details such as phone, Facebook and map coordinates.
  const restaurantList = useMemo(() => {
    const key = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const map = new Map();
    DINING_DIRECTORY.forEach((r) => map.set(key(r.name), { ...r, id: key(r.name) }));
    restaurants.forEach((r) => {
      const k = key(r.name);
      map.set(k, { ...(map.get(k) || {}), ...r, id: r.id || k });
    });
    return [...map.values()];
  }, [restaurants]);

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
      onSnapshot(collection(db, "restaurants"), (snap) =>
        setRestaurants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
  // Adds 1 to the view count so the chatbot knows what is most visited
  const trackView = (collectionName, id) => {
    if (!id) return;
    updateDoc(doc(db, collectionName, id), { viewCount: increment(1) }).catch(() => {});
  };

  // Road route from the free OpenStreetMap routing service (no Google Maps needed)
  const fetchRoadRoute = async (from, to) => {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    const r = data.routes && data.routes[0];
    if (!r) throw new Error("No route found");
    return {
      coords: r.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceKm: r.distance / 1000,
      minutes: Math.round(r.duration / 60),
      steps: (r.legs?.[0]?.steps || []).map((st) => ({
        type: st.maneuver.type,
        modifier: st.maneuver.modifier,
        exit: st.maneuver.exit,
        name: st.name,
        distance: st.distance,
        location: { latitude: st.maneuver.location[1], longitude: st.maneuver.location[0] },
      })),
    };
  };

  // Draws the route from you to a tourist spot and fits both on the map
  const selectRoute = async (spot) => {
    const to = { latitude: spot.latitude, longitude: spot.longitude };
    setRouteSpot(spot);
    setRoute(null);
    try {
      setRoute(await fetchRoadRoute(userLocation, to));
    } catch {
      // Offline or service unavailable: show a straight line instead
      setRoute({
        coords: [userLocation, to],
        distanceKm: getDistanceKm(userLocation.latitude, userLocation.longitude, to.latitude, to.longitude),
        minutes: null,
      });
    }
  };

  // Fit the active map to the route (also runs when the full map opens)
  useEffect(() => {
    if (!routeSpot || !userLocation || navigating) return;
    const to = { latitude: routeSpot.latitude, longitude: routeSpot.longitude };
    const coords = route?.coords?.length ? route.coords : [userLocation, to];
    const t = setTimeout(
      () => {
        (mapFull ? fullMapRef : mapRef).current?.fitToCoordinates(coords, {
          edgePadding: {
            top: 80,
            right: 60,
            bottom: mapFull ? Math.round(height * 0.5) : 160,
            left: 60,
          },
          animated: true,
        });
      },
      mapFull ? 500 : 100
    );
    return () => clearTimeout(t);
  }, [route, routeSpot, mapFull, navigating]);

  // ==========================================
  // VOICE NAVIGATION (turn-by-turn, like Google Maps)
  // ==========================================
  const speak = (text) => {
    if (mutedRef.current || !text) return;
    Speech.stop();
    Speech.speak(text, { language: "en-US", rate: 0.95 });
  };

  const stopNavigation = () => {
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = null;
    watchRef.current?.remove();
    watchRef.current = null;
    navRef.current = null;
    Speech.stop();
    setNavigating(false);
    setNavInfo(null);
    setLivePos(null);
    fullMapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 400 });
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) Speech.stop();
  };

  // Gets a fresh route from where you are now (when you leave the route)
  const reroute = async (here) => {
    const nav = navRef.current;
    if (!nav) return;
    speak("Rerouting");
    try {
      const r = await fetchRoadRoute(here, nav.to);
      if (!navRef.current) return;
      nav.steps = r.steps || nav.steps;
      nav.coords = r.coords;
      nav.next = 1;
      nav.far = false;
      nav.near = false;
      nav.totalKm = r.distanceKm;
      nav.totalMin = r.minutes;
      setRoute(r);
    } catch {
      // No internet: keep the old route and try again later
    }
  };

  // Runs on every GPS update while navigating
  const onPosition = (pos) => {
    const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setLivePos(here);
    const nav = navRef.current;
    if (!nav) return;

    const heading = pos.coords.heading;
    fullMapRef.current?.animateCamera(
      { center: here, zoom: 17.5, pitch: 40, heading: heading != null && heading >= 0 ? heading : 0 },
      { duration: 600 }
    );

    // Off the route for two updates in a row: reroute
    let minDist = Infinity;
    for (const c of nav.coords) {
      const d = METERS(here, c);
      if (d < minDist) minDist = d;
    }
    if (minDist > 60) {
      nav.off += 1;
      if (nav.off >= 2 && Date.now() - nav.lastReroute > 15000) {
        nav.lastReroute = Date.now();
        nav.off = 0;
        reroute(here);
        return;
      }
    } else {
      nav.off = 0;
    }

    const step = nav.steps[nav.next];
    if (!step) return;
    const d = METERS(here, step.location);
    const isArrive = step.type === "arrive";

    const remainingM = d + nav.steps.slice(nav.next).reduce((s, st) => s + (st.distance || 0), 0);
    setNavInfo({
      step,
      distance: d,
      remainingKm: remainingM / 1000,
      minutes: Math.max(1, Math.round((nav.totalMin || 1) * (remainingM / (nav.totalKm * 1000 || 1)))),
    });

    if (d <= 30) {
      if (isArrive) {
        speak(`You have arrived at ${nav.name}`);
        setTimeout(stopNavigation, 4000);
      } else {
        nav.next += 1;
        nav.far = false;
        nav.near = false;
      }
    } else if (d <= 60 && !nav.near && !isArrive) {
      nav.near = true;
      nav.far = true;
      speak(cap(turnText(step)));
    } else if (d <= 250 && !nav.far) {
      nav.far = true;
      speak(
        isArrive
          ? `Your destination is in ${spokenDistance(d)}`
          : `In ${spokenDistance(d)}, ${turnText(step)}`
      );
    }
  };

  // simulate = true: a test drive along the route, no need to move
  const startNavigation = async (simulate = false) => {
    if (usingFallback && !simulate) {
      Alert.alert("Location needed", "Turn on your phone's location so the app can guide you.");
      return;
    }
    if (!route?.steps?.length || route.steps.length < 2 || !routeSpot) {
      Alert.alert(
        "Directions not ready",
        "Turn-by-turn directions need an internet connection. Try again in a moment."
      );
      return;
    }
    const first = route.steps[1];
    const d = METERS(userLocation, first.location);
    navRef.current = {
      steps: route.steps,
      coords: route.coords,
      next: 1,
      far: true, // the first instruction is spoken now
      near: false,
      off: 0,
      lastReroute: Date.now(),
      name: routeSpot.name,
      to: { latitude: routeSpot.latitude, longitude: routeSpot.longitude },
      totalKm: route.distanceKm,
      totalMin: route.minutes,
    };
    mutedRef.current = muted;
    setNavInfo({
      step: first,
      distance: d,
      remainingKm: route.distanceKm,
      minutes: route.minutes || 1,
    });
    setNavigating(true);
    speak(
      `Starting navigation to ${routeSpot.name}. ` +
        (first.type === "arrive"
          ? `Your destination is in ${spokenDistance(d)}`
          : `In ${spokenDistance(d)}, ${turnText(first)}`)
    );
    if (simulate) {
      // Moves a fake position along the route, about 25 m every second
      const coords = route.coords;
      let idx = 0;
      simRef.current = setInterval(() => {
        let moved = 0;
        while (idx < coords.length - 1 && moved < 25) {
          moved += METERS(coords[idx], coords[idx + 1]);
          idx += 1;
        }
        const p = coords[idx];
        const prev = coords[Math.max(0, idx - 1)];
        onPosition({
          coords: {
            latitude: p.latitude,
            longitude: p.longitude,
            heading: idx > 0 ? bearingDeg(prev, p) : 0,
          },
        });
        if (idx >= coords.length - 1) {
          clearInterval(simRef.current);
          simRef.current = null;
        }
      }, 1000);
      return;
    }
    try {
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 8,
          timeInterval: 1500,
        },
        onPosition
      );
    } catch {
      stopNavigation();
      Alert.alert("Location unavailable", "Could not follow your location. Check your GPS settings.");
    }
  };

  useEffect(
    () => () => {
      if (simRef.current) clearInterval(simRef.current);
      watchRef.current?.remove();
      Speech.stop();
    },
    []
  );

  // Tapping a pin opens the full map with the route and the place details
  const pickPlace = (place) => {
    if (navRef.current) return; // ignore pins while navigating
    setMapFull(true);
    selectRoute(place);
  };

  const clearRoute = () => {
    setRouteSpot(null);
    setRoute(null);
  };

  const openSpotPackages = (spot) => {
    trackView("touristSpots", spot.id);
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

  // Shows the route inside the app (full map) instead of opening Google Maps
  const openDirections = (place) => {
    setSelectedSpot(null);
    setSelectedHotel(null);
    setSelectedRestaurant(null);
    setRestaurantsOpen(false);
    setPackagesOpen(false);
    // Wait for the sheet to close before showing the full map
    setTimeout(() => {
      setMapFull(true);
      selectRoute(place);
    }, 350);
  };

  // Booking link opens directly; otherwise show the contact options
  // Lowest price from "₱150 - ₱400" (or a priceFrom number); Infinity if unknown
  const lowestPrice = (r) => {
    if (typeof r.priceFrom === "number") return r.priceFrom;
    const nums = String(r.priceRange || "").replace(/,/g, "").match(/\d+(\.\d+)?/g);
    return nums ? Math.min(...nums.map(Number)) : Infinity;
  };

  const hasContact = (r) => !!r.phone || !!normalizeUrl(r.facebookUrl);

  // Recommended: nearest first when a map pin exists, then places with a phone or Facebook
  const recommendedRestos = useMemo(() => {
    const withInfo = restaurantList.map((r) => {
      const hasPin = typeof r.location?.lat === "number" && typeof r.location?.lng === "number";
      const distance =
        hasPin && userLocation
          ? getDistanceKm(userLocation.latitude, userLocation.longitude, r.location.lat, r.location.lng)
          : null;
      return { ...r, distance };
    });
    return withInfo.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return (hasContact(b) ? 1 : 0) - (hasContact(a) ? 1 : 0);
    });
  }, [restaurantList, userLocation]);

  // Cheapest: lowest starting price first
  const cheapestRestos = useMemo(
    () => [...restaurantList].sort((a, b) => lowestPrice(a) - lowestPrice(b)),
    [restaurantList]
  );

  const visibleRestos = (restoMode === "cheapest" ? cheapestRestos : recommendedRestos).slice(0, 3);

  // Directions use the saved map pin if there is one, otherwise a search by name and address
  const openRestaurantDirections = (r) => {
    if (r.location?.lat && r.location?.lng) {
      openDirections(placeOf("resto", r));
      return;
    }
    Alert.alert("No map pin yet", "This place doesn't have a map location saved yet.");
  };

  const openHotel = (hotel) => {
    trackView("hotels", hotel.id);
    const bookingUrl = normalizeUrl(hotel.externalBookingUrl);
    if (bookingUrl) {
      openLink(bookingUrl);
      return;
    }
    setSelectedHotel(hotel);
  };

  // Directions requested from the chat screen: show the route on this map
  const openDirectionsRef = useRef(null);
  openDirectionsRef.current = openDirections;
  useEffect(() => {
    if (!userLocation) return;
    const check = () => {
      const req = takePendingDirections();
      if (!req) return;
      openDirectionsRef.current({
        ...placeOf(req.kind, req.item),
        latitude: req.lat,
        longitude: req.lng,
      });
    };
    check();
    const offBus = onDirectionsRequest(check);
    const offFocus = navigation.addListener("focus", check);
    return () => {
      offBus();
      offFocus();
    };
  }, [userLocation, navigation]);

  const locateMe = () => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion(
      { ...userLocation, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      500
    );
  };

  const renderMapLayers = () => (
    <>
            <Marker
              coordinate={{
                latitude: TOURISM_OFFICE.latitude,
                longitude: TOURISM_OFFICE.longitude,
              }}
              title={TOURISM_OFFICE.name}
              pinColor={C.purple}
              onPress={() => pickPlace(placeOf("office", TOURISM_OFFICE))}
            />
            {nearbySpots.map((spot) => (
              <Marker
                key={`spot-${spot.id}`}
                coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
                title={spot.name}
                description={spot.category || "Tourist spot"}
                pinColor="#FFC62E"
                onPress={() => pickPlace(placeOf("spot", spot))}
              />
            ))}
            {sortedHotels
              .filter((h) => typeof h.location?.lat === "number" && typeof h.location?.lng === "number")
              .map((h) => (
                <Marker
                  key={`hotel-${h.id}`}
                  coordinate={{ latitude: h.location.lat, longitude: h.location.lng }}
                  title={h.name}
                  description="Partner hotel"
                  pinColor="#1C6EA4"
                  onPress={() => pickPlace(placeOf("hotel", h))}
                />
              ))}
            {restaurantList
              .filter((r) => typeof r.location?.lat === "number" && typeof r.location?.lng === "number")
              .map((r) => (
                <Marker
                  key={`resto-${r.id}`}
                  coordinate={{ latitude: r.location.lat, longitude: r.location.lng }}
                  title={r.name}
                  description="Restaurant"
                  pinColor="#FF8A3D"
                  onPress={() => pickPlace(placeOf("resto", r))}
                />
              ))}
            <Marker coordinate={livePos || userLocation} title="You are here" pinColor="#E53935" />
            {route ? (
              <Polyline
                coordinates={route.coords}
                strokeColor="#2F7A3E"
                strokeWidth={5}
              />
            ) : null}
    </>
  );

  const routeCardEl = routeSpot ? (
            <View style={styles.routeCard}>
              <View style={styles.flex}>
                <Text style={styles.routeTitle} numberOfLines={1}>{routeSpot.name}</Text>
                <Text style={styles.routeMeta}>
                  {route
                    ? `${formatDistance(route.distanceKm)}${
                        route.minutes != null ? ` · about ${route.minutes} min by road` : " · straight line"
                      }`
                    : "Finding the route…"}
                </Text>
              </View>
              {route ? null : <ActivityIndicator color="#2F7A3E" size="small" />}
              <TouchableOpacity onPress={clearRoute} hitSlop={8}>
                <Ionicons name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>
          ) : null;

  // "More details" closes the full map first, then opens the matching sheet
  const openPlaceDetails = (place) => {
    setMapFull(false);
    setTimeout(() => {
      if (place.kind === "spot") openSpotPackages(place.raw);
      else if (place.kind === "hotel") openHotel(place.raw);
      else if (place.kind === "resto") setSelectedRestaurant(place.raw);
    }, 350);
  };

  // Google-Maps-style place card shown on the full map when a pin is tapped
  const placeCardEl = routeSpot ? (
    <View style={[styles.placeCard, { maxHeight: height * 0.5, paddingBottom: insets.bottom + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {routeSpot.photos?.length ? (
          <View style={{ marginBottom: 10 }}>
            <PhotoCarousel photos={routeSpot.photos} width={width - 24} height={150} />
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.placeName} numberOfLines={2}>{routeSpot.name}</Text>
            {routeSpot.subtitle ? (
              <Text style={styles.placeSub} numberOfLines={1}>{routeSpot.subtitle}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={clearRoute} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.row, { marginTop: 8 }]}>
          <Ionicons name="navigate" size={15} color={C.purple} />
          <Text style={styles.placeRoute}>
            {route
              ? `${formatDistance(route.distanceKm)}${
                  route.minutes != null ? ` · about ${route.minutes} min by road` : " · straight line"
                }`
              : "Finding the route…"}
          </Text>
          {route ? null : <ActivityIndicator color="#2F7A3E" size="small" />}
        </View>

        {routeSpot.price ? <Text style={[styles.priceText, { marginTop: 6 }]}>{routeSpot.price}</Text> : null}
        {routeSpot.address ? (
          <View style={styles.placeInfoRow}>
            <Ionicons name="location-outline" size={15} color={C.muted} />
            <Text style={styles.placeInfoText}>{routeSpot.address}</Text>
          </View>
        ) : null}
        {routeSpot.hours ? (
          <View style={styles.placeInfoRow}>
            <Ionicons name="time-outline" size={15} color={C.muted} />
            <Text style={styles.placeInfoText}>{routeSpot.hours}</Text>
          </View>
        ) : null}
        {routeSpot.phone ? (
          <View style={styles.placeInfoRow}>
            <Ionicons name="call-outline" size={15} color={C.muted} />
            <Text style={styles.placeInfoText}>{routeSpot.phone}</Text>
          </View>
        ) : null}
        {routeSpot.description ? (
          <Text style={styles.placeDesc} numberOfLines={4}>{routeSpot.description}</Text>
        ) : null}

        <View style={styles.placeBtnRow}>
          {route?.steps?.length ? (
            <TouchableOpacity style={[styles.placeBtn, styles.placeBtnGold]} onPress={() => startNavigation(false)}>
              <Ionicons name="navigate-circle" size={18} color="#1B2A1F" />
              <Text style={[styles.placeBtnText, { color: "#1B2A1F" }]}>Start</Text>
            </TouchableOpacity>
          ) : null}
          {route?.steps?.length ? (
            <TouchableOpacity style={styles.placeBtn} onPress={() => startNavigation(true)}>
              <Ionicons name="play-circle-outline" size={18} color={C.purple} />
              <Text style={styles.placeBtnText}>Test drive</Text>
            </TouchableOpacity>
          ) : null}
          {routeSpot.phone ? (
            <TouchableOpacity
              style={styles.placeBtn}
              onPress={() => openLink(`tel:${firstPhone(routeSpot.phone)}`)}
            >
              <Ionicons name="call-outline" size={16} color={C.purple} />
              <Text style={styles.placeBtnText}>Call</Text>
            </TouchableOpacity>
          ) : null}
          {normalizeUrl(routeSpot.facebookUrl) ? (
            <TouchableOpacity
              style={styles.placeBtn}
              onPress={() => openLink(normalizeUrl(routeSpot.facebookUrl))}
            >
              <Ionicons name="logo-facebook" size={16} color={C.purple} />
              <Text style={styles.placeBtnText}>Facebook</Text>
            </TouchableOpacity>
          ) : null}
          {normalizeUrl(routeSpot.website) ? (
            <TouchableOpacity
              style={styles.placeBtn}
              onPress={() => openLink(normalizeUrl(routeSpot.website))}
            >
              <Ionicons name="globe-outline" size={16} color={C.purple} />
              <Text style={styles.placeBtnText}>Website</Text>
            </TouchableOpacity>
          ) : null}
          {routeSpot.kind && routeSpot.kind !== "office" ? (
            <TouchableOpacity
              style={[styles.placeBtn, styles.placeBtnPrimary]}
              onPress={() => openPlaceDetails(routeSpot)}
            >
              <Text style={[styles.placeBtnText, { color: "#fff" }]}>
                {routeSpot.kind === "spot" ? "Trip packages" : "More details"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  ) : null;

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
            {renderMapLayers()}
          </MapView>

          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setMapFull(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="expand-outline" size={20} color={C.purple} />
          </TouchableOpacity>

          {routeCardEl}

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
              openDirections(placeOf("office", TOURISM_OFFICE))
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

        {/* Restaurants */}
        <SectionHeader
          title="Restaurants"
          action="View all"
          onAction={() => setRestaurantsOpen(true)}
        />
        <View style={styles.restoToggle}>
          {[
            { id: "recommended", label: "Recommended" },
            { id: "cheapest", label: "Cheapest" },
          ].map((t) => {
            const active = restoMode === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setRestoMode(t.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {visibleRestos.length === 0 ? (
          <Text style={styles.emptyText}>No restaurants yet.</Text>
        ) : (
          visibleRestos.map((r, i) => (
            <Press key={r.id} style={styles.hotelCard} onPress={() => setSelectedRestaurant(r)}>
              {r.imageUrl ? (
                <Image source={{ uri: r.imageUrl }} style={styles.hotelImage} />
              ) : (
                <View style={[styles.hotelImage, styles.placeholder]}>
                  <Text style={styles.placeholderText}>{r.name?.charAt(0)?.toUpperCase() || "R"}</Text>
                </View>
              )}
              <View style={styles.flex}>
                {i === 0 && restoMode === "recommended" ? (
                  <View style={styles.recBadge}>
                    <Ionicons name="star" size={11} color={C.purple} />
                    <Text style={styles.recBadgeText}>RECOMMENDED</Text>
                  </View>
                ) : null}
                {i === 0 && restoMode === "cheapest" ? (
                  <View style={styles.cheapBadge}>
                    <Ionicons name="pricetag" size={11} color={C.amber} />
                    <Text style={styles.cheapBadgeText}>CHEAPEST</Text>
                  </View>
                ) : null}
                <Text style={styles.hotelName} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.metaText} numberOfLines={1}>
                  {r.cuisine || r.category || "Restaurant"}
                </Text>
                {r.distance != null ? (
                  <View style={styles.row}>
                    <Ionicons name="navigate-outline" size={12} color={C.muted} />
                    <Text style={styles.metaText}>{formatDistance(r.distance)} away</Text>
                  </View>
                ) : null}
                {r.priceRange ? <Text style={styles.priceText}>{r.priceRange}</Text> : null}
                <View style={[styles.row, { marginTop: 6 }]}>
                  <Text style={styles.linkText}>{hasContact(r) ? "Contact and directions" : "Directions"}</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.purple} />
                </View>
              </View>
            </Press>
          ))
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
          icon="restaurant"
          label="Restaurants"
          onPress={() => setRestaurantsOpen(true)}
        />
        <TabItem
          icon="person"
          label="Profile"
          onPress={() => navigation.navigate("Account")}
        />
      </View>

      {/* Full map pop-up */}
      <Modal
        visible={mapFull}
        animationType="fade"
        onRequestClose={() => {
          stopNavigation();
          setMapFull(false);
        }}
      >
        <View style={styles.flex}>
          <MapView
            ref={fullMapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }}
          >
            {renderMapLayers()}
          </MapView>

          {navigating ? (
            <View style={[styles.navBanner, { top: insets.top + 8 }]}>
              <View style={styles.navIcon}>
                <Ionicons name={turnIcon(navInfo?.step)} size={30} color="#fff" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.navDist}>
                  {navInfo ? formatDistance(navInfo.distance / 1000) : ""}
                </Text>
                <Text style={styles.navText} numberOfLines={2}>
                  {cap(turnText(navInfo?.step))}
                </Text>
              </View>
              <TouchableOpacity onPress={toggleMute} hitSlop={10} style={styles.navMute}>
                <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.expandBtn, { top: insets.top + 12 }]}
              onPress={() => {
                stopNavigation();
                setMapFull(false);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="contract-outline" size={20} color={C.purple} />
            </TouchableOpacity>
          )}

          {navigating ? (
            <View style={[styles.navBottom, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.flex}>
                <Text style={styles.navEta}>{navInfo ? `${navInfo.minutes} min` : "…"}</Text>
                <Text style={styles.navSub} numberOfLines={1}>
                  {navInfo ? `${formatDistance(navInfo.remainingKm)}  ·  ${routeSpot?.name || ""}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={styles.navEnd} onPress={stopNavigation}>
                <Text style={styles.navEndText}>End</Text>
              </TouchableOpacity>
            </View>
          ) : (
            placeCardEl
          )}
        </View>
      </Modal>

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
              selectedSpot && openDirections(placeOf("spot", selectedSpot))
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
        <View style={[styles.sheet, styles.contactSheet, { paddingBottom: insets.bottom + 28 }]}>
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
                  openDirections(placeOf("hotel", selectedHotel))
                }
              >
                <Ionicons name="navigate-outline" size={16} color="#fff" />
                <Text style={styles.sheetDirectionsText}>Directions</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      {/* Restaurants list */}
      <Modal
        visible={restaurantsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRestaurantsOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRestaurantsOpen(false)} />
        <View style={[styles.sheet, styles.contactSheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle}>Restaurants</Text>
              <Text style={styles.muted}>
                {restaurantList.length} {restaurantList.length === 1 ? "place" : "places"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setRestaurantsOpen(false)} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          {restaurantList.length === 0 ? (
            <View style={styles.noPkg}>
              <Text style={styles.sheetSub}>No restaurants yet</Text>
              <Text style={styles.muted}>Restaurants will appear here once they are added.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: "80%" }} showsVerticalScrollIndicator={false}>
              {restaurantList.map((r) => (
                <Press key={r.id} style={styles.hotelCard} onPress={() => setSelectedRestaurant(r)}>
                  {r.imageUrl ? (
                    <Image source={{ uri: r.imageUrl }} style={styles.hotelImage} />
                  ) : (
                    <View style={[styles.hotelImage, styles.placeholder]}>
                      <Text style={styles.placeholderText}>{r.name?.charAt(0)?.toUpperCase() || "R"}</Text>
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.hotelName} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {r.cuisine || r.category || "Restaurant"}
                    </Text>
                    {r.priceRange ? <Text style={styles.priceText}>{r.priceRange}</Text> : null}
                    {r.address ? (
                      <Text style={styles.metaText} numberOfLines={2}>{r.address}</Text>
                    ) : null}
                    <View style={[styles.row, { marginTop: 6 }]}>
                      <Text style={styles.linkText}>
                        {hasContact(r) ? "Contact and directions" : "Directions"}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={C.purple} />
                    </View>
                  </View>
                </Press>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Restaurant contact popup */}
      <Modal
        visible={!!selectedRestaurant}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRestaurant(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelectedRestaurant(null)} />
        <View style={[styles.sheet, styles.contactSheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{selectedRestaurant?.name}</Text>
              <Text style={styles.muted} numberOfLines={2}>
                {[selectedRestaurant?.cuisine, selectedRestaurant?.priceRange].filter(Boolean).join("  ·  ")}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedRestaurant(null)} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ marginBottom: 14 }}>
              <PhotoCarousel photos={photosOf(selectedRestaurant)} width={width - 40} />
            </View>

            {selectedRestaurant?.address ? (
              <Text style={[styles.muted, { marginBottom: 10 }]}>{selectedRestaurant.address}</Text>
            ) : null}
            {selectedRestaurant?.openingHours ? (
              <Text style={[styles.muted, { marginBottom: 10 }]}>Hours: {selectedRestaurant.openingHours}</Text>
            ) : null}
            {selectedRestaurant?.description ? (
              <Text style={[styles.muted, { marginBottom: 12 }]}>{selectedRestaurant.description}</Text>
            ) : null}

            {selectedRestaurant?.phone ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openLink(`tel:${firstPhone(selectedRestaurant.phone)}`)}
              >
                <Ionicons name="call-outline" size={18} color={C.purple} />
                <Text style={styles.contactText}>{selectedRestaurant.phone}</Text>
              </TouchableOpacity>
            ) : null}

            {normalizeUrl(selectedRestaurant?.facebookUrl) ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openLink(normalizeUrl(selectedRestaurant.facebookUrl))}
              >
                <Ionicons name="logo-facebook" size={18} color={C.purple} />
                <Text style={styles.contactText}>
                  {selectedRestaurant.facebookName || "Facebook page"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {!selectedRestaurant?.phone && !normalizeUrl(selectedRestaurant?.facebookUrl) ? (
              <Text style={[styles.muted, { marginBottom: 10 }]}>
                Phone and Facebook not added yet. Use directions to find the place.
              </Text>
            ) : null}

            {selectedRestaurant ? (
              <TouchableOpacity
                style={styles.sheetDirections}
                onPress={() =>
                  openRestaurantDirections(selectedRestaurant)
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
  brandPurple: { color: "#FFC62E" },
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
    right: 12,
    top: 12,
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
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  restThumb: { width: 56, height: 56, borderRadius: 12 },
  restoToggle: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  cheapBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  cheapBadgeText: { color: "#B45309", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  expandBtn: {
    position: "absolute",
    left: 12,
    top: 12,
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
  routeCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 10,
    borderWidth: 0.5,
    borderColor: "#E8DFC7",
  },
  placeCard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  placeName: { fontSize: 18, fontWeight: "800", color: "#1B2A1F" },
  placeSub: { fontSize: 13, color: "#5F6B5F", marginTop: 2 },
  placeRoute: { fontSize: 13, fontWeight: "600", color: "#2F7A3E", flexShrink: 1 },
  placeInfoRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-start" },
  placeInfoText: { flex: 1, fontSize: 13, color: "#5F6B5F", lineHeight: 18 },
  placeDesc: { fontSize: 13, color: "#1B2A1F", lineHeight: 19, marginTop: 10 },
  placeBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  placeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8DFC7",
    backgroundColor: "#FFFFFF",
  },
  placeBtnGold: { backgroundColor: "#FFC62E", borderColor: "#FFC62E" },
  navBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#2F7A3E",
    borderRadius: 16,
    padding: 14,
    elevation: 8,
  },
  navIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  navDist: { color: "#FFC62E", fontSize: 22, fontWeight: "800" },
  navText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginTop: 2 },
  navMute: { padding: 6 },
  navBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    elevation: 10,
  },
  navEta: { fontSize: 22, fontWeight: "800", color: "#2F7A3E" },
  navSub: { fontSize: 13, color: "#5F6B5F", marginTop: 2 },
  navEnd: { backgroundColor: "#DC2626", borderRadius: 22, paddingHorizontal: 22, paddingVertical: 12 },
  navEndText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  placeBtnPrimary: { backgroundColor: "#2F7A3E", borderColor: "#2F7A3E" },
  placeBtnText: { fontSize: 13, fontWeight: "700", color: "#2F7A3E" },
  routeTitle: { color: "#1B2A1F", fontSize: 14, fontWeight: "700" },
  routeMeta: { color: "#5F6B5F", fontSize: 12, marginTop: 2 },
  routeGo: {
    backgroundColor: "#2F7A3E",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  routeGoText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  carouselEmpty: {
    backgroundColor: C.bg,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  carouselDots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  carouselDotActive: { backgroundColor: C.purple, width: 16 },
  contactSheet: {
    minHeight: "60%",
    maxHeight: "92%",
  },
  contactText: { color: C.text, fontSize: 14, fontWeight: "600", flex: 1 },
});