import React, { useState, useEffect, useRef } from "react";
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
  SafeAreaView,
} from "react-native";

import { db } from "../../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

// ==========================================
// GEMINI CONFIG
// ==========================================
// NOTE: gemini-1.5-flash was deprecated and removed from the API,
// which is what caused the 404. These are current model names.
// Move this key to a backend before shipping the app.
const GEMINI_API_KEY = "AIzaSyCKMLNoIiAq7Yi0DiLVOIyB4VBszGSFk_4";

const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

export default function ChatScreen({ navigation }) {
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant",
      text: "Hi! 👋 I'm your San Carlos travel assistant. I can help you discover tourist spots, find available vehicles, and look for accommodations in San Carlos. What are you looking for today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Firestore data
  const [spotsData, setSpotsData] = useState([]);
  const [vehiclesData, setVehiclesData] = useState([]);
  const [accommodationsData, setAccommodationsData] = useState([]);

  const flatListRef = useRef(null);

  // Caches the first model name that actually responds OK
  const workingModel = useRef(null);

  // ==========================================
  // FETCH DATA FROM FIRESTORE
  // ==========================================
  useEffect(() => {
    const fetchData = async () => {
      try {
        // -------------------------------
        // TOURIST SPOTS
        // -------------------------------
        const spotsSnap = await getDocs(collection(db, "touristSpots"));

        const spots = spotsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setSpotsData(spots);

        // -------------------------------
        // VEHICLES
        // -------------------------------
        const vehiclesSnap = await getDocs(collection(db, "vehicles"));

        const vehicles = vehiclesSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((v) => v.isAvailable === true);

        setVehiclesData(vehicles);

        // -------------------------------
        // ACCOMMODATIONS
        // -------------------------------
        const accommodationsSnap = await getDocs(
          collection(db, "accommodations")
        );

        const accommodations = accommodationsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setAccommodationsData(accommodations);

        console.log("Tourist spots:", spots.length);
        console.log("Available vehicles:", vehicles.length);
        console.log("Accommodations:", accommodations.length);
      } catch (error) {
        console.error("Error fetching data for chatbot:", error);
      }
    };

    fetchData();
  }, []);

  // ==========================================
  // LOG MODELS THIS API KEY CAN ACTUALLY USE
  // ==========================================
  // Run the app once and read this log. If neither name in GEMINI_MODELS
  // appears here, replace them with one that does.
  useEffect(() => {
    const listModels = async () => {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
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
    // ------------------------------------------
    // TOURIST SPOTS
    // ------------------------------------------
    const spotsText =
      spotsData.length > 0
        ? spotsData
            .map(
              (s) =>
                `- ${s.name}${s.category ? ` (${s.category})` : ""}${
                  s.description ? `: ${s.description}` : ""
                }`
            )
            .join("\n")
        : "No tourist spots available at the moment.";

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
    // ACCOMMODATIONS
    // ------------------------------------------
    const accommodationsText =
      accommodationsData.length > 0
        ? accommodationsData
            .map(
              (a) =>
                `- ${a.name || "Unnamed accommodation"}${
                  a.type
                    ? ` (${a.type})`
                    : a.category
                    ? ` (${a.category})`
                    : ""
                }${
                  a.address
                    ? `, Address: ${a.address}`
                    : a.location
                    ? `, Location: ${a.location}`
                    : ""
                }${a.description ? `: ${a.description}` : ""}${
                  a.price ? `, Price: ₱${a.price}` : ""
                }`
            )
            .join("\n")
        : "No accommodations available at the moment.";

    // ------------------------------------------
    // SYSTEM PROMPT
    // ------------------------------------------
    return `You are a friendly and helpful AI travel assistant for RideLocal, a travel, tourism, and vehicle rental app focused on San Carlos City, Negros Occidental, Philippines.

You help users with:

1. Discovering and recommending tourist spots in San Carlos
2. Finding and recommending available vehicles for rent in San Carlos
3. Finding accommodations such as hotels, inns, resorts, pension houses, guesthouses, and other places to stay in San Carlos
4. Answering general questions about San Carlos as a travel destination

IMPORTANT RULES:

- If the user asks about tourist spots, attractions, beaches, mountains, parks, or places to visit in San Carlos — answer using the tourist spot data below.
- If the user asks about vehicles, transportation, rentals, rides, motorcycles, cars, or how to get around — answer using the available vehicle data below.
- If the user asks about hotels, accommodations, resorts, inns, pension houses, guesthouses, places to stay, lodging, or where to sleep — answer using the accommodation data below.
- If the user asks general travel questions about San Carlos, use the available information below when relevant.
- If the user asks "what can you do", "show me spots", "any vehicles", "where can I stay", or "what's available", answer helpfully using the data below.
- If the user greets you or asks who you are, respond warmly and introduce yourself.
- Do not invent tourist spots, vehicles, accommodations, prices, addresses, or other information that is not provided in the data.
- If information is not available in the Firestore data, clearly say that the information is not currently available.
- When listing multiple items, use bullet points.
- Be conversational, friendly, and helpful.
- Keep answers reasonably concise.
- Focus on San Carlos City, Negros Occidental.

If the question is completely unrelated to San Carlos, travel, tourism, accommodations, or vehicle rentals, say:

"Sorry, I can only help with tourist spots, accommodations, and vehicle rentals in San Carlos. 😊"

========================================
TOURIST SPOTS IN SAN CARLOS
========================================

${spotsText}

========================================
AVAILABLE VEHICLES FOR RENT
========================================

${vehiclesText}

========================================
ACCOMMODATIONS IN SAN CARLOS
========================================

${accommodationsText}
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
    setLoading(true);

    try {
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
            placeholder="Ask about spots, vehicles, or accommodations..."
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
    paddingTop: 50,
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