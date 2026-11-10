import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Linking,
  Alert,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { db } from "../../firebaseConfig";
import { collection, getDocs, doc, updateDoc, increment } from "firebase/firestore";
import * as Location from "expo-location";
import { TOURISM_OFFICE } from "../constants/tourismOffice";
import { requestDirections } from "../utils/directionsBus";
import { DINING_DIRECTORY } from "../constants/sanCarlosDining";

// ==========================================
// GEMINI CONFIG
// ==========================================
// The key now comes from your .env file:
//   EXPO_PUBLIC_GEMINI_API_KEY=your-new-key-here
// After editing .env, restart Expo with:  npx expo start -c
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

// The key is sent in a header instead of the URL so it doesn't show up in logs.
const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Easter egg: fixed reply when someone types "Melissa"
const MELISSA_REPLY =
  "Melissa is the designer of this app, and she is the most beautiful woman I know. " +
  "She is the cutest, very demure, and very pretty. " +
  "Every pixel in this app got a little brighter because she made it. 💜";

// Straight-line distance in km between two points
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// "350 m" or "2.4 km"
const formatKm = (km) =>
  km == null ? "" : km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;

// ==========================================
// MAP-STYLE COLORS (same look as the hotel cards on the map screen)
// ==========================================
const C = {
  navy: "#2F7A3E",       // header and main dark (deep green)
  purple: "#2F7A3E",     // accent for links, icons and buttons (deep green)
  purpleSoft: "#FFF1BF", // soft gold background
  green: "#3E9B4F",
  greenSoft: "#E6FBEC",
  gold: "#FFC62E",
  bg: "#FBF7EC",         // warm cream page background
  text: "#1B2A1F",
  muted: "#5F6B5F",
  faint: "#94A3B8",
  border: "#E8DFC7",
};

// ==========================================
// SMALL HELPERS (same behavior as in MapScreen)
// ==========================================
const peso = (n) => `₱${Number(n).toLocaleString()}`;

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

// "0927 697 3031 / 0969 545 9405" -> first number only
const firstPhone = (p) => (p || "").split("/")[0].replace(/[^\d+]/g, "");

// Hotels / restaurants save { location: {lat, lng} }; spots may use either form
const getCoords = (item) => {
  const rawLat = item.location?.lat ?? item.latitude;
  const rawLng = item.location?.lng ?? item.longitude;
  if (rawLat == null || rawLng == null || rawLat === "" || rawLng === "") return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

// Adds `km` (distance from the user) to every item
const withKm = (list, here) =>
  list.map((item) => {
    const c = getCoords(item);
    return {
      ...item,
      km: c ? getDistanceKm(here.latitude, here.longitude, c.lat, c.lng) : null,
    };
  });

const byDistance = (a, b) => {
  if (a.km == null && b.km == null) return 0;
  if (a.km == null) return 1;
  if (b.km == null) return -1;
  return a.km - b.km;
};

// ==========================================
// PLACE QUESTIONS ANSWERED BY CODE (not by the AI)
// "hotels in San Carlos", "nearest cafe", "tourist spots", "cheapest hotel"...
// The app builds the answer from Firestore and returns tappable CARDS,
// exactly like the lists on the map screen.
// ==========================================
const HOTEL_WORDS = /\b(hotels?|inns?|resorts?|pension|lodg(e|ing)s?|accommodations?|places? to stay|where to stay|stay)\b/i;
const NEAREST_WORDS = /\b(nearest|closest|near ?by|near me|near)\b/i;
const CHEAPEST_WORDS = /\b(cheapest|cheap|lowest|least expensive|most affordable|affordable|budget)\b/i;
const SPOT_WORDS = /\b(tourist spots?|tourist attractions?|attractions?|spots?|beach(es)?|falls?|waterfalls?|parks?|islands?|places? to (visit|go)|things to do|destinations?|sightseeing|landmarks?)\b/i;
const RESTO_WORDS = /\b(restaurants?|restos?|food|eat|eats|eatery|eateries|dining|dine|cafes?|coffee|milk ?tea|dessert|bakery|bakeries|pizza|fast ?food|bars?|restobars?|pubs?|nightlife|carenderias?|pungko|street food)\b/i;

// Optional narrowing, matched against the directory category
const RESTO_CATEGORIES = [
  [/\b(cafes?|coffee|milk ?tea|dessert)\b/i, "Cafes", "cafes & dessert shops"],
  [/\b(fast ?food|pizza|bakery|bakeries)\b/i, "Pizzerias", "fast food, pizza & bakeries"],
  [/\b(bars?|restobars?|pubs?|nightlife)\b/i, "Restobars", "restobars & pubs"],
  [/\b(carenderias?|pungko|street food|market)\b/i, "Local Eateries", "local eateries"],
];

const normName = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Directory first, then Firestore entries (which win when the name matches)
const mergeRestaurants = (firestoreList) => {
  const map = new Map();
  DINING_DIRECTORY.forEach((r) => map.set(normName(r.name), r));
  firestoreList.forEach((r) => {
    const key = normName(r.name);
    map.set(key, { ...(map.get(key) || {}), ...r });
  });
  return [...map.values()];
};

// "₱150 - ₱400" -> { min: 150, max: 400 }
const parsePriceRange = (text) => {
  const nums = String(text || "")
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/g);
  if (!nums) return { min: null, max: null };
  const v = nums.map(Number);
  return { min: Math.min(...v), max: Math.max(...v) };
};

// True when the message names one specific place (the AI should answer those)
const mentionsKnownPlace = (text, items) => {
  const t = normName(text);
  return items.some((i) => {
    const n = normName(i.name);
    return n.length >= 4 && t.includes(n);
  });
};

// Finds hotels / restaurants / spots named inside the AI's reply and
// returns them as cards, in the order they were mentioned
const cardsFromReply = (reply, groups, here) => {
  const t = normName(reply);
  const found = [];
  groups.forEach(([type, list]) =>
    withKm(list, here).forEach((item) => {
      const n = normName(item.name);
      if (n.length < 4) return;
      const idx = t.indexOf(n);
      if (idx >= 0) found.push({ type, item, idx });
    })
  );
  return found
    .sort((a, b) => a.idx - b.idx)
    .slice(0, 8)
    .map(({ type, item }) => ({ type, item }));
};

// Returns { text, cards } or null when the question should go to the AI
const answerPlaceQuestion = (text, data, here) => {
  const { hotels, restaurants, spots } = data;

  const wants = {
    hotel: HOTEL_WORDS.test(text),
    restaurant: RESTO_WORDS.test(text),
    spot: SPOT_WORDS.test(text),
  };
  const kinds = Object.keys(wants).filter((k) => wants[k]);
  // Mixed questions ("hotel and restaurant near a beach") go to the AI
  if (kinds.length !== 1) return null;
  const type = kinds[0];

  // "How much is Skyland Hotel?" -> AI answers, and the named place appears as a card
  if (mentionsKnownPlace(text, [...hotels, ...restaurants, ...spots])) return null;

  const wantsNearest = NEAREST_WORDS.test(text);
  const wantsCheapest = type !== "spot" && CHEAPEST_WORDS.test(text);
  if (wantsNearest && wantsCheapest) return null;

  let pool;
  let label;
  if (type === "hotel") {
    pool = hotels;
    label = "hotels";
  } else if (type === "restaurant") {
    const cat = RESTO_CATEGORIES.find(([re]) => re.test(text));
    pool = cat
      ? restaurants.filter((r) => (r.category || "").includes(cat[1]))
      : restaurants;
    label = cat ? cat[2] : "places to eat";
  } else {
    pool = spots;
    label = "tourist spots";
  }
  if (pool.length === 0) return null;

  const list = withKm(pool, here);
  const toCards = (items) => items.map((item) => ({ type, item }));

  const minPrice = (item) =>
    type === "hotel"
      ? Number(item.priceFrom) > 0
        ? Number(item.priceFrom)
        : null
      : parsePriceRange(item.priceRange).min;

  if (wantsCheapest) {
    const ranked = list
      .filter((i) => minPrice(i) != null)
      .sort((a, b) => minPrice(a) - minPrice(b))
      .slice(0, 3);
    if (ranked.length === 0) {
      return { text: `I don't have any ${label} prices yet. 😊`, cards: [] };
    }
    return {
      text:
        `Here are the cheapest ${label} in San Carlos 💸` +
        (type === "hotel"
          ? "\nPrices are starting rates per night."
          : "\nRanked by lowest starting price per person."),
      cards: toCards(ranked),
    };
  }

  if (wantsNearest) {
    const ranked = list
      .filter((i) => i.km != null)
      .sort(byDistance)
      .slice(0, 3);
    if (ranked.length === 0) {
      return {
        text: `I can't tell which is nearest yet because none of the ${label} has a saved location. 😊`,
        cards: [],
      };
    }
    return {
      text: `Here are the nearest ${label} to you 📍`,
      cards: toCards(ranked),
    };
  }

  // Plain list: "hotels in San Carlos", "show me restaurants", "tourist spots"
  const limit = type === "hotel" ? 15 : 10;
  const sorted = [...list].sort(byDistance);
  const shown = sorted.slice(0, limit);
  const more = sorted.length - shown.length;
  return {
    text:
      `Here are the ${label} in San Carlos ✨ Tap one to see details.` +
      (more > 0
        ? `\nShowing ${shown.length} of ${sorted.length}. Ask for the nearest or cheapest to narrow it down.`
        : ""),
    cards: toCards(shown),
  };
};

// ==========================================
// RESULT CARD (looks like the hotel cards on the map screen)
// ==========================================
function PlaceCard({ type, item, onPress }) {
  const initial =
    item.name?.charAt(0)?.toUpperCase() ||
    (type === "hotel" ? "H" : type === "restaurant" ? "R" : "S");
  const subtitle =
    type === "restaurant"
      ? [item.cuisine, item.priceRange].filter(Boolean).join("  ·  ")
      : type === "spot"
      ? item.category
      : null;

  return (
    <TouchableOpacity style={styles.placeCard} activeOpacity={0.85} onPress={onPress}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.placeImage} />
      ) : (
        <View style={[styles.placeImage, styles.placePlaceholder]}>
          <Text style={styles.placePlaceholderText}>{initial}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {type === "hotel" && item.dotAccredited ? (
          <View style={styles.dotBadge}>
            <Ionicons name="shield-checkmark" size={12} color={C.green} />
            <Text style={styles.dotBadgeText}>DOT ACCREDITED</Text>
          </View>
        ) : null}

        <Text style={styles.placeName} numberOfLines={1}>
          {item.name}
        </Text>

        {subtitle ? (
          <Text style={styles.placeMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        {item.km != null ? (
          <View style={styles.placeRow}>
            <Ionicons name="navigate-outline" size={12} color={C.muted} />
            <Text style={styles.placeMeta}>{formatKm(item.km)}</Text>
          </View>
        ) : null}

        {type === "hotel" && item.priceFrom ? (
          <Text style={styles.placePrice}>
            from {peso(item.priceFrom)}
            <Text style={styles.placeUnit}> / night</Text>
          </Text>
        ) : null}

        {type !== "hotel" && item.address ? (
          <Text style={styles.placeMeta} numberOfLines={1}>
            {item.address}
          </Text>
        ) : null}

        {type === "spot" && item.description ? (
          <Text style={styles.placeMeta} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={C.faint} />
    </TouchableOpacity>
  );
}

// ==========================================
// DETAILS SHEET (opens when a card is tapped)
// ==========================================
function ContactRow({ icon, text, onPress }) {
  return (
    <TouchableOpacity style={styles.contactRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={C.purple} />
      <Text style={styles.contactText} numberOfLines={2}>
        {text}
      </Text>
    </TouchableOpacity>
  );
}

function PlaceSheet({ place, packages, onClose, onOpenPackage, onDirections }) {
  const insets = useSafeAreaInsets();
  const type = place?.type;
  const item = place?.item;
  const coords = item ? getCoords(item) : null;

  const subtitle = !item
    ? ""
    : [
        item.km != null ? formatKm(item.km) : null,
        type === "restaurant" ? item.cuisine : null,
        type === "restaurant" ? item.priceRange : null,
        type === "spot" ? item.category : null,
        item.address,
      ]
        .filter(Boolean)
        .join("  ·  ");

  const packagePrice = (pkg) =>
    pkg.totalPrice ||
    pkg.price ||
    (pkg.legs || []).reduce((sum, l) => sum + (Number(l.estimatedPrice) || 0), 0);

  return (
    <Modal visible={!!place} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.sheetHandle} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {item?.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.sheetImage} />
            ) : null}

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{item?.name}</Text>
                {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
                {type === "hotel" && item?.priceFrom ? (
                  <Text style={styles.placePrice}>
                    from {peso(item.priceFrom)}
                    <Text style={styles.placeUnit}> / night</Text>
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>

            {item?.openingHours ? (
              <Text style={styles.sheetBody}>Hours: {item.openingHours}</Text>
            ) : null}

            {item?.description ? (
              <Text style={styles.sheetBody}>{item.description}</Text>
            ) : null}

            {item?.phone ? (
              <ContactRow
                icon="call-outline"
                text={item.phone}
                onPress={() => openLink(`tel:${firstPhone(item.phone)}`)}
              />
            ) : null}

            {item?.email ? (
              <ContactRow
                icon="mail-outline"
                text={item.email}
                onPress={() => openLink(`mailto:${item.email}`)}
              />
            ) : null}

            {normalizeUrl(item?.facebookUrl) ? (
              <ContactRow
                icon="logo-facebook"
                text={item.facebookName || "Facebook page"}
                onPress={() => openLink(normalizeUrl(item.facebookUrl))}
              />
            ) : null}

            {type === "spot" && packages.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sheetSection}>Trip packages</Text>
                {packages.map((pkg) => (
                  <TouchableOpacity
                    key={pkg.id}
                    style={styles.pkgRow}
                    onPress={() => onOpenPackage(pkg, item)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.placeName} numberOfLines={1}>
                        {pkg.name}
                      </Text>
                      {packagePrice(pkg) ? (
                        <Text style={styles.placePrice}>{peso(packagePrice(pkg))}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.faint} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {coords ? (
              <TouchableOpacity
                style={styles.directionsBtn}
                onPress={() => onDirections(place)}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate-outline" size={16} color="#fff" />
                <Text style={styles.directionsText}>Get directions</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      text: "Hi! 👋 I'm your San Carlos travel assistant. I can help you discover tourist spots, find hotels and restaurants near you, and check available vehicles in San Carlos. What are you looking for today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Firestore data
  const [spotsData, setSpotsData] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [accommodationsData, setAccommodationsData] = useState([]);
  const [restaurantsData, setRestaurantsData] = useState([]);
  const [packagesData, setPackagesData] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null); // { type, item }

  const flatListRef = useRef(null);

  // Caches the first model name that actually responds OK
  const workingModel = useRef(null);

  // ==========================================
  // USER LOCATION (used to sort results by distance)
  // ==========================================
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
        // Falls back to the tourism office in the prompt
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  
  // ==========================================
  // CARD ACTIONS (same behavior as the map screen)
  // ==========================================
  // Adds 1 to the view count so "most visited" stays accurate
  const trackView = (collectionName, id) => {
    if (!id) return;
    updateDoc(doc(db, collectionName, id), { viewCount: increment(1) }).catch(() => {});
  };

  const openPlace = (type, item) => {
    if (type === "hotel") {
      trackView("hotels", item.id);
      // A hotel with a booking link opens it directly, like on the map
      const bookingUrl = normalizeUrl(item.externalBookingUrl);
      if (bookingUrl) {
        openLink(bookingUrl);
        return;
      }
    }
    if (type === "spot") trackView("touristSpots", item.id);
    setSelectedPlace({ type, item });
  };

  // Directions are shown on the app's own map screen, not in Google Maps
  const showDirections = (place) => {
    const c = getCoords(place.item);
    if (!c) return;
    setSelectedPlace(null);
    requestDirections({
      kind: place.type === "restaurant" ? "resto" : place.type,
      item: place.item,
      lat: c.lat,
      lng: c.lng,
    });
    // The map screen is the one this chat was opened from
    setTimeout(() => navigation.goBack(), 250);
  };

  const openPackage = (pkg, spot) => {
    setSelectedPlace(null);
    setTimeout(() => navigation.navigate("PackageDetail", { package: pkg, spot }), 200);
  };

  // ==========================================
  // FETCH DATA FROM FIRESTORE
  // ==========================================
  useEffect(() => {
    let cancelled = false;

    const fetchCollection = async (collectionName) => {
      try {
        const snapshot = await getDocs(
          collection(db, collectionName)
        );

        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        console.log(
          `[Chatbot] ${collectionName}: ${data.length} documents loaded`
        );

        return data;
      } catch (error) {
        console.error(
          `[Chatbot] Failed to fetch "${collectionName}":`,
          error.code || "unknown-error",
          error.message
        );

        return null;
      }
    };

    const fetchData = async () => {
      const [spots, vehicles, accommodations, restaurants, packages] =
        await Promise.all([
          fetchCollection("touristSpots"),
          fetchCollection("vehicles"),
          fetchCollection("hotels"),
          fetchCollection("restaurants"),
          fetchCollection("tripPackages"),
        ]);

      if (cancelled) return;

      if (spots !== null) {
        setSpotsData(spots);
      }

      if (vehicles !== null) {
        setVehiclesData(
          vehicles.filter(
            (vehicle) => vehicle.isAvailable === true
          )
        );
      }

      if (accommodations !== null) {
        setAccommodationsData(accommodations);
      }

      if (restaurants !== null) {
        setRestaurantsData(restaurants);
      }

      if (packages !== null) {
        setPackagesData(packages);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);


  // ==========================================
  // LOG MODELS THIS API KEY CAN ACTUALLY USE
  // ==========================================
  // Run the app once and read this log. If neither name in GEMINI_MODELS
  // appears here, replace them with one that does.
  useEffect(() => {
    if (!GEMINI_API_KEY) {
      console.warn(
        "EXPO_PUBLIC_GEMINI_API_KEY is missing. Check your .env file and restart Expo with: npx expo start -c"
      );
      return;
    }

    const listModels = async () => {
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models",
          { headers: { "x-goog-api-key": GEMINI_API_KEY } }
        );

        const json = await res.json();

        const usable = (json.models || [])
          .filter((m) =>
            m.supportedGenerationMethods?.includes("generateContent")
          )
          .map((m) => m.name.replace("models/", ""));

        console.log("Usable Gemini models:", usable);
      } catch (e) {
        console.warn("Could not list Gemini models:", e);
      }
    };

    listModels();
  }, []);

  // ==========================================
  // BUILD GEMINI SYSTEM PROMPT
  // ==========================================
  const buildSystemPrompt = () => {
    const allRestaurants = mergeRestaurants(restaurantsData);
    // Use the user's location, or the tourism office when it is unavailable
    const here = userLocation || {
      latitude: TOURISM_OFFICE.latitude,
      longitude: TOURISM_OFFICE.longitude,
    };
    const locationNote = userLocation
      ? `The user's current location is ${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}.`
      : "The user's exact location is not available, so distances are measured from the Municipal Tourism Office in San Carlos City.";

    // Adds a distance to each item and keeps the nearest 15
    const nearest = (list, limit = 15) =>
      list
        .map((item) => {
          const c = getCoords(item);
          const km = c
            ? getDistanceKm(here.latitude, here.longitude, c.lat, c.lng)
            : null;
          return { ...item, km };
        })
        .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
        .slice(0, limit);

    const withDistance = (item) =>
      item.km == null ? ", distance unknown" : `, ${formatKm(item.km)}`;

    // ------------------------------------------
    // TOURIST SPOTS
    // ------------------------------------------
    const spotsText =
      spotsData.length > 0
        ? nearest(spotsData)
            .map(
              (s) =>
                `- ${s.name}${s.category ? ` (${s.category})` : ""}${withDistance(s)}${
                  s.description ? `: ${s.description}` : ""
                }`
            )
            .join("\n")
        : "No tourist spots available at the moment.";

    // ------------------------------------------
    // HOTELS (the "hotels" collection)
    // ------------------------------------------
    const hotelsText =
      accommodationsData.length > 0
        ? nearest(accommodationsData, 100)
            .map(
              (h) =>
                `- ${h.name || "Unnamed hotel"}${withDistance(h)}${
                  h.address ? `, Address: ${h.address}` : ""
                }${h.priceFrom ? `, From ₱${h.priceFrom}/night` : ""}${
                  h.phone ? `, Phone: ${h.phone}` : ""
                }${h.email ? `, Email: ${h.email}` : ""}${
                  h.facebookName ? `, Facebook: ${h.facebookName}` : ""
                }${h.dotAccredited ? ", DOT accredited" : ""}${
                  h.availabilityStatus ? `, Status: ${h.availabilityStatus}` : ""
                }`
            )
            .join("\n")
        : "No hotels available at the moment.";

    // Ready-made rankings so the AI never has to sort hotels itself
    const cheapestHotelsText =
      accommodationsData
        .filter((h) => Number(h.priceFrom) > 0)
        .sort((a, b) => Number(a.priceFrom) - Number(b.priceFrom))
        .slice(0, 5)
        .map((h, i) => `${i + 1}. ${h.name} - from ₱${h.priceFrom}/night`)
        .join("\n") || "No hotel prices available.";

    // ------------------------------------------
    // RESTAURANTS (dining directory + "restaurants" collection)
    // ------------------------------------------
    const restaurantsText =
      allRestaurants.length > 0
        ? nearest(allRestaurants, 100)
            .map(
              (r) =>
                `- ${r.name || "Unnamed restaurant"}${r.category ? ` [${r.category}]` : ""}${r.cuisine ? ` (${r.cuisine})` : ""}${withDistance(r)}${
                  r.address ? `, Address: ${r.address}` : ""
                }${r.priceRange ? `, Price: ${r.priceRange}` : ""}${
                  r.openingHours ? `, Hours: ${r.openingHours}` : ""
                }${r.phone ? `, Phone: ${r.phone}` : ""}${
                  r.description ? `: ${r.description}` : ""
                }`
            )
            .join("\n")
        : "No restaurants available at the moment.";

    const cheapestRestaurantsText =
      allRestaurants
        .map((r) => ({ ...r, _p: parsePriceRange(r.priceRange) }))
        .filter((r) => r._p.min != null)
        .sort((a, b) => a._p.min - b._p.min || a._p.max - b._p.max)
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.name} - ${r.priceRange}`)
        .join("\n") || "No restaurant prices available.";

    // ------------------------------------------
    // TRIP PACKAGES (with prices)
    // ------------------------------------------
    const packagesText =
      packagesData.length > 0
        ? packagesData
            .map((pkg) => {
              const spot = spotsData.find((x) => x.id === pkg.spotId);
              const total =
                pkg.totalPrice ||
                pkg.price ||
                (pkg.legs || []).reduce((sum, l) => sum + (Number(l.estimatedPrice) || 0), 0);
              const route = (pkg.legs || []).map((l) => l.vehicleType || "ride").join(" -> ");
              const duration = pkg.durationEstimate || pkg.duration;
              return `- ${pkg.name}${spot ? ` (${spot.name})` : ""}, Price: ₱${Number(total).toLocaleString()}${
                duration ? `, Duration: ${duration}` : ""
              }${route ? `, Route: ${route}` : ""}`;
            })
            .join("\n")
        : "No trip packages available at the moment.";

    // ------------------------------------------
    // MOST VISITED (top 5 by view count)
    // ------------------------------------------
    const topBy = (list, label) => {
      const top = list
        .filter((x) => (x.viewCount || 0) > 0)
        .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
        .slice(0, 5);
      return top.length > 0
        ? top.map((x, i) => `${i + 1}. ${x.name} (${x.viewCount} views)`).join("\n")
        : `No ${label} views recorded yet.`;
    };
    const mostVisitedText =
      `Most visited tourist spots:\n${topBy(spotsData, "tourist spot")}\n\n` +
      `Most visited hotels:\n${topBy(accommodationsData, "hotel")}`;

    // ------------------------------------------
    // VEHICLES
    // ------------------------------------------
    const vehiclesText =
      vehiclesData.length > 0
        ? vehiclesData
            .map(
              (v) =>
                `- ${
                  v.category?.replace("_", " ").toUpperCase() || "Vehicle"
                }, Plate: ${v.plate || "N/A"}${
                  v.model ? `, Model: ${v.model}` : ""
                }${v.price ? `, Price: ₱${v.price}/hr` : ""}`
            )
            .join("\n")
        : "No vehicles currently available.";

    // ------------------------------------------
    // SYSTEM PROMPT
    // ------------------------------------------
    return `You are a friendly and helpful AI travel assistant for TouraMove, a travel, tourism, and vehicle rental app focused on San Carlos City, Negros Occidental, Philippines.

You help users with:

1. Discovering tourist spots in San Carlos
2. Finding hotels, inns, resorts, and other places to stay
3. Finding restaurants and places to eat
4. Finding vehicles available for rent
5. Answering general questions about San Carlos

LOCATION
${locationNote}
Distances are straight-line distances from that location, so they are approximate. Each list below is sorted from nearest to farthest.

IMPORTANT RULES

- Tourist spots, attractions, beaches, falls, and parks: use the TOURIST SPOTS data.
- Hotels, inns, resorts, pension houses, and places to stay: use the HOTELS data.
- Restaurants, food, cafes, and where to eat: use the RESTAURANTS data.
- Prices, costs, budget, or cheapest options: use the PRICE values in the HOTELS, RESTAURANTS, TRIP PACKAGES and VEHICLES data. Say hotel prices are "starting from".
- Trip packages, tours, and itineraries: use the TRIP PACKAGES data.
- Popular, most visited, or top places: use the MOST VISITED data.
- Vehicles, rentals, rides, motorcycles, and cars: use the VEHICLES data.
- When the user asks for something near them, nearby, closest, or nearest, recommend the nearest matches first and mention their distance.
- When the user asks for a combination, such as a hotel and a restaurant near a spot, use the distances to suggest places that are close to each other.
- Do not invent places, prices, phone numbers, addresses, or opening hours. If a detail is not in the data, say it is not currently available.
- If a place has no distance, say its distance is unknown.
- If the user greets you or asks who you are, respond warmly and introduce yourself.
- When listing multiple items, use bullet points.
- Be conversational and keep answers reasonably concise.
- Focus on San Carlos City, Negros Occidental.

If the question is completely unrelated to San Carlos, travel, food, accommodations, or vehicle rentals, say:

"Sorry, I can only help with tourist spots, hotels, restaurants, and vehicle rentals in San Carlos. 😊"

========================================
TOURIST SPOTS IN SAN CARLOS
========================================

${spotsText}

========================================
HOTELS IN SAN CARLOS
========================================

${hotelsText}

CHEAPEST HOTELS (already sorted, lowest price first):
${cheapestHotelsText}

The HOTELS list above is already sorted nearest first. For "nearest hotel" use the first hotel listed; for "cheapest hotel" use the first one in the CHEAPEST HOTELS ranking.

========================================
RESTAURANTS IN SAN CARLOS
========================================

${restaurantsText}

CHEAPEST RESTAURANTS (already sorted, lowest starting price first):
${cheapestRestaurantsText}

For "cheapest restaurant / cafe / place to eat" use this ranking (or filter the list by its [category]). Restaurant prices are the typical price range per person.

========================================
TRIP PACKAGES (WITH PRICES)
========================================

${packagesText}

========================================
MOST VISITED
========================================

${mostVisitedText}

========================================
AVAILABLE VEHICLES FOR RENT
========================================

${vehiclesText}
`;
  };

  // ==========================================
  // SEND MESSAGE
  // ==========================================
  const sendMessage = async () => {
    const trimmed = input.trim();

    if (!trimmed || loading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Easter egg: answer "Melissa" directly without calling the AI
    if (/\bmelissa\b/i.test(trimmed)) {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-melissa`, role: "assistant", text: MELISSA_REPLY },
      ]);
      return;
    }

    // "nearest hotel" / "cheapest hotel": answer directly from Firestore
    const here = userLocation || {
      latitude: TOURISM_OFFICE.latitude,
      longitude: TOURISM_OFFICE.longitude,
    };
    const placeReply = answerPlaceQuestion(
      trimmed,
      {
        hotels: accommodationsData,
        restaurants: mergeRestaurants(restaurantsData),
        spots: spotsData,
      },
      here
    );
    if (placeReply) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-places`,
          role: "assistant",
          text: placeReply.text,
          cards: placeReply.cards,
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      if (!GEMINI_API_KEY) {
        throw new Error(
          "Missing EXPO_PUBLIC_GEMINI_API_KEY. Check your .env file and restart Expo with: npx expo start -c"
        );
      }

      // --------------------------------------
      // CHAT HISTORY
      // --------------------------------------
      const history = messages
        .slice(1)
        .slice(-10) // only send the last 10 turns to keep requests fast
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.text }],
        }));

      history.push({
        role: "user",
        parts: [{ text: trimmed }],
      });

      // --------------------------------------
      // REQUEST BODY
      // --------------------------------------
      const body = JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemPrompt() }],
        },

        contents: history,

        generationConfig: {
          maxOutputTokens: 1000,
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      });

      // --------------------------------------
      // GEMINI REQUEST (with model fallback)
      // --------------------------------------
      const candidates = workingModel.current
        ? [workingModel.current]
        : GEMINI_MODELS;

      let data = null;
      let lastError = null;

      for (const model of candidates) {
        const response = await fetch(geminiUrl(model), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body,
        });

        const json = await response.json();

        if (response.ok) {
          workingModel.current = model;
          data = json;
          break;
        }

        lastError = json?.error?.message || "Gemini API request failed";
        console.warn(`Model ${model} failed:`, lastError);

        // Only try the next model when this one doesn't exist (404).
        // Other errors (quota, bad key, bad request) will repeat anyway.
        if (json?.error?.code !== 404) break;
      }

      if (!data) {
        throw new Error(lastError || "No available Gemini model");
      }

      // --------------------------------------
      // GET RESPONSE
      // --------------------------------------
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn't get a response. Please try again.";

      const cards = cardsFromReply(
        reply,
        [
          ["hotel", accommodationsData],
          ["restaurant", mergeRestaurants(restaurantsData)],
          ["spot", spotsData],
        ],
        here
      );

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: reply,
          cards,
        },
      ]);
    } catch (error) {
      console.error("Gemini API error:", error);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: "Oops! Something went wrong. Please try again. 😅",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // RENDER MESSAGE
  // ==========================================
  const renderMessage = ({ item }) => {
    const isUser = item.role === "user";

    return (
      <View>
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {!isUser && (
            <View style={styles.botAvatarSmall}>
              <Text style={styles.botAvatarText}>🤖</Text>
            </View>
          )}

          <View
            style={[
              styles.bubbleContent,
              isUser ? styles.userBubbleContent : styles.assistantBubbleContent,
            ]}
          >
            <Text style={isUser ? styles.userText : styles.assistantText}>
              {item.text}
            </Text>
          </View>
        </View>

        {/* Tappable result cards (hotels, restaurants, tourist spots) */}
        {!isUser && item.cards?.length > 0 && (
          <View style={styles.cardsWrap}>
            {item.cards.map(({ type, item: place }) => (
              <PlaceCard
                key={`${type}-${place.id || place.name}`}
                type={type}
                item={place}
                onPress={() => openPlace(type, place)}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  // ==========================================
  // UI
  // ==========================================
  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* HEADER */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.botAvatar}>
              <Text style={styles.botAvatarEmoji}>🤖</Text>
            </View>

            <View>
              <Text style={styles.headerTitle}>San Carlos Assistant</Text>

              <Text style={styles.headerSubtitle}>AI-powered travel guide</Text>
            </View>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* CHAT MESSAGES */}
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />

        {/* TYPING INDICATOR */}
        {loading && (
          <View style={styles.typingContainer}>
            <View style={styles.botAvatarSmall}>
              <Text style={styles.botAvatarText}>🤖</Text>
            </View>

            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={C.purple} />

              <Text style={styles.typingText}>Typing...</Text>
            </View>
          </View>
        )}

        {/* INPUT */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about spots, hotels, restaurants, or vehicles..."
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            textAlignVertical="center"
          />

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* DETAILS SHEET for the tapped card */}
      <PlaceSheet
        place={selectedPlace}
        packages={
          selectedPlace?.type === "spot"
            ? packagesData.filter((p) => p.spotId === selectedPlace.item.id)
            : []
        }
        onClose={() => setSelectedPlace(null)}
        onOpenPackage={openPackage}
        onDirections={showDirections}
      />
    </SafeAreaView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: C.navy,
    elevation: 3,
  },

  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  backText: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "bold",
  },

  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  botAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },

  botAvatarEmoji: {
    fontSize: 22,
  },

  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  headerSubtitle: {
    fontSize: 11,
    color: C.gold,
    fontWeight: "500",
  },

  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  messageBubble: {
    flexDirection: "row",
    marginBottom: 14,
    alignItems: "flex-end",
  },

  userBubble: {
    justifyContent: "flex-end",
  },

  assistantBubble: {
    justifyContent: "flex-start",
  },

  botAvatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 2,
  },

  botAvatarText: {
    fontSize: 14,
  },

  bubbleContent: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  userBubbleContent: {
    backgroundColor: C.navy,
    borderBottomRightRadius: 4,
  },

  assistantBubbleContent: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 1,
  },

  userText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
  },

  assistantText: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
  },

  // ---- result cards (same look as the map screen) ----
  cardsWrap: {
    marginLeft: 38, // lines up under the bot bubble (avatar 30 + gap 8)
    marginBottom: 14,
    gap: 10,
  },

  placeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 1,
  },

  placeImage: { width: 84, height: 84, borderRadius: 12 },

  placePlaceholder: {
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },

  placePlaceholderText: { fontSize: 26, fontWeight: "800", color: C.purple },

  placeName: { fontSize: 14, fontWeight: "700", color: C.text },

  placeMeta: { fontSize: 12, color: C.muted, marginTop: 2 },

  placeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },

  placePrice: { fontSize: 13, fontWeight: "700", color: C.purple, marginTop: 3 },

  placeUnit: { fontSize: 11, fontWeight: "500", color: C.muted },

  dotBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: C.greenSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },

  dotBadgeText: { fontSize: 9, fontWeight: "800", color: C.green },

  // ---- details sheet ----
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,18,36,0.45)",
  },

  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: "82%",
  },

  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 12,
  },

  sheetImage: { width: "100%", height: 160, borderRadius: 16, marginBottom: 12 },

  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },

  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.text },

  sheetSubtitle: { fontSize: 12, color: C.muted, marginTop: 3 },

  sheetBody: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 10 },

  sheetSection: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 6 },

  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.purpleSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 10,
  },

  contactText: { flex: 1, fontSize: 13, fontWeight: "600", color: C.text },

  pkgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },

  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 14,
  },

  directionsText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  typingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },

  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    elevation: 1,
  },

  typingText: {
    color: "#888",
    fontSize: 13,
    fontStyle: "italic",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,

    // Keeps the input box raised from the bottom
    marginBottom: 70,
  },

  input: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: C.text,
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.navy,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },

  sendBtnDisabled: {
    backgroundColor: "#B9D6BF",
  },

  sendBtnText: {
    color: "#fff",
    fontSize: 18,
  },
});