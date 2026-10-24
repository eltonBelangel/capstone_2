import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

// Firestore documents are capped at 1 MB, so keep the encoded photo small.
const MAX_BASE64_CHARS = 700000;

// Opens the gallery and returns a data URI ("data:image/jpeg;base64,...") or null.
export async function pickImageAsDataUri({ aspect = [4, 3] } = {}) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Permission needed", "Allow photo access to choose an image.");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect,
    quality: 0.5,
    base64: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  if (!asset.base64) {
    Alert.alert("Could not read photo", "Try a different photo.");
    return null;
  }
  if (asset.base64.length > MAX_BASE64_CHARS) {
    Alert.alert("Photo too large", "Choose a smaller photo or crop it tighter.");
    return null;
  }

  return `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
}
