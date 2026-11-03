import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  StatusBar,
  Image,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { pickImageAsDataUri } from "../utils/pickImage";

const C = {
  navy: "#0B1224",
  purple: "#7C3AED",
  purpleSoft: "#F1EAFE",
  green: "#16A34A",
  red: "#DC2626",
  bg: "#F4F5F9",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E5E7EB",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

// Packages from the brochures. Each one is matched to its tourist spot by name,
// so create "Mayana Peak" and "Sipaway Island" as tourist spots first.
// Prices are not on the brochures, so they start at 0 and can be edited after import.
const STARTER_PACKAGES = [
  {
    spot: "Mayana Peak",
    name: "Mayana Peak Trek with Snacks (Package B)",
    description: "Trek with a local tour guide, native coffee, alupi and budbod. Barangay Prosperidad.",
    duration: "",
    roundTrip: false,
    legs: [{ vehicleType: "Trek", fromSpot: "Barangay Prosperidad", toSpot: "Mayana Peak" }],
    contactNumbers: ["09851615477"],
    facebook: "Mayana Peak",
    address: "Barangay Prosperidad",
    highlights: [{ name: "Native coffee", imageUrl: null }, { name: "Alupi", imageUrl: null }, { name: "Budbod", imageUrl: null }],
    inclusions: ["Local tour guide", "Native coffee", "Alupi", "Budbod"],
  },
  {
    spot: "Sipaway Island",
    name: "Sipaway Nature-Based Day Tour",
    description:
      "Day tour: Century Old Balete Tree, Nigad Forest, SETWA Beach for lunch, and the lighthouse. Includes environmental fee, boat service, local tour guide, land transportation, lunch and afternoon snacks. Rate is per person for groups of more than 5.",
    duration: "1 day",
    roundTrip: true,
    legs: [
      { vehicleType: "Boat", fromSpot: "Mainland pier", toSpot: "Sipaway Island" },
      { vehicleType: "Land transportation", fromSpot: "Sipaway pier", toSpot: "Balete Tree, Nigad Forest, SETWA Beach, Lighthouse" },
      { vehicleType: "Boat", fromSpot: "Sipaway Island", toSpot: "Mainland pier" },
    ],
    contactNumbers: ["09260827472", "09859743352"],
    facebook: "Sipaway Eco-tourism",
    highlights: [{ name: "Century Old Balete Tree", imageUrl: null }, { name: "Nigad Forest", imageUrl: null }, { name: "SETWA Beach (lunch)", imageUrl: null }, { name: "Lighthouse", imageUrl: null }],
    inclusions: ["Environmental fee", "Boat service back and forth", "Local tour guide", "Land transportation", "Lunch", "Afternoon snacks"],
  },
  {
    spot: "Sipaway Island",
    name: "Sipaway Culinary Day Tour",
    description:
      "Day tour: Balete Tree, Nigad Forest, danggit deboning and tuba making, SETWA Beach, and cocolane food demo with bukayo and salbaro. Includes environmental fee, local tour guide, lunch, boat service, land transportation and afternoon snacks. Rate is per person for groups of more than 5.",
    duration: "1 day",
    roundTrip: true,
    legs: [
      { vehicleType: "Boat", fromSpot: "Mainland pier", toSpot: "Sipaway Island" },
      { vehicleType: "Land transportation", fromSpot: "Sipaway pier", toSpot: "Balete Tree, Nigad Forest, SETWA Beach, Cocolane" },
      { vehicleType: "Boat", fromSpot: "Sipaway Island", toSpot: "Mainland pier" },
    ],
    contactNumbers: ["09260827472", "09859743352"],
    facebook: "Sipaway Eco-tourism",
    highlights: [{ name: "Century Old Balete Tree", imageUrl: null }, { name: "Nigad Forest", imageUrl: null }, { name: "Danggit deboning and tuba making", imageUrl: null }, { name: "SETWA Beach", imageUrl: null }, { name: "Cocolane food demo (bukayo and salbaro)", imageUrl: null }],
    inclusions: ["Environmental fee", "Boat service back and forth", "Local tour guide", "Land transportation", "Lunch", "Afternoon snacks"],
  },
  {
    spot: "Sipaway Island",
    name: "Sipaway Ecotourism Tour Package",
    description:
      "Accommodation, local guides, land transportation, and meals showing local flavors. Explore the mangroves, white sand beaches and the Sipaway Island culture. Contact: 09260827472 or 09859743352.",
    duration: "",
    roundTrip: false,
    legs: [{ vehicleType: "Boat", fromSpot: "Mainland pier", toSpot: "Sipaway Island" }],
    contactNumbers: ["09260827472", "09859743352"],
    facebook: "Sipaway Eco-tourism",
    highlights: [{ name: "White sand beaches", imageUrl: null }, { name: "Mangroves", imageUrl: null }, { name: "Island culture", imageUrl: null }],
    inclusions: ["Accommodation", "Local guides", "Land transportation", "Meals showcasing local flavors"],
  },
];

const emptyLeg = () => ({ vehicleType: "", fromSpot: "", toSpot: "", estimatedPrice: "" });

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  duration: "",
  spotId: null,
  spotName: "",
  roundTrip: false,
  imageUrl: null,
  contactNumbers: "", // one per line or separated by commas
  facebook: "",
  address: "",
  inclusions: "", // one per line
  highlights: [], // [{ name, imageUrl }]
  legs: [emptyLeg()],
};

const emptyHighlight = () => ({ name: "", imageUrl: null });

// "0926..., 0985..." or one per line -> ["0926...", "0985..."]
const splitList = (text) =>
  (text || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

// Firestore documents are capped at 1 MB. Photos are stored inside the document,
// so check the total before saving.
const MAX_DOC_CHARS = 900000;

// Reusable labelled input
function Field({ label, multiline, small, ...inputProps }) {
  return (
    <View>
      <Text style={small ? styles.miniLabel : styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        placeholderTextColor={C.faint}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        {...inputProps}
      />
    </View>
  );
}

export default function AdminPackagesScreen({ navigation }) {
  const [packages, setPackages] = useState([]);
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // "list" | "form"
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const unsubPkgs = onSnapshot(
      collection(db, "tripPackages"),
      (snap) => {
        setPackages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsubSpots = onSnapshot(collection(db, "touristSpots"), (snap) =>
      setSpots(snap.docs.map((d) => ({ id: d.id, name: d.data().name || "Untitled" })))
    );
    return () => {
      unsubPkgs();
      unsubSpots();
    };
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setLeg = (index, key, value) =>
    setForm((f) => ({
      ...f,
      legs: f.legs.map((l, i) => (i === index ? { ...l, [key]: value } : l)),
    }));

  const setHighlight = (index, key, value) =>
    setForm((f) => ({
      ...f,
      highlights: f.highlights.map((h, i) => (i === index ? { ...h, [key]: value } : h)),
    }));

  const addHighlight = () =>
    setForm((f) => ({ ...f, highlights: [...f.highlights, emptyHighlight()] }));

  const removeHighlight = (index) =>
    setForm((f) => ({ ...f, highlights: f.highlights.filter((_, i) => i !== index) }));

  const pickHighlightPhoto = async (index) => {
    // Small photo (600px wide) so many of them fit in one package
    const uri = await pickImageAsDataUri({ aspect: [4, 3], maxWidth: 600 });
    if (uri) setHighlight(index, "imageUrl", uri);
  };

  const addLeg = () => setForm((f) => ({ ...f, legs: [...f.legs, emptyLeg()] }));

  const removeLeg = (index) =>
    setForm((f) =>
      f.legs.length === 1 ? f : { ...f, legs: f.legs.filter((_, i) => i !== index) }
    );

  const findSpot = (name) =>
    spots.find((x) => x.name?.trim().toLowerCase() === name.toLowerCase());

  const importStarter = () => {
    const missing = [...new Set(STARTER_PACKAGES.map((p) => p.spot))].filter((n) => !findSpot(n));
    if (missing.length > 0) {
      Alert.alert(
        "Add the spot first",
        `Create these tourist spots first, then try again: ${missing.join(", ")}`
      );
      return;
    }

    const exists = (p) =>
      packages.find((x) => x.name?.trim().toLowerCase() === p.name.toLowerCase());
    const toAdd = STARTER_PACKAGES.filter((p) => !exists(p));
    // Packages imported earlier that don't have contacts/highlights yet
    const toUpdate = STARTER_PACKAGES.filter((p) => {
      const found = exists(p);
      return found && !found.highlights && !found.contactNumbers;
    });
    if (toAdd.length === 0 && toUpdate.length === 0) {
      Alert.alert("Already added", "These packages are already up to date.");
      return;
    }

    Alert.alert(
      "Import brochure packages",
      `${toAdd.length} new and ${toUpdate.length} existing packages will get contact numbers, highlights and inclusions. Prices and photos you already set are kept. You can add food photos by editing each package.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          onPress: async () => {
            setImporting(true);
            try {
              for (const p of toUpdate) {
                await updateDoc(doc(db, "tripPackages", exists(p).id), {
                  contactNumbers: p.contactNumbers || [],
                  facebook: p.facebook || "",
                  address: p.address || "",
                  highlights: p.highlights || [],
                  inclusions: p.inclusions || [],
                  updatedAt: new Date(),
                });
              }
              for (const p of toAdd) {
                const spot = findSpot(p.spot);
                await addDoc(collection(db, "tripPackages"), {
                  name: p.name,
                  description: p.description,
                  price: 0,
                  totalPrice: 0,
                  duration: p.duration,
                  durationEstimate: p.duration,
                  spotId: spot.id,
                  spotName: spot.name,
                  roundTrip: p.roundTrip,
                  imageUrl: null,
                  contactNumbers: p.contactNumbers || [],
                  facebook: p.facebook || "",
                  address: p.address || "",
                  highlights: p.highlights || [],
                  inclusions: p.inclusions || [],
                  legs: p.legs.map((l) => ({
                    vehicleType: l.vehicleType,
                    fromSpot: l.fromSpot,
                    toSpot: l.toSpot,
                    fromLabel: l.fromSpot,
                    toLabel: l.toSpot,
                    estimatedPrice: 0,
                  })),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              }
              Alert.alert("Done", "Packages imported.");
            } catch {
              Alert.alert("Import stopped", "Some packages may not have been added. Check the list before importing again.");
            } finally {
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setView("form");
  };

  const openEdit = (pkg) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name || "",
      description: pkg.description || "",
      price: pkg.totalPrice?.toString() || pkg.price?.toString() || "",
      duration: pkg.durationEstimate || pkg.duration || "",
      spotId: pkg.spotId || null,
      spotName: pkg.spotName || "",
      roundTrip: !!pkg.roundTrip,
      imageUrl: pkg.imageUrl || null,
      contactNumbers: (pkg.contactNumbers || []).join("\n"),
      facebook: pkg.facebook || "",
      address: pkg.address || "",
      inclusions: (pkg.inclusions || []).join("\n"),
      highlights: (pkg.highlights || []).map((h) => ({ name: h.name || "", imageUrl: h.imageUrl || null })),
      legs: pkg.legs?.length
        ? pkg.legs.map((l) => ({
            vehicleType: l.vehicleType || "",
            fromSpot: l.fromSpot || l.fromLabel || "",
            toSpot: l.toSpot || l.toLabel || "",
            estimatedPrice: l.estimatedPrice?.toString() || "",
          }))
        : [emptyLeg()],
    });
    setView("form");
  };

  const closeForm = () => {
    setView("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const pickPhoto = async () => {
    const uri = await pickImageAsDataUri({ aspect: [16, 9] });
    if (uri) set("imageUrl", uri);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert("Name required", "Enter a package name to continue.");
      return;
    }
    if (!form.spotId) {
      Alert.alert("Spot required", "Choose the tourist spot this package belongs to.");
      return;
    }

    const legs = form.legs
      .filter((l) => l.vehicleType.trim() || l.fromSpot.trim() || l.toSpot.trim())
      .map((l) => ({
        vehicleType: l.vehicleType.trim(),
        fromSpot: l.fromSpot.trim(),
        toSpot: l.toSpot.trim(),
        fromLabel: l.fromSpot.trim(),
        toLabel: l.toSpot.trim(),
        estimatedPrice: parseFloat(l.estimatedPrice) || 0,
      }));

    const price = parseFloat(form.price) || 0;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      totalPrice: price,
      duration: form.duration.trim(),
      durationEstimate: form.duration.trim(),
      spotId: form.spotId,
      spotName: form.spotName,
      roundTrip: form.roundTrip,
      imageUrl: form.imageUrl || null,
      contactNumbers: splitList(form.contactNumbers),
      facebook: form.facebook.trim(),
      address: form.address.trim(),
      inclusions: form.inclusions.split("\n").map((x) => x.trim()).filter(Boolean),
      highlights: form.highlights
        .filter((h) => h.name.trim() || h.imageUrl)
        .map((h) => ({ name: h.name.trim(), imageUrl: h.imageUrl || null })),
      legs,
      updatedAt: new Date(),
    };

    if (JSON.stringify(payload).length > MAX_DOC_CHARS) {
      Alert.alert(
        "Too many photos",
        "This package is too big to save. Remove a photo or two and try again."
      );
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "tripPackages", editingId), payload);
      } else {
        await addDoc(collection(db, "tripPackages"), { ...payload, createdAt: new Date() });
      }
      closeForm();
    } catch (e) {
      Alert.alert("Could not save", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    Alert.alert("Delete package", `"${name}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "tripPackages", id));
          } catch {
            Alert.alert("Could not delete", "Check your connection and try again.");
          }
        },
      },
    ]);
  };

  const renderPackage = ({ item }) => {
    const total =
      item.totalPrice ||
      item.price ||
      (item.legs || []).reduce((s, l) => s + (Number(l.estimatedPrice) || 0), 0);
    const legCount = (item.legs || []).length;
    const route = (item.legs || []).map((l) => cap(l.vehicleType || "ride")).join(" → ");
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.85}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.placeholder]}>
            <Text style={styles.placeholderText}>{item.name?.charAt(0)?.toUpperCase() || "P"}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, styles.flex]} numberOfLines={1}>
              {item.name}
            </Text>
            {Number(total) > 0 ? (
              <Text style={styles.price}>₱{Number(total).toLocaleString()}</Text>
            ) : null}
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[item.spotName, item.durationEstimate || item.duration].filter(Boolean).join("  ·  ") ||
              "No spot or duration"}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {legCount} leg{legCount !== 1 ? "s" : ""}
            {item.roundTrip ? "  ·  Round trip" : ""}
          </Text>
          {route ? (
            <Text style={styles.route} numberOfLines={1}>
              {route}
            </Text>
          ) : null}

          <View style={styles.cardActions}>
            <Text style={styles.link}>Tap to edit</Text>
            <TouchableOpacity onPress={() => handleDelete(item.id, item.name)} hitSlop={8}>
              <Text style={styles.danger}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isForm = view === "form";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      {/* Header */}
      <View style={styles.header}>
        {isForm ? (
          <TouchableOpacity onPress={closeForm} hitSlop={8}>
            <Text style={styles.headerLink}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("AdminDashboard"))}
            hitSlop={8}
          >
            <Text style={styles.headerLink}>Back</Text>
          </TouchableOpacity>
        )}

        {isForm ? (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.headerBtn, saving && styles.disabled]}
            hitSlop={8}
          >
            {saving ? (
              <ActivityIndicator color={C.navy} size="small" />
            ) : (
              <Text style={styles.headerBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openAdd} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="add" size={16} color={C.navy} />
            <Text style={styles.headerBtnText}>New package</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {isForm ? (editingId ? "Edit package" : "New package") : "Trip packages"}
        </Text>
        <Text style={styles.subtitle}>
          {isForm
            ? "Pick the spot, then add each leg of the trip. Leg prices are added together for the total."
            : "Multi-leg trips shown under each tourist spot on the homepage."}
        </Text>
      </View>

      <View style={styles.content}>
        {isForm ? (
          <KeyboardAwareScrollView
            style={styles.flex}
            contentContainerStyle={styles.formContent}
            bottomOffset={28}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Photo</Text>
            {form.imageUrl ? (
              <View>
                <Image source={{ uri: form.imageUrl }} style={styles.preview} />
                <TouchableOpacity style={styles.removePhoto} onPress={() => set("imageUrl", null)}>
                  <Text style={styles.danger}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoPicker} onPress={pickPhoto}>
                <Ionicons name="camera-outline" size={24} color={C.purple} />
                <Text style={styles.photoPickerText}>Add a photo</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Tourist spot</Text>
            {spots.length === 0 ? (
              <Text style={styles.hint}>Add a tourist spot first.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {spots.map((s) => {
                  const active = form.spotId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        set("spotId", s.id);
                        set("spotName", s.name);
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Field label="Package name" value={form.name} onChangeText={(v) => set("name", v)} placeholder="Island hopping adventure" />
            <Field label="Description" multiline value={form.description} onChangeText={(v) => set("description", v)} placeholder="What this package includes" />


            <Text style={styles.label}>Contact</Text>
            <Field small label="Phone numbers (one per line)" multiline value={form.contactNumbers} onChangeText={(v) => set("contactNumbers", v)} placeholder={"09260827472\n09859743352"} />
            <Field small label="Facebook page" value={form.facebook} onChangeText={(v) => set("facebook", v)} placeholder="Sipaway Eco-tourism" autoCapitalize="none" />
            <Field small label="Address / meeting point" value={form.address} onChangeText={(v) => set("address", v)} placeholder="Barangay Prosperidad" />

            <View style={styles.legsHead}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              <TouchableOpacity onPress={addHighlight} hitSlop={8}>
                <Text style={styles.link}>+ Add highlight</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Snacks, food, or places guests will enjoy. Add a photo for each.</Text>

            {form.highlights.map((h, index) => (
              <View key={index} style={styles.legCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.legTitle}>Highlight {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeHighlight(index)} hitSlop={8}>
                    <Text style={styles.danger}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <Field small label="Name" value={h.name} onChangeText={(v) => setHighlight(index, "name", v)} placeholder="Native coffee, Alupi, Budbod..." />
                {h.imageUrl ? (
                  <View>
                    <Image source={{ uri: h.imageUrl }} style={styles.hlPreview} />
                    <TouchableOpacity style={styles.removePhoto} onPress={() => setHighlight(index, "imageUrl", null)}>
                      <Text style={styles.danger}>Remove photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.photoPicker, styles.hlPicker]} onPress={() => pickHighlightPhoto(index)}>
                    <Ionicons name="camera-outline" size={20} color={C.purple} />
                    <Text style={styles.photoPickerText}>Add photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <Field label="Inclusions (one per line)" multiline value={form.inclusions} onChangeText={(v) => set("inclusions", v)} placeholder={"Environmental fee\nLocal tour guide\nLunch"} />

            <View style={styles.inline}>
              <View style={[styles.flex, { marginRight: 6 }]}>
                <Field label="Total price (₱)" value={form.price} onChangeText={(v) => set("price", v)} placeholder="0" keyboardType="numeric" />
              </View>
              <View style={[styles.flex, { marginLeft: 6 }]}>
                <Field label="Duration" value={form.duration} onChangeText={(v) => set("duration", v)} placeholder="1 day" />
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Round trip</Text>
              <Switch
                value={form.roundTrip}
                onValueChange={(v) => set("roundTrip", v)}
                trackColor={{ false: C.border, true: C.green }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.legsHead}>
              <Text style={styles.sectionTitle}>Trip legs</Text>
              <TouchableOpacity onPress={addLeg} hitSlop={8}>
                <Text style={styles.link}>+ Add leg</Text>
              </TouchableOpacity>
            </View>

            {form.legs.map((leg, index) => (
              <View key={index} style={styles.legCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.legTitle}>Leg {index + 1}</Text>
                  {form.legs.length > 1 && (
                    <TouchableOpacity onPress={() => removeLeg(index)} hitSlop={8}>
                      <Text style={styles.danger}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Field small label="Vehicle" value={leg.vehicleType} onChangeText={(v) => setLeg(index, "vehicleType", v)} placeholder="Motorbike, boat, van" />
                <View style={styles.inline}>
                  <View style={[styles.flex, { marginRight: 6 }]}>
                    <Field small label="From" value={leg.fromSpot} onChangeText={(v) => setLeg(index, "fromSpot", v)} placeholder="Start point" />
                  </View>
                  <View style={[styles.flex, { marginLeft: 6 }]}>
                    <Field small label="To" value={leg.toSpot} onChangeText={(v) => setLeg(index, "toSpot", v)} placeholder="End point" />
                  </View>
                </View>
                <Field small label="Estimated price (₱)" value={leg.estimatedPrice} onChangeText={(v) => setLeg(index, "estimatedPrice", v)} placeholder="0" keyboardType="numeric" />
              </View>
            ))}

            {editingId ? (
              <TouchableOpacity
                style={styles.deleteFull}
                onPress={() => handleDelete(editingId, form.name)}
              >
                <Text style={styles.danger}>Delete this package</Text>
              </TouchableOpacity>
            ) : null}
          </KeyboardAwareScrollView>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.purple} />
          </View>
        ) : (
          <FlatList
            data={packages}
            keyExtractor={(item) => item.id}
            renderItem={renderPackage}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              packages.length > 0 ? (
                <TouchableOpacity
                  style={[styles.importBtn, importing && styles.disabled]}
                  onPress={importStarter}
                  disabled={importing}
                >
                  {importing ? (
                    <ActivityIndicator color={C.muted} size="small" />
                  ) : (
                    <Text style={styles.importText}>Add contacts and highlights from brochures</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No packages yet</Text>
                <Text style={styles.emptySub}>
                  Create a trip with a photo, a spot, and the vehicles for each leg.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
                  <Text style={styles.primaryText}>New package</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.importBtn, importing && styles.disabled]}
                  onPress={importStarter}
                  disabled={importing}
                >
                  {importing ? (
                    <ActivityIndicator color={C.muted} size="small" />
                  ) : (
                    <Text style={styles.importText}>Import {STARTER_PACKAGES.length} brochure packages</Text>
                  )}
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  importBtn: {
    marginTop: 10,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  importText: { color: C.muted, fontSize: 15, fontWeight: "600" },
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: C.navy },
  rowBetween: { flexDirection: "row", alignItems: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  disabled: { opacity: 0.6 },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLink: { color: C.faint, fontSize: 15 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
  },
  headerBtnText: { color: C.navy, fontSize: 14, fontWeight: "700" },
  titleBlock: { backgroundColor: C.navy, paddingHorizontal: 20, paddingBottom: 22 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: C.faint, fontSize: 13, lineHeight: 19, marginTop: 6 },

  // Content sheet
  content: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    overflow: "hidden",
  },
  list: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  formContent: { padding: 20, paddingBottom: 120 },

  // Package card
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardImage: { width: "100%", height: 150 },
  placeholder: {
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: { color: C.purple, fontSize: 36, fontWeight: "800" },
  cardBody: { padding: 14 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: C.muted, fontSize: 13, marginTop: 3 },
  route: { color: C.text, fontSize: 13, fontWeight: "600", marginTop: 6 },
  price: { color: C.text, fontSize: 15, fontWeight: "700", marginLeft: 12 },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  link: { color: C.purple, fontSize: 14, fontWeight: "600" },
  danger: { color: C.red, fontSize: 14, fontWeight: "600" },
  deleteFull: { alignItems: "center", paddingVertical: 20, marginTop: 10 },

  // Empty
  empty: { paddingTop: 48, alignItems: "flex-start" },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: C.muted, fontSize: 14, lineHeight: 21, marginBottom: 20 },

  // Buttons
  primaryBtn: {
    backgroundColor: C.navy,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    alignSelf: "stretch",
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // Form
  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  miniLabel: { color: C.muted, fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 6 },
  hint: { color: C.faint, fontSize: 13 },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  textArea: { minHeight: 90 },
  inline: { flexDirection: "row" },

  // Photo
  photoPicker: {
    height: 130,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.purple,
    backgroundColor: C.purpleSoft,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  photoPickerText: { color: C.purple, fontSize: 14, fontWeight: "700" },
  preview: { width: "100%", height: 180, borderRadius: 14 },
  hlPreview: { width: "100%", height: 140, borderRadius: 10, marginTop: 10 },
  hlPicker: { height: 70, marginTop: 10 },
  removePhoto: { alignSelf: "flex-end", marginTop: 8 },

  // Spot chips
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.navy, borderColor: C.navy },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF" },

  // Switch
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  switchLabel: { color: C.text, fontSize: 15 },

  // Legs
  legsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 4,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  legCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  legTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
});