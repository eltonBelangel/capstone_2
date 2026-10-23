
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";

import { auth, db } from "../../firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

export default function AccountScreen({ navigation }) {
  const [userInfo, setUserInfo] = useState(null);
  const [activeBookings, setActiveBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeBookings = () => {};

    const user = auth.currentUser;

    if (!user) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    // Fetch the signed-in user's profile.
    const fetchUser = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        if (isMounted) {
          if (snapshot.exists()) {
            setUserInfo(snapshot.data());
          } else {
            setUserInfo(null);
            console.warn("No user profile found for:", user.uid);
          }
        }
      } catch (error) {
        console.error(
          "User profile error:",
          error.code,
          error.message
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    // Listen for this renter's bookings.
    const bookingsQuery = query(
      collection(db, "bookings"),
      where("renterId", "==", user.uid)
    );

    unsubscribeBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        if (!isMounted) return;

        const allBookings = snapshot.docs.map((bookingDoc) => ({
          id: bookingDoc.id,
          ...bookingDoc.data(),
        }));

        setActiveBookings(
          allBookings.filter(
            (booking) =>
              booking.status === "active" ||
              booking.status === "pending_payment"
          )
        );

        setPastBookings(
          allBookings.filter(
            (booking) =>
              booking.status === "completed" ||
              booking.status === "cancelled"
          )
        );
      },
      (error) => {
        console.error(
          "Bookings listener error:",
          error.code,
          error.message
        );
      }
    );

    return () => {
      isMounted = false;
      unsubscribeBookings();
    };
  }, []);

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              navigation.replace("Login");
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert(
                "Logout Failed",
                "Unable to log out. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "active":
        return {
          bg: "#DCFCE7",
          text: "#166534",
          label: "Active",
        };

      case "pending_payment":
        return {
          bg: "#FEF9C3",
          text: "#854D0E",
          label: "Pending",
        };

      case "completed":
        return {
          bg: "#F1F5F9",
          text: "#475569",
          label: "Completed",
        };

      case "cancelled":
        return {
          bg: "#FEE2E2",
          text: "#991B1B",
          label: "Cancelled",
        };

      default:
        return {
          bg: "#EFF6FF",
          text: "#1D4ED8",
          label: status || "Unknown",
        };
    }
  };

  const formatPrice = (price) => {
    const amount = Number(price);

    if (price === null || price === undefined || price === "") {
      return null;
    }

    if (!Number.isFinite(amount)) {
      return null;
    }

    return `₱${amount.toFixed(2)}`;
  };

  const BookingCard = ({ booking }) => {
    const statusStyle = getStatusStyle(booking.status);
    const price = formatPrice(booking.totalPrice);

    return (
      <TouchableOpacity
        style={styles.bookingCard}
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate("BookingDetail", { booking })
        }
      >
        <View style={styles.bookingLeft}>
          <Text style={styles.bookingCategory}>
            {booking.vehicleCategory
              ? booking.vehicleCategory
                  .replace(/_/g, " ")
                  .toUpperCase()
              : "VEHICLE BOOKING"}
          </Text>

          {booking.vehicleModel ? (
            <Text style={styles.bookingDetail}>
              🚘 {booking.vehicleModel}
            </Text>
          ) : null}

          {booking.vehiclePlate ? (
            <Text style={styles.bookingDetail}>
              🪪 {booking.vehiclePlate}
            </Text>
          ) : null}

          {booking.hours !== null &&
          booking.hours !== undefined &&
          booking.hours !== "" ? (
            <Text style={styles.bookingDetail}>
              ⏱ {booking.hours} hr(s)
            </Text>
          ) : null}

          {price !== null ? (
            <Text style={styles.bookingPrice}>{price}</Text>
          ) : null}
        </View>

        <View style={styles.bookingRight}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: statusStyle.text },
              ]}
            >
              {statusStyle.label}
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1A56DB" />
        <Text style={styles.loadingText}>Loading account...</Text>
      </View>
    );
  }

  if (!auth.currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.messageText}>
          Please log in to view your account.
        </Text>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => navigation.replace("Login")}
        >
          <Text style={styles.loginBtnText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>My Account</Text>

        <View style={{ width: 36 }} />
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {userInfo?.username?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {userInfo?.username || "No Name"}
          </Text>

          <Text style={styles.profileDetail}>
            {userInfo?.email || "No Email"}
          </Text>

          <Text style={styles.profileDetail}>
            {userInfo?.phone || "No Phone"}
          </Text>
        </View>

        <View
          style={[
            styles.roleBadge,
            userInfo?.role === "owner" && styles.roleBadgeOwner,
          ]}
        >
          <Text style={styles.roleBadgeText}>
            {userInfo?.role === "owner" ? "Owner" : "Renter"}
          </Text>
        </View>
      </View>

      {/* Active Transactions */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Active Transactions
        </Text>

        {activeBookings.length > 0 && (
          <View style={styles.countDot}>
            <Text style={styles.countDotText}>
              {activeBookings.length}
            </Text>
          </View>
        )}
      </View>

      {activeBookings.length === 0 ? (
        <Text style={styles.emptyText}>
          No active transactions.
        </Text>
      ) : (
        activeBookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))
      )}

      {/* Transaction History */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Transaction History
        </Text>
      </View>

      {pastBookings.length === 0 ? (
        <Text style={styles.emptyText}>
          No past transactions yet.
        </Text>
      ) : (
        pastBookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))
      )}

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },

  messageText: {
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    marginBottom: 16,
  },

  loginBtn: {
    backgroundColor: "#1A56DB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },

  loginBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  header: {
    backgroundColor: "#1A56DB",
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  backArrow: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "bold",
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    margin: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },

  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1A56DB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  avatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  profileInfo: {
    flex: 1,
  },

  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },

  profileDetail: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 1,
  },

  roleBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  roleBadgeOwner: {
    backgroundColor: "#FEF3C7",
  },

  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0369A1",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
    marginTop: 12,
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },

  countDot: {
    marginLeft: 8,
    backgroundColor: "#1A56DB",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  countDotText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  emptyText: {
    marginLeft: 16,
    marginRight: 16,
    color: "#94A3B8",
    fontStyle: "italic",
    marginBottom: 12,
  },

  bookingCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  bookingLeft: {
    flex: 1,
    paddingRight: 8,
  },

  bookingCategory: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },

  bookingDetail: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 2,
  },

  bookingPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A56DB",
    marginTop: 4,
  },

  bookingRight: {
    alignItems: "flex-end",
    gap: 8,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  arrow: {
    fontSize: 20,
    color: "#CBD5E1",
  },

  logoutBtn: {
    margin: 16,
    marginTop: 24,
    backgroundColor: "#FEE2E2",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  logoutText: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 15,
  },
});
