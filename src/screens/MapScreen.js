import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TextInput, Image,
  TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator,
  PanResponder, Animated,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { auth, db } from "../../firebaseConfig";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";

const RADIUS_KM = 50;

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

export default function MapScreen({ navigation }) {
  const [userLocation, setUserLocation] = useState(null);
  const [allSpots, setAllSpots] = useState([]);
  const [nearbySpots, setNearbySpots] = useState([]);
  const [filteredSpots, setFilteredSpots] = useState([]);
  const [nearbyVehicles, setNearbyVehicles] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [spotsLoading, setSpotsLoading] = useState(true);
  const [renterInfo, setRenterInfo] = useState(null);

  // ── Draggable FAB ──
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
    const unsubscribe = onSnapshot(collection(db, "touristSpots"), (snapshot) => {
      const spots = snapshot.docs.map((d) => ({
        id: d.id, ...d.data(),
        latitude: d.data().location?.lat ?? d.data().latitude ?? 0,
        longitude: d.data().location?.lng ?? d.data().longitude ?? 0,
      }));
      setAllSpots(spots);
      setSpotsLoading(false);
    }, (error) => { console.error(error); setSpotsLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userLocation || allSpots.length === 0) return;
    setNearbySpots(allSpots.filter((spot) =>
      getDistanceKm(userLocation.latitude, userLocation.longitude, spot.latitude, spot.longitude) <= RADIUS_KM
    ));
  }, [userLocation, allSpots]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSpots(nearbySpots);
    } else {
      setFilteredSpots(nearbySpots.filter((spot) =>
        spot.name?.toLowerCase().includes(searchQuery.toLowerCase())
      ));
    }
  }, [searchQuery, nearbySpots]);

  useEffect(() => {
    if (!userLocation) return;
    const unsubscribe = onSnapshot(collection(db, "vehicles"), (snapshot) => {
      const vehicles = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v.isAvailable === true && typeof v.lat === "number" && typeof v.lng === "number")
        .filter((v) => getDistanceKm(userLocation.latitude, userLocation.longitude, v.lat, v.lng) <= RADIUS_KM);
      setNearbyVehicles(vehicles);
    });
    return () => unsubscribe();
  }, [userLocation]);

  const handleGoToPayment = (vehicle) => {
    if (!auth.currentUser) { Alert.alert("Error", "You must be logged in."); return; }
    navigation.navigate("Payment", {
      vehicle,
      renterName: renterInfo?.username || "No Name",
      renterPhone: renterInfo?.phone || "No Phone",
    });
  };

  if (!userLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1A56DB" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  const renderSpot = ({ item }) => {
    const distance = getDistanceKm(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude).toFixed(1);
    return (
      <TouchableOpacity onPress={() => navigation.navigate("FullMap", { userLocation, spots: [item], allowedVehicles: nearbyVehicles })}>
        <View style={styles.card}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
              <Text style={styles.cardImagePlaceholderText}>📍</Text>
            </View>
          )}
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          {item.category ? <Text style={styles.cardCategory}>{item.category}</Text> : null}
          {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
          <Text style={styles.cardDistance}>📏 {distance} km away</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderVehicle = ({ item }) => {
    const distance = getDistanceKm(userLocation.latitude, userLocation.longitude, item.lat, item.lng).toFixed(1);
    return (
      <View style={styles.vehicleCard}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.vehicleImage} resizeMode="cover" />
        ) : (
          <View style={[styles.vehicleImage, styles.vehicleImagePlaceholder]}>
            <Text style={styles.vehicleImagePlaceholderIcon}>🚗</Text>
            <Text style={styles.vehicleImagePlaceholderText}>No Photo</Text>
          </View>
        )}
        <Text style={styles.vehicleTitle}>{item.category.replace("_", " ").toUpperCase()}</Text>
        {item.model ? <Text style={styles.vehicleModel}>{item.model}</Text> : null}
        <Text style={styles.vehiclePlate}>🪪 {item.plate}</Text>
        {item.price ? <Text style={styles.vehiclePrice}>₱{item.price}/hr</Text> : null}
        <Text style={styles.cardDistance}>📏 {distance} km away</Text>
        <TouchableOpacity style={styles.rentButton} onPress={() => handleGoToPayment(item)}>
          <Text style={styles.rentButtonText}>Rent Now</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>RideLocal</Text>
          <Text style={styles.headerSub}>Find rides near you</Text>
        </View>
        <TouchableOpacity
          style={styles.userIconBtn}
          onPress={() => navigation.navigate("Account")}
          activeOpacity={0.8}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {renterInfo?.username ? renterInfo.username.charAt(0).toUpperCase() : "👤"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={{ height: 220 }}>
        <MapView
          style={styles.map}
          region={{ latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        >
          <Marker coordinate={userLocation} title="You are here" pinColor="blue" />
          {filteredSpots.map((spot) => (
            <Marker key={spot.id} coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
              title={spot.name} description={spot.description || spot.category || ""} pinColor="orange" />
          ))}
          {nearbyVehicles.map((v) => (
            <Marker key={v.id} coordinate={{ latitude: v.lat, longitude: v.lng }}
              title={v.category} description={v.plate} pinColor="green" />
          ))}
        </MapView>
        <View style={styles.searchContainer}>
          <TextInput
            placeholder="🔍  Search tourist spots..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>Tourist Spots Near You</Text>
        {spotsLoading ? (
          <ActivityIndicator size="small" color="#1A56DB" style={{ marginLeft: 15, marginBottom: 10 }} />
        ) : filteredSpots.length === 0 ? (
          <Text style={styles.emptyText}>No tourist spots found nearby.</Text>
        ) : (
          <FlatList data={filteredSpots} renderItem={renderSpot} keyExtractor={(item) => item.id.toString()}
            horizontal showsHorizontalScrollIndicator={true} persistentScrollbar={true}
            contentContainerStyle={{ paddingRight: 15 }} />
        )}

        <Text style={styles.sectionTitle}>Available Vehicles Near You</Text>
        <FlatList data={nearbyVehicles} renderItem={renderVehicle} keyExtractor={(item) => item.id}
          horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 15 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No vehicles available nearby.</Text>} />
      </ScrollView>

      {/* ── DRAGGABLE FLOATING AI CHAT BUTTON ── */}
      <Animated.View
        style={[styles.chatFab, { transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.chatFabInner}
          activeOpacity={0.85}
          onPress={() => {
            // Only navigate if it was a tap not a drag
            if (dragDistance.current < 10) {
              navigation.navigate("Chat");
            }
            dragDistance.current = 0;
          }}
        >
          <Text style={styles.chatFabText}>💬</Text>
          <View style={styles.chatFabBadge}>
            <Text style={styles.chatFabBadgeText}>AI</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" },
  loadingText: { marginTop: 12, color: "#555", fontSize: 15 },
  header: {
    backgroundColor: "#1A56DB", paddingTop: 52, paddingBottom: 14,
    paddingHorizontal: 18, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  userIconBtn: { padding: 2 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.6)",
    justifyContent: "center", alignItems: "center",
  },
  userAvatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  map: { width: "100%", height: "100%" },
  searchContainer: { position: "absolute", bottom: 10, left: 15, right: 15, zIndex: 100 },
  searchInput: {
    backgroundColor: "#fff", padding: 10, borderRadius: 10, elevation: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginVertical: 10, marginLeft: 15, color: "#0F172A" },
  emptyText: { marginLeft: 15, marginBottom: 10, color: "#94A3B8", fontStyle: "italic" },
  card: { backgroundColor: "#fff", width: 200, marginRight: 12, marginLeft: 15, borderRadius: 12, padding: 10, elevation: 3 },
  cardImage: { width: "100%", height: 120, borderRadius: 10, marginBottom: 5 },
  cardImagePlaceholder: { backgroundColor: "#E8F0FF", justifyContent: "center", alignItems: "center" },
  cardImagePlaceholderText: { fontSize: 36 },
  cardTitle: { fontSize: 14, fontWeight: "bold" },
  cardCategory: { fontSize: 11, color: "#1A56DB", fontWeight: "600", marginTop: 2, textTransform: "uppercase" },
  cardDesc: { fontSize: 11, color: "#666", marginTop: 3 },
  cardDistance: { fontSize: 12, color: "#555", marginTop: 4 },
  vehicleCard: { backgroundColor: "#fff", width: 220, marginRight: 12, marginLeft: 15, borderRadius: 15, padding: 12, elevation: 4, marginBottom: 5 },
  vehicleImage: { width: "100%", height: 120, borderRadius: 10, marginBottom: 8 },
  vehicleImagePlaceholder: { backgroundColor: "#E8F0FF", justifyContent: "center", alignItems: "center" },
  vehicleImagePlaceholderIcon: { fontSize: 32 },
  vehicleImagePlaceholderText: { fontSize: 12, color: "#999", marginTop: 4 },
  vehicleTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 2 },
  vehicleModel: { fontSize: 12, color: "#444", marginBottom: 2 },
  vehiclePlate: { fontSize: 12, color: "#555", marginBottom: 2 },
  vehiclePrice: { fontSize: 13, fontWeight: "bold", color: "#16A34A", marginBottom: 2 },
  rentButton: { backgroundColor: "#1A56DB", padding: 10, borderRadius: 8, alignItems: "center", marginTop: 8 },
  rentButtonText: { color: "#fff", fontWeight: "bold" },

  // ── Draggable Chat FAB ──
  chatFab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1A56DB",
    elevation: 8,
    shadowColor: "#1A56DB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    zIndex: 999,
  },
  chatFabInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  chatFabText: { fontSize: 26 },
  chatFabBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#16A34A",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  chatFabBadgeText: {
    fontSize: 9, color: "#fff", fontWeight: "800", letterSpacing: 0.5,
  },
});