import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig"; // ✅ FIXED PATH

import MapView, { Marker } from "react-native-maps";

export default function AddVehicleScreen({ navigation }) {
  const [category, setCategory] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [vehicleImage, setVehicleImage] = useState(null); // local URI
  const [saving, setSaving] = useState(false);

  useEffect(() => { getUserLocation(); }, []);

  const getUserLocation = async () => {
    try {
      setLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Location permission is needed.");
        setLoadingLocation(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 10000,
      });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLoadingLocation(false);
    } catch (error) {
      console.log("LOCATION ERROR:", error);
      Alert.alert("Error", "Unable to fetch location. Please enable GPS.");
      setLoadingLocation(false);
    }
  };

  // ── Pick image from gallery ──
  const pickVehicleImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "We need gallery access to pick an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6, // compress to keep under Firestore 1MB limit
    });
    if (!result.canceled && result.assets?.length > 0) {
      setVehicleImage(result.assets[0].uri);
    }
  };

  // ── Convert image URI to Base64 ──
  const convertToBase64 = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result); // "data:image/jpeg;base64,..."
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSave = async () => {
    if (!category || !plate || !location || !model || !price) {
      Alert.alert("Error", "Complete all fields and select location.");
      return;
    }
    if (!auth.currentUser) {
      Alert.alert("Error", "You are not logged in.");
      return;
    }

    setSaving(true);
    try {
      const ownerId = auth.currentUser.uid;

      // Convert image to Base64 if selected
      let imageBase64 = null;
      if (vehicleImage) {
        imageBase64 = await convertToBase64(vehicleImage);
      }

      const vehicle = {
        ownerId,
        category,
        plate,
        model,
        price: parseFloat(price),
        capabilities: getCapabilities(category),
        isAvailable: true,
        lat: location.lat,
        lng: location.lng,
        imageUrl: imageBase64 || null, // ✅ saved as Base64 in Firestore
        createdAt: new Date(),
      };

      await addDoc(collection(db, "vehicles"), vehicle);
      Alert.alert("Success", "Vehicle added!");
      navigation.goBack();
    } catch (error) {
      console.log("Add Vehicle Error:", error);
      Alert.alert("Error", "Failed to save vehicle. Image may be too large, try a smaller photo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.title}>Add Vehicle</Text>

      {/* ── Vehicle Photo ── */}
      <Text style={styles.label}>Vehicle Photo</Text>
      <TouchableOpacity style={styles.imagePicker} onPress={pickVehicleImage}>
        {vehicleImage ? (
          <Image source={{ uri: vehicleImage }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderIcon}>🚗</Text>
            <Text style={styles.imagePlaceholderText}>Tap to add a photo</Text>
          </View>
        )}
      </TouchableOpacity>
      {vehicleImage && (
        <TouchableOpacity onPress={() => setVehicleImage(null)} style={styles.removeImageBtn}>
          <Text style={styles.removeImageText}>✕ Remove Photo</Text>
        </TouchableOpacity>
      )}

      {/* ── Vehicle Type ── */}
      <Text style={styles.label}>Select Vehicle Type</Text>
      {["standard_motorcycle", "big_motorcycle", "car", "4x4", "boat"].map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.optionButton, category === v && styles.optionSelected]}
          onPress={() => setCategory(v)}
        >
          <Text style={[styles.optionText, category === v && styles.optionTextSelected]}>
            {v.replace("_", " ").toUpperCase()}
          </Text>
        </TouchableOpacity>
      ))}

      <TextInput
        style={styles.input}
        placeholder="Plate Number"
        value={plate}
        onChangeText={setPlate}
      />

      <TextInput
        style={styles.input}
        placeholder="Vehicle Model (e.g., Honda Beat)"
        value={model}
        onChangeText={setModel}
      />

      <TextInput
        style={styles.input}
        placeholder="Price per hour (PHP)"
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
      />

      {/* ── Map ── */}
      <Text style={[styles.label, { marginTop: 15 }]}>Select Vehicle Location</Text>
      <MapView
        style={{ width: "100%", height: 180, borderRadius: 10 }}
        initialRegion={{
          latitude: location?.lat || 10.35,
          longitude: location?.lng || 123.27,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        onPress={(e) =>
          setLocation({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          })
        }
      >
        {location && (
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            draggable
            onDragEnd={(e) =>
              setLocation({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        )}
      </MapView>

      {/* ── Save Button ── */}
      <TouchableOpacity
        style={[styles.saveButton, (!location || saving) && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={!location || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>
            {loadingLocation ? "Fetching Location..." : "Save Vehicle"}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const getCapabilities = (category) => {
  switch (category) {
    case "standard_motorcycle": return ["city"];
    case "big_motorcycle": return ["city", "mountain"];
    case "car": return ["city"];
    case "4x4": return ["city", "mountain"];
    case "boat": return ["island"];
    default: return [];
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#F5F5F5" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 15 },
  label: { fontSize: 16, marginBottom: 10, fontWeight: "bold" },

  // Image picker
  imagePicker: {
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 6,
  },
  imagePreview: { width: "100%", height: 180, borderRadius: 12 },
  imagePlaceholder: {
    height: 140,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
  },
  imagePlaceholderIcon: { fontSize: 36, marginBottom: 6 },
  imagePlaceholderText: { color: "#999", fontSize: 13 },
  removeImageBtn: { alignSelf: "flex-end", marginBottom: 10 },
  removeImageText: { color: "#FF3B30", fontSize: 12, fontWeight: "600" },

  optionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007BFF",
    marginBottom: 8,
  },
  optionSelected: { backgroundColor: "#007BFF" },
  optionText: { textAlign: "center", fontWeight: "bold", color: "#007BFF" },
  optionTextSelected: { color: "#fff" },

  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ccc",
  },

  saveButton: {
    backgroundColor: "#28A745",
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  saveButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },
});