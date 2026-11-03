import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
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
} from "react-native";

import { db } from "../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import * as Location from "expo-location";
import { TOURISM_OFFICE } from "../constants/tourismOffice";

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

export default function ChatScreen({ navigation }) {
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
    // Use the user's location, or the tourism office when it is unavailable
    const here = userLocation || {
      latitude: TOURISM_OFFICE.latitude,
      longitude: TOURISM_OFFICE.longitude,
    };
    const locationNote = userLocation
      ? `The user's current location is ${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}.`
      : "The user's exact location is not available, so distances are measured from the Municipal Tourism Office in San Carlos City.";

    // Adds a distance to each item and keeps the nearest 15
    const nearest = (list) =>
      list
        .map((item) => {
          const lat = item.location?.lat;
          const lng = item.location?.lng;
          const km =
            typeof lat === "number" && typeof lng === "number"
              ? getDistanceKm(here.latitude, here.longitude, lat, lng)
              : null;
          return { ...item, km };
        })
        .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
        .slice(0, 15);

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
        ? nearest(accommodationsData)
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

    // ------------------------------------------
    // RESTAURANTS (the "restaurants" collection)
    // ------------------------------------------
    const restaurantsText =
      restaurantsData.length > 0
        ? nearest(restaurantsData)
            .map(
              (r) =>
                `- ${r.name || "Unnamed restaurant"}${r.cuisine ? ` (${r.cuisine})` : ""}${withDistance(r)}${
                  r.address ? `, Address: ${r.address}` : ""
                }${r.priceRange ? `, Price: ${r.priceRange}` : ""}${
                  r.openingHours ? `, Hours: ${r.openingHours}` : ""
                }${r.phone ? `, Phone: ${r.phone}` : ""}${
                  r.description ? `: ${r.description}` : ""
                }`
            )
            .join("\n")
        : "No restaurants available at the moment.";

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

========================================
RESTAURANTS IN SAN CARLOS
========================================

${restaurantsText}

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

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          text: reply,
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
    );
  };

  // ==========================================
  // UI
  // ==========================================
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* HEADER */}
        <View style={styles.header}>
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
              <ActivityIndicator size="small" color="#1A56DB" />

              <Text style={styles.typingText}>Typing...</Text>
            </View>
          </View>
        )}

        {/* INPUT */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about spots, hotels, restaurants, or vehicles..."
            placeholderTextColor="#888"
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
    </SafeAreaView>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4FF",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF5",
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
    color: "#1A56DB",
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
    backgroundColor: "#E8F0FF",
    justifyContent: "center",
    alignItems: "center",
  },

  botAvatarEmoji: {
    fontSize: 22,
  },

  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
  },

  headerSubtitle: {
    fontSize: 11,
    color: "#1A56DB",
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
    backgroundColor: "#E8F0FF",
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
    backgroundColor: "#1A56DB",
    borderBottomRightRadius: 4,
  },

  assistantBubbleContent: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    elevation: 1,
  },

  userText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
  },

  assistantText: {
    color: "#1A1A2E",
    fontSize: 14,
    lineHeight: 20,
  },

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
    borderTopColor: "#E8EDF5",
    gap: 10,

    // Keeps the input box raised from the bottom
    marginBottom: 70,
  },

  input: {
    flex: 1,
    backgroundColor: "#F0F4FF",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: "#1A1A2E",
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1A56DB",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },

  sendBtnDisabled: {
    backgroundColor: "#B0C4DE",
  },

  sendBtnText: {
    color: "#fff",
    fontSize: 18,
  },
});