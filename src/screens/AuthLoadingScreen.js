import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function AuthLoadingScreen({ navigation }) {

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));

        if (userDoc.exists()) {
          const role = userDoc.data().role;

          if (role === "admin") {
            navigation.replace("AdminDashboard");
          } else if (role === "owner") {
            navigation.replace("OwnerDashboard");
          } else {
            navigation.replace("MainTabs"); // ✅ updated
          }
        } else {
          navigation.replace("Login");
        }

      } else {
        navigation.replace("Login");
      }

    });

    return unsubscribe;

  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color="#1A56DB" />
    </View>
  );
}